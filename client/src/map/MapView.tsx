import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { buildBaseStyle, UK_BOUNDS, UK_CENTER, UK_ZOOM } from './style';
import { OVERLAYS } from './overlays';
import { useMapStore } from '../store/mapStore';
import { loadExistingNetwork, refreshPopulation } from './referenceData';
import { useSchemeStore } from '../store/schemeStore';
import { useEditorStore } from '../store/editorStore';
import { renderScheme } from './schemeRender';
import { renderAnalysis, renderConnectivity } from './analysisRender';
import { useAnalysisStore } from '../store/analysisStore';
import { DrawController } from './DrawController';
import { projectToLine, type LngLat } from '../lib/geometry';

// Shared handle so later build steps (drawing, analysis) can reach the map.
let mapInstance: MlMap | null = null;
export function getMap(): MlMap | null {
  return mapInstance;
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const controllerRef = useRef<DrawController | null>(null);
  const [ready, setReady] = useState(false);

  const visibility = useMapStore((s) => s.visibility);
  const setCursor = useMapStore((s) => s.setCursor);
  const setZoom = useMapStore((s) => s.setZoom);

  const activeScheme = useSchemeStore((s) => s.activeScheme);
  const tool = useEditorStore((s) => s.tool);
  const selection = useEditorStore((s) => s.selection);
  const selectionLineId = selection?.lineId ?? null;
  const analysisResult = useAnalysisStore((s) => s.result);
  const connectivity = useAnalysisStore((s) => s.connectivity);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildBaseStyle(),
      center: UK_CENTER,
      zoom: UK_ZOOM,
      maxBounds: [
        [UK_BOUNDS[0][0] - 6, UK_BOUNDS[0][1] - 4],
        [UK_BOUNDS[1][0] + 6, UK_BOUNDS[1][1] + 4],
      ],
      minZoom: 4,
      maxZoom: 18,
      // Attribution is rendered in the app's bottom strip instead.
      attributionControl: false,
      // Respect reduced-motion users: disable inertial/animated camera.
      fadeDuration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      for (const overlay of OVERLAYS) overlay.add(map);
      applyVisibility(map, useMapStore.getState().visibility);
      setZoom(map.getZoom());
      renderScheme(map, useSchemeStore.getState().activeScheme);

      // Terra Draw owns line drawing and vertex editing.
      controllerRef.current = new DrawController(
        map,
        async (coords) => {
          const id = await useSchemeStore.getState().addLine(coords as LngLat[]);
          useEditorStore.getState().setTool('select');
          if (id) useEditorStore.getState().select({ type: 'line', lineId: id });
        },
        (lineId, coords) => useSchemeStore.getState().updateLineGeometry(lineId, coords),
      );

      setReady(true);
      void loadExistingNetwork(map);
      if (useMapStore.getState().visibility.population) void refreshPopulation(map);
    });

    // Selection + station placement (when Terra Draw is idle).
    map.on('click', (e) => {
      const ed = useEditorStore.getState();
      if (ed.tool === 'draw-line' || ed.tool === 'edit-geometry') return;
      const layers = ['scheme-stations', 'scheme-lines', 'scheme-lines-tunnel'].filter((l) =>
        map.getLayer(l),
      );
      const feats = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : [];
      const station = feats.find((f) => f.layer.id === 'scheme-stations');
      const lineFeat = feats.find((f) => f.layer.id !== 'scheme-stations');

      if (ed.tool === 'add-station') {
        if (!lineFeat) return;
        const lineId = lineFeat.properties?.lineId as string;
        const line = useSchemeStore.getState().activeScheme?.lines.find((l) => l.id === lineId);
        const coords = line?.geom?.coordinates as LngLat[] | undefined;
        if (coords) {
          const { fraction } = projectToLine(coords, [e.lngLat.lng, e.lngLat.lat]);
          useSchemeStore.getState().addStation(lineId, fraction);
        }
        return;
      }

      if (station) {
        ed.select({
          type: 'station',
          lineId: station.properties?.lineId as string,
          stationId: station.properties?.stationId as string,
        });
      } else if (lineFeat) {
        ed.select({
          type: 'segment',
          lineId: lineFeat.properties?.lineId as string,
          seq: lineFeat.properties?.seq as number,
        });
      } else {
        ed.select(null);
      }
    });

    map.on('mousemove', (e) => setCursor({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
    map.on('mouseout', () => setCursor(null));
    map.on('zoom', () => setZoom(map.getZoom()));

    // Reference data is viewport-scoped (the national sets are too large to load
    // at once), so refresh on pan/zoom. Debounced; population only while on.
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    map.on('moveend', () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void loadExistingNetwork(map);
        if (useMapStore.getState().visibility.population) void refreshPopulation(map);
      }, 250);
    });

    mapRef.current = map;
    mapInstance = map;

    return () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
      map.remove();
      mapRef.current = null;
      mapInstance = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-render the scheme sources when it changes (hiding the line being edited,
  // which Terra Draw renders instead).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const exclude = tool === 'edit-geometry' ? selectionLineId : null;
    renderScheme(map, activeScheme, exclude);
  }, [activeScheme, ready, tool, selectionLineId]);

  // Drive Terra Draw from the active tool.
  useEffect(() => {
    const ctrl = controllerRef.current;
    if (!ctrl || !ready) return;
    if (tool === 'draw-line') {
      ctrl.drawNew();
    } else if (tool === 'edit-geometry' && selectionLineId) {
      const line = useSchemeStore.getState().activeScheme?.lines.find((l) => l.id === selectionLineId);
      const coords = line?.geom?.coordinates as LngLat[] | undefined;
      if (coords && coords.length >= 2) ctrl.editGeometry(selectionLineId, coords);
      else ctrl.idle();
    } else {
      ctrl.idle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selectionLineId, ready]);

  // Cursor affordance for the active tool.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getCanvas().style.cursor =
      tool === 'draw-line' || tool === 'add-station' ? 'crosshair' : '';
  }, [tool, ready]);

  // Apply visibility changes from the store.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    applyVisibility(map, visibility);
  }, [visibility, ready]);

  // Fetch the choropleth for the current viewport the first time it's enabled.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !visibility.population) return;
    void refreshPopulation(map);
  }, [visibility.population, ready]);

  // Push analysis results to the map overlays.
  useEffect(() => {
    const map = mapRef.current;
    if (map && ready) renderAnalysis(map, analysisResult);
  }, [analysisResult, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && ready) renderConnectivity(map, connectivity);
  }, [connectivity, ready]);

  return <div ref={containerRef} className="absolute inset-0" />;
}

function applyVisibility(map: MlMap, visibility: Record<string, boolean>): void {
  for (const overlay of OVERLAYS) {
    if (!overlay.toggleable) continue;
    const visible = visibility[overlay.key] ?? overlay.defaultVisible;
    for (const layerId of overlay.layerIds) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    }
  }
}

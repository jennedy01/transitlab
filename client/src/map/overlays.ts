import type { Map as MlMap } from 'maplibre-gl';

/**
 * The overlay registry.
 *
 * Defines every map layer above the base, in render order (bottom → top), per
 * the implementation spec:
 *
 *   base → population choropleth → existing freight → national rail →
 *   tube/metro → existing stations → OpenRailwayMap raster → scheme lines →
 *   scheme stations → analysis overlays
 *
 * Each spec knows how to add its sources/layers to the map and which layer ids
 * its visibility toggle controls. Data layers start from empty GeoJSON sources
 * (populated by later build steps via `map.getSource(id).setData(...)`); the
 * OpenRailwayMap raster layers render immediately from external tiles.
 */

export type OverlayGroup = 'population' | 'existing' | 'railmap' | 'scheme' | 'analysis';

export interface OverlaySpec {
  /** Stable key, used as the visibility store key. */
  key: string;
  /** Human label for the layers panel (absent => not shown as a toggle). */
  label?: string;
  group: OverlayGroup;
  /** Whether this appears as a user toggle in the layers panel. */
  toggleable: boolean;
  defaultVisible: boolean;
  /** MapLibre layer ids whose visibility this key controls. */
  layerIds: string[];
  /** Attribution credited when any of this overlay's layers are visible. */
  attribution?: string;
  /** Idempotently add this overlay's sources + layers to the map. */
  add: (map: MlMap) => void;
}

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] };

/** Perceptually-uniform (viridis) ramp for population density (persons/ha). */
const DENSITY_RAMP: (number | string)[] = [
  0, '#440154',
  8, '#414487',
  20, '#2a788e',
  45, '#22a884',
  90, '#7ad151',
  180, '#fde725',
];

const ORM_ATTRIBUTION = '© OpenRailwayMap (CC-BY-SA) · data © OpenStreetMap contributors';
const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';
const TFL_ATTRIBUTION = 'Powered by TfL Open Data';
const ONS_ATTRIBUTION = 'Population: © Crown copyright, ONS (OGL v3.0)';

function ensureGeoJSON(map: MlMap, id: string): void {
  if (!map.getSource(id)) {
    map.addSource(id, { type: 'geojson', data: EMPTY_FC });
  }
}

function ormRaster(style: string): OverlaySpec['add'] {
  return (map) => {
    const srcId = `orm-${style}-src`;
    const layerId = `orm-${style}`;
    if (!map.getSource(srcId)) {
      map.addSource(srcId, {
        type: 'raster',
        tiles: ['a', 'b', 'c'].map(
          (s) => `https://${s}.tiles.openrailwaymap.org/${style}/{z}/{x}/{y}.png`,
        ),
        tileSize: 256,
        minzoom: 2,
        maxzoom: 19,
        attribution: ORM_ATTRIBUTION,
      });
    }
    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: 'raster',
        source: srcId,
        layout: { visibility: 'none' },
        paint: { 'raster-opacity': 0.85 },
      });
    }
  };
}

export const OVERLAYS: OverlaySpec[] = [
  /* ---- Population density choropleth -------------------------------------- */
  {
    key: 'population',
    label: 'Population density',
    group: 'population',
    toggleable: true,
    defaultVisible: false,
    layerIds: ['population-fill', 'population-line'],
    attribution: ONS_ATTRIBUTION,
    add: (map) => {
      ensureGeoJSON(map, 'population');
      if (!map.getLayer('population-fill')) {
        map.addLayer({
          id: 'population-fill',
          type: 'fill',
          source: 'population',
          layout: { visibility: 'none' },
          paint: {
            'fill-color': ['interpolate', ['linear'], ['get', 'density'], ...DENSITY_RAMP],
            'fill-opacity': 0.5,
          },
        });
      }
      if (!map.getLayer('population-line')) {
        map.addLayer({
          id: 'population-line',
          type: 'line',
          source: 'population',
          layout: { visibility: 'none' },
          paint: { 'line-color': '#2C333D', 'line-width': 0.3, 'line-opacity': 0.4 },
        });
      }
    },
  },

  /* ---- Former (pre-Beeching) railways ------------------------------------ */
  {
    key: 'historic-rail',
    label: 'Former railways (pre-Beeching)',
    group: 'existing',
    toggleable: true,
    defaultVisible: false,
    layerIds: ['historic-rail'],
    attribution: OSM_ATTRIBUTION,
    add: (map) => {
      ensureGeoJSON(map, 'historic-lines');
      if (!map.getLayer('historic-rail')) {
        map.addLayer({
          id: 'historic-rail',
          type: 'line',
          source: 'historic-lines',
          layout: { visibility: 'none', 'line-cap': 'round' },
          paint: {
            'line-color': '#A6643C', // sepia/rust — evokes a historic map, reads on the light base
            'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.9, 13, 2.4],
            'line-dasharray': [3, 2],
            'line-opacity': 0.9,
          },
        });
      }
    },
  },

  /* ---- Existing network: freight ----------------------------------------- */
  {
    key: 'existing-freight',
    label: 'Freight lines',
    group: 'existing',
    toggleable: true,
    defaultVisible: true,
    layerIds: ['existing-freight'],
    attribution: OSM_ATTRIBUTION,
    add: (map) => {
      ensureGeoJSON(map, 'existing-lines');
      if (!map.getLayer('existing-freight')) {
        map.addLayer({
          id: 'existing-freight',
          type: 'line',
          source: 'existing-lines',
          filter: ['==', ['get', 'modegroup'], 'freight'],
          paint: {
            'line-color': '#8a6d3b',
            'line-width': 1.1,
            'line-dasharray': [2, 2],
            'line-opacity': 0.85,
          },
        });
      }
    },
  },

  /* ---- Existing network: national (heavy) rail --------------------------- */
  {
    key: 'existing-rail',
    label: 'National rail',
    group: 'existing',
    toggleable: true,
    defaultVisible: true,
    layerIds: ['existing-rail'],
    attribution: OSM_ATTRIBUTION,
    add: (map) => {
      ensureGeoJSON(map, 'existing-lines');
      if (!map.getLayer('existing-rail')) {
        map.addLayer({
          id: 'existing-rail',
          type: 'line',
          source: 'existing-lines',
          filter: ['==', ['get', 'modegroup'], 'rail'],
          paint: {
            'line-color': '#5b6b7a',
            'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 12, 2.2],
            'line-opacity': 0.9,
          },
        });
      }
    },
  },

  /* ---- Existing network: tube / metro / light rail ----------------------- */
  {
    key: 'existing-metro',
    label: 'Tube / metro / tram',
    group: 'existing',
    toggleable: true,
    defaultVisible: true,
    layerIds: ['existing-metro'],
    attribution: `${TFL_ATTRIBUTION} · ${OSM_ATTRIBUTION}`,
    add: (map) => {
      ensureGeoJSON(map, 'existing-lines');
      if (!map.getLayer('existing-metro')) {
        map.addLayer({
          id: 'existing-metro',
          type: 'line',
          source: 'existing-lines',
          filter: ['==', ['get', 'modegroup'], 'metro'],
          paint: {
            // TfL/metro lines carry their own colour where known.
            'line-color': ['coalesce', ['get', 'colour'], '#3a86a8'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 12, 2.6],
            'line-opacity': 0.95,
          },
        });
      }
    },
  },

  /* ---- Existing stations -------------------------------------------------- */
  {
    key: 'existing-stations',
    label: 'Existing stations',
    group: 'existing',
    toggleable: true,
    defaultVisible: true,
    layerIds: ['existing-stations'],
    attribution: `${TFL_ATTRIBUTION} · ${OSM_ATTRIBUTION}`,
    add: (map) => {
      ensureGeoJSON(map, 'existing-stations');
      if (!map.getLayer('existing-stations')) {
        map.addLayer({
          id: 'existing-stations',
          type: 'circle',
          source: 'existing-stations',
          minzoom: 8,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 14, 3.5],
            'circle-color': '#cfd6de',
            'circle-stroke-color': '#5b6b7a',
            'circle-stroke-width': 0.8,
            'circle-opacity': 0.9,
          },
        });
      }
    },
  },

  /* ---- OpenRailwayMap raster overlays ------------------------------------ */
  {
    key: 'orm-standard',
    label: 'Infrastructure',
    group: 'railmap',
    toggleable: true,
    defaultVisible: false,
    layerIds: ['orm-standard'],
    attribution: ORM_ATTRIBUTION,
    add: ormRaster('standard'),
  },
  {
    key: 'orm-maxspeed',
    label: 'Max speed',
    group: 'railmap',
    toggleable: true,
    defaultVisible: false,
    layerIds: ['orm-maxspeed'],
    attribution: ORM_ATTRIBUTION,
    add: ormRaster('maxspeed'),
  },
  {
    key: 'orm-electrification',
    label: 'Electrification',
    group: 'railmap',
    toggleable: true,
    defaultVisible: false,
    layerIds: ['orm-electrification'],
    attribution: ORM_ATTRIBUTION,
    add: ormRaster('electrification'),
  },
  {
    key: 'orm-gauge',
    label: 'Gauge',
    group: 'railmap',
    toggleable: true,
    defaultVisible: false,
    layerIds: ['orm-gauge'],
    attribution: ORM_ATTRIBUTION,
    add: ormRaster('gauge'),
  },

  /* ---- User scheme lines (data-driven; always laid out visible) ---------- */
  {
    key: 'scheme-lines',
    group: 'scheme',
    toggleable: false,
    defaultVisible: true,
    // Surface spans render solid, subsurface (tunnel) spans dashed. line-dasharray
    // cannot be data-driven, so structure is split across two filtered layers.
    layerIds: ['scheme-lines-casing', 'scheme-lines', 'scheme-lines-tunnel'],
    add: (map) => {
      ensureGeoJSON(map, 'scheme-lines');
      if (!map.getLayer('scheme-lines-casing')) {
        map.addLayer({
          id: 'scheme-lines-casing',
          type: 'line',
          source: 'scheme-lines',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#15181D', 'line-width': 5, 'line-opacity': 0.9 },
        });
      }
      if (!map.getLayer('scheme-lines')) {
        map.addLayer({
          id: 'scheme-lines',
          type: 'line',
          source: 'scheme-lines',
          filter: ['!=', ['get', 'subsurface'], true],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': ['coalesce', ['get', 'colour'], '#FFFFFF'], 'line-width': 3 },
        });
      }
      if (!map.getLayer('scheme-lines-tunnel')) {
        map.addLayer({
          id: 'scheme-lines-tunnel',
          type: 'line',
          source: 'scheme-lines',
          filter: ['==', ['get', 'subsurface'], true],
          paint: {
            'line-color': ['coalesce', ['get', 'colour'], '#FFFFFF'],
            'line-width': 3,
            'line-dasharray': [2, 1.5],
          },
        });
      }
    },
  },

  /* ---- User scheme stations ---------------------------------------------- */
  {
    key: 'scheme-stations',
    group: 'scheme',
    toggleable: false,
    defaultVisible: true,
    layerIds: ['scheme-stations'],
    add: (map) => {
      ensureGeoJSON(map, 'scheme-stations');
      if (!map.getLayer('scheme-stations')) {
        map.addLayer({
          id: 'scheme-stations',
          type: 'circle',
          source: 'scheme-stations',
          paint: {
            'circle-radius': 4,
            'circle-color': '#FFFFFF',
            'circle-stroke-color': '#00B4A6',
            'circle-stroke-width': 2,
          },
        });
      }
    },
  },

  /* ---- Analysis overlays (catchment buffers, missing-link desire lines) --- */
  {
    key: 'analysis-catchment',
    group: 'analysis',
    toggleable: false,
    defaultVisible: true,
    layerIds: ['analysis-catchment-fill', 'analysis-catchment-line'],
    add: (map) => {
      ensureGeoJSON(map, 'analysis-catchment');
      if (!map.getLayer('analysis-catchment-fill')) {
        map.addLayer({
          id: 'analysis-catchment-fill',
          type: 'fill',
          source: 'analysis-catchment',
          paint: { 'fill-color': '#00B4A6', 'fill-opacity': 0.12 },
        });
      }
      if (!map.getLayer('analysis-catchment-line')) {
        map.addLayer({
          id: 'analysis-catchment-line',
          type: 'line',
          source: 'analysis-catchment',
          paint: { 'line-color': '#00B4A6', 'line-width': 1, 'line-opacity': 0.5 },
        });
      }
    },
  },
  {
    key: 'analysis-coverage',
    group: 'analysis',
    toggleable: false,
    defaultVisible: true,
    layerIds: ['analysis-coverage'],
    add: (map) => {
      ensureGeoJSON(map, 'analysis-coverage');
      if (!map.getLayer('analysis-coverage')) {
        map.addLayer({
          id: 'analysis-coverage',
          type: 'line',
          source: 'analysis-coverage',
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': '#E8A13C', 'line-width': 6, 'line-opacity': 0.5 },
        });
      }
    },
  },
  {
    key: 'analysis-links',
    group: 'analysis',
    toggleable: false,
    defaultVisible: true,
    layerIds: ['analysis-links'],
    add: (map) => {
      ensureGeoJSON(map, 'analysis-links');
      if (!map.getLayer('analysis-links')) {
        map.addLayer({
          id: 'analysis-links',
          type: 'line',
          source: 'analysis-links',
          layout: { 'line-cap': 'round' },
          paint: {
            'line-color': '#E8A13C',
            'line-width': 2,
            'line-dasharray': [1, 1.5],
            'line-opacity': 0.8,
          },
        });
      }
    },
  },
];

/** Initial visibility map keyed by overlay key. */
export const DEFAULT_VISIBILITY: Record<string, boolean> = Object.fromEntries(
  OVERLAYS.map((o) => [o.key, o.defaultVisible]),
);

/** Toggleable overlays grouped for the layers panel, in registry order. */
export const TOGGLE_GROUPS: { group: OverlayGroup; title: string; items: OverlaySpec[] }[] = (
  [
    ['population', 'Demand'],
    ['existing', 'Existing network'],
    ['railmap', 'OpenRailwayMap overlays'],
  ] as [OverlayGroup, string][]
).map(([group, title]) => ({
  group,
  title,
  items: OVERLAYS.filter((o) => o.group === group && o.toggleable),
}));

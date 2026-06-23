import type { Map as MlMap } from 'maplibre-gl';
import {
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawSelectMode,
  TerraDrawRenderMode,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { LngLat } from '../lib/geometry';

const SIGNAL = '#00B4A6';

/**
 * Wraps Terra Draw for the two geometry-editing interactions:
 *   - drawing a brand-new line (linestring mode → `onDrawFinish`)
 *   - editing an existing line's vertices (select mode → `onGeometryChange`)
 *
 * When idle it sits in a non-interactive render mode so the app's own map-click
 * handlers (segment/station selection, station placement) take over.
 */
export class DrawController {
  private draw: TerraDraw;
  private state: 'idle' | 'drawing' | 'editing' = 'idle';
  private editId: string | number | null = null;
  private editLineId: string | null = null;

  constructor(
    map: MlMap,
    private readonly onDrawFinish: (coords: LngLat[]) => void,
    private readonly onGeometryChange: (lineId: string, coords: LngLat[]) => void,
  ) {
    this.draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        new TerraDrawLineStringMode({
          styles: {
            lineStringColor: SIGNAL,
            lineStringWidth: 3,
            closingPointColor: SIGNAL,
            closingPointWidth: 4,
          },
        }),
        new TerraDrawSelectMode({
          flags: {
            linestring: {
              feature: {
                draggable: true,
                coordinates: { midpoints: true, draggable: true, deletable: true },
              },
            },
          },
          styles: {
            selectedLineStringColor: SIGNAL,
            selectionPointColor: '#FFFFFF',
            selectionPointOutlineColor: SIGNAL,
            midPointColor: SIGNAL,
          },
        }),
        new TerraDrawRenderMode({ modeName: 'static', styles: {} }),
      ],
    });

    this.draw.start();
    this.draw.setMode('static');

    this.draw.on('finish', (id) => {
      // Only the completion of a fresh draw matters here; edits stay in 'editing'.
      if (this.state === 'drawing') {
        const feature = this.draw.getSnapshot().find((f) => f.id === id);
        const coords = feature?.geometry.type === 'LineString'
          ? (feature.geometry.coordinates as LngLat[])
          : null;
        this.draw.clear();
        this.idle();
        if (coords && coords.length >= 2) this.onDrawFinish(coords);
      }
    });

    this.draw.on('change', () => {
      if (this.state !== 'editing' || this.editId === null || !this.editLineId) return;
      const feature = this.draw.getSnapshot().find((f) => f.id === this.editId);
      if (feature?.geometry.type === 'LineString') {
        this.onGeometryChange(this.editLineId, feature.geometry.coordinates as LngLat[]);
      }
    });
  }

  /** Begin drawing a fresh line. */
  drawNew(): void {
    this.draw.clear();
    this.editId = null;
    this.editLineId = null;
    this.state = 'drawing';
    this.draw.setMode('linestring');
  }

  /** Load an existing line for vertex editing. */
  editGeometry(lineId: string, coords: LngLat[]): void {
    this.draw.clear();
    this.draw.addFeatures([
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: { mode: 'linestring' },
      },
    ]);
    const snap = this.draw.getSnapshot();
    this.editId = snap[snap.length - 1]?.id ?? null;
    this.editLineId = lineId;
    this.state = 'editing';
    this.draw.setMode('select');
    if (this.editId !== null) this.draw.selectFeature(this.editId);
  }

  /** Return to non-interactive idle. */
  idle(): void {
    this.state = 'idle';
    this.editId = null;
    this.editLineId = null;
    this.draw.clear();
    this.draw.setMode('static');
  }

  destroy(): void {
    try {
      this.draw.stop();
    } catch {
      /* adapter already torn down */
    }
  }
}

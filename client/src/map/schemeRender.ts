import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { SchemeWithLines } from '@transitlab/shared';
import { IS_SUBSURFACE } from '@transitlab/shared';

/**
 * Projects the active scheme into the map's `scheme-lines` and
 * `scheme-stations` GeoJSON sources.
 *
 * Lines are emitted one feature per structural segment so the map can dash
 * subsurface (tunnel) spans and keep surface spans solid; each feature carries
 * its line/segment ids for click selection.
 */

function setSource(map: MlMap, id: string, data: unknown): void {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  if (src) src.setData(data as never);
}

export function renderScheme(
  map: MlMap,
  scheme: SchemeWithLines | null,
  excludeLineId?: string | null,
): void {
  const lineFeatures: unknown[] = [];
  const stationFeatures: unknown[] = [];

  for (const line of scheme?.lines ?? []) {
    if (excludeLineId && line.id === excludeLineId) continue;
    for (const seg of line.segments) {
      if (!seg.geom) continue;
      lineFeatures.push({
        type: 'Feature',
        geometry: seg.geom,
        properties: {
          lineId: line.id,
          seq: seg.seq,
          colour: line.colour,
          structureType: seg.structureType,
          subsurface: IS_SUBSURFACE[seg.structureType] ?? false,
        },
      });
    }
    for (const st of line.stations) {
      stationFeatures.push({
        type: 'Feature',
        geometry: st.geom,
        properties: {
          lineId: line.id,
          stationId: st.id,
          name: st.name,
          interchange: st.isInterchange,
          stepFree: st.stepFree,
        },
      });
    }
  }

  setSource(map, 'scheme-lines', { type: 'FeatureCollection', features: lineFeatures });
  setSource(map, 'scheme-stations', { type: 'FeatureCollection', features: stationFeatures });
}

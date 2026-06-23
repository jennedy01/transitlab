import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { ConnectivityResult, LineAnalysis } from '@transitlab/shared';

/** Pushes analysis results into the map's analysis overlay sources. */

function setSource(map: MlMap, id: string, features: unknown[]): void {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  if (src) src.setData({ type: 'FeatureCollection', features } as never);
}

export function renderAnalysis(map: MlMap, result: LineAnalysis | null): void {
  // Catchment buffers.
  const catchment = (result?.catchment?.stations ?? []).map((s) => s.buffer);
  setSource(map, 'analysis-catchment', catchment);

  // Coverage duplication spans.
  setSource(map, 'analysis-coverage', result?.coverage?.duplicatedSpans ?? []);
}

export function renderConnectivity(map: MlMap, connectivity: ConnectivityResult | null): void {
  const features = (connectivity?.links ?? []).map((l) => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: [l.from.coordinates, l.to.coordinates] },
    properties: {
      from: l.fromName,
      to: l.toName,
      ratio: l.detourRatio,
      improved: l.improvementPct ?? null,
    },
  }));
  setSource(map, 'analysis-links', features);
}

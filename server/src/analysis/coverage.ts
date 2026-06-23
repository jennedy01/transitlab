/**
 * Coverage overlap: how much of the proposed line runs within a buffer of an
 * existing line of the same mode (duplication) versus serving otherwise
 * uncovered ground. Computed in EPSG:27700.
 */
import type { CoverageResult } from '@transitlab/shared';
import { pool } from '../db/pool.js';
import { loadLineMeta, modeGroup } from './data.js';

export async function computeCoverage(
  lineId: string,
  bufferM: number,
): Promise<CoverageResult | null> {
  const meta = await loadLineMeta(lineId);
  if (!meta) return null;
  const group = modeGroup(meta.mode);

  // Existing same-mode lines: TfL is always 'metro'; otherwise derive from mode.
  const { rows } = await pool.query<{
    totalM: number;
    dupM: number;
    spans: unknown;
  }>(
    `WITH ln AS (
       SELECT ST_Transform(geom, 27700) AS g,
              ST_Transform(ST_Buffer(ST_Transform(geom,27700), $2), 4326) AS corridor4326
       FROM lines WHERE id = $1
     ),
     existing AS (
       -- Only the same-mode existing lines that actually run within the route
       -- corridor (not just its bbox) — keeps the collect+buffer set tiny.
       SELECT ST_Buffer(ST_Collect(ST_Transform(el.geom, 27700)), $2) AS g
       FROM existing_lines el
       WHERE el.geom && (SELECT corridor4326 FROM ln)
         AND ST_Intersects(el.geom, (SELECT corridor4326 FROM ln))
         AND (CASE
               WHEN el.source = 'tfl' THEN 'metro'
               WHEN el.mode = 'freight' THEN 'freight'
               WHEN el.mode IN ('metro_tube','light_rail','tram') THEN 'metro'
               ELSE 'rail' END) = $3
     ),
     dup AS (
       SELECT CASE WHEN existing.g IS NULL THEN NULL
                   ELSE ST_Intersection(ln.g, existing.g) END AS g
       FROM ln LEFT JOIN existing ON true
     )
     SELECT ST_Length((SELECT g FROM ln)) AS "totalM",
            COALESCE(ST_Length((SELECT g FROM dup)), 0) AS "dupM",
            ST_AsGeoJSON(ST_Transform((SELECT g FROM dup), 4326))::jsonb AS spans`,
    [lineId, bufferM, group],
  );

  const r = rows[0];
  if (!r || !r.totalM) return null;

  const totalKm = r.totalM / 1000;
  const dupKm = r.dupM / 1000;
  const spansGeo = r.spans as { type: string; coordinates: unknown } | null;

  // The duplicated geometry may be a (Multi)LineString; emit one feature per
  // span (never merge disjoint spans into one polyline).
  const duplicatedSpans: CoverageResult['duplicatedSpans'] = [];
  if (spansGeo?.type === 'LineString') {
    duplicatedSpans.push({
      type: 'Feature',
      geometry: spansGeo as never,
      properties: { kind: 'duplication' },
    });
  } else if (spansGeo?.type === 'MultiLineString') {
    for (const coords of spansGeo.coordinates as number[][][]) {
      duplicatedSpans.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords } as never,
        properties: { kind: 'duplication' },
      });
    }
  }

  return {
    bufferM,
    lengthKm: round(totalKm),
    duplicatedKm: round(dupKm),
    uncoveredKm: round(Math.max(0, totalKm - dupKm)),
    duplicationProportion: round(totalKm > 0 ? dupKm / totalKm : 0, 3),
    duplicatedSpans,
  };
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

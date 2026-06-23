/**
 * Catchment population: the population within a walk radius of each station,
 * area-weighted from LSOA density (the official per-hectare figure) over the
 * buffer∩LSOA intersection — the standard areal-interpolation method. All
 * metric work is done in EPSG:27700.
 */
import type { CatchmentResult, CatchmentStation } from '@transitlab/shared';
import { pool } from '../db/pool.js';

export async function computeCatchment(
  lineId: string,
  walkRadiusM: number,
): Promise<CatchmentResult | null> {
  // Per-station population + buffer polygon (returned for the map overlay).
  const perStation = await pool.query<{
    stationId: string;
    name: string;
    population: number;
    buffer: unknown;
  }>(
    `WITH s AS (
       SELECT id, name,
              ST_Buffer(ST_Transform(geom, 27700), $2) AS b,
              ST_Transform(ST_Buffer(ST_Transform(geom, 27700), $2), 4326) AS b4326
       FROM stations WHERE line_id = $1
     )
     SELECT s.id AS "stationId", s.name,
            COALESCE(SUM(
              pa.density * ST_Area(ST_Intersection(ST_Transform(pa.geom,27700), s.b)) / 10000.0
            ), 0) AS population,
            ST_AsGeoJSON(s.b4326)::jsonb AS buffer
     FROM s
     LEFT JOIN population_areas pa
       ON pa.geom && s.b4326   -- GIST-indexed bbox prefilter (4326)
     GROUP BY s.id, s.name, s.b, s.b4326
     ORDER BY s.name`,
    [lineId, walkRadiusM],
  );

  if (perStation.rows.length === 0) return null;

  // Unique (union) population — counts overlapping catchment once.
  const unique = await pool.query<{ pop: number }>(
    `WITH u AS (
       SELECT ST_Union(ST_Buffer(ST_Transform(geom,27700), $2)) AS b,
              ST_Transform(ST_Union(ST_Buffer(ST_Transform(geom,27700), $2)), 4326) AS b4326
       FROM stations WHERE line_id = $1
     )
     SELECT COALESCE(SUM(
       pa.density * ST_Area(ST_Intersection(ST_Transform(pa.geom,27700), u.b)) / 10000.0
     ), 0) AS pop
     FROM u LEFT JOIN population_areas pa
       ON pa.geom && u.b4326`,
    [lineId, walkRadiusM],
  );

  const stations: CatchmentStation[] = perStation.rows.map((r) => ({
    stationId: r.stationId,
    name: r.name,
    population: Math.round(r.population),
    buffer: {
      type: 'Feature',
      geometry: r.buffer as CatchmentStation['buffer']['geometry'],
      properties: { stationId: r.stationId, name: r.name, population: Math.round(r.population) },
    },
  }));

  return {
    walkRadiusM,
    stations,
    lineTotalPopulation: stations.reduce((a, s) => a + s.population, 0),
    lineUniquePopulation: Math.round(unique.rows[0]?.pop ?? 0),
  };
}

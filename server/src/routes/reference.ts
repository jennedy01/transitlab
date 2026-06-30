/**
 * Read-only reference-network endpoints, served as GeoJSON FeatureCollections
 * for the map. Geometry is generalised/limited where helpful for client
 * performance; population is bbox-filtered because the national LSOA set is too
 * large to render at once.
 */
import { Router } from 'express';
import { pool } from '../db/pool.js';

export const referenceRouter = Router();

/** Parse a `bbox=west,south,east,north` query param (EPSG:4326). */
function parseBbox(raw: unknown): [number, number, number, number] | null {
  if (typeof raw !== 'string') return null;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return parts as [number, number, number, number];
}

/**
 * Existing lines as GeoJSON. The map filters by `modegroup`, derived here:
 * all TfL under 'metro'; OSM freight → 'freight'; subway/tram/light → 'metro';
 * everything else → 'rail'. Geometry simplified for transfer.
 */
referenceRouter.get('/existing-lines', async (req, res) => {
  const bbox = parseBbox(req.query.bbox);
  const params: unknown[] = [];
  let where = '';
  if (bbox) {
    where = 'WHERE geom && ST_MakeEnvelope($1,$2,$3,$4,4326)';
    params.push(bbox[0], bbox[1], bbox[2], bbox[3]);
  }
  try {
    const { rows } = await pool.query<{ fc: unknown }>(
      `WITH src AS (
         SELECT
           id, name, mode, operator, electrified, gauge, colour,
           CASE
             WHEN source = 'tfl' THEN 'metro'
             WHEN mode = 'freight' THEN 'freight'
             WHEN mode IN ('metro_tube','light_rail','tram') THEN 'metro'
             ELSE 'rail'
           END AS modegroup,
           ST_SimplifyPreserveTopology(geom, 0.0002) AS geom
         FROM existing_lines ${where}
         -- Prioritise longer/main alignments; drops tiny sidings first under cap.
         ORDER BY ST_Length(geom) DESC
         LIMIT 4000
       )
       SELECT jsonb_build_object(
         'type','FeatureCollection',
         'features', COALESCE(jsonb_agg(jsonb_build_object(
           'type','Feature',
           'geometry', ST_AsGeoJSON(geom)::jsonb,
           'properties', jsonb_build_object(
             'id', id, 'name', name, 'mode', mode, 'modegroup', modegroup,
             'operator', operator, 'electrified', electrified, 'gauge', gauge,
             'colour', colour)
         )), '[]'::jsonb)
       ) AS fc
       FROM src`,
      params,
    );
    res.json(rows[0].fc);
  } catch (err) {
    res.status(500).json({ error: 'existing-lines failed', detail: (err as Error).message });
  }
});

/** Existing stations as GeoJSON (bbox-filtered for performance). */
referenceRouter.get('/existing-stations', async (req, res) => {
  const bbox = parseBbox(req.query.bbox);
  const params: unknown[] = [];
  let where = '';
  if (bbox) {
    where = 'WHERE geom && ST_MakeEnvelope($1,$2,$3,$4,4326)';
    params.push(bbox[0], bbox[1], bbox[2], bbox[3]);
  }
  try {
    const { rows } = await pool.query<{ fc: unknown }>(
      `SELECT jsonb_build_object(
         'type','FeatureCollection',
         'features', COALESCE(jsonb_agg(jsonb_build_object(
           'type','Feature',
           'geometry', ST_AsGeoJSON(geom)::jsonb,
           'properties', jsonb_build_object('id', id, 'name', name, 'modes', modes)
         )), '[]'::jsonb)
       ) AS fc
       FROM (SELECT id, name, modes, geom FROM existing_stations ${where} LIMIT 5000) s`,
      params,
    );
    res.json(rows[0].fc);
  } catch (err) {
    res.status(500).json({ error: 'existing-stations failed', detail: (err as Error).message });
  }
});

/**
 * Former ("pre-Beeching") railways as GeoJSON — abandoned/disused/dismantled
 * lines from OSM. Viewport-scoped + capped + simplified for transfer.
 */
referenceRouter.get('/historic-lines', async (req, res) => {
  const bbox = parseBbox(req.query.bbox);
  const params: unknown[] = [];
  let where = '';
  if (bbox) {
    where = 'WHERE geom && ST_MakeEnvelope($1,$2,$3,$4,4326)';
    params.push(bbox[0], bbox[1], bbox[2], bbox[3]);
  }
  try {
    const { rows } = await pool.query<{ fc: unknown }>(
      `WITH src AS (
         SELECT id, name, kind, ST_SimplifyPreserveTopology(geom, 0.0002) AS geom
         FROM historic_lines ${where}
         ORDER BY ST_Length(geom) DESC
         LIMIT 4000
       )
       SELECT jsonb_build_object(
         'type','FeatureCollection',
         'features', COALESCE(jsonb_agg(jsonb_build_object(
           'type','Feature',
           'geometry', ST_AsGeoJSON(geom)::jsonb,
           'properties', jsonb_build_object('id', id, 'name', name, 'kind', kind)
         )), '[]'::jsonb)
       ) AS fc
       FROM src`,
      params,
    );
    res.json(rows[0].fc);
  } catch (err) {
    res.status(500).json({ error: 'historic-lines failed', detail: (err as Error).message });
  }
});

/**
 * Population areas (LSOA) as GeoJSON, bbox-filtered (required — the national set
 * is ~35k polygons). Returns density (persons/ha) and population per area.
 */
referenceRouter.get('/population', async (req, res) => {
  const bbox = parseBbox(req.query.bbox);
  if (!bbox) {
    res.status(400).json({ error: 'bbox required', detail: 'bbox=west,south,east,north' });
    return;
  }
  try {
    const { rows } = await pool.query<{ fc: unknown }>(
      `WITH src AS (
         SELECT lsoa_code, population, density,
                ST_SimplifyPreserveTopology(geom, 0.0003) AS geom
         FROM population_areas
         WHERE geom && ST_MakeEnvelope($1,$2,$3,$4,4326)
         LIMIT 6000
       )
       SELECT jsonb_build_object(
         'type','FeatureCollection',
         'features', COALESCE(jsonb_agg(jsonb_build_object(
           'type','Feature',
           'geometry', ST_AsGeoJSON(geom)::jsonb,
           'properties', jsonb_build_object(
             'lsoa', lsoa_code, 'population', population, 'density', round(density::numeric,1))
         )), '[]'::jsonb)
       ) AS fc
       FROM src`,
      [bbox[0], bbox[1], bbox[2], bbox[3]],
    );
    res.json(rows[0].fc);
  } catch (err) {
    res.status(500).json({ error: 'population failed', detail: (err as Error).message });
  }
});

/** Rolling stock reference table (for the line properties picker). */
referenceRouter.get('/rolling-stock', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, mode, gauge_mm AS "gaugeMm", max_speed_kph AS "maxSpeedKph",
              capacity, traction, loading_gauge AS "loadingGauge"
       FROM rolling_stock ORDER BY mode, max_speed_kph DESC`,
    );
    res.json({ rollingStock: rows });
  } catch (err) {
    res.status(500).json({ error: 'rolling-stock failed', detail: (err as Error).message });
  }
});

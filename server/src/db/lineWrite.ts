/**
 * Shared line-content writer: replaces a line's geometry, per-edge structural
 * segments, and stations in one transaction, deriving metric chainage
 * (EPSG:27700), per-segment geometry, station points (from fractional position),
 * and interchange auto-detection. Used by the lines route and the demo seed.
 */
import type pg from 'pg';

const INTERCHANGE_RADIUS_M = 150;

export interface LineContent {
  name: string;
  colour: string;
  mode: string;
  gaugeMm: number;
  electrification: string;
  rollingStockId?: string | null;
  coordinates: [number, number][];
  segments: { structureType: string; trackCount: number; maxSpeedKph?: number | null }[];
  stations: {
    id?: string;
    name: string;
    fraction: number;
    isInterchange?: boolean;
    stepFree?: boolean;
  }[];
}

export async function writeLineContents(
  client: pg.PoolClient,
  lineId: string,
  body: LineContent,
): Promise<void> {
  const lineGeo = JSON.stringify({ type: 'LineString', coordinates: body.coordinates });

  await client.query(
    `UPDATE lines SET name=$2, colour=$3, mode=$4, gauge_mm=$5, electrification=$6,
            rolling_stock_id=$7, geom=ST_SetSRID(ST_GeomFromGeoJSON($8),4326)
     WHERE id=$1`,
    [
      lineId,
      body.name,
      body.colour,
      body.mode,
      body.gaugeMm,
      body.electrification,
      body.rollingStockId ?? null,
      lineGeo,
    ],
  );

  await client.query('DELETE FROM segments WHERE line_id=$1', [lineId]);
  await client.query('DELETE FROM stations WHERE line_id=$1', [lineId]);

  // One segment per polyline edge; default to surface if not supplied.
  const edgeCount = body.coordinates.length - 1;
  for (let i = 0; i < edgeCount; i += 1) {
    const seg = body.segments[i] ?? { structureType: 'surface', trackCount: 2, maxSpeedKph: null };
    const edgeGeo = JSON.stringify({
      type: 'LineString',
      coordinates: [body.coordinates[i], body.coordinates[i + 1]],
    });
    await client.query(
      `INSERT INTO segments (line_id, seq, structure_type, track_count, max_speed_kph, geom)
       VALUES ($1,$2,$3,$4,$5, ST_SetSRID(ST_GeomFromGeoJSON($6),4326))`,
      [lineId, i, seg.structureType, seg.trackCount, seg.maxSpeedKph ?? null, edgeGeo],
    );
  }

  // Cumulative metric chainage (EPSG:27700) along the segments.
  await client.query(
    `WITH lengths AS (
       SELECT id, seq, ST_Length(ST_Transform(geom,27700)) AS len
       FROM segments WHERE line_id=$1
     ), cum AS (
       SELECT id, seq, len,
         COALESCE(SUM(len) OVER (ORDER BY seq ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS start_m
       FROM lengths
     )
     UPDATE segments s SET start_chainage_m = c.start_m, end_chainage_m = c.start_m + c.len
     FROM cum c WHERE s.id = c.id`,
    [lineId],
  );

  // Stations: interpolate a point at the fractional position; auto-flag as an
  // interchange when within range of a real existing station.
  for (const st of body.stations) {
    await client.query(
      `WITH ln AS (
         SELECT geom, ST_Length(ST_Transform(geom,27700)) AS total FROM lines WHERE id=$1
       ), pt AS (
         SELECT ST_LineInterpolatePoint((SELECT geom FROM ln), $3) AS g, (SELECT total FROM ln) AS total
       )
       INSERT INTO stations (line_id, name, is_interchange, step_free, chainage_m, geom)
       SELECT $1, $2,
              COALESCE($4, false) OR EXISTS (
                SELECT 1 FROM existing_stations es
                WHERE ST_DWithin(es.geom::geography, (SELECT g FROM pt)::geography, $6)
              ),
              COALESCE($5, false),
              $3 * (SELECT total FROM pt),
              (SELECT g FROM pt)`,
      [lineId, st.name, st.fraction, st.isInterchange ?? null, st.stepFree ?? null, INTERCHANGE_RADIUS_M],
    );
  }
}

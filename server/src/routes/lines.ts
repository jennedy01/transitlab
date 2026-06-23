/**
 * Line persistence: a line's geometry, its per-edge structural segments, and its
 * stations are saved together in one transaction (full replace of segments +
 * stations). The server derives metric chainage (EPSG:27700), per-segment
 * geometry, station points (from fractional position), and interchange
 * auto-detection (proximity to a real existing station).
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { attachUser } from '../middleware/auth.js';
import { writeLineContents } from '../db/lineWrite.js';

export const linesRouter = Router();
linesRouter.use(attachUser);

const position = z.tuple([z.number(), z.number()]);

const lineBody = z.object({
  name: z.string().min(1).max(160),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  mode: z.string().max(40),
  gaugeMm: z.number().int().positive().max(5000),
  electrification: z.string().max(40),
  rollingStockId: z.string().uuid().nullable().optional(),
  coordinates: z.array(position).min(2),
  segments: z
    .array(
      z.object({
        structureType: z.string().max(40),
        trackCount: z.number().int().min(1).max(8),
        maxSpeedKph: z.number().int().positive().max(500).nullable().optional(),
      }),
    )
    .default([]),
  stations: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(160),
        fraction: z.number().min(0).max(1),
        isInterchange: z.boolean().optional(),
        stepFree: z.boolean().optional(),
      }),
    )
    .default([]),
});

async function userOwnsScheme(schemeId: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query('SELECT 1 FROM schemes WHERE id = $1 AND user_id = $2', [
    schemeId,
    userId,
  ]);
  return !!rowCount;
}

async function schemeIdForLine(lineId: string, userId: string): Promise<string | null> {
  const { rows } = await pool.query<{ scheme_id: string }>(
    `SELECT l.scheme_id FROM lines l
     JOIN schemes s ON s.id = l.scheme_id
     WHERE l.id = $1 AND s.user_id = $2`,
    [lineId, userId],
  );
  return rows[0]?.scheme_id ?? null;
}

/** Serialize a line with its segments + stations and GeoJSON geometry. */
async function loadLineFull(lineId: string) {
  const line = await pool.query(
    `SELECT id, scheme_id AS "schemeId", name, colour, mode, gauge_mm AS "gaugeMm",
            electrification, rolling_stock_id AS "rollingStockId", ST_AsGeoJSON(geom)::jsonb AS geom
     FROM lines WHERE id=$1`,
    [lineId],
  );
  if (!line.rows[0]) return null;
  const segments = await pool.query(
    `SELECT id, line_id AS "lineId", seq, structure_type AS "structureType",
            track_count AS "trackCount", max_speed_kph AS "maxSpeedKph",
            start_chainage_m AS "startChainageM", end_chainage_m AS "endChainageM",
            ST_AsGeoJSON(geom)::jsonb AS geom
     FROM segments WHERE line_id=$1 ORDER BY seq`,
    [lineId],
  );
  const stations = await pool.query(
    `SELECT id, line_id AS "lineId", name, is_interchange AS "isInterchange",
            step_free AS "stepFree", chainage_m AS "chainageM", ST_AsGeoJSON(geom)::jsonb AS geom
     FROM stations WHERE line_id=$1 ORDER BY chainage_m`,
    [lineId],
  );
  return { ...line.rows[0], segments: segments.rows, stations: stations.rows };
}

// Create a line in a scheme.
linesRouter.post('/schemes/:schemeId/lines', async (req, res) => {
  const parsed = lineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid line', detail: parsed.error.issues[0]?.message });
    return;
  }
  if (!(await userOwnsScheme(req.params.schemeId, req.user!.id))) {
    res.status(404).json({ error: 'scheme not found' });
    return;
  }
  try {
    const lineId = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO lines (scheme_id, name, colour, mode, gauge_mm, electrification)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          req.params.schemeId,
          parsed.data.name,
          parsed.data.colour,
          parsed.data.mode,
          parsed.data.gaugeMm,
          parsed.data.electrification,
        ],
      );
      await writeLineContents(client, rows[0].id, parsed.data);
      return rows[0].id;
    });
    res.status(201).json({ line: await loadLineFull(lineId) });
  } catch (err) {
    res.status(500).json({ error: 'create line failed', detail: (err as Error).message });
  }
});

// Replace a line's geometry/properties/segments/stations.
linesRouter.put('/lines/:id', async (req, res) => {
  const parsed = lineBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid line', detail: parsed.error.issues[0]?.message });
    return;
  }
  if (!(await schemeIdForLine(req.params.id, req.user!.id))) {
    res.status(404).json({ error: 'line not found' });
    return;
  }
  try {
    await withTransaction((client) => writeLineContents(client, req.params.id, parsed.data));
    res.json({ line: await loadLineFull(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: 'update line failed', detail: (err as Error).message });
  }
});

linesRouter.delete('/lines/:id', async (req, res) => {
  if (!(await schemeIdForLine(req.params.id, req.user!.id))) {
    res.status(404).json({ error: 'line not found' });
    return;
  }
  try {
    await pool.query('DELETE FROM lines WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'delete line failed', detail: (err as Error).message });
  }
});

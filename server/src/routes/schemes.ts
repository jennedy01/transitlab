/**
 * Scheme CRUD, scoped to the authenticated (or local) user.
 *
 * GET /:id returns the full scheme with its lines, each line's ordered segments
 * and stations, and geometry as GeoJSON — the shape the client store consumes.
 */
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { attachUser } from '../middleware/auth.js';

export const schemesRouter = Router();

// Every scheme route resolves a user (real or local).
schemesRouter.use(attachUser);

const createSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
});

interface SchemeRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

function serializeScheme(r: SchemeRow) {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Load a scheme with its lines/segments/stations, or null if not owned. */
async function loadSchemeFull(schemeId: string, userId: string) {
  const schemeRes = await pool.query<SchemeRow>(
    'SELECT * FROM schemes WHERE id = $1 AND user_id = $2',
    [schemeId, userId],
  );
  const scheme = schemeRes.rows[0];
  if (!scheme) return null;

  const lines = await pool.query(
    `SELECT id, scheme_id AS "schemeId", name, colour, mode,
            gauge_mm AS "gaugeMm", electrification, rolling_stock_id AS "rollingStockId",
            ST_AsGeoJSON(geom)::jsonb AS geom
     FROM lines WHERE scheme_id = $1 ORDER BY name`,
    [schemeId],
  );
  const lineIds = lines.rows.map((l) => l.id as string);

  const segments = lineIds.length
    ? await pool.query(
        `SELECT id, line_id AS "lineId", seq, structure_type AS "structureType",
                track_count AS "trackCount", max_speed_kph AS "maxSpeedKph",
                start_chainage_m AS "startChainageM", end_chainage_m AS "endChainageM",
                ST_AsGeoJSON(geom)::jsonb AS geom
         FROM segments WHERE line_id = ANY($1) ORDER BY seq`,
        [lineIds],
      )
    : { rows: [] as Record<string, unknown>[] };

  const stations = lineIds.length
    ? await pool.query(
        `SELECT id, line_id AS "lineId", name, is_interchange AS "isInterchange",
                step_free AS "stepFree", chainage_m AS "chainageM",
                ST_AsGeoJSON(geom)::jsonb AS geom
         FROM stations WHERE line_id = ANY($1) ORDER BY chainage_m`,
        [lineIds],
      )
    : { rows: [] as Record<string, unknown>[] };

  const byLine = <T extends { lineId: string }>(rows: T[], id: string) =>
    rows.filter((r) => r.lineId === id);

  return {
    ...serializeScheme(scheme),
    lines: lines.rows.map((l) => ({
      ...l,
      segments: byLine(segments.rows as { lineId: string }[], l.id as string),
      stations: byLine(stations.rows as { lineId: string }[], l.id as string),
    })),
  };
}

/** List the user's schemes (metadata only). */
schemesRouter.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query<SchemeRow>(
      'SELECT * FROM schemes WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.user!.id],
    );
    res.json({ schemes: rows.map(serializeScheme) });
  } catch (err) {
    res.status(500).json({ error: 'list failed', detail: (err as Error).message });
  }
});

schemesRouter.post('/', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid input', detail: parsed.error.issues[0]?.message });
    return;
  }
  try {
    const { rows } = await pool.query<SchemeRow>(
      `INSERT INTO schemes (user_id, name, description) VALUES ($1, $2, $3) RETURNING *`,
      [req.user!.id, parsed.data.name, parsed.data.description ?? null],
    );
    res.status(201).json({ scheme: { ...serializeScheme(rows[0]), lines: [] } });
  } catch (err) {
    res.status(500).json({ error: 'create failed', detail: (err as Error).message });
  }
});

schemesRouter.get('/:id', async (req, res) => {
  try {
    const scheme = await loadSchemeFull(req.params.id, req.user!.id);
    if (!scheme) {
      res.status(404).json({ error: 'scheme not found' });
      return;
    }
    res.json({ scheme });
  } catch (err) {
    res.status(500).json({ error: 'load failed', detail: (err as Error).message });
  }
});

schemesRouter.patch('/:id', async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid input' });
    return;
  }
  const fields: string[] = [];
  const values: unknown[] = [];
  if (parsed.data.name !== undefined) {
    values.push(parsed.data.name);
    fields.push(`name = $${values.length}`);
  }
  if (parsed.data.description !== undefined) {
    values.push(parsed.data.description);
    fields.push(`description = $${values.length}`);
  }
  if (!fields.length) {
    res.status(400).json({ error: 'nothing to update' });
    return;
  }
  values.push(req.params.id, req.user!.id);
  try {
    const { rows } = await pool.query<SchemeRow>(
      `UPDATE schemes SET ${fields.join(', ')}
       WHERE id = $${values.length - 1} AND user_id = $${values.length} RETURNING *`,
      values,
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'scheme not found' });
      return;
    }
    res.json({ scheme: serializeScheme(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: 'update failed', detail: (err as Error).message });
  }
});

schemesRouter.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM schemes WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user!.id],
    );
    if (!rowCount) {
      res.status(404).json({ error: 'scheme not found' });
      return;
    }
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: 'delete failed', detail: (err as Error).message });
  }
});

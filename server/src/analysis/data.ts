/** Shared loaders for the analysis modules. */
import { pool } from '../db/pool.js';

export interface SegRow {
  seq: number;
  structureType: string;
  trackCount: number;
  maxSpeedKph: number | null;
  lengthM: number;
  startChainageM: number;
  endChainageM: number;
}
export interface StationRow {
  name: string;
  chainageM: number;
  isInterchange: boolean;
  stepFree: boolean;
}
export interface LineMeta {
  id: string;
  name: string;
  mode: string;
  electrification: string;
  rollingStockId: string | null;
}

export async function loadLineMeta(lineId: string): Promise<LineMeta | null> {
  const { rows } = await pool.query(
    `SELECT id, name, mode, electrification, rolling_stock_id AS "rollingStockId"
     FROM lines WHERE id = $1`,
    [lineId],
  );
  return rows[0] ?? null;
}

export async function loadSegments(lineId: string): Promise<SegRow[]> {
  const { rows } = await pool.query<SegRow>(
    `SELECT seq, structure_type AS "structureType", track_count AS "trackCount",
            max_speed_kph AS "maxSpeedKph",
            ST_Length(ST_Transform(geom,27700)) AS "lengthM",
            start_chainage_m AS "startChainageM", end_chainage_m AS "endChainageM"
     FROM segments WHERE line_id = $1 ORDER BY seq`,
    [lineId],
  );
  return rows;
}

export async function loadStations(lineId: string): Promise<StationRow[]> {
  const { rows } = await pool.query<StationRow>(
    `SELECT name, chainage_m AS "chainageM", is_interchange AS "isInterchange",
            step_free AS "stepFree"
     FROM stations WHERE line_id = $1 ORDER BY chainage_m`,
    [lineId],
  );
  return rows;
}

/** Default top speed (km/h) by mode, used when no rolling stock is assigned. */
export const MODE_TOP_SPEED_KPH: Record<string, number> = {
  heavy_rail: 160,
  metro_tube: 90,
  light_rail: 80,
  tram: 70,
  freight: 120,
};

/** Map a line/segment mode to the existing-network mode group. */
export function modeGroup(mode: string): 'rail' | 'freight' | 'metro' {
  if (mode === 'freight') return 'freight';
  if (mode === 'metro_tube' || mode === 'light_rail' || mode === 'tram') return 'metro';
  return 'rail';
}

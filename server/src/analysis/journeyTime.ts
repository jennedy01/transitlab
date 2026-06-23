/**
 * Journey-time estimate.
 *
 * End-to-end run time from rolling-stock top speed, per-segment speed limits,
 * station spacing, and a fixed dwell per intermediate stop, using a simple
 * trapezoidal accel/cruise/decel kinematic model per inter-station leg.
 */
import type { JourneyLeg, JourneyTimeResult } from '@transitlab/shared';
import { pool } from '../db/pool.js';
import { loadLineMeta, loadSegments, loadStations, MODE_TOP_SPEED_KPH } from './data.js';

const ACCEL = 0.7; // m/s²
const DECEL = 0.8; // m/s²
const DWELL_S = 45; // per intermediate stop

/** Time (s) to traverse distance d (m) topping out at v (m/s). */
function legTime(d: number, v: number): number {
  if (v <= 0 || d <= 0) return 0;
  const dAccel = (v * v) / (2 * ACCEL);
  const dDecel = (v * v) / (2 * DECEL);
  if (d >= dAccel + dDecel) {
    const tCruise = (d - dAccel - dDecel) / v;
    return v / ACCEL + v / DECEL + tCruise;
  }
  // Triangular: never reaches v.
  const vp = Math.sqrt(d / (0.5 / ACCEL + 0.5 / DECEL));
  return vp / ACCEL + vp / DECEL;
}

export async function computeJourneyTime(lineId: string): Promise<JourneyTimeResult | null> {
  const meta = await loadLineMeta(lineId);
  const segments = await loadSegments(lineId);
  if (!meta || segments.length === 0) return null;
  const stations = await loadStations(lineId);

  // Rolling-stock top speed, else mode default.
  let stockMax = MODE_TOP_SPEED_KPH[meta.mode] ?? 120;
  if (meta.rollingStockId) {
    const { rows } = await pool.query<{ v: number }>(
      'SELECT max_speed_kph AS v FROM rolling_stock WHERE id = $1',
      [meta.rollingStockId],
    );
    if (rows[0]) stockMax = rows[0].v;
  }

  const modeDefault = MODE_TOP_SPEED_KPH[meta.mode] ?? 120;
  const segSpeed = (s: (typeof segments)[number]) => s.maxSpeedKph ?? modeDefault;

  const total = segments[segments.length - 1].endChainageM;

  // Terminus chainages: stations if ≥2, else the whole line.
  const stops =
    stations.length >= 2
      ? stations.map((s) => ({ name: s.name, chainageM: s.chainageM }))
      : [
          { name: 'Start', chainageM: 0 },
          { name: 'End', chainageM: total },
        ];

  const legs: JourneyLeg[] = [];
  let runTimeS = 0;
  for (let i = 0; i < stops.length - 1; i += 1) {
    const c0 = stops[i].chainageM;
    const c1 = stops[i + 1].chainageM;
    const d = Math.max(0, c1 - c0);
    // Limiting speed over the leg: min of stock + overlapping segment limits.
    const overlapping = segments.filter((s) => s.endChainageM > c0 && s.startChainageM < c1);
    const limit = Math.min(stockMax, ...overlapping.map(segSpeed));
    const speed = Number.isFinite(limit) ? limit : stockMax;
    const t = legTime(d, speed / 3.6);
    runTimeS += t;
    legs.push({
      fromStation: stops[i].name,
      toStation: stops[i + 1].name,
      distanceM: Math.round(d),
      speedKph: speed,
      travelTimeS: Math.round(t),
    });
  }

  // Dwell at intermediate stops.
  const intermediate = Math.max(0, stops.length - 2);
  runTimeS += intermediate * DWELL_S;

  const runDistance = stops[stops.length - 1].chainageM - stops[0].chainageM;
  const averageSpeedKph = runTimeS > 0 ? (runDistance / runTimeS) * 3.6 : 0;

  return {
    runTimeS: Math.round(runTimeS),
    averageSpeedKph: Math.round(averageSpeedKph * 10) / 10,
    lengthKm: Math.round((runDistance / 1000) * 100) / 100,
    dwellTimeS: DWELL_S,
    stops: stations.length,
    legs,
  };
}

/**
 * Indicative capital cost model.
 *
 * Rates are illustrative UK planning figures (£ million), clearly labelled as
 * estimates, not forecasts. Structure rates are for a double-track baseline and
 * scale with track count; electrification is per route-km; a contingency line
 * reflects optimism bias / risk.
 */
import type { CostLineItem, CostResult } from '@transitlab/shared';
import { loadLineMeta, loadSegments } from './data.js';

/** £ million per km, double-track baseline, by structure type. */
const STRUCTURE_RATE: Record<string, number> = {
  tunnel_bored: 250,
  tunnel_cut_cover: 130,
  viaduct: 70,
  bridge: 80,
  embankment: 30,
  cutting: 28,
  surface: 18,
};

/** £ million per route-km of electrification. */
const ELECTRIFICATION_RATE: Record<string, number> = {
  ohle_25kv: 1.8,
  ohle_1500v: 1.6,
  third_rail_750v: 1.0,
  diesel: 0,
  battery: 0.2,
  hydrogen: 0.3,
};

const STATION_BASE = 40; // £m
const STATION_INTERCHANGE = 85; // £m
const STATION_STEP_FREE_ADD = 8; // £m
const CONTINGENCY = 0.4; // 40%
const TUNNEL_FLAG_PROPORTION = 0.4;

const trackFactor = (n: number) => 0.6 + 0.2 * n; // 2 tracks → 1.0

export async function computeCost(lineId: string): Promise<CostResult | null> {
  const meta = await loadLineMeta(lineId);
  const segments = await loadSegments(lineId);
  if (!meta || segments.length === 0) return null;

  const lengthM = segments.reduce((a, s) => a + s.lengthM, 0);
  const lengthKm = lengthM / 1000;

  // Aggregate structure cost by type.
  const byType = new Map<string, { km: number; cost: number }>();
  let tunnelLen = 0;
  for (const s of segments) {
    const km = s.lengthM / 1000;
    const rate = STRUCTURE_RATE[s.structureType] ?? STRUCTURE_RATE.surface;
    const cost = rate * km * trackFactor(s.trackCount);
    const cur = byType.get(s.structureType) ?? { km: 0, cost: 0 };
    cur.km += km;
    cur.cost += cost;
    byType.set(s.structureType, cur);
    if (s.structureType.startsWith('tunnel')) tunnelLen += s.lengthM;
  }

  const breakdown: CostLineItem[] = [];
  for (const [structureType, v] of byType) {
    breakdown.push({
      label: `Structure — ${structureType.replace(/_/g, ' ')}`,
      category: 'structure',
      quantity: round(v.km, 2),
      unit: 'km',
      ratePerUnit: v.km > 0 ? round(v.cost / v.km, 1) : 0,
      subtotal: round(v.cost, 1),
      structureType: structureType as CostLineItem['structureType'],
    });
  }

  // Stations.
  const stations = await stationCosts(lineId);
  if (stations.count > 0) {
    breakdown.push({
      label: `Stations (${stations.count}${stations.interchanges ? `, ${stations.interchanges} interchange` : ''})`,
      category: 'stations',
      quantity: stations.count,
      unit: 'station',
      ratePerUnit: round(stations.cost / stations.count, 1),
      subtotal: round(stations.cost, 1),
    });
  }

  // Electrification.
  const elecRate = ELECTRIFICATION_RATE[meta.electrification] ?? 0;
  const elecCost = elecRate * lengthKm;
  if (elecCost > 0) {
    breakdown.push({
      label: `Electrification — ${meta.electrification.replace(/_/g, ' ')}`,
      category: 'electrification',
      quantity: round(lengthKm, 2),
      unit: 'km',
      ratePerUnit: elecRate,
      subtotal: round(elecCost, 1),
    });
  }

  const base = breakdown.reduce((a, b) => a + b.subtotal, 0);
  const contingency = base * CONTINGENCY;
  breakdown.push({
    label: 'Contingency & risk (40%)',
    category: 'structure',
    quantity: 40,
    unit: '%',
    ratePerUnit: 0,
    subtotal: round(contingency, 1),
  });

  const total = base + contingency;
  const tunnelProportion = lengthM > 0 ? tunnelLen / lengthM : 0;

  return {
    currency: 'GBP',
    total: round(total, 1),
    perKm: lengthKm > 0 ? round(total / lengthKm, 1) : 0,
    lengthKm: round(lengthKm, 2),
    tunnelProportion: round(tunnelProportion, 3),
    overThreshold: tunnelProportion > TUNNEL_FLAG_PROPORTION,
    breakdown,
  };
}

async function stationCosts(lineId: string) {
  const { loadStations } = await import('./data.js');
  const stations = await loadStations(lineId);
  let cost = 0;
  let interchanges = 0;
  for (const st of stations) {
    cost += st.isInterchange ? STATION_INTERCHANGE : STATION_BASE;
    if (st.stepFree) cost += STATION_STEP_FREE_ADD;
    if (st.isInterchange) interchanges += 1;
  }
  return { count: stations.length, interchanges, cost };
}

function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

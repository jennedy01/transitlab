/**
 * Network connectivity / missing links — the flagship analysis.
 *
 * Builds a routable graph from the existing passenger network (pgRouting), takes
 * the major population centres near the scheme, and for each pair compares the
 * on-network travel distance to the straight-line distance. Pairs with a high
 * detour ratio despite being close and populous are flagged as candidate
 * "missing links". When the proposed line is folded into the graph, the same
 * pairs are re-routed to show which links it now shortens.
 */
import type { ConnectivityResult, MissingLink } from '@transitlab/shared';
import { pool } from '../db/pool.js';

const REGION_EXPAND_M = 25_000;
const CENTRE_GRID_M = 4_000;
const MAX_CENTRES = 12;
const SNAP_M = 600; // proposed-line vertex → existing graph vertex
const DETOUR_FLAG = 1.6;
const MIN_PAIR_KM = 2;
const MAX_PAIR_KM = 35;
const MAX_LINKS = 8;

// Memoise the in-flight build so concurrent first requests don't both run the
// (slow) topology build.
let graphBuild: Promise<void> | null = null;

/** Build the network graph + topology once (lazy, idempotent, concurrency-safe). */
export function ensureGraph(): Promise<void> {
  graphBuild = graphBuild ?? buildGraph().catch((err) => {
    graphBuild = null; // allow a retry on the next request
    throw err;
  });
  return graphBuild;
}

async function buildGraph(): Promise<void> {
  const { rows } = await pool.query<{ cnt: number }>('SELECT count(*)::int AS cnt FROM network_edges');
  if (rows[0].cnt === 0) {
    console.log('[connectivity] populating network_edges from existing passenger lines…');
    await pool.query(
      `INSERT INTO network_edges (geom, cost, reverse_cost, mode)
       SELECT geom, ST_Length(ST_Transform(geom,27700)), ST_Length(ST_Transform(geom,27700)),
              CASE WHEN source='tfl' THEN 'metro'
                   WHEN mode IN ('metro_tube','light_rail','tram') THEN 'metro'
                   ELSE 'rail' END
       FROM existing_lines
       WHERE source='tfl' OR mode IN ('heavy_rail','metro_tube','light_rail','tram')`,
    );
  }
  const built = await pool.query<{ built: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM network_edges WHERE source IS NOT NULL) AS built',
  );
  if (!built.rows[0].built) {
    console.log('[connectivity] building pgRouting topology (one-off, may take a minute)…');
    await pool.query(`SELECT pgr_createTopology('network_edges', 0.0001, 'geom', 'id')`);
  }
}

interface Centre {
  idx: number;
  lng: number;
  lat: number;
  population: number;
  vid: number | null;
  name: string;
}

export async function computeConnectivity(
  lineId: string,
  opts: { includeProposed?: boolean } = {},
): Promise<ConnectivityResult> {
  await ensureGraph();

  // Region bbox (4326) around the line.
  const bboxRes = await pool.query<{ minx: number; miny: number; maxx: number; maxy: number }>(
    `SELECT ST_XMin(e) AS minx, ST_YMin(e) AS miny, ST_XMax(e) AS maxx, ST_YMax(e) AS maxy
     FROM (SELECT ST_Transform(ST_Buffer(ST_Transform(ST_Envelope(geom),27700), $2), 4326) AS e
           FROM lines WHERE id=$1) q`,
    [lineId, REGION_EXPAND_M],
  );
  const bbox = bboxRes.rows[0];
  if (!bbox || bbox.minx == null) return { links: [], improvements: [] };
  const envSql = `ST_MakeEnvelope(${bbox.minx},${bbox.miny},${bbox.maxx},${bbox.maxy},4326)`;

  // Major population centres in the region, deduped to a grid.
  const centreRows = await pool.query<{ lng: number; lat: number; population: number }>(
    `WITH cand AS (
       SELECT pa.population,
              ST_X(ST_Centroid(pa.geom)) AS lng, ST_Y(ST_Centroid(pa.geom)) AS lat,
              ST_SnapToGrid(ST_Transform(ST_Centroid(pa.geom),27700), $1) AS cell
       FROM population_areas pa
       WHERE pa.geom && ${envSql}
     ),
     dedup AS (
       SELECT DISTINCT ON (cell) lng, lat, population FROM cand ORDER BY cell, population DESC
     )
     SELECT lng, lat, population FROM dedup ORDER BY population DESC LIMIT $2`,
    [CENTRE_GRID_M, MAX_CENTRES],
  );
  if (centreRows.rows.length < 2) return { links: [], improvements: [] };

  // Resolve each centre to its nearest graph vertex + a human label.
  const centres: Centre[] = [];
  for (let i = 0; i < centreRows.rows.length; i += 1) {
    const c = centreRows.rows[i];
    const v = await pool.query<{ id: number }>(
      `SELECT id FROM network_edges_vertices_pgr
       ORDER BY the_geom <-> ST_SetSRID(ST_Point($1,$2),4326) LIMIT 1`,
      [c.lng, c.lat],
    );
    const nm = await pool.query<{ name: string | null }>(
      `SELECT name FROM existing_stations
       WHERE name IS NOT NULL
       ORDER BY geom <-> ST_SetSRID(ST_Point($1,$2),4326) LIMIT 1`,
      [c.lng, c.lat],
    );
    centres.push({
      idx: i,
      lng: c.lng,
      lat: c.lat,
      population: c.population,
      vid: v.rows[0]?.id ?? null,
      name: nm.rows[0]?.name ?? `Centre ${i + 1}`,
    });
  }
  const usable = centres.filter((c) => c.vid !== null);
  if (usable.length < 2) return { links: [], improvements: [] };

  const vids = [...new Set(usable.map((c) => c.vid!))];
  const edgesSql = `SELECT id, source, target, cost, reverse_cost FROM network_edges WHERE geom && ${envSql} AND source IS NOT NULL`;

  const before = await routeMatrix(edgesSql, vids);

  // Straight-line distances (27700) between centres.
  const links: MissingLink[] = [];
  for (let a = 0; a < usable.length; a += 1) {
    for (let b = a + 1; b < usable.length; b += 1) {
      const ca = usable[a];
      const cb = usable[b];
      const straight = await straightLineM(ca, cb);
      const straightKm = straight / 1000;
      if (straightKm < MIN_PAIR_KM || straightKm > MAX_PAIR_KM) continue;
      const net = before.get(key(ca.vid!, cb.vid!));
      const networkKm = net != null && Number.isFinite(net) ? net / 1000 : null;
      const ratio = networkKm != null ? networkKm / straightKm : null;
      links.push({
        id: `${ca.idx}-${cb.idx}`,
        fromName: ca.name,
        toName: cb.name,
        from: { type: 'Point', coordinates: [ca.lng, ca.lat] },
        to: { type: 'Point', coordinates: [cb.lng, cb.lat] },
        straightLineKm: round(straightKm),
        networkKm: networkKm != null ? round(networkKm) : null,
        detourRatio: ratio != null ? round(ratio, 2) : null,
        combinedPopulation: ca.population + cb.population,
      });
    }
  }

  // Flag the worst-connected, most-populous pairs that ARE reachable on the
  // network but take a circuitous route (a high detour ratio). Unreachable
  // pairs are excluded — they are usually graph-topology artefacts, not links.
  const flagged = links
    .filter((l) => l.detourRatio != null && l.detourRatio >= DETOUR_FLAG)
    .sort((x, y) => y.detourRatio! * y.combinedPopulation - x.detourRatio! * x.combinedPopulation)
    .slice(0, MAX_LINKS);

  const result: ConnectivityResult = { links: flagged, improvements: [] };
  if (!opts.includeProposed || flagged.length === 0) return result;

  // Fold the proposed line into the graph and re-route the flagged pairs.
  const proposedEdges = await buildProposedEdges(lineId);
  if (proposedEdges.length === 0) return result;
  // Combine existing edges with the proposed line's edges for re-routing.
  const proposedValues = proposedEdges
    .map((e) => `(${e.id}::bigint, ${e.source}::bigint, ${e.target}::bigint, ${e.cost}::float, ${e.cost}::float)`)
    .join(',');
  const afterEdges =
    `SELECT id, source, target, cost, reverse_cost FROM (${edgesSql}) AS base ` +
    `UNION ALL SELECT id, source, target, cost, reverse_cost FROM ` +
    `(VALUES ${proposedValues}) AS pe(id, source, target, cost, reverse_cost)`;

  const after = await routeMatrix(afterEdges, vids);
  for (const link of flagged) {
    const [a, b] = link.id.split('-').map(Number);
    const ca = usable.find((c) => c.idx === a);
    const cb = usable.find((c) => c.idx === b);
    if (!ca || !cb) continue;
    const beforeCost = before.get(key(ca.vid!, cb.vid!));
    const afterCost = after.get(key(ca.vid!, cb.vid!));
    if (beforeCost == null || afterCost == null || !Number.isFinite(beforeCost)) continue;
    if (afterCost < beforeCost - 1) {
      const beforeRatio = link.detourRatio ?? beforeCost / 1000 / link.straightLineKm;
      const afterRatio = afterCost / 1000 / link.straightLineKm;
      const improvementPct = round(((beforeCost - afterCost) / beforeCost) * 100, 1);
      link.improvedRatio = round(afterRatio, 2);
      link.improvementPct = improvementPct;
      result.improvements.push({
        linkId: link.id,
        fromName: link.fromName,
        toName: link.toName,
        beforeRatio: round(beforeRatio, 2),
        afterRatio: round(afterRatio, 2),
        improvementPct,
      });
    }
  }
  result.improvements.sort((x, y) => y.improvementPct - x.improvementPct);
  return result;
}

/** Many-to-many shortest path costs as a map keyed "a:b". */
async function routeMatrix(edgesSql: string, vids: number[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (vids.length < 2) return map;
  const { rows } = await pool.query<{ start_vid: number; end_vid: number; agg_cost: number }>(
    `SELECT start_vid, end_vid, agg_cost
     FROM pgr_dijkstraCost($1::text, $2::bigint[], $2::bigint[], directed := false)`,
    [edgesSql, vids],
  );
  for (const r of rows) map.set(key(r.start_vid, r.end_vid), r.agg_cost);
  return map;
}

async function straightLineM(a: Centre, b: Centre): Promise<number> {
  const { rows } = await pool.query<{ d: number }>(
    `SELECT ST_Distance(ST_Transform(ST_SetSRID(ST_Point($1,$2),4326),27700),
                        ST_Transform(ST_SetSRID(ST_Point($3,$4),4326),27700)) AS d`,
    [a.lng, a.lat, b.lng, b.lat],
  );
  return rows[0].d;
}

interface ProposedEdge {
  id: number;
  source: number;
  target: number;
  cost: number;
}

/**
 * Edges for the proposed line, plugged into the existing graph: each polyline
 * vertex snaps to a nearby existing graph vertex if one is in range, otherwise
 * gets a fresh synthetic (negative) node id.
 */
async function buildProposedEdges(lineId: string): Promise<ProposedEdge[]> {
  const lineRes = await pool.query<{ coords: [number, number][] }>(
    `SELECT (ST_AsGeoJSON(geom)::jsonb -> 'coordinates') AS coords FROM lines WHERE id=$1`,
    [lineId],
  );
  const coords = lineRes.rows[0]?.coords;
  if (!coords || coords.length < 2) return [];

  const segLens = await pool.query<{ len: number }>(
    `SELECT ST_Length(ST_Transform(geom,27700)) AS len FROM segments WHERE line_id=$1 ORDER BY seq`,
    [lineId],
  );

  // Resolve a node id per unique vertex.
  const nodeIds: number[] = [];
  let synthetic = -1;
  for (let i = 0; i < coords.length; i += 1) {
    const [lng, lat] = coords[i];
    const v = await pool.query<{ id: number }>(
      `SELECT id FROM network_edges_vertices_pgr
       WHERE ST_DWithin(the_geom::geography, ST_SetSRID(ST_Point($1,$2),4326)::geography, $3)
       ORDER BY the_geom <-> ST_SetSRID(ST_Point($1,$2),4326) LIMIT 1`,
      [lng, lat, SNAP_M],
    );
    nodeIds.push(v.rows[0]?.id ?? synthetic--);
  }

  const edges: ProposedEdge[] = [];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const raw = segLens.rows[i]?.len;
    // Guard against null/0/NaN — these are interpolated into the routing SQL,
    // and a zero-cost edge would be a free shortcut that corrupts the result.
    const cost = Number.isFinite(raw) && (raw as number) > 0 ? (raw as number) : 100;
    // Synthetic edge ids well below any real id.
    edges.push({ id: -1000 - i, source: nodeIds[i], target: nodeIds[i + 1], cost });
  }
  return edges;
}

const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

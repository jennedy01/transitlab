/**
 * Seed national rail + freight geometry from OpenStreetMap via Overpass.
 *
 * The UK is split into regional bounding boxes and queried sequentially (Overpass
 * has strict timeouts/rate limits). Each response is cached to disk so re-runs
 * don't re-hit the endpoint. Railway ways are categorised into mode groups
 * (rail / freight / metro) for the map's existing-network toggles; station and
 * halt nodes become existing_stations. Idempotent (upsert by source/source_id).
 *
 * Data © OpenStreetMap contributors, ODbL.
 *
 * Run a subset with OVERPASS_REGIONS=london,north_west (comma-separated keys).
 */
import { pool } from '../../db/pool.js';
import { env } from '../../env.js';
import { cached } from './cache.js';
import { bulkUpsert, fetchTextRetry, isMain, lineStringGeoJSON, pointGeoJSON, sleep } from './util.js';

interface Region {
  key: string;
  name: string;
  /** [south, west, north, east] */
  bbox: [number, number, number, number];
}

/** Regional grid covering Great Britain (kept coarse to limit query count). */
const REGIONS: Region[] = [
  { key: 'london', name: 'Greater London', bbox: [51.25, -0.55, 51.72, 0.32] },
  { key: 'south_east', name: 'South East', bbox: [50.7, -1.0, 51.8, 1.5] },
  { key: 'south_west', name: 'South West', bbox: [49.9, -5.8, 51.7, -1.0] },
  { key: 'east', name: 'East of England', bbox: [51.8, -0.6, 53.0, 1.8] },
  { key: 'midlands_w', name: 'West Midlands', bbox: [51.9, -3.2, 53.2, -1.0] },
  { key: 'midlands_e', name: 'East Midlands', bbox: [52.4, -1.0, 53.6, 0.4] },
  { key: 'wales', name: 'Wales', bbox: [51.3, -5.5, 53.5, -2.6] },
  { key: 'north_west', name: 'North West', bbox: [53.0, -3.3, 54.7, -2.0] },
  { key: 'yorkshire', name: 'Yorkshire & Humber', bbox: [53.3, -2.6, 54.6, 0.3] },
  { key: 'north_east', name: 'North East', bbox: [54.4, -2.7, 55.9, -1.2] },
  { key: 'scotland_s', name: 'Southern Scotland', bbox: [54.6, -5.3, 56.3, -1.9] },
  { key: 'scotland_c', name: 'Central Scotland', bbox: [55.7, -5.2, 56.9, -2.3] },
  { key: 'scotland_n', name: 'Northern Scotland', bbox: [56.6, -6.5, 58.7, -2.0] },
];

const RAIL_RX = '^(rail|light_rail|tram|subway|narrow_gauge)$';

function buildQuery(bbox: Region['bbox']): string {
  const b = bbox.join(',');
  return (
    `[out:json][timeout:240];` +
    `(` +
    `way["railway"~"${RAIL_RX}"](${b});` +
    `node["railway"~"^(station|halt)$"](${b});` +
    `);` +
    `out tags geom;`
  );
}

interface OsmWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}
interface OsmNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}
type OsmElement = OsmWay | OsmNode;

/** Classify a railway way into a (modegroup, mode) pair for styling/toggles. */
function classify(tags: Record<string, string>): { modegroup: string; mode: string } {
  const railway = tags.railway ?? 'rail';
  if (railway === 'subway') return { modegroup: 'metro', mode: 'metro_tube' };
  if (railway === 'light_rail') return { modegroup: 'metro', mode: 'light_rail' };
  if (railway === 'tram') return { modegroup: 'metro', mode: 'tram' };
  // Heavy rail: freight vs passenger.
  const service = tags.service ?? '';
  const usage = tags.usage ?? '';
  if (usage === 'freight' || service === 'siding' || service === 'yard' || service === 'spur') {
    return { modegroup: 'freight', mode: 'freight' };
  }
  return { modegroup: 'rail', mode: 'heavy_rail' };
}

interface LineRow {
  sourceId: string;
  modegroup: string;
  mode: string;
  name: string | null;
  operator: string | null;
  electrified: string | null;
  gauge: string | null;
  geomJson: string;
}
interface StationRow {
  sourceId: string;
  name: string | null;
  modes: string[];
  geomJson: string;
}

async function processRegion(region: Region): Promise<{ lines: number; stations: number }> {
  const raw = await cached(`overpass-${region.key}.json`, async () => {
    console.log(`[seed:overpass] querying ${region.name}…`);
    const body = `data=${encodeURIComponent(buildQuery(region.bbox))}`;
    const text = await fetchTextRetry(
      env.overpassUrl,
      { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      { label: `overpass ${region.key}`, retries: 5, baseDelayMs: 5000, timeoutMs: 300_000 },
    );
    // Be a good citizen between live region queries.
    await sleep(3000);
    return text;
  });

  const data = JSON.parse(raw) as { elements?: OsmElement[] };
  const elements = data.elements ?? [];

  const lineRows: LineRow[] = [];
  const stationRows: StationRow[] = [];

  for (const el of elements) {
    if (el.type === 'way') {
      const tags = el.tags ?? {};
      const coords = (el.geometry ?? []).map((g) => [g.lon, g.lat] as [number, number]);
      const geom = lineStringGeoJSON(coords);
      if (!geom) continue;
      const { modegroup, mode } = classify(tags);
      lineRows.push({
        sourceId: `way/${el.id}`,
        modegroup,
        mode,
        name: tags.name ?? null,
        operator: tags.operator ?? null,
        electrified: tags.electrified ?? null,
        gauge: tags.gauge ?? null,
        geomJson: geom,
      });
    } else if (el.type === 'node') {
      if (!Number.isFinite(el.lat) || !Number.isFinite(el.lon)) continue;
      const tags = el.tags ?? {};
      stationRows.push({
        sourceId: `node/${el.id}`,
        name: tags.name ?? null,
        modes: [tags.railway ?? 'station'],
        geomJson: pointGeoJSON(el.lon, el.lat),
      });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (lineRows.length) {
      await bulkUpsert<LineRow>(client, {
        prefix:
          'INSERT INTO existing_lines (source, source_id, mode, name, operator, electrified, gauge, geom) VALUES',
        suffix: `ON CONFLICT (source, source_id) DO UPDATE SET
                   mode = EXCLUDED.mode, name = EXCLUDED.name, operator = EXCLUDED.operator,
                   electrified = EXCLUDED.electrified, gauge = EXCLUDED.gauge, geom = EXCLUDED.geom`,
        rows: lineRows,
        paramsPerRow: 7,
        // `mode` is the OSM-derived mode; the map's modegroup is computed at
        // serve time (see routes/reference.ts).
        rowPlaceholders: (b) =>
          `('osm', $${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, ST_GeomFromGeoJSON($${b + 7}))`,
        mapRow: (r) => [r.sourceId, r.mode, r.name, r.operator, r.electrified, r.gauge, r.geomJson],
        batchSize: 300,
      });
    }
    if (stationRows.length) {
      await bulkUpsert<StationRow>(client, {
        prefix: 'INSERT INTO existing_stations (source, source_id, name, modes, geom) VALUES',
        suffix: `ON CONFLICT (source, source_id) DO UPDATE SET
                   name = EXCLUDED.name, modes = EXCLUDED.modes, geom = EXCLUDED.geom`,
        rows: stationRows,
        paramsPerRow: 4,
        rowPlaceholders: (b) =>
          `('osm', $${b + 1}, $${b + 2}, $${b + 3}, ST_GeomFromGeoJSON($${b + 4}))`,
        mapRow: (r) => [r.sourceId, r.name, r.modes, r.geomJson],
        batchSize: 400,
      });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`[seed:overpass] ${region.name}: ${lineRows.length} ways, ${stationRows.length} nodes`);
  return { lines: lineRows.length, stations: stationRows.length };
}

export async function seedOverpass(): Promise<void> {
  const filter = (process.env.OVERPASS_REGIONS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const regions = filter.length ? REGIONS.filter((r) => filter.includes(r.key)) : REGIONS;

  console.log(`[seed:overpass] regions: ${regions.map((r) => r.key).join(', ')}`);
  let lines = 0;
  let stations = 0;
  for (const region of regions) {
    const r = await processRegion(region);
    lines += r.lines;
    stations += r.stations;
  }
  console.log(`[seed:overpass] done — ${lines} ways, ${stations} nodes across ${regions.length} regions`);
}

if (isMain(import.meta.url)) {
  seedOverpass()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed:overpass] failed:', err);
      process.exit(1);
    });
}

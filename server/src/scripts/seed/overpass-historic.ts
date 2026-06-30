/**
 * Seed the former ("pre-Beeching") railway network from OpenStreetMap.
 *
 * Pulls abandoned / disused / dismantled / razed railways (and the
 * `disused:railway=*` / `abandoned:railway=*` lifecycle tags) per region — the
 * trackbeds of closed lines, overwhelmingly the Beeching-era closures. Same
 * regional chunking, caching and backoff as the live-network seed.
 *
 * Data © OpenStreetMap contributors, ODbL. Run a subset with
 * OVERPASS_REGIONS=south_west,wales.
 */
import { pool } from '../../db/pool.js';
import { env } from '../../env.js';
import { cached } from './cache.js';
import { bulkUpsert, fetchTextRetry, isMain, lineStringGeoJSON, sleep } from './util.js';
import { REGIONS } from './overpass.js';

function buildQuery(bbox: [number, number, number, number]): string {
  const b = bbox.join(',');
  return (
    `[out:json][timeout:240];` +
    `(` +
    `way["railway"~"^(abandoned|disused|dismantled|razed)$"](${b});` +
    `way["disused:railway"~"^(rail|light_rail|narrow_gauge|tram)$"](${b});` +
    `way["abandoned:railway"~"^(rail|light_rail|narrow_gauge|tram)$"](${b});` +
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

/** Derive the closure kind from whichever lifecycle tag is present. */
function kindOf(tags: Record<string, string>): string {
  if (tags.railway && /^(abandoned|disused|dismantled|razed)$/.test(tags.railway)) {
    return tags.railway;
  }
  if (tags['disused:railway']) return 'disused';
  if (tags['abandoned:railway']) return 'abandoned';
  return 'former';
}

interface HistRow {
  sourceId: string;
  kind: string;
  name: string | null;
  geomJson: string;
}

async function processRegion(region: (typeof REGIONS)[number]): Promise<number> {
  const raw = await cached(`overpass-historic-${region.key}.json`, async () => {
    console.log(`[seed:historic] querying ${region.name}…`);
    const body = `data=${encodeURIComponent(buildQuery(region.bbox))}`;
    const text = await fetchTextRetry(
      env.overpassUrl,
      { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      { label: `overpass-historic ${region.key}`, retries: 5, baseDelayMs: 5000, timeoutMs: 300_000 },
    );
    await sleep(3000);
    return text;
  });

  const data = JSON.parse(raw) as { elements?: OsmWay[] };
  const rows: HistRow[] = [];
  for (const el of data.elements ?? []) {
    if (el.type !== 'way') continue;
    const coords = (el.geometry ?? []).map((g) => [g.lon, g.lat] as [number, number]);
    const geom = lineStringGeoJSON(coords);
    if (!geom) continue;
    const tags = el.tags ?? {};
    rows.push({ sourceId: `way/${el.id}`, kind: kindOf(tags), name: tags.name ?? null, geomJson: geom });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (rows.length) {
      await bulkUpsert<HistRow>(client, {
        prefix: 'INSERT INTO historic_lines (source, source_id, kind, name, geom) VALUES',
        suffix: `ON CONFLICT (source, source_id) DO UPDATE SET
                   kind = EXCLUDED.kind, name = EXCLUDED.name, geom = EXCLUDED.geom`,
        rows,
        paramsPerRow: 4,
        rowPlaceholders: (b) =>
          `('osm', $${b + 1}, $${b + 2}, $${b + 3}, ST_GeomFromGeoJSON($${b + 4}))`,
        mapRow: (r) => [r.sourceId, r.kind, r.name, r.geomJson],
        batchSize: 300,
      });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  console.log(`[seed:historic] ${region.name}: ${rows.length} former-railway ways`);
  return rows.length;
}

export async function seedHistoric(): Promise<void> {
  const filter = (process.env.OVERPASS_REGIONS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const regions = filter.length ? REGIONS.filter((r) => filter.includes(r.key)) : REGIONS;
  console.log(`[seed:historic] regions: ${regions.map((r) => r.key).join(', ')}`);
  let total = 0;
  for (const region of regions) total += await processRegion(region);
  console.log(`[seed:historic] done — ${total} former-railway ways across ${regions.length} regions`);
}

if (isMain(import.meta.url)) {
  seedHistoric()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed:historic] failed:', err);
      process.exit(1);
    });
}

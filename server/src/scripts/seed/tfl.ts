/**
 * Seed the London transit network from the TfL Unified API.
 *
 *   /Line/Mode/{modes}            → lines per mode
 *   /Line/{id}/Route/Sequence/all → ordered geometry (lineStrings) + stations
 *
 * Each lineString becomes an existing_lines row; stations become
 * existing_stations rows (deduped across lines). Idempotent (upsert by
 * source/source_id); responses cached. Reads optional TFL_APP_KEY from env.
 */
import { pool } from '../../db/pool.js';
import { env } from '../../env.js';
import { cached } from './cache.js';
import { bulkUpsert, fetchTextRetry, isMain, lineStringGeoJSON, pointGeoJSON, sleep } from './util.js';

const API = 'https://api.tfl.gov.uk';
const MODES = ['tube', 'overground', 'dlr', 'elizabeth-line', 'tram'] as const;

/** TfL mode → TRANSITLAB mode. */
const MODE_MAP: Record<string, string> = {
  tube: 'metro_tube',
  overground: 'heavy_rail',
  dlr: 'light_rail',
  'elizabeth-line': 'heavy_rail',
  tram: 'tram',
};

/** Iconic TfL line colours (subset; others fall back to the layer default). */
const LINE_COLOURS: Record<string, string> = {
  bakerloo: '#B36305', central: '#E32017', circle: '#FFD300', district: '#00782A',
  'hammersmith-city': '#F3A9BB', jubilee: '#A0A5A9', metropolitan: '#9B0056',
  northern: '#000000', piccadilly: '#003688', victoria: '#0098D4',
  'waterloo-city': '#95CDBA', 'elizabeth-line': '#6950A1', dlr: '#00A4A7',
  tram: '#84B817', 'london-overground': '#EE7C0E', liberty: '#5D6061',
  lioness: '#FAA61A', mildmay: '#0077AD', suffragette: '#18A95D',
  weaver: '#823A62', windrush: '#ED1B00',
};

function withKey(url: string): string {
  return env.tflAppKey ? `${url}${url.includes('?') ? '&' : '?'}app_key=${env.tflAppKey}` : url;
}

interface LineMeta {
  id: string;
  name: string;
  mode: string;
}

interface LineRow {
  sourceId: string;
  mode: string;
  name: string;
  colour: string | null;
  geomJson: string;
}

interface StationRow {
  sourceId: string;
  name: string;
  modes: string[];
  lng: number;
  lat: number;
}

/** Parse TfL lineStrings (each a JSON string nesting [lng,lat] pairs). */
function parseLineString(ls: string): [number, number][] | null {
  try {
    const arr = JSON.parse(ls);
    // Forms seen: [[ [lng,lat], ... ]] or [ [lng,lat], ... ].
    const coords = Array.isArray(arr[0]?.[0]) ? arr[0] : arr;
    return coords as [number, number][];
  } catch {
    return null;
  }
}

export async function seedTfl(): Promise<void> {
  const lines: LineMeta[] = [];
  for (const mode of MODES) {
    const raw = await cached(`tfl-lines-${mode}.json`, () =>
      fetchTextRetry(withKey(`${API}/Line/Mode/${mode}`), {}, { label: `tfl lines ${mode}` }),
    );
    const arr = JSON.parse(raw) as { id: string; name: string }[];
    for (const l of arr) lines.push({ id: l.id, name: l.name, mode });
    console.log(`[seed:tfl] ${mode}: ${arr.length} lines`);
  }

  const lineRows: LineRow[] = [];
  const stationMap = new Map<string, StationRow>();

  for (const line of lines) {
    const raw = await cached(`tfl-route-${line.id}.json`, () =>
      fetchTextRetry(withKey(`${API}/Line/${line.id}/Route/Sequence/all`), {}, {
        label: `tfl route ${line.id}`,
      }),
    );
    const seq = JSON.parse(raw) as {
      lineStrings?: string[];
      stations?: { id: string; name: string; lat: number; lon: number; modes?: string[] }[];
    };

    (seq.lineStrings ?? []).forEach((ls, idx) => {
      const coords = parseLineString(ls);
      const geom = coords && lineStringGeoJSON(coords);
      if (!geom) return;
      lineRows.push({
        sourceId: `${line.id}:${idx}`,
        mode: MODE_MAP[line.mode] ?? 'metro_tube',
        name: line.name,
        colour: LINE_COLOURS[line.id] ?? null,
        geomJson: geom,
      });
    });

    for (const st of seq.stations ?? []) {
      if (!Number.isFinite(st.lat) || !Number.isFinite(st.lon)) continue;
      const existing = stationMap.get(st.id);
      const modes = new Set([...(existing?.modes ?? []), ...(st.modes ?? [])]);
      stationMap.set(st.id, {
        sourceId: st.id,
        name: st.name,
        modes: [...modes],
        lng: st.lon,
        lat: st.lat,
      });
    }

    // Be gentle with the un-keyed rate limit.
    if (!env.tflAppKey) await sleep(250);
  }

  const stationRows = [...stationMap.values()];
  console.log(`[seed:tfl] parsed ${lineRows.length} line segments, ${stationRows.length} stations`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await bulkUpsert<LineRow>(client, {
      prefix:
        "INSERT INTO existing_lines (source, source_id, mode, name, operator, electrified, gauge, colour, geom) VALUES",
      suffix: `ON CONFLICT (source, source_id) DO UPDATE SET
                 mode = EXCLUDED.mode, name = EXCLUDED.name, colour = EXCLUDED.colour, geom = EXCLUDED.geom`,
      rows: lineRows,
      paramsPerRow: 5,
      // source='tfl', operator='Transport for London', electrified/gauge null/standard.
      rowPlaceholders: (b) =>
        `('tfl', $${b + 1}, $${b + 2}, $${b + 3}, 'Transport for London', NULL, '1435', $${b + 4}, ST_GeomFromGeoJSON($${b + 5}))`,
      mapRow: (r) => [r.sourceId, r.mode, r.name, r.colour, r.geomJson],
    });

    await bulkUpsert<StationRow>(client, {
      prefix: 'INSERT INTO existing_stations (source, source_id, name, modes, geom) VALUES',
      suffix: `ON CONFLICT (source, source_id) DO UPDATE SET
                 name = EXCLUDED.name, modes = EXCLUDED.modes, geom = EXCLUDED.geom`,
      rows: stationRows,
      paramsPerRow: 4,
      rowPlaceholders: (b) =>
        `('tfl', $${b + 1}, $${b + 2}, $${b + 3}, ST_GeomFromGeoJSON($${b + 4}))`,
      mapRow: (r) => [r.sourceId, r.name, r.modes, pointGeoJSON(r.lng, r.lat)],
    });

    await client.query('COMMIT');
    console.log('[seed:tfl] committed');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (isMain(import.meta.url)) {
  seedTfl()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed:tfl] failed:', err);
      process.exit(1);
    });
}

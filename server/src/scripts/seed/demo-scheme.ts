/**
 * Seed a small demo scheme for the local user, so the analysis tools have
 * something to show on first run. Idempotent: skips if the demo already exists.
 *
 * The line is an illustrative "East–West Crossing" through London with mixed
 * structure types and five stations.
 */
import { pool, withTransaction } from '../../db/pool.js';
import { getLocalUser } from '../../middleware/auth.js';
import { writeLineContents, type LineContent } from '../../db/lineWrite.js';
import { isMain } from './util.js';

const DEMO_SCHEME = 'Demo — East–West Crossing';

const DEMO_LINE: LineContent = {
  name: 'East–West Crossing',
  colour: '#00B4A6',
  mode: 'heavy_rail',
  gaugeMm: 1435,
  electrification: 'ohle_25kv',
  rollingStockId: null,
  coordinates: [
    [-0.225, 51.488],
    [-0.165, 51.5],
    [-0.118, 51.508],
    [-0.075, 51.515],
    [-0.02, 51.52],
    [0.03, 51.53],
  ],
  segments: [
    { structureType: 'surface', trackCount: 2, maxSpeedKph: 120 },
    { structureType: 'embankment', trackCount: 2, maxSpeedKph: 110 },
    { structureType: 'tunnel_bored', trackCount: 2, maxSpeedKph: 100 },
    { structureType: 'tunnel_bored', trackCount: 2, maxSpeedKph: 100 },
    { structureType: 'viaduct', trackCount: 2, maxSpeedKph: 130 },
  ],
  stations: [
    { name: 'Richmond Gate', fraction: 0, stepFree: true },
    { name: 'Hammersmith Central', fraction: 0.28, stepFree: true },
    { name: 'Westminster Cross', fraction: 0.55 },
    { name: 'Canary Approach', fraction: 0.78, stepFree: true },
    { name: 'Stratford East', fraction: 1 },
  ],
};

export async function seedDemoScheme(): Promise<void> {
  const user = await getLocalUser();
  const existing = await pool.query('SELECT id FROM schemes WHERE user_id=$1 AND name=$2', [
    user.id,
    DEMO_SCHEME,
  ]);
  if (existing.rows.length > 0) {
    console.log('[seed:demo] demo scheme already present — skipping');
    return;
  }

  await withTransaction(async (client) => {
    const scheme = await client.query<{ id: string }>(
      `INSERT INTO schemes (user_id, name, description)
       VALUES ($1, $2, $3) RETURNING id`,
      [user.id, DEMO_SCHEME, 'Illustrative proposal — try Run analysis.'],
    );
    const line = await client.query<{ id: string }>(
      `INSERT INTO lines (scheme_id, name, colour, mode, gauge_mm, electrification)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        scheme.rows[0].id,
        DEMO_LINE.name,
        DEMO_LINE.colour,
        DEMO_LINE.mode,
        DEMO_LINE.gaugeMm,
        DEMO_LINE.electrification,
      ],
    );
    await writeLineContents(client, line.rows[0].id, DEMO_LINE);
  });
  console.log('[seed:demo] created demo scheme + line');
}

if (isMain(import.meta.url)) {
  seedDemoScheme()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed:demo] failed:', err);
      process.exit(1);
    });
}

/**
 * Seed orchestrator — runs every import in dependency order:
 *   rolling stock → ONS population → TfL → Overpass → demo scheme.
 *
 * Each step is independently idempotent and re-runnable. Run a single step with
 * its own npm script (e.g. `npm run seed:tfl`). Skip the (slow) Overpass step
 * with SKIP_OVERPASS=1, or limit it with OVERPASS_REGIONS=london,....
 */
import { pool } from '../../db/pool.js';
import { seedRollingStock } from './rolling-stock.js';
import { seedPopulation } from './ons-population.js';
import { seedTfl } from './tfl.js';
import { seedOverpass } from './overpass.js';
import { seedHistoric } from './overpass-historic.js';
import { seedDemoScheme } from './demo-scheme.js';

async function run(): Promise<void> {
  const t0 = Date.now();

  console.log('\n=== 1/4 rolling stock ===');
  await seedRollingStock();

  console.log('\n=== 2/4 ONS population ===');
  await seedPopulation();

  console.log('\n=== 3/4 TfL London transit ===');
  await seedTfl();

  if (process.env.SKIP_OVERPASS === '1') {
    console.log('\n=== 4/5 Overpass — SKIPPED (SKIP_OVERPASS=1) ===');
  } else {
    console.log('\n=== 4/5 Overpass national rail/freight ===');
    await seedOverpass();
  }

  if (process.env.SKIP_OVERPASS === '1') {
    console.log('\n=== 5/6 Historic railways — SKIPPED (SKIP_OVERPASS=1) ===');
  } else {
    console.log('\n=== 5/6 Historic (former) railways ===');
    await seedHistoric();
  }

  console.log('\n=== 6/6 demo scheme ===');
  await seedDemoScheme();

  console.log(`\n[seed] all done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

run()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[seed] failed:', err);
    await pool.end().catch(() => {});
    process.exit(1);
  });

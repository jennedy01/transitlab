/**
 * Seed population_areas from ONS open data.
 *
 *   geometry  — LSOA 2021 boundaries, Boundary Super-generalised Clipped (BSC),
 *               from the ONS Open Geography Portal ArcGIS FeatureServer.
 *   density   — Census 2021 TS006 population density (persons/km²) via NOMIS.
 *
 * Density is stored per hectare; population is then derived in PostGIS from the
 * British National Grid (EPSG:27700) area — i.e. area-weighted from official
 * density, which is exactly the basis catchment analysis uses. Idempotent
 * (upsert by lsoa_code); raw responses cached under .cache/.
 */
import { pool } from '../../db/pool.js';
import { env } from '../../env.js';
import { cached } from './cache.js';
import { bulkUpsert, fetchTextRetry, isMain } from './util.js';

const BOUNDARY_BASE =
  env.onsLsoaBoundaryUrl ||
  'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LSOA_2021_EW_BSC_V4_RUC/FeatureServer/0';

const DENSITY_BASE =
  env.onsLsoaPopulationUrl ||
  'https://www.nomisweb.co.uk/api/v01/dataset/NM_2026_1.data.csv?geography=TYPE151&measures=20100&select=geography_code,obs_value';

const PAGE = 2000;

/** Fetch all LSOA densities (persons/km²) keyed by LSOA21CD, paginating NOMIS. */
async function fetchDensities(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const limit = 25000;
  for (let offset = 0; ; offset += limit) {
    const url = `${DENSITY_BASE}&RecordLimit=${limit}&RecordOffset=${offset}`;
    const csv = await cached(`ons-density-${offset}.csv`, () =>
      fetchTextRetry(url, {}, { label: `nomis density @${offset}` }),
    );
    const lines = csv.trim().split('\n');
    let rows = 0;
    for (const line of lines) {
      const m = line.match(/"?([EW]\d{8})"?\s*,\s*"?([\d.]+)"?/);
      if (!m) continue;
      out.set(m[1], Number(m[2]));
      rows += 1;
    }
    console.log(`[seed:population] density page @${offset}: ${rows} rows (total ${out.size})`);
    if (rows < limit - 1) break; // last page
  }
  return out;
}

interface LsoaFeature {
  code: string;
  geomJson: string;
  density: number; // persons per hectare
}

/** Page through the ArcGIS FeatureServer pulling LSOA boundaries as GeoJSON. */
async function fetchBoundaries(densities: Map<string, number>): Promise<LsoaFeature[]> {
  const features: LsoaFeature[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url =
      `${BOUNDARY_BASE}/query?where=1%3D1&outFields=LSOA21CD&returnGeometry=true` +
      `&outSR=4326&f=geojson&resultOffset=${offset}&resultRecordCount=${PAGE}`;
    const raw = await cached(`ons-lsoa-bsc-${offset}.geojson`, () =>
      fetchTextRetry(url, {}, { label: `arcgis lsoa @${offset}`, timeoutMs: 120_000 }),
    );
    const fc = JSON.parse(raw) as {
      features?: { properties: Record<string, string>; geometry: unknown }[];
      exceededTransferLimit?: boolean;
    };
    const page = fc.features ?? [];
    for (const f of page) {
      const code = f.properties.LSOA21CD;
      if (!code || !f.geometry) continue;
      const perKm2 = densities.get(code) ?? 0;
      features.push({
        code,
        geomJson: JSON.stringify(f.geometry),
        density: perKm2 / 100, // → persons per hectare
      });
    }
    console.log(`[seed:population] boundary page @${offset}: ${page.length} features (total ${features.length})`);
    if (page.length < PAGE && !fc.exceededTransferLimit) break;
    if (page.length === 0) break;
  }
  return features;
}

export async function seedPopulation(): Promise<void> {
  const densities = await fetchDensities();
  const features = await fetchBoundaries(densities);
  if (features.length === 0) throw new Error('no LSOA features fetched');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await bulkUpsert<LsoaFeature>(client, {
      prefix: 'INSERT INTO population_areas (lsoa_code, density, population, geom) VALUES',
      suffix: `ON CONFLICT (lsoa_code) DO UPDATE SET
           density = EXCLUDED.density, geom = EXCLUDED.geom`,
      rows: features,
      paramsPerRow: 3,
      // population (literal 0) is filled by the BNG-area pass below; geom is
      // coerced to MultiPolygon for the schema's geometry(MultiPolygon) column.
      rowPlaceholders: (b) =>
        `($${b + 1}, $${b + 2}, 0, ST_Multi(ST_GeomFromGeoJSON($${b + 3})))`,
      mapRow: (r) => [r.code, r.density, r.geomJson],
      batchSize: 300,
      onProgress: (done, total) => {
        if (done % 4500 === 0 || done === total) {
          console.log(`[seed:population] upserted ${done}/${total}`);
        }
      },
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Derive population from official density and BNG area (persons/ha × hectares).
  const upd = await pool.query(
    `UPDATE population_areas
        SET population = GREATEST(0, round(density * ST_Area(ST_Transform(geom, 27700)) / 10000.0))::int`,
  );
  const tot = await pool.query<{ areas: number; pop: number }>(
    'SELECT count(*)::int AS areas, COALESCE(sum(population),0)::bigint AS pop FROM population_areas',
  );
  console.log(
    `[seed:population] done — ${tot.rows[0].areas} LSOAs, derived population ${Number(tot.rows[0].pop).toLocaleString()} (updated ${upd.rowCount})`,
  );
}

if (isMain(import.meta.url)) {
  seedPopulation()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed:population] failed:', err);
      process.exit(1);
    });
}

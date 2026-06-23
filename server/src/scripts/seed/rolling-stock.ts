/**
 * Seed reference rolling stock.
 *
 * Static, illustrative data on real UK fleets across every mode. Idempotent:
 * upserts by `source_key`. Figures are nominal per-unit values for planning.
 */
import { pool } from '../../db/pool.js';
import { isMain } from './util.js';

interface StockSeed {
  key: string;
  name: string;
  mode: string;
  gaugeMm: number;
  maxSpeedKph: number;
  capacity: number;
  traction: string;
  loadingGauge: string;
}

const STOCK: StockSeed[] = [
  // ---- Heavy rail ----------------------------------------------------------
  { key: 'class-800-iet', name: 'Class 800 IET (5-car)', mode: 'heavy_rail', gaugeMm: 1435, maxSpeedKph: 201, capacity: 326, traction: 'bi_mode', loadingGauge: 'W10' },
  { key: 'class-801-azuma', name: 'Class 801 Azuma (9-car)', mode: 'heavy_rail', gaugeMm: 1435, maxSpeedKph: 201, capacity: 611, traction: 'electric_ohle', loadingGauge: 'W10' },
  { key: 'class-390-pendolino', name: 'Class 390 Pendolino (11-car)', mode: 'heavy_rail', gaugeMm: 1435, maxSpeedKph: 201, capacity: 589, traction: 'electric_ohle', loadingGauge: 'W8' },
  { key: 'class-345-aventra', name: 'Class 345 (Elizabeth line, 9-car)', mode: 'heavy_rail', gaugeMm: 1435, maxSpeedKph: 145, capacity: 1500, traction: 'electric_ohle', loadingGauge: 'W10' },
  { key: 'class-700-thameslink', name: 'Class 700 Desiro City (12-car)', mode: 'heavy_rail', gaugeMm: 1435, maxSpeedKph: 161, capacity: 1754, traction: 'electric_ohle', loadingGauge: 'W6' },
  { key: 'class-377-electrostar', name: 'Class 377 Electrostar (4-car)', mode: 'heavy_rail', gaugeMm: 1435, maxSpeedKph: 161, capacity: 244, traction: 'electric_third_rail', loadingGauge: 'W6' },
  { key: 'class-222-meridian', name: 'Class 222 Meridian (7-car)', mode: 'heavy_rail', gaugeMm: 1435, maxSpeedKph: 201, capacity: 488, traction: 'diesel', loadingGauge: 'W8' },
  { key: 'class-158-express', name: 'Class 158 Express Sprinter (2-car)', mode: 'heavy_rail', gaugeMm: 1435, maxSpeedKph: 145, capacity: 138, traction: 'diesel', loadingGauge: 'W6' },
  { key: 'class-195-civity', name: 'Class 195 Civity (3-car)', mode: 'heavy_rail', gaugeMm: 1435, maxSpeedKph: 161, capacity: 196, traction: 'diesel', loadingGauge: 'W8' },
  { key: 'class-331-civity', name: 'Class 331 Civity (4-car)', mode: 'heavy_rail', gaugeMm: 1435, maxSpeedKph: 161, capacity: 244, traction: 'electric_ohle', loadingGauge: 'W8' },
  { key: 'class-756-flirt', name: 'Class 756 FLIRT tri-mode (4-car)', mode: 'heavy_rail', gaugeMm: 1435, maxSpeedKph: 161, capacity: 256, traction: 'battery', loadingGauge: 'W6' },

  // ---- Metro / tube --------------------------------------------------------
  { key: 'lu-2009-victoria', name: 'LU 2009 Stock (Victoria line)', mode: 'metro_tube', gaugeMm: 1435, maxSpeedKph: 80, capacity: 1080, traction: 'electric_third_rail', loadingGauge: 'metro' },
  { key: 'lu-s8-subsurface', name: 'LU S8 Stock (sub-surface lines)', mode: 'metro_tube', gaugeMm: 1435, maxSpeedKph: 100, capacity: 1278, traction: 'electric_third_rail', loadingGauge: 'metro' },
  { key: 'lu-1995-northern', name: 'LU 1995 Stock (Northern line)', mode: 'metro_tube', gaugeMm: 1435, maxSpeedKph: 72, capacity: 800, traction: 'electric_third_rail', loadingGauge: 'metro' },
  { key: 'glasgow-subway-2020', name: 'Glasgow Subway 2020 Stock', mode: 'metro_tube', gaugeMm: 1219, maxSpeedKph: 54, capacity: 196, traction: 'electric_third_rail', loadingGauge: 'metro' },

  // ---- Light rail ----------------------------------------------------------
  { key: 'dlr-b23', name: 'DLR B23 Stock (5-car)', mode: 'light_rail', gaugeMm: 1435, maxSpeedKph: 100, capacity: 526, traction: 'electric_third_rail', loadingGauge: 'metro' },
  { key: 'tyne-wear-metrocar555', name: 'Tyne & Wear Class 555 Metrocar', mode: 'light_rail', gaugeMm: 1435, maxSpeedKph: 80, capacity: 600, traction: 'electric_ohle', loadingGauge: 'metro' },
  { key: 'class-399-citylink', name: 'Class 399 Citylink tram-train', mode: 'light_rail', gaugeMm: 1435, maxSpeedKph: 100, capacity: 222, traction: 'electric_ohle', loadingGauge: 'metro' },

  // ---- Tram ----------------------------------------------------------------
  { key: 'metrolink-m5000', name: 'Manchester Metrolink M5000', mode: 'tram', gaugeMm: 1435, maxSpeedKph: 80, capacity: 206, traction: 'electric_ohle', loadingGauge: 'metro' },
  { key: 'croydon-citadis', name: 'Croydon Citadis 302', mode: 'tram', gaugeMm: 1435, maxSpeedKph: 80, capacity: 208, traction: 'electric_ohle', loadingGauge: 'metro' },
  { key: 'edinburgh-urbos', name: 'Edinburgh CAF Urbos 3', mode: 'tram', gaugeMm: 1435, maxSpeedKph: 70, capacity: 250, traction: 'electric_ohle', loadingGauge: 'metro' },

  // ---- Freight (locomotives; capacity not applicable) ----------------------
  { key: 'class-66', name: 'Class 66 freight loco', mode: 'freight', gaugeMm: 1435, maxSpeedKph: 121, capacity: 0, traction: 'diesel', loadingGauge: 'W10' },
  { key: 'class-70', name: 'Class 70 PowerHaul freight loco', mode: 'freight', gaugeMm: 1435, maxSpeedKph: 121, capacity: 0, traction: 'diesel', loadingGauge: 'W10' },
  { key: 'class-88', name: 'Class 88 bi-mode freight loco', mode: 'freight', gaugeMm: 1435, maxSpeedKph: 161, capacity: 0, traction: 'bi_mode', loadingGauge: 'W10' },
  { key: 'class-99', name: 'Class 99 bi-mode freight loco', mode: 'freight', gaugeMm: 1435, maxSpeedKph: 121, capacity: 0, traction: 'bi_mode', loadingGauge: 'W12' },
];

export async function seedRollingStock(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const s of STOCK) {
      await client.query(
        `INSERT INTO rolling_stock
           (name, mode, gauge_mm, max_speed_kph, capacity, traction, loading_gauge, source_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (source_key) DO UPDATE SET
           name = EXCLUDED.name, mode = EXCLUDED.mode, gauge_mm = EXCLUDED.gauge_mm,
           max_speed_kph = EXCLUDED.max_speed_kph, capacity = EXCLUDED.capacity,
           traction = EXCLUDED.traction, loading_gauge = EXCLUDED.loading_gauge`,
        [s.name, s.mode, s.gaugeMm, s.maxSpeedKph, s.capacity, s.traction, s.loadingGauge, s.key],
      );
    }
    await client.query('COMMIT');
    console.log(`[seed:rolling-stock] upserted ${STOCK.length} fleets`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (isMain(import.meta.url)) {
  seedRollingStock()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed:rolling-stock] failed:', err);
      process.exit(1);
    });
}

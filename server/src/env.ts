/**
 * Centralised environment loading. Reads the repo-root .env so all workspaces
 * share one configuration file.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// server/src/env.ts -> repo root is three levels up.
const repoRoot = resolve(here, '..', '..', '..');
config({ path: resolve(repoRoot, '.env') });

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

export const env = {
  repoRoot,
  port: int('PORT', 4010),
  jwtSecret: str('JWT_SECRET', 'dev-only-change-me'),
  corsOrigins: str('CORS_ORIGIN', 'http://localhost:5174')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  db: {
    connectionString: process.env.DATABASE_URL || undefined,
    host: str('PGHOST', 'localhost'),
    port: int('PGPORT', 5432),
    database: str('PGDATABASE', 'transitlab'),
    user: str('PGUSER', 'transitlab'),
    password: str('PGPASSWORD', 'transitlab'),
  },

  tflAppKey: process.env.TFL_APP_KEY || '',
  overpassUrl: str('OVERPASS_URL', 'https://overpass-api.de/api/interpreter'),
  onsLsoaBoundaryUrl: process.env.ONS_LSOA_BOUNDARY_URL || '',
  onsLsoaPopulationUrl: process.env.ONS_LSOA_POPULATION_URL || '',
} as const;

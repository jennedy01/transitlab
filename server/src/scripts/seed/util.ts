/** Shared helpers for the seed scripts: HTTP with backoff, batching, geometry. */
import type pg from 'pg';
import { pathToFileURL } from 'node:url';

/** True when `importMetaUrl` is the entry module (script run directly). */
export function isMain(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  return !!entry && importMetaUrl === pathToFileURL(entry).href;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch text with retry + exponential backoff. Retries on network errors and
 * 429/5xx responses. `init.body`/headers are passed through.
 */
export async function fetchTextRetry(
  url: string,
  init: RequestInit = {},
  opts: { retries?: number; baseDelayMs?: number; timeoutMs?: number; label?: string } = {},
): Promise<string> {
  const { retries = 4, baseDelayMs = 2000, timeoutMs = 180_000, label = url } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: ctrl.signal,
        headers: {
          // Identify the client politely to public endpoints.
          'User-Agent': 'TransitLab/0.1 (open-data seed; contact: local)',
          ...(init.headers ?? {}),
        },
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} (non-retryable)`);
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt === retries) break;
      const delay = baseDelayMs * 2 ** attempt;
      console.warn(`[http] ${label} attempt ${attempt + 1} failed (${(err as Error).message}); retry in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw new Error(`[http] ${label} failed after ${retries + 1} attempts: ${(lastErr as Error)?.message}`);
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Batched parameterised INSERT ... ON CONFLICT.
 *
 * `rowPlaceholders(base)` returns the `($1,$2,ST_GeomFromGeoJSON($3),...)` text
 * for one row given a 0-based parameter offset; `mapRow(row)` returns that row's
 * ordered parameter values (length must equal `paramsPerRow`).
 */
export async function bulkUpsert<T>(
  client: pg.PoolClient,
  args: {
    prefix: string; // e.g. "INSERT INTO existing_lines (source, ...) VALUES "
    suffix: string; // e.g. "ON CONFLICT (source, source_id) DO UPDATE SET ..."
    rows: T[];
    paramsPerRow: number;
    rowPlaceholders: (base: number) => string;
    mapRow: (row: T) => unknown[];
    batchSize?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<number> {
  const { prefix, suffix, rows, paramsPerRow, rowPlaceholders, mapRow, batchSize = 500, onProgress } = args;
  let done = 0;
  for (const part of chunk(rows, batchSize)) {
    const valuesSql = part.map((_, i) => rowPlaceholders(i * paramsPerRow)).join(', ');
    const params = part.flatMap(mapRow);
    await client.query(`${prefix} ${valuesSql} ${suffix}`, params);
    done += part.length;
    onProgress?.(done, rows.length);
  }
  return done;
}

/** Build a GeoJSON LineString from [lng,lat] pairs (or null if too short). */
export function lineStringGeoJSON(coords: [number, number][]): string | null {
  const clean = coords.filter(
    (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]),
  );
  if (clean.length < 2) return null;
  return JSON.stringify({ type: 'LineString', coordinates: clean });
}

export function pointGeoJSON(lng: number, lat: number): string {
  return JSON.stringify({ type: 'Point', coordinates: [lng, lat] });
}

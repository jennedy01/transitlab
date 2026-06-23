/**
 * Disk cache for raw API/Overpass responses.
 *
 * Seed scripts cache every external response under `.cache/` so re-runs don't
 * re-hit rate-limited endpoints. Delete the directory to force a fresh pull.
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = join(here, '.cache');

async function ensureDir(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
}

function cachePath(key: string): string {
  // Keys may contain slashes/odd chars; flatten to a safe filename.
  const safe = key.replace(/[^a-z0-9._-]/gi, '_');
  return join(CACHE_DIR, safe);
}

export async function readCache(key: string): Promise<string | null> {
  try {
    return await readFile(cachePath(key), 'utf8');
  } catch {
    return null;
  }
}

export async function writeCache(key: string, value: string): Promise<void> {
  await ensureDir();
  await writeFile(cachePath(key), value, 'utf8');
}

export async function cacheAgeHours(key: string): Promise<number | null> {
  try {
    const s = await stat(cachePath(key));
    return (Date.now() - s.mtimeMs) / 3_600_000;
  } catch {
    return null;
  }
}

/**
 * Returns cached text for `key` if present; otherwise calls `fetcher`, caches
 * the result, and returns it.
 */
export async function cached(key: string, fetcher: () => Promise<string>): Promise<string> {
  const hit = await readCache(key);
  if (hit !== null) {
    console.log(`[cache] hit  ${key}`);
    return hit;
  }
  console.log(`[cache] miss ${key} — fetching`);
  const value = await fetcher();
  await writeCache(key, value);
  return value;
}

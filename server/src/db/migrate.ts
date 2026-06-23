/**
 * Idempotent migration runner.
 *
 * Applies every *.sql file in ./migrations in lexical order, each inside a
 * transaction, recording applied filenames in schema_migrations. Re-running is
 * safe: already-applied files are skipped, and the SQL itself uses IF NOT EXISTS.
 *
 *   npm run migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { pool } from './pool.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, 'migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function appliedSet(): Promise<Map<string, string>> {
  const { rows } = await pool.query<{ filename: string; checksum: string }>(
    'SELECT filename, checksum FROM schema_migrations',
  );
  return new Map(rows.map((r) => [r.filename, r.checksum]));
}

async function run(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await appliedSet();

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  let appliedCount = 0;
  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex').slice(0, 16);

    const prev = applied.get(file);
    if (prev) {
      if (prev !== checksum) {
        console.warn(
          `[migrate] WARNING: ${file} already applied but its contents changed ` +
            `(checksum ${prev} -> ${checksum}). Not re-running. Reset the DB to apply edits.`,
        );
      } else {
        console.log(`[migrate] skip   ${file} (already applied)`);
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
        [file, checksum],
      );
      await client.query('COMMIT');
      console.log(`[migrate] apply  ${file}`);
      appliedCount += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] FAILED ${file}:`, (err as Error).message);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(
    `[migrate] done — ${appliedCount} new migration(s) applied, ${files.length} total file(s).`,
  );
}

run()
  .then(() => pool.end())
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('[migrate] aborted:', err);
    await pool.end().catch(() => {});
    process.exit(1);
  });

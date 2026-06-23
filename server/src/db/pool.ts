/** Shared PostgreSQL connection pool. */
import pg from 'pg';
import { env } from '../env.js';

const { Pool } = pg;

// Postgres returns BIGINT/NUMERIC as strings by default to avoid precision loss.
// Our population/density columns are safely within JS number range, so parse
// them to numbers for convenience. (OID 20 = int8, 1700 = numeric.)
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export const pool = env.db.connectionString
  ? new Pool({ connectionString: env.db.connectionString })
  : new Pool({
      host: env.db.host,
      port: env.db.port,
      database: env.db.database,
      user: env.db.user,
      password: env.db.password,
    });

pool.on('error', (err) => {
  // Keep the process alive on idle-client errors; log for visibility.
  console.error('[db] unexpected idle client error:', err.message);
});

/** Convenience query helper. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params as never[]);
}

/** Run a function inside a transaction, rolling back on error. */
export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

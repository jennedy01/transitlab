/** TRANSITLAB API server entry point. */
import express from 'express';
import cors from 'cors';
import { env } from './env.js';
import { pool } from './db/pool.js';
import { referenceRouter } from './routes/reference.js';
import { authRouter } from './routes/auth.js';
import { schemesRouter } from './routes/schemes.js';
import { linesRouter } from './routes/lines.js';
import { analysisRouter } from './routes/analysis.js';

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(
  cors({
    origin: env.corsOrigins.length ? env.corsOrigins : true,
    credentials: true,
  }),
);

/** Liveness + database connectivity check. */
app.get('/api/health', async (_req, res) => {
  try {
    const { rows } = await pool.query<{
      postgis: string;
      pgrouting: string;
    }>(
      `SELECT
         (SELECT extversion FROM pg_extension WHERE extname = 'postgis')   AS postgis,
         (SELECT extversion FROM pg_extension WHERE extname = 'pgrouting')  AS pgrouting`,
    );
    res.json({
      status: 'ok',
      db: 'connected',
      postgis: rows[0]?.postgis ?? null,
      pgrouting: rows[0]?.pgrouting ?? null,
    });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: 'unavailable', detail: (err as Error).message });
  }
});

app.use('/api/reference', referenceRouter);
app.use('/api/auth', authRouter);
app.use('/api/schemes', schemesRouter);
app.use('/api', linesRouter); // POST /schemes/:id/lines, PUT/DELETE /lines/:id
app.use('/api/analysis', analysisRouter);

app.listen(env.port, () => {
  console.log(`[server] TRANSITLAB API listening on http://localhost:${env.port}`);
});

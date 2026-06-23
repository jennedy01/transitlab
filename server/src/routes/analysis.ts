/**
 * Analysis endpoints. All figures are indicative planning estimates.
 *
 *   GET /api/analysis/line/:id?walkRadius=800&coverageBuffer=500
 *        → catchment, cost, journey time, coverage (the quick bundle)
 *   GET /api/analysis/connectivity/:id?proposed=1
 *        → missing-links (heavier pgRouting analysis, run on demand)
 */
import { Router } from 'express';
import { pool } from '../db/pool.js';
import { attachUser } from '../middleware/auth.js';
import { computeCost } from '../analysis/cost.js';
import { computeJourneyTime } from '../analysis/journeyTime.js';
import { computeCatchment } from '../analysis/catchment.js';
import { computeCoverage } from '../analysis/coverage.js';
import { computeConnectivity } from '../analysis/connectivity.js';

export const analysisRouter = Router();
analysisRouter.use(attachUser);

/** Confirm the line belongs to the requesting user. */
async function ownsLine(lineId: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM lines l JOIN schemes s ON s.id = l.scheme_id
     WHERE l.id = $1 AND s.user_id = $2`,
    [lineId, userId],
  );
  return !!rowCount;
}

function intParam(raw: unknown, fallback: number, allowed?: number[]): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  if (allowed && !allowed.includes(n)) return fallback;
  return n;
}

analysisRouter.get('/line/:id', async (req, res) => {
  if (!(await ownsLine(req.params.id, req.user!.id))) {
    res.status(404).json({ error: 'line not found' });
    return;
  }
  const walkRadius = intParam(req.query.walkRadius, 800, [400, 800, 1000, 1500]);
  const coverageBuffer = intParam(req.query.coverageBuffer, 500);
  try {
    const [cost, journeyTime, catchment, coverage] = await Promise.all([
      computeCost(req.params.id),
      computeJourneyTime(req.params.id),
      computeCatchment(req.params.id, walkRadius),
      computeCoverage(req.params.id, coverageBuffer),
    ]);
    res.json({
      lineId: req.params.id,
      cost: cost ?? undefined,
      journeyTime: journeyTime ?? undefined,
      catchment: catchment ?? undefined,
      coverage: coverage ?? undefined,
    });
  } catch (err) {
    res.status(500).json({ error: 'analysis failed', detail: (err as Error).message });
  }
});

analysisRouter.get('/connectivity/:id', async (req, res) => {
  if (!(await ownsLine(req.params.id, req.user!.id))) {
    res.status(404).json({ error: 'line not found' });
    return;
  }
  const includeProposed = req.query.proposed !== '0';
  try {
    const connectivity = await computeConnectivity(req.params.id, { includeProposed });
    res.json({ connectivity });
  } catch (err) {
    console.error('[analysis:connectivity]', (err as Error).message);
    // Connectivity is best-effort; never 500 the panel.
    res.json({ connectivity: { links: [], improvements: [], error: (err as Error).message } });
  }
});

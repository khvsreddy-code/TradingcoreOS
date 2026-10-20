import { Router, type Response } from 'express';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { enqueueBackgroundJob } from '../jobs/queue.js';
import { parseProductionPredictionInput, runProductionPrediction } from '../jobs/productionPrediction.js';
import { API_LATENCY_BUDGET_MS } from '../latency/budgets.js';
import { loadCanonicalHistoryForUser } from '../marketData/canonicalHistoricalData.js';

export const productionPredictionRoutes = Router();
productionPredictionRoutes.use(requireUser);

type PreparedPrediction = {
  input: ReturnType<typeof parseProductionPredictionInput>;
  history?: {
    symbol: string;
    timeframe: string;
    sourcePolicy: string;
    returned: number;
    oldestTimestamp: string | null;
    newestTimestamp: string | null;
    sourceStatus: Record<string, unknown>;
    degraded: boolean;
    stale: boolean;
  };
};

async function preparePrediction(body: any, userId: string): Promise<PreparedPrediction> {
  const useCanonical = body?.useCanonicalHistory === true || !Array.isArray(body?.candles) || body.candles.length === 0;
  if (!useCanonical) return { input: parseProductionPredictionInput(body) };
  const symbol = String(body?.symbol || '').trim();
  const timeframe = String(body?.timeframe || '').trim();
  if (!symbol || !timeframe) throw new Error('Canonical-history prediction requires symbol and timeframe.');
  const rawLimit = Number(body?.historyLimit ?? 5000);
  const limit = Number.isFinite(rawLimit) ? Math.max(80, Math.min(5000, Math.floor(rawLimit))) : 5000;
  const loaded = await loadCanonicalHistoryForUser({ userId, symbol, timeframe, limit });
  const history = {
    symbol: loaded.symbol,
    timeframe: loaded.timeframe,
    sourcePolicy: loaded.metadata.sourcePolicy,
    returned: loaded.bars.length,
    oldestTimestamp: loaded.metadata.oldestTimestamp,
    newestTimestamp: loaded.metadata.newestTimestamp,
    sourceStatus: loaded.metadata.sourceStatus,
    degraded: loaded.metadata.degraded,
    stale: loaded.metadata.stale,
  };
  if (loaded.bars.length === 0) {
    const error = new Error('No validated canonical candles are available from FYERS or the configured TradingView datafeed.') as Error & { statusCode?: number; history?: typeof history };
    error.statusCode = 502;
    error.history = history;
    throw error;
  }
  if (loaded.bars.length < 80) {
    const error = new Error('The selected models require at least 80 valid candles, but canonical history returned ' + loaded.bars.length + '.') as Error & { statusCode?: number; history?: typeof history };
    error.statusCode = 422;
    error.history = history;
    throw error;
  }
  return { input: parseProductionPredictionInput({ ...body, symbol: loaded.symbol, timeframe: loaded.timeframe, candles: loaded.bars }), history };
}

productionPredictionRoutes.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const serviceUrl = String(process.env.ML_SERVICE_URL || '').trim().replace(/\/$/, '');
  const wantsAsync = req.query.async === 'true' || req.body?.async === true;
  if (!serviceUrl) {
    return res.status(503).json({ success: false, error: 'Production ML service is not configured. Set ML_SERVICE_URL on the server.' });
  }

  let prepared: PreparedPrediction;
  try {
    prepared = await preparePrediction(req.body, req.tradingCoreUserId!);
  } catch (error: any) {
    const status = Number(error?.statusCode) || 400;
    return res.status(status).json({
      success: false,
      error: error?.message || 'Invalid production prediction payload.',
      ...(error?.history ? { history: error.history } : {}),
    });
  }

  if (wantsAsync) {
    try {
      const queued = await enqueueBackgroundJob(req.tradingCoreUserId!, 'production_prediction', prepared.input as unknown as Record<string, unknown>);
      return res.status(202).json({
        success: true,
        async: true,
        data: { jobId: queued.job.id, status: queued.job.status, queueMessageId: queued.messageId },
        ...(prepared.history ? { history: prepared.history } : {}),
        requestId: req.get('x-request-id') || null,
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, error: error?.message || 'Unable to enqueue production prediction.' });
    }
  }

  try {
    const payload = await runProductionPrediction(prepared.input, API_LATENCY_BUDGET_MS.predictionSync);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, ...payload, user_id: req.tradingCoreUserId, ...(prepared.history ? { history: prepared.history } : {}) });
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? 'Production ML service timed out.' : error?.message || 'Production ML service is unavailable.';
    return res.status(503).json({ success: false, error: message });
  }
});

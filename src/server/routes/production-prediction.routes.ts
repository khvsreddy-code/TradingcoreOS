import { Router, Response } from 'express';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { enqueueBackgroundJob } from '../jobs/queue.js';
import { parseProductionPredictionInput, runProductionPrediction } from '../jobs/productionPrediction.js';
import { API_LATENCY_BUDGET_MS } from '../latency/budgets.js';

export const productionPredictionRoutes = Router();
productionPredictionRoutes.use(requireUser);

productionPredictionRoutes.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const serviceUrl = String(process.env.ML_SERVICE_URL || '').trim().replace(/\/$/, '');
  const wantsAsync = req.query.async === 'true' || req.body?.async === true;
  if (wantsAsync) {
    if (!serviceUrl) {
      res.status(503).json({ success: false, error: 'Production ML service is not configured. Set ML_SERVICE_URL on the server.' });
      return;
    }
    let input;
    try {
      input = parseProductionPredictionInput(req.body);
    } catch (error: any) {
      res.status(400).json({ success: false, error: error?.message || 'Invalid production prediction payload.' });
      return;
    }
    try {
      const queued = await enqueueBackgroundJob(req.tradingCoreUserId!, 'production_prediction', input);
      res.status(202).json({
        success: true,
        async: true,
        data: { jobId: queued.job.id, status: queued.job.status, queueMessageId: queued.messageId },
        requestId: req.get('x-request-id') || null,
      });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error?.message || 'Unable to enqueue production prediction.' });
    }
    return;
  }
  if (!serviceUrl) {
    res.status(503).json({ success: false, error: 'Production ML service is not configured. Set ML_SERVICE_URL on the server.' });
    return;
  }
  let input;
  try {
    input = parseProductionPredictionInput(req.body);
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Invalid production prediction payload.' });
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_LATENCY_BUDGET_MS.predictionSync);
  try {
    const upstream = await fetch(`${serviceUrl}/predict`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.ML_SERVICE_SECRET ? { 'X-TradingCore-ML-Secret': process.env.ML_SERVICE_SECRET } : {}),
      },
      body: JSON.stringify(input),
    });
    const text = await upstream.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { detail: text.slice(0, 300) }; }
    if (!upstream.ok) {
      res.status(upstream.status >= 500 ? 503 : upstream.status).json({ success: false, error: payload?.detail || payload?.error || 'Production ML service rejected the prediction request.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, ...payload, user_id: req.tradingCoreUserId });
  } catch (error: any) {
    const message = error?.name === 'AbortError' ? 'Production ML service timed out.' : 'Production ML service is unavailable.';
    res.status(503).json({ success: false, error: message });
  } finally {
    clearTimeout(timeout);
  }
});

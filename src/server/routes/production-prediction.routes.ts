import { Router, Response } from 'express';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { enqueueBackgroundJob } from '../jobs/queue.js';
import { parseProductionPredictionInput, runProductionPrediction } from '../jobs/productionPrediction.js';
import { API_LATENCY_BUDGET_MS } from '../latency/budgets.js';

export const productionPredictionRoutes = Router();
productionPredictionRoutes.use(requireUser);

productionPredictionRoutes.post('/', async (req: AuthenticatedRequest, res: Response) => {
  let input;
  try {
    input = parseProductionPredictionInput(req.body);
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Invalid production prediction payload.' });
    return;
  }

  const wantsAsync = req.query.async === 'true' || req.body?.async === true;
  if (wantsAsync) {
    try {
      const queued = await enqueueBackgroundJob(req.tradingCoreUserId!, 'production_prediction', input);
      res.status(202).json({
        success: true,
        async: true,
        data: {
          jobId: queued.job.id,
          status: queued.job.status,
          queueMessageId: queued.messageId,
        },
        requestId: req.get('x-request-id') || null,
      });
    } catch (error: any) {
      res.status(503).json({
        success: false,
        error: error?.message || 'Unable to enqueue production prediction.',
        requestId: req.get('x-request-id') || null,
      });
    }
    return;
  }

  try {
    const payload = await runProductionPrediction(input, API_LATENCY_BUDGET_MS.predictionSync);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, ...payload, user_id: req.tradingCoreUserId });
  } catch (error: any) {
    res.status(503).json({
      success: false,
      error: error?.message || 'Production ML service is unavailable.',
      requestId: req.get('x-request-id') || null,
    });
  }
});

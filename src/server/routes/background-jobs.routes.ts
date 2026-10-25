import { Router, Response } from 'express';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { BackgroundJobRepository } from '../storage/BackgroundJobRepository.js';
import { enqueueBackgroundJob } from '../jobs/queue.js';

export const backgroundJobRoutes = Router();
backgroundJobRoutes.use(requireUser);

backgroundJobRoutes.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const kind = String(req.body?.kind || '').trim();
  if (kind !== 'production_prediction') {
    res.status(400).json({ success: false, error: 'Unsupported background job kind.' });
    return;
  }

  const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : req.body;
  try {
    const queued = await enqueueBackgroundJob(req.tradingCoreUserId!, kind, payload);
    res.status(202).json({
      success: true,
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
      error: error?.message || 'Unable to enqueue background job',
      requestId: req.get('x-request-id') || null,
    });
  }
});

backgroundJobRoutes.get('/:jobId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const job = await BackgroundJobRepository.getForUser(String(req.params.jobId), req.tradingCoreUserId!);
    if (!job) {
      res.status(404).json({ success: false, error: 'Background job not found.' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    let visibleResult = job.result;
    if (job.kind === 'corespirit_ai_invoke' && visibleResult && typeof visibleResult === 'object' && !Array.isArray(visibleResult)) {
      const aiResult = visibleResult as Record<string, unknown>;
      const expiresAt = typeof aiResult.expiresAt === 'string' ? Date.parse(aiResult.expiresAt) : NaN;
      if (aiResult.status === 'ready' && Number.isFinite(expiresAt) && Date.now() >= expiresAt) {
        visibleResult = { ...aiResult, status: 'stale', result: null, reasonCode: 'result-expired', summary: 'This AI result passed its freshness window. Request a new asynchronous result before using it.' };
      }
    }
    res.json({
      success: true,
      data: {
        jobId: job.id,
        kind: job.kind,
        status: job.status,
        progress: job.progress,
        result: visibleResult,
        error: job.error,
        attempts: job.attempts,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        updatedAt: job.updatedAt,
      },
    });
  } catch (error: any) {
    res.status(503).json({ success: false, error: error?.message || 'Unable to load background job.' });
  }
});

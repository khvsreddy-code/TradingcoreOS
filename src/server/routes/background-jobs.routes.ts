import { Router, Response } from 'express';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { BackgroundJobRepository } from '../storage/BackgroundJobRepository.js';
import { enqueueBackgroundJob } from '../jobs/queue.js';
import { validateCoreSpiritAiInvocationResult } from '../../services/coreSpirit/aiInvocation.js';

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
    if (job.kind === 'corespirit_ai_invoke') {
      const payload = job.payload && typeof job.payload === 'object' ? job.payload : {};
      const validated = validateCoreSpiritAiInvocationResult(job.result, {
        artifactHash: typeof payload.artifactHash === 'string' ? payload.artifactHash : undefined,
        sourceHash: typeof payload.sourceHash === 'string' ? payload.sourceHash : undefined,
        inputFingerprint: typeof payload.inputFingerprint === 'string' ? payload.inputFingerprint : undefined,
        modelVersion: typeof payload.modelVersion === 'string' ? payload.modelVersion : undefined,
      });
      visibleResult = validated ?? {
        status: 'unavailable',
        result: null,
        summary: 'The stored AI result failed integrity or provenance validation. Submit a fresh request.',
        modelVersion: typeof payload.modelVersion === 'string' ? payload.modelVersion : 'unknown',
        artifactHash: typeof payload.artifactHash === 'string' ? payload.artifactHash : '',
        sourceHash: typeof payload.sourceHash === 'string' ? payload.sourceHash : '',
        inputFingerprint: typeof payload.inputFingerprint === 'string' ? payload.inputFingerprint : '',
        outputHash: null,
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        advisoryOnly: true,
        executable: false,
        mayCreateOrderIntent: false,
        reasonCode: 'result-integrity-failed',
      };
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

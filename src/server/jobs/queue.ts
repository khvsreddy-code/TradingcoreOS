import { send } from '@vercel/queue';
import { BackgroundJobRepository } from '../storage/BackgroundJobRepository.js';

export type BackgroundJobMessage = {
  jobId: string;
  userId: string;
  kind: string;
  payload: Record<string, unknown>;
};

export async function enqueueBackgroundJob(userId: string, kind: string, payload: Record<string, unknown>) {
  const job = await BackgroundJobRepository.create(userId, kind, payload);
  try {
    const queued = await send('tradingcore-background', {
      jobId: job.id,
      userId,
      kind,
      payload,
    } satisfies BackgroundJobMessage, {
      retentionSeconds: 24 * 60 * 60,
      idempotencyKey: job.id,
    });
    await BackgroundJobRepository.markQueued(job.id, queued.messageId);
    return { job, messageId: queued.messageId };
  } catch (error) {
    await BackgroundJobRepository.markFailed(
      job.id,
      error instanceof Error ? error.message : 'Unable to enqueue background job',
    );
    throw error;
  }
}

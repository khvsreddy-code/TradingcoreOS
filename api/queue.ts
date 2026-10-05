import { QueueClient } from '@vercel/queue';
import { processBackgroundJob } from '../src/server/jobs/process.js';
import { BackgroundJobRepository } from '../src/server/storage/BackgroundJobRepository.js';
import type { BackgroundJobMessage } from '../src/server/jobs/queue.js';

const queue = new QueueClient();
const { handleNodeCallback } = queue;

export default handleNodeCallback(
  async (message: BackgroundJobMessage, metadata) => {
    try {
      await processBackgroundJob(message, metadata.deliveryCount);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Background job failed';
      if (metadata.deliveryCount >= 5) {
        await BackgroundJobRepository.markFailed(message.jobId, reason);
        return;
      }
      await BackgroundJobRepository.markRetrying(message.jobId, reason);
      throw error;
    }
  },
  {
    visibilityTimeoutSeconds: 240,
    retry: (_error, metadata) => {
      if (metadata.deliveryCount >= 5) return { acknowledge: true };
      return { afterSeconds: Math.min(60, 5 * 2 ** Math.max(0, metadata.deliveryCount - 1)) };
    },
  },
);

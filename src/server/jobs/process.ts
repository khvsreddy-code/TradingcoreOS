import type { BackgroundJobMessage } from './queue.js';
import { BackgroundJobRepository } from '../storage/BackgroundJobRepository.js';
import { parseProductionPredictionInput, runProductionPrediction } from './productionPrediction.js';

export async function processBackgroundJob(message: BackgroundJobMessage, deliveryCount: number): Promise<void> {
  const job = await BackgroundJobRepository.get(message.jobId);
  if (!job || job.status === 'succeeded') return;

  await BackgroundJobRepository.markRunning(message.jobId, deliveryCount);
  try {
    if (message.kind === 'production_prediction') {
      const input = parseProductionPredictionInput(message.payload);
      const result = await runProductionPrediction(input, 30_000);
      await BackgroundJobRepository.markSucceeded(message.jobId, result);
      return;
    }

    throw new Error('Unsupported background job kind: ' + message.kind);
  } catch (error) {
    throw error;
  }
}

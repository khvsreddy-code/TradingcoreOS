import type { BackgroundJobMessage } from './queue.js';
import { BackgroundJobRepository } from '../storage/BackgroundJobRepository.js';
import { parseProductionPredictionInput, runProductionPrediction } from './productionPrediction.js';
import { runCoreSpiritModelTraining } from './coreSpiritModelTraining.js';
import { CoreSpiritArtifactRepository } from '../storage/CoreSpiritArtifactRepository.js';

export async function processBackgroundJob(message: BackgroundJobMessage, deliveryCount: number): Promise<void> {
  const job = await BackgroundJobRepository.get(message.jobId);
  if (!job || job.status === 'succeeded') return;

  await BackgroundJobRepository.markRunning(message.jobId, deliveryCount);
  try {
    if (message.kind === 'corespirit_model_training') {
      try {
        const result = await runCoreSpiritModelTraining(message.userId, message.payload);
        await BackgroundJobRepository.markSucceeded(message.jobId, result);
        return;
      } catch (error) {
        if (deliveryCount >= 5 && typeof message.payload.trainingRunId === 'string') {
          const repository = new CoreSpiritArtifactRepository(message.userId);
          await repository.updateTrainingRun(message.payload.trainingRunId, {
            status: 'failed',
            progress: 100,
            error: error instanceof Error ? error.message : 'CoreSpirit training failed after retries',
          }).catch(() => undefined);
        }
        throw error;
      }
    }

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

/** Resource budgets for interactive API work and isolated batch research. */
export type CoreSpiritResearchWorkload = 'interactive' | 'batch';

export const CORESPIRIT_RESEARCH_HARD_MAX_ROWS = 1_000_000;
const HARD_MAX_MEMORY_BYTES = 1024 * 1024 * 1024;
const HARD_MAX_EXECUTION_MS = 15 * 60 * 1000;
const HARD_MAX_TRAINING_WINDOW_ROWS = 4_096;
const HARD_MAX_TRAINING_FIT_EVERY = 4_096;

function boundedEnvInt(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name];
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

/**
 * Interactive requests remain deliberately small. Batch limits are tunable per
 * deployment but cannot exceed hard ceilings enforced by the code and schema.
 */
export function getCoreSpiritResearchLimits(workload: CoreSpiritResearchWorkload) {
  if (workload === 'interactive') {
    return Object.freeze({
      workload,
      maxRows: boundedEnvInt('CORESPIRIT_INTERACTIVE_MAX_ROWS', 5_000, 12, 5_000),
      maxChunkRows: 0,
      maxChunkBytes: 2 * 1024 * 1024,
      maxMemoryBytes: 256 * 1024 * 1024,
      maxExecutionMs: 30_000,
      maxTrainingWindowRows: boundedEnvInt('CORESPIRIT_INTERACTIVE_TRAINING_WINDOW_ROWS', 1_024, 48, 1_024),
      maxTrainingFitEvery: 64,
    });
  }

  return Object.freeze({
    workload,
    maxRows: boundedEnvInt('CORESPIRIT_BATCH_MAX_DATASET_ROWS', 250_000, 12, CORESPIRIT_RESEARCH_HARD_MAX_ROWS),
    maxChunkRows: boundedEnvInt('CORESPIRIT_BATCH_CHUNK_ROWS', 500, 100, 1_000),
    maxChunkBytes: boundedEnvInt('CORESPIRIT_BATCH_CHUNK_MAX_BYTES', 2 * 1024 * 1024, 64 * 1024, 4 * 1024 * 1024),
    maxMemoryBytes: boundedEnvInt('CORESPIRIT_BATCH_MAX_MEMORY_BYTES', 512 * 1024 * 1024, 128 * 1024 * 1024, HARD_MAX_MEMORY_BYTES),
    maxExecutionMs: boundedEnvInt('CORESPIRIT_BATCH_MAX_EXECUTION_MS', 5 * 60 * 1000, 30_000, HARD_MAX_EXECUTION_MS),
    maxTrainingWindowRows: boundedEnvInt('CORESPIRIT_BATCH_MAX_TRAINING_WINDOW_ROWS', 2_048, 48, HARD_MAX_TRAINING_WINDOW_ROWS),
    maxTrainingFitEvery: boundedEnvInt('CORESPIRIT_BATCH_MAX_FIT_EVERY', HARD_MAX_TRAINING_FIT_EVERY, 64, HARD_MAX_TRAINING_FIT_EVERY),
  });
}

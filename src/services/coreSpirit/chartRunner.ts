import type { CoreSpiritMarketBar } from './marketData';
import { coreSpiritWorkerPool, type CoreSpiritWorkerRunResult } from './coreSpiritWorkerPool';

export type WorkerResult = CoreSpiritWorkerRunResult;

/** Reuses a bounded worker pool instead of spawning a new worker for each chart run. */
export async function runCoreSpiritInWorker(source: string, bars: CoreSpiritMarketBar[], sourceId: string): Promise<WorkerResult> {
  return coreSpiritWorkerPool.run(source, bars, sourceId);
}

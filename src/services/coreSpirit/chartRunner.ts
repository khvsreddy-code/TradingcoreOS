import type { CoreSpiritMarketBar } from './marketData';
import { coreSpiritWorkerPool, type CoreSpiritWorkerRunResult } from './coreSpiritWorkerPool';
import { loadOrCompileCoreSpiritArtifact } from './artifactCache';

export type WorkerResult = CoreSpiritWorkerRunResult;

export type CoreSpiritWorkerRunOptions = {
  contextKey?: string;
  datasetVersion?: number;
  dirtyRange?: { from:number; to:number };
};

/**
 * Resolve a backend-neutral executable artifact from the hierarchical cache,
 * persist it in IndexedDB when available, then address the persistent worker
 * context using artifactId + datasetVersion. Source parsing/semantic analysis
 * is therefore removed from the normal reopen path.
 */
export async function runCoreSpiritInWorker(
  source: string,
  bars: CoreSpiritMarketBar[],
  sourceId: string,
  options: CoreSpiritWorkerRunOptions = {},
): Promise<WorkerResult> {
  const artifact = await loadOrCompileCoreSpiritArtifact(source, sourceId, {
    backend:'worker-vm',
  });

  return coreSpiritWorkerPool.runArtifact(
    artifact,
    undefined,
    bars,
    sourceId,
    {
      contextKey: options.contextKey || sourceId,
      datasetVersion: options.datasetVersion || 1,
      dirtyRange: options.dirtyRange,
    },
  );
}

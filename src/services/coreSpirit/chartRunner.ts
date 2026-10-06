import { compileCoreSpirit } from './coreSpiritPipeline';
import type { CoreSpiritMarketBar } from './marketData';
import { coreSpiritWorkerPool, type CoreSpiritWorkerRunResult } from './coreSpiritWorkerPool';

export type WorkerResult = CoreSpiritWorkerRunResult;

export type CoreSpiritWorkerRunOptions = {
  contextKey?: string;
  datasetVersion?: number;
  dirtyRange?: { from:number; to:number };
};

/**
 * Compile once on the application side, then address the persistent worker
 * context by artifactId + datasetVersion. Market data is placed in a shared
 * typed buffer when the page is cross-origin isolated.
 */
export async function runCoreSpiritInWorker(
  source: string,
  bars: CoreSpiritMarketBar[],
  sourceId: string,
  options: CoreSpiritWorkerRunOptions = {},
): Promise<WorkerResult> {
  const compiled = compileCoreSpirit(source, sourceId);
  const error = compiled.diagnostics?.find(diagnostic => diagnostic.severity === 'error');
  if (!compiled.artifact || error) throw new Error(error?.message || 'CoreSpirit compilation failed');

  return coreSpiritWorkerPool.runArtifact(
    compiled.artifact,
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

import type { CoreSpiritMarketBar } from './marketData';
import { coreSpiritWorkerPool, type CoreSpiritWorkerRunResult } from './coreSpiritWorkerPool';
import { loadOrCompileCoreSpiritArtifact } from './artifactCache';
import { marketDataGraph, type CoreSpiritGraphSnapshot } from '../core/data/marketDataGraph';

export type WorkerResult = CoreSpiritWorkerRunResult;

export type CoreSpiritWorkerRunOptions = {
  contextKey?: string;
  datasetVersion?: number;
  dirtyRange?: { from:number; to:number };
  baseSymbol?:string;
  baseTimeframe?:string;
  graphSnapshot?:CoreSpiritGraphSnapshot;
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

  const plan=artifact.ir.tradingNativePlan;
  const requests=plan?.dataDependencies?.map(dependency=>({
    symbol:dependency.symbol,
    timeframe:dependency.timeframe,
    fields:dependency.fields,
  })) ?? [];
  const graphSnapshot=options.graphSnapshot ?? (
    requests.length
      ? marketDataGraph.snapshot(requests, options.baseSymbol ?? 'current', options.baseTimeframe ?? 'chart')
      : undefined
  );

  return coreSpiritWorkerPool.runArtifact(
    artifact,
    undefined,
    bars,
    sourceId,
    {
      contextKey: options.contextKey || sourceId,
      datasetVersion: options.datasetVersion || 1,
      dirtyRange: options.dirtyRange,
      graphSnapshot,
    },
  );
}

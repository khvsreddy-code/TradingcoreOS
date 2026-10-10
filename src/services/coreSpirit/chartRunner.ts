import type { CoreSpiritMarketBar } from './marketData';
import type { CoreSpiritHMMArtifactBinding } from './quantMath';
import { coreSpiritWorkerPool, type CoreSpiritWorkerRunResult } from './coreSpiritWorkerPool';
import { loadOrCompileCoreSpiritArtifact } from './artifactCache';
import { marketDataGraph, type CoreSpiritGraphSnapshot } from '../core/data/marketDataGraph';
import { sessionService } from '../auth/sessionService';
import { prepareCoreSpiritLiveInference } from './modelArtifactClient';
import { parseCoreSpiritModelLifecycleSurface } from './modelLifecycleSurface';

export type WorkerResult = CoreSpiritWorkerRunResult;

export type CoreSpiritWorkerRunOptions = {
  contextKey?: string;
  datasetVersion?: number;
  dirtyRange?: { from:number; to:number };
  baseSymbol?:string;
  baseTimeframe?:string;
  graphSnapshot?:CoreSpiritGraphSnapshot;
  /** Preverified artifacts loaded once per chart/runtime, never fetched per candle. */
  hmmArtifacts?:readonly CoreSpiritHMMArtifactBinding[];
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
  let executableSource = source;
  let hmmArtifacts = options.hmmArtifacts;
  const lifecyclePlan = parseCoreSpiritModelLifecycleSurface(source);
  if (lifecyclePlan.artifactSymbol || lifecyclePlan.training || lifecyclePlan.saveAs || lifecyclePlan.loadModelName) {
    if (!lifecyclePlan.loadModelName) {
      throw new Error('CoreScript research/training source cannot be deployed to a chart without loadModel("artifact-name"). Train and save the model first, then bind the sealed artifact for inference.');
    }
    const { session, error } = await sessionService.getSession();
    if (error || !session?.access_token) {
      throw new Error(error?.message || 'Sign in to TradingCoreOS to load the sealed CoreSpirit model artifact.');
    }
    const prepared = await prepareCoreSpiritLiveInference(source, session.access_token);
    executableSource = prepared.source;
    // Keep any explicitly supplied bindings for other models, but never let a
    // caller-supplied binding replace the verified artifact selected by name.
    hmmArtifacts = [
      ...(options.hmmArtifacts ?? []).filter(binding => binding.artifactHash !== prepared.artifactHash),
      ...prepared.hmmArtifacts,
    ];
  }

  const artifact = await loadOrCompileCoreSpiritArtifact(executableSource, sourceId, {
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
      graphBaseSymbol:options.baseSymbol,
      graphBaseTimeframe:options.baseTimeframe,
      hmmArtifacts,
    },
  );
}

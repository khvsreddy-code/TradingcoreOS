import type { CoreSpiritMarketBar } from './marketData';
import type { CoreSpiritHMMArtifactBinding } from './quantMath';
import { coreSpiritWorkerPool, type CoreSpiritWorkerRunResult, type CoreSpiritWorkerRuntimeOptions } from './coreSpiritWorkerPool';
import { loadOrCompileCoreSpiritArtifact } from './artifactCache';
import { compileCoreSpiritArtifactOffThread } from './coreSpiritCompilerClient';
import type { CoreSpiritExecutableArtifact } from './artifact';
import { marketDataGraph, type CoreSpiritGraphSnapshot } from '../core/data/marketDataGraph';

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
  /** Read-only history/range evaluation must suppress side effects. */
  readOnly?:boolean;
  /** Suppress effects for one incremental bar while retaining its runtime context. */
  suppressExternalEffectsForRun?:boolean;
  /** Serializable Vela session configuration; changes reset the persistent runtime. */
  runtimeOptions?:CoreSpiritWorkerRuntimeOptions;
};

/**
 * Resolve a backend-neutral executable artifact from the hierarchical cache,
 * persist it in IndexedDB when available, then address the persistent worker
 * context using artifactId + datasetVersion. Source parsing/semantic analysis
 * is therefore removed from the normal reopen path.
 */
function artifactGraphSnapshot(
  artifact:CoreSpiritExecutableArtifact,
  sourceId:string,
  options:CoreSpiritWorkerRunOptions,
):CoreSpiritGraphSnapshot|undefined {
  const plan=artifact.ir.tradingNativePlan;
  const requests=plan?.dataDependencies?.map(dependency=>({
    symbol:dependency.symbol,timeframe:dependency.timeframe,fields:dependency.fields,
  })) ?? [];
  return options.graphSnapshot ?? (
    requests.length
      ? marketDataGraph.snapshot(requests,options.baseSymbol ?? 'current',options.baseTimeframe ?? 'chart')
      : undefined
  );
}

/** Executes a compiler-validated artifact without reparsing or recompiling the editor source. */
export async function runCoreSpiritArtifactInWorker(
  artifact:CoreSpiritExecutableArtifact,
  bars:CoreSpiritMarketBar[],
  sourceId:string,
  options:CoreSpiritWorkerRunOptions={},
):Promise<WorkerResult>{
  if(!artifact?.abi?.artifactHash || !artifact.ir) throw new Error('CoreSpirit Run requires a validated executable artifact.');
  const graphSnapshot=artifactGraphSnapshot(artifact,sourceId,options);
  return coreSpiritWorkerPool.runArtifact(artifact,undefined,bars,sourceId,{
    contextKey:options.contextKey || sourceId,
    datasetVersion:options.datasetVersion || 1,
    dirtyRange:options.dirtyRange,
    graphSnapshot,
    graphBaseSymbol:options.baseSymbol,
    graphBaseTimeframe:options.baseTimeframe,
    hmmArtifacts:options.hmmArtifacts,
    readOnly:options.readOnly,
    suppressExternalEffectsForRun:options.suppressExternalEffectsForRun,
    runtimeOptions:options.runtimeOptions,
  });
}

/** Resolve/cache an artifact off-thread, then dispatch it to the persistent runtime worker. */
export async function runCoreSpiritInWorker(
  source:string,
  bars:CoreSpiritMarketBar[],
  sourceId:string,
  options:CoreSpiritWorkerRunOptions={},
):Promise<WorkerResult>{
  const artifact=await loadOrCompileCoreSpiritArtifact(source,sourceId,{
    backend:'worker-vm',
    compileInWorker:(input,id,compileOptions)=>compileCoreSpiritArtifactOffThread(input,id,compileOptions),
  });
  return runCoreSpiritArtifactInWorker(artifact,bars,sourceId,options);
}

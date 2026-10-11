import type { CoreSpiritMarketBar } from './marketData';
import { CoreSpiritGaussianHMM, type CoreSpiritHMMArtifactBinding } from './quantMath';
import type { CoreSpiritObject } from './types';
import type { CoreSpiritExecutableArtifact } from './artifact';
import type { CoreSpiritRuntime } from './runtime';
import type { CoreSpiritRuntimeOptions } from './runtime';
import { validateExecutableArtifact } from './artifact';
import { artifactIdFor } from './artifactAbi';
import { isRecord } from '../boundary/brokerApiValidation';
import { materializeSharedSeriesOutput, type CoreSpiritSharedSeriesDescriptor } from './sharedOutputBuffer';
import { requireCoreSpiritOutputs } from './boundaryValidation';
import {
  CoreSpiritSharedMarketBuffer,
  type CoreSpiritSharedMarketDescriptor,
} from './sharedMarketBuffer';
import { createGraphResolver, graphSnapshotTransferables, type CoreSpiritGraphSnapshot } from '../core/data/marketDataGraph';

export type CoreSpiritWorkerRuntimeOptions = Pick<CoreSpiritRuntimeOptions,
  'symbol'|'timeframe'|'executionMode'|'layer'|'executionTarget'|'executionTier'|'inputValues'|'propValues'|'visibleRange'|'suppressExternalEffects'|'modelTrainingMode'>;

type FallbackRuntimeContext={
  artifactId:string;
  runtimeOptionsSignature:string;
  datasetVersion:number;
  initialized:boolean;
  runtime:CoreSpiritRuntime;
  graphResolver?:ReturnType<typeof createGraphResolver>;
  graphRevision?:number;
  hmmSignature:string;
  hmmModels:Map<string,CoreSpiritGaussianHMM>;
};

function stableSignature(value:unknown):string {
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(stableSignature).join(',')}]`;
  const record=value as Record<string,unknown>;
  return `{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${stableSignature(record[key])}`).join(',')}}`;
}


function cloneGraphSnapshot(snapshot:CoreSpiritGraphSnapshot):CoreSpiritGraphSnapshot {
  // Transfer copies, not the caller-owned snapshot: transferables detach their
  // buffers, and a Vela session may reuse its cached snapshot across many ticks.
  return {
    ...snapshot,
    nodes:snapshot.nodes.map(node=>({
      ...node,
      time:new Float64Array(node.time),open:new Float64Array(node.open),high:new Float64Array(node.high),
      low:new Float64Array(node.low),close:new Float64Array(node.close),volume:new Float64Array(node.volume),
    })),
  };
}

export type CoreSpiritWorkerRunResult = {
  outputs: CoreSpiritObject[];
  diagnostics: string[];
  state?: unknown;
};

type DirtyRange = { from:number; to:number };

type WorkerJob = {
  artifact:CoreSpiritExecutableArtifact;
  sourceId:string;
  contextKey:string;
  bars:CoreSpiritMarketBar[];
  datasetVersion:number;
  dirtyRange?:DirtyRange;
  resolve:(value:CoreSpiritWorkerRunResult)=>void;
  reject:(reason:unknown)=>void;
  priority:0|1|2|3|4;
  graphSnapshot?:CoreSpiritGraphSnapshot;
  graphBaseSymbol?:string;
  graphBaseTimeframe?:string;
  hmmArtifacts?:readonly CoreSpiritHMMArtifactBinding[];
  readOnly:boolean;
  runtimeOptions?:CoreSpiritWorkerRuntimeOptions;
};

type WorkerSlot = {
  worker:Worker;
  busy:boolean;
  generation:number;
  contexts:Set<string>;
  job?:WorkerJob;
};

type WorkerRunEnvelope = {
  type:'run';
  requestId:string;
  artifactId:string;
  contextKey:string;
  datasetVersion:number;
  dirtyFrom:number;
  dirtyTo:number;
  mode:'historical'|'incremental';
  readOnly:boolean;
  sharedMarket?:CoreSpiritSharedMarketDescriptor;
  bars?:CoreSpiritMarketBar[];
  graphSnapshot?:CoreSpiritGraphSnapshot;
  graphBaseSymbol?:string;
  graphBaseTimeframe?:string;
};

function normalizeResult(value: unknown): CoreSpiritWorkerRunResult {
  if (!isRecord(value) || value.type !== 'result') throw new Error('Invalid CoreSpirit worker result envelope');
  const diagnostics = Array.isArray(value.diagnostics) && value.diagnostics.every(item => typeof item === 'string')
    ? value.diagnostics
    : [];
  const shared = value.sharedSeries as CoreSpiritSharedSeriesDescriptor | undefined;
  const sharedOutputs = shared ? materializeSharedSeriesOutput(shared) : [];
  return {
    outputs: requireCoreSpiritOutputs([...(Array.isArray(value.outputs) ? value.outputs : []), ...sharedOutputs]),
    diagnostics,
    state: value.state,
  };
}

/**
 * Persistent CoreSpirit worker pool.
 *
 * A worker owns one or more durable execution contexts. The first run installs
 * the compiled executable artifact; later runs address it by artifactId and
 * mutate only the shared market dataset + dirty range.
 */
export class CoreSpiritWorkerPool {
  private readonly slots: WorkerSlot[] = [];
  private readonly queue: WorkerJob[] = [];
  private disposed = false;
  private readonly maxWorkers:number;
  private readonly contextSlots = new Map<string,WorkerSlot>();
  private readonly sharedBuffers = new Map<string,CoreSpiritSharedMarketBuffer>();
  private readonly contextArtifacts = new Map<string,string>();
  private readonly contextGraphRevisions = new Map<string,number>();
  private readonly contextHMMArtifacts = new Map<string,string>();
  private readonly contextRuntimeOptions = new Map<string,string>();
  private readonly fallbackContexts = new Map<string,FallbackRuntimeContext>();

  constructor(maxWorkers?:number) {
    const hardware = typeof navigator !== 'undefined' && Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency
      : 2;
    this.maxWorkers = Math.max(1, Math.min(maxWorkers ?? 2, Math.max(1, hardware - 1)));
  }

  async run(
    source:string,
    bars:CoreSpiritMarketBar[],
    sourceId='coreSpirit',
    options?:{contextKey?:string;datasetVersion?:number;dirtyRange?:DirtyRange;graphSnapshot?:CoreSpiritGraphSnapshot;graphBaseSymbol?:string;graphBaseTimeframe?:string;hmmArtifacts?:readonly CoreSpiritHMMArtifactBinding[];readOnly?:boolean;runtimeOptions?:CoreSpiritWorkerRuntimeOptions},
  ):Promise<CoreSpiritWorkerRunResult> {
    const [{loadOrCompileCoreSpiritArtifact},{compileCoreSpiritArtifactOffThread}]=await Promise.all([
      import('./artifactCache'),
      import('./coreSpiritCompilerClient'),
    ]);
    const artifact=await loadOrCompileCoreSpiritArtifact(source,sourceId,{
      backend:'worker-vm',
      compileInWorker:(input,id,compileOptions)=>compileCoreSpiritArtifactOffThread(input,id,compileOptions),
    });
    return this.runArtifact(artifact,undefined,bars,sourceId,options);
  }

  runArtifact(
    artifact:CoreSpiritExecutableArtifact|undefined,
    source:string|undefined,
    bars:CoreSpiritMarketBar[],
    sourceId='coreSpirit',
    options?:{contextKey?:string;datasetVersion?:number;dirtyRange?:DirtyRange;graphSnapshot?:CoreSpiritGraphSnapshot;graphBaseSymbol?:string;graphBaseTimeframe?:string;hmmArtifacts?:readonly CoreSpiritHMMArtifactBinding[];readOnly?:boolean;runtimeOptions?:CoreSpiritWorkerRuntimeOptions},
  ):Promise<CoreSpiritWorkerRunResult> {
    if(this.disposed) return Promise.reject(new Error('CoreSpirit worker pool disposed'));
    if(typeof Worker==='undefined'){
      // A browser must never fall back to interpreting a full history on the UI
      // thread. Keep a persistent compatibility runtime only for Node/SSR/tests.
      if(typeof window!=='undefined'){
        return Promise.reject(new Error('CoreSpirit chart execution requires Web Worker support; inline browser-thread execution is disabled.'));
      }
      if(!artifact || !validateExecutableArtifact(artifact)) return Promise.reject(new Error('CoreSpirit worker requires a valid executable artifact'));
      return this.runFallback(
        artifact,bars,sourceId,options?.contextKey||sourceId,
        Math.max(1,Math.floor(options?.datasetVersion||1)),options?.dirtyRange,
        options?.graphSnapshot,options?.graphBaseSymbol,options?.graphBaseTimeframe,
        options?.hmmArtifacts,options?.runtimeOptions,options?.readOnly===true,
      );
    }

    return new Promise((resolve,reject)=>{
      const contextKey=options?.contextKey || sourceId;
      const job:WorkerJob={
        artifact:artifact as CoreSpiritExecutableArtifact,
        sourceId,
        contextKey,
        bars,
        datasetVersion:Math.max(1,Math.floor(options?.datasetVersion || 1)),
        dirtyRange:options?.dirtyRange,
        resolve,
        reject,
        priority:sourceId.includes('chart') ? 1 : 3,
        graphSnapshot:options?.graphSnapshot,
        graphBaseSymbol:options?.graphBaseSymbol,
        graphBaseTimeframe:options?.graphBaseTimeframe,
        hmmArtifacts:options?.hmmArtifacts,
        readOnly:options?.readOnly===true,
        runtimeOptions:options?.runtimeOptions,
      };

      // Market updates are snapshots, not a durable event queue. If this chart
      // context is already queued behind a busy worker, only the newest snapshot
      // can produce useful output; reject superseded promises so no caller hangs.
      for(let index=this.queue.length-1;index>=0;index-=1){
        const queued=this.queue[index]!;
        if(queued.contextKey!==contextKey)continue;
        this.queue.splice(index,1);
        queued.reject(new Error('CoreSpirit worker request superseded by a newer snapshot for the same context.'));
      }
      this.queue.push(job);
      this.queue.sort((a,b)=>a.priority-b.priority);
      this.dispatch();
    });
  }

  dispose():void {
    this.disposed=true;
    for(const slot of this.slots.splice(0)){
      try{slot.job?.reject(new Error('CoreSpirit worker pool disposed'));}catch{}
      try{slot.worker.terminate();}catch{}
    }
    for(const job of this.queue) job.reject(new Error('CoreSpirit worker pool disposed'));
    this.queue.length=0;
    this.contextSlots.clear();
    this.sharedBuffers.clear();
    this.contextArtifacts.clear();
    this.contextGraphRevisions.clear();
    this.contextHMMArtifacts.clear();
    this.contextRuntimeOptions.clear();
    this.fallbackContexts.clear();
  }

  private dispatch():void {
    if(this.disposed)return;

    // Search for any runnable context rather than head-of-line blocking on a
    // chart whose own worker is busy. The queue itself contains only one pending
    // snapshot per context due to runArtifact's coalescing step above.
    let madeProgress=true;
    while(madeProgress){
      madeProgress=false;
      for(let index=0;index<this.queue.length;index+=1){
        const job=this.queue[index]!;
        let slot=this.contextSlots.get(job.contextKey);
        if(slot?.busy)continue;
        if(!slot){
          slot=this.slots.find(candidate=>!candidate.busy);
          if(!slot&&this.slots.length<this.maxWorkers)slot=this.createSlot();
          if(!slot)continue;
          this.contextSlots.set(job.contextKey,slot);
          slot.contexts.add(job.contextKey);
        }
        this.queue.splice(index,1);
        this.attachJob(slot,job);
        madeProgress=true;
        break;
      }
    }
  }

  private createSlot():WorkerSlot {
    const worker=new Worker(new URL('./coreSpirit.worker.ts',import.meta.url),{type:'module'});
    const slot:WorkerSlot={worker,busy:false,generation:0,contexts:new Set()};
    this.slots.push(slot);
    return slot;
  }

  private attachJob(slot:WorkerSlot,job:WorkerJob):void {
    slot.busy=true;
    slot.job=job;

    const requestId=Date.now().toString(36)+':'+(++slot.generation);
    const sharedBuffer=this.getOrCreateSharedBuffer(job.contextKey,job.bars.length);
    const sharedMarket=sharedBuffer
      ? sharedBuffer.writeBars(job.bars,job.datasetVersion,job.dirtyRange?.from ?? 0,job.dirtyRange?.to ?? job.bars.length)
      : undefined;

    // Avoid hashing/serializing a potentially large IR on the UI thread. A new
    // artifact is fully verified by installArtifact() inside the execution worker;
    // an already loaded context has already passed that same verification.
    if (!job.artifact?.abi?.artifactHash || !job.artifact.ir) {
      job.reject(new Error('CoreSpirit worker job requires a valid executable artifact envelope'));
      slot.busy=false;
      slot.job=undefined;
      this.dispatch();
      return;
    }

    const artifactId=artifactIdFor(job.artifact);
    const runtimeOptionsSignature=stableSignature(job.runtimeOptions??{});
    const artifactChanged=this.contextArtifacts.get(job.contextKey)!==artifactId || this.contextRuntimeOptions.get(job.contextKey)!==runtimeOptionsSignature;
    const graphChanged=!!job.graphSnapshot && this.contextGraphRevisions.get(job.contextKey)!==job.graphSnapshot.revision;
    const graphSnapshotForTransfer=(job.graphSnapshot&&(artifactChanged||graphChanged))?cloneGraphSnapshot(job.graphSnapshot):undefined;
    const hmmSignature=(job.hmmArtifacts ?? []).map(binding=>binding.artifactHash+':'+binding.modelAlias).sort().join('|');
    const hmmArtifactsChanged=job.hmmArtifacts!==undefined && this.contextHMMArtifacts.get(job.contextKey)!==hmmSignature;
    const sendArtifact=artifactChanged ? {
      type:'loadArtifact' as const,
      requestId,
      artifact:job.artifact,
      contextKey:job.contextKey,
      sourceId:job.sourceId,
      graphSnapshot:graphSnapshotForTransfer,
      graphBaseSymbol:job.graphBaseSymbol,
      graphBaseTimeframe:job.graphBaseTimeframe,
      hmmArtifacts:job.hmmArtifacts ?? [],
      replaceHMMArtifacts:true,
      runtimeOptions:job.runtimeOptions,
    } : null;
    const sendHMMArtifacts=(!artifactChanged&&hmmArtifactsChanged) ? {
      type:'updateHMMArtifacts' as const,
      requestId,
      contextKey:job.contextKey,
      hmmArtifacts:job.hmmArtifacts!,
    } : null;
    const sendGraph=(!artifactChanged&&graphChanged&&job.graphSnapshot) ? {
      type:'updateGraph' as const,
      requestId,
      contextKey:job.contextKey,
      graphSnapshot:graphSnapshotForTransfer,
      graphBaseSymbol:job.graphBaseSymbol,
      graphBaseTimeframe:job.graphBaseTimeframe,
    } : null;

    const cleanup=()=>{
      slot.busy=false;
      slot.job=undefined;
      this.dispatch();
    };

    slot.worker.onmessage=(event:MessageEvent<unknown>)=>{
      const message=event.data;
      if(!isRecord(message)||message.requestId!==requestId)return;
      try{
        if(message.type==='result'){
          if(artifactChanged){
            this.contextArtifacts.set(job.contextKey,artifactId);
            this.contextRuntimeOptions.set(job.contextKey,runtimeOptionsSignature);
          }
          if(artifactChanged||hmmArtifactsChanged)this.contextHMMArtifacts.set(job.contextKey,hmmSignature);
          if(job.graphSnapshot&&graphChanged)this.contextGraphRevisions.set(job.contextKey,job.graphSnapshot.revision);
          job.resolve(normalizeResult(message));
        }
        else if(message.type==='error')job.reject(new Error(typeof message.message==='string'?message.message:'CoreSpirit worker failed'));
        else return;
      }catch(error){job.reject(error);}
      cleanup();
    };

    slot.worker.onerror=(event)=>{
      job.reject(new Error(event.message||'CoreSpirit worker error'));
      try{slot.worker.terminate();}catch{}
      const index=this.slots.indexOf(slot);
      if(index>=0)this.slots.splice(index,1);
      for(const [key,value] of this.contextSlots){if(value===slot){this.contextSlots.delete(key);this.contextArtifacts.delete(key);this.contextGraphRevisions.delete(key);this.contextHMMArtifacts.delete(key);this.contextRuntimeOptions.delete(key);this.sharedBuffers.delete(key);}}
      cleanup();
    };

    const mode:WorkerRunEnvelope['mode'] =
      !job.readOnly &&
      job.datasetVersion>1 &&
      !!job.dirtyRange &&
      job.dirtyRange.to>=job.bars.length &&
      job.dirtyRange.from>=Math.max(0,job.bars.length-2)
        ? 'incremental'
        : 'historical';

    const envelope:WorkerRunEnvelope={
      type:'run',
      requestId,
      artifactId,
      contextKey:job.contextKey,
      datasetVersion:job.datasetVersion,
      dirtyFrom:job.dirtyRange?.from ?? 0,
      dirtyTo:job.dirtyRange?.to ?? job.bars.length,
      mode,
      readOnly:job.readOnly,
      ...(sharedMarket?{sharedMarket}:{bars:job.bars}),
    };

    try{
      if(sendArtifact)slot.worker.postMessage(sendArtifact, graphSnapshotForTransfer ? graphSnapshotTransferables(graphSnapshotForTransfer) : []);
      else if(sendHMMArtifacts)slot.worker.postMessage(sendHMMArtifacts);
      if(!sendArtifact&&sendGraph&&graphSnapshotForTransfer)slot.worker.postMessage(sendGraph, graphSnapshotTransferables(graphSnapshotForTransfer));
      slot.worker.postMessage(
        envelope,
        sharedMarket && !sharedMarket.shared ? [sharedMarket.buffer] : [],
      );
    }catch(error){
      job.reject(error);
      cleanup();
    }
  }

  private getOrCreateSharedBuffer(contextKey:string,length:number):CoreSpiritSharedMarketBuffer|undefined {
    if(typeof SharedArrayBuffer==='undefined')return undefined;
    if(typeof globalThis.crossOriginIsolated==='boolean'&&!globalThis.crossOriginIsolated)return undefined;
    let buffer=this.sharedBuffers.get(contextKey);
    if(!buffer){
      buffer=new CoreSpiritSharedMarketBuffer(Math.max(65_536,Math.min(262_144,Math.max(256,length))),true);
      this.sharedBuffers.set(contextKey,buffer);
    }
    return buffer;
  }

  private async runFallback(
    artifact:CoreSpiritExecutableArtifact,
    bars:CoreSpiritMarketBar[],
    sourceId:string,
    contextKey:string,
    datasetVersion:number,
    dirtyRange:DirtyRange|undefined,
    graphSnapshot?:CoreSpiritGraphSnapshot,
    graphBaseSymbol='current',
    graphBaseTimeframe='chart',
    hmmArtifacts?:readonly CoreSpiritHMMArtifactBinding[],
    runtimeOptions?:CoreSpiritWorkerRuntimeOptions,
    readOnly=false,
  ):Promise<CoreSpiritWorkerRunResult>{
    const { CoreSpiritRuntime } = await import('./runtime');
    const artifactId=artifactIdFor(artifact);
    const runtimeOptionsSignature=stableSignature(runtimeOptions??{});
    const hmmSignature=(hmmArtifacts??[]).map(binding=>binding.artifactHash+':'+binding.modelAlias).sort().join('|');
    let context=this.fallbackContexts.get(contextKey);

    const installHMMArtifacts=(models:Map<string,CoreSpiritGaussianHMM>)=>{
      models.clear();
      for(const binding of hmmArtifacts??[]){
        if(!Number.isFinite(binding.trainingEndTimestampMs))throw new Error('Invalid CoreSpirit HMM training cutoff');
        const model=CoreSpiritGaussianHMM.fromTrainedState(binding.state);
        model.setInferenceBoundaryExclusive(Math.floor(binding.trainingEndTimestampMs/1000));
        models.set(binding.modelAlias,model);
      }
    };

    if(!context||context.artifactId!==artifactId||context.runtimeOptionsSignature!==runtimeOptionsSignature){
      const graphResolver=graphSnapshot?createGraphResolver(graphSnapshot,graphBaseSymbol,graphBaseTimeframe):undefined;
      const hmmModels=new Map<string,CoreSpiritGaussianHMM>();
      installHMMArtifacts(hmmModels);
      const runtime=new CoreSpiritRuntime({
        ...(runtimeOptions??{}),
        sourceId,
        dataResolver:graphResolver,
        hmmArtifactResolver:modelName=>hmmModels.get(modelName),
      });
      runtime.loadIr(artifact.ir);
      context={artifactId,runtimeOptionsSignature,datasetVersion:0,initialized:false,runtime,graphResolver,graphRevision:graphSnapshot?.revision,hmmSignature,hmmModels};
      this.fallbackContexts.set(contextKey,context);
    }else{
      if(graphSnapshot&&context.graphResolver&&context.graphRevision!==graphSnapshot.revision){
        context.graphResolver.replaceSnapshot(graphSnapshot);
        context.graphRevision=graphSnapshot.revision;
      }else if(graphSnapshot&&!context.graphResolver){
        // A data resolver cannot be bolted onto an already-loaded VM safely;
        // reinstall via a fresh context on the next request instead.
        const graphResolver=createGraphResolver(graphSnapshot,graphBaseSymbol,graphBaseTimeframe);
        const hmmModels=context.hmmModels;
        const runtime=new CoreSpiritRuntime({...(runtimeOptions??{}),sourceId,dataResolver:graphResolver,hmmArtifactResolver:modelName=>hmmModels.get(modelName)});
        runtime.loadIr(artifact.ir);
        context={...context,runtime,graphResolver,graphRevision:graphSnapshot.revision,datasetVersion:0,initialized:false};
        this.fallbackContexts.set(contextKey,context);
      }
      if(context.hmmSignature!==hmmSignature){installHMMArtifacts(context.hmmModels);context.hmmSignature=hmmSignature;}
    }

    const incremental=!readOnly&&datasetVersion>context.datasetVersion&&datasetVersion>1&&!!dirtyRange&&
      dirtyRange.to>=bars.length&&dirtyRange.from>=Math.max(0,bars.length-2)&&context.initialized;
    let result;
    if(incremental){
      const latest=bars.at(-1);
      if(!latest)throw new Error('CoreSpirit worker received an empty market dataset');
      result=context.runtime.executeBar(latest,'realtime');
    }else{
      result=readOnly?context.runtime.executeIrReadOnly(artifact.ir,bars):context.runtime.executeIr(artifact.ir,bars);
      context.initialized=true;
    }
    context.datasetVersion=datasetVersion;
    return {outputs:result.outputs,diagnostics:result.diagnostics,state:result.state};
  }
}

export const coreSpiritWorkerPool=new CoreSpiritWorkerPool();

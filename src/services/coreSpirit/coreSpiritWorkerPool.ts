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
  if(value===null||typeof value!=='object')return JSON.stringify(value)??'undefined';
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
const MAX_QUEUED_WORKER_JOBS = 64;
const MAX_CONTEXTS_PER_WORKER = 8;
const WORKER_JOB_TIMEOUT_MS = 20_000;
function abortError(message:string):Error { const error=new Error(message); error.name='AbortError'; return error; }

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
  generation:number;
  enqueuedAt:number;
  signal?:AbortSignal;
  abortHandler?:()=>void;
  settled:boolean;
  graphSnapshot?:CoreSpiritGraphSnapshot;
  graphBaseSymbol?:string;
  graphBaseTimeframe?:string;
  hmmArtifacts?:readonly CoreSpiritHMMArtifactBinding[];
  readOnly:boolean;
  suppressExternalEffectsForRun?:boolean;
  runtimeOptions?:CoreSpiritWorkerRuntimeOptions;
};

type WorkerSlot = {
  worker:Worker;
  busy:boolean;
  generation:number;
  contexts:Set<string>;
  job?:WorkerJob;
  timeout?:ReturnType<typeof setTimeout>;
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
  suppressExternalEffectsForRun?:boolean;
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
  private readonly contextGenerations = new Map<string,number>();
  private requestSequence = 0;
  private readonly maxQueuedJobs = MAX_QUEUED_WORKER_JOBS;
  private readonly maxContextsPerWorker = MAX_CONTEXTS_PER_WORKER;
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
    options?:{contextKey?:string;datasetVersion?:number;dirtyRange?:DirtyRange;graphSnapshot?:CoreSpiritGraphSnapshot;graphBaseSymbol?:string;graphBaseTimeframe?:string;hmmArtifacts?:readonly CoreSpiritHMMArtifactBinding[];readOnly?:boolean;suppressExternalEffectsForRun?:boolean;runtimeOptions?:CoreSpiritWorkerRuntimeOptions;signal?:AbortSignal},
  ):Promise<CoreSpiritWorkerRunResult> {
    if(options?.signal?.aborted)throw abortError('CoreSpirit request cancelled before compilation.');
    const [{loadOrCompileCoreSpiritArtifact},{compileCoreSpiritArtifactOffThread}]=await Promise.all([
      import('./artifactCache'),
      import('./coreSpiritCompilerClient'),
    ]);
    const artifact=await loadOrCompileCoreSpiritArtifact(source,sourceId,{
      backend:'worker-vm',
      compileInWorker:(input,id,compileOptions)=>compileCoreSpiritArtifactOffThread(input,id,{...compileOptions,signal:options?.signal}),
    });
    if(options?.signal?.aborted)throw abortError('CoreSpirit request cancelled after compilation.');
    return this.runArtifact(artifact,undefined,bars,sourceId,options);
  }

  runArtifact(
    artifact:CoreSpiritExecutableArtifact|undefined,
    source:string|undefined,
    bars:CoreSpiritMarketBar[],
    sourceId='coreSpirit',
    options?:{contextKey?:string;datasetVersion?:number;dirtyRange?:DirtyRange;graphSnapshot?:CoreSpiritGraphSnapshot;graphBaseSymbol?:string;graphBaseTimeframe?:string;hmmArtifacts?:readonly CoreSpiritHMMArtifactBinding[];readOnly?:boolean;suppressExternalEffectsForRun?:boolean;runtimeOptions?:CoreSpiritWorkerRuntimeOptions;signal?:AbortSignal},
  ):Promise<CoreSpiritWorkerRunResult> {
    const contextKey=options?.contextKey || sourceId;
    const signal=options?.signal;
    if(signal?.aborted)return Promise.reject(abortError('CoreSpirit execution cancelled before admission.'));
    if(this.disposed) return Promise.reject(new Error('CoreSpirit worker pool disposed'));
    if(typeof Worker==='undefined'){
      // A browser must never fall back to interpreting a full history on the UI
      // thread. Keep a persistent compatibility runtime only for Node/SSR/tests.
      if(typeof window!=='undefined'){
        return Promise.reject(new Error('CoreSpirit chart execution requires Web Worker support; inline browser-thread execution is disabled.'));
      }
      if(!artifact || !validateExecutableArtifact(artifact)) return Promise.reject(new Error('CoreSpirit worker requires a valid executable artifact'));
      const generation=(this.contextGenerations.get(contextKey)??0)+1;this.contextGenerations.set(contextKey,generation);
      return this.runFallback(artifact,bars,sourceId,contextKey,Math.max(1,Math.floor(options?.datasetVersion||1)),options?.dirtyRange,options?.graphSnapshot,options?.graphBaseSymbol,options?.graphBaseTimeframe,options?.hmmArtifacts,options?.runtimeOptions,options?.readOnly===true,options?.suppressExternalEffectsForRun===true).then(result=>{
        if(signal?.aborted||this.contextGenerations.get(contextKey)!==generation)throw abortError('CoreSpirit fallback result belongs to an obsolete generation.');
        return result;
      });
    }

    return new Promise((resolve,reject)=>{
      const job:WorkerJob={
        artifact:artifact as CoreSpiritExecutableArtifact,
        sourceId,
        contextKey,
        bars,
        datasetVersion:Math.max(1,Math.floor(options?.datasetVersion || 1)),
        dirtyRange:options?.dirtyRange,
        resolve,
        reject,
        // Use the declared execution target/mode, not the human-readable
        // sourceId, to prioritize live chart work. Vela's instance IDs are
        // generated and often do not contain the word "chart".
        priority:options?.runtimeOptions?.executionTarget==='chart'?(options.runtimeOptions.executionMode==='realtime'?0:1):sourceId.includes('chart')?2:4,
        generation:this.contextGenerations.get(contextKey)??0,enqueuedAt:Date.now(),signal,settled:false,
        graphSnapshot:options?.graphSnapshot,
        graphBaseSymbol:options?.graphBaseSymbol,
        graphBaseTimeframe:options?.graphBaseTimeframe,
        hmmArtifacts:options?.hmmArtifacts,
        readOnly:options?.readOnly===true,
        suppressExternalEffectsForRun:options?.suppressExternalEffectsForRun===true,
        runtimeOptions:options?.runtimeOptions,
      };

      for(let index=this.queue.length-1;index>=0;index-=1){
        const queued=this.queue[index]!;
        if(queued.contextKey!==contextKey)continue;
        this.queue.splice(index,1);this.settleJob(queued,abortError('Superseded by a newer snapshot for this context.'));
      }
      if(this.queue.length>=this.maxQueuedJobs){
        let worstIndex=-1;
        for(let index=0;index<this.queue.length;index+=1){
          const candidate=this.queue[index]!,worst=worstIndex>=0?this.queue[worstIndex]!:undefined;
          if(candidate.priority>job.priority&&(!worst||candidate.priority>worst.priority||(candidate.priority===worst.priority&&candidate.enqueuedAt<worst.enqueuedAt)))worstIndex=index;
        }
        if(worstIndex<0){this.settleJob(job,new Error('CoreSpirit worker queue is saturated; request was not admitted.'));return;}
        const [evicted]=this.queue.splice(worstIndex,1);
        if(evicted)this.settleJob(evicted,abortError('Background job pre-empted by visible chart work.'));
      }
      job.generation=(this.contextGenerations.get(contextKey)??0)+1;this.contextGenerations.set(contextKey,job.generation);
      this.queue.push(job);
      if(signal){job.abortHandler=()=>this.cancelJob(job,abortError('CoreSpirit worker request cancelled.'));signal.addEventListener('abort',job.abortHandler,{once:true});}
      const activeSlot=this.contextSlots.get(contextKey);
      if(activeSlot?.busy&&activeSlot.job&&activeSlot.job.generation<job.generation)this.retireSlot(activeSlot,abortError('Superseded by a newer CoreSpirit worker generation.'),false);
      if(signal?.aborted){this.cancelJob(job,abortError('CoreSpirit worker request cancelled.'));return;}
      this.sortQueue();this.dispatch();
    });
  }

  dispose():void {
    this.disposed=true;const error=new Error('CoreSpirit worker pool disposed');
    for(const slot of [...this.slots])this.retireSlot(slot,error,false);
    for(const job of this.queue.splice(0))this.settleJob(job,error);
    this.contextGenerations.clear();
    this.contextSlots.clear();
    this.sharedBuffers.clear();
    this.contextArtifacts.clear();
    this.contextGraphRevisions.clear();
    this.contextHMMArtifacts.clear();
    this.contextRuntimeOptions.clear();this.fallbackContexts.clear();
  }
  private settleJob(job:WorkerJob,error?:unknown,value?:CoreSpiritWorkerRunResult):void {
    if(job.settled)return;job.settled=true;
    if(job.signal&&job.abortHandler)job.signal.removeEventListener('abort',job.abortHandler);job.abortHandler=undefined;
    if(error!==undefined)job.reject(error);else job.resolve(value!);
  }
  private cancelJob(job:WorkerJob,error:Error):void {
    if(job.settled)return;const index=this.queue.indexOf(job);
    if(index>=0){
      this.queue.splice(index,1);this.settleJob(job,error);
      if(!this.queue.some(item=>item.contextKey===job.contextKey)&&!this.contextSlots.has(job.contextKey))this.contextGenerations.delete(job.contextKey);
      this.dispatch();return;
    }
    const slot=this.contextSlots.get(job.contextKey);
    if(slot?.job===job){this.retireSlot(slot,error);return;}this.settleJob(job,error);
  }
  private effectivePriority(job:WorkerJob):number {
    const ageBoost=Math.floor(Math.max(0,Date.now()-job.enqueuedAt)/10_000);
    return Math.max(job.priority===0?0:1,job.priority-ageBoost);
  }
  private sortQueue():void {this.queue.sort((a,b)=>this.effectivePriority(a)-this.effectivePriority(b)||a.enqueuedAt-b.enqueuedAt);}
  private retireSlot(slot:WorkerSlot,error:Error,dispatch=true):void {
    if(slot.timeout)clearTimeout(slot.timeout);slot.timeout=undefined;
    const active=slot.job;slot.job=undefined;slot.busy=false;if(active)this.settleJob(active,error);
    try{slot.worker.terminate();}catch{}
    const index=this.slots.indexOf(slot);if(index>=0)this.slots.splice(index,1);
    for(const [key,value] of this.contextSlots){if(value!==slot)continue;
      this.contextSlots.delete(key);this.contextArtifacts.delete(key);this.contextGraphRevisions.delete(key);
      this.contextHMMArtifacts.delete(key);this.contextRuntimeOptions.delete(key);this.sharedBuffers.delete(key);
      if(!this.queue.some(job=>job.contextKey===key))this.contextGenerations.delete(key);
    }
    slot.contexts.clear();if(dispatch)this.dispatch();
  }
  private dispatch():void {
    if(this.disposed)return;this.sortQueue();

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
          if(slot&&slot.contexts.size>=this.maxContextsPerWorker){this.retireSlot(slot,new Error('Worker context cache rotated to bound memory.'),false);slot=undefined;}
          if(!slot&&this.slots.length<this.maxWorkers)slot=this.createSlot();
          if(!slot)continue;
          this.contextSlots.set(job.contextKey,slot);slot.contexts.add(job.contextKey);
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

    const requestId='cs-run-'+(++this.requestSequence).toString(36)+'-'+(++slot.generation).toString(36);
    const sharedBuffer=this.getOrCreateSharedBuffer(job.contextKey,job.bars.length);
    const sharedMarket=sharedBuffer
      ? sharedBuffer.writeBars(job.bars,job.datasetVersion,job.dirtyRange?.from ?? 0,job.dirtyRange?.to ?? job.bars.length)
      : undefined;

    // Avoid hashing/serializing a potentially large IR on the UI thread. A new
    // artifact is fully verified by installArtifact() inside the execution worker;
    // an already loaded context has already passed that same verification.
    if (!job.artifact?.abi?.artifactHash || !job.artifact.ir) {
      this.settleJob(job,new Error('CoreSpirit worker job requires a valid executable artifact envelope'));
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

    const cleanup=()=>{if(slot.timeout)clearTimeout(slot.timeout);slot.timeout=undefined;if(slot.job===job){slot.busy=false;slot.job=undefined;}this.dispatch();};

    slot.worker.onmessage=(event:MessageEvent<unknown>)=>{
      const message=event.data;
      if(slot.job!==job||!isRecord(message)||message.requestId!==requestId)return;
      if(job.generation!==this.contextGenerations.get(job.contextKey)){this.retireSlot(slot,abortError('CoreSpirit result belongs to an obsolete generation.'));return;}
      try{
        if(message.type==='result'){
          if(artifactChanged){
            this.contextArtifacts.set(job.contextKey,artifactId);
            this.contextRuntimeOptions.set(job.contextKey,runtimeOptionsSignature);
          }
          if(artifactChanged||hmmArtifactsChanged)this.contextHMMArtifacts.set(job.contextKey,hmmSignature);
          if(job.graphSnapshot&&graphChanged)this.contextGraphRevisions.set(job.contextKey,job.graphSnapshot.revision);
          this.settleJob(job,undefined,normalizeResult(message));
        }
        else if(message.type==='error')this.settleJob(job,new Error(typeof message.message==='string'?message.message:'CoreSpirit worker failed'));
        else return;
      }catch(error){this.settleJob(job,error instanceof Error?error:new Error(String(error)));}
      cleanup();
    };
    slot.worker.onerror=(event)=>this.retireSlot(slot,new Error(event.message||'CoreSpirit worker error'));

    const mode:WorkerRunEnvelope['mode'] =
      !job.readOnly &&
      job.datasetVersion>1 &&
      !!job.dirtyRange &&
      job.dirtyRange.to>=job.bars.length &&
      job.dirtyRange.from>=Math.max(0,job.bars.length-2)
        ? 'incremental'
        : 'historical';

    slot.timeout=setTimeout(()=>{if(slot.job===job)this.retireSlot(slot,new Error('CoreSpirit worker timed out; it was terminated and will restart on demand.'));},WORKER_JOB_TIMEOUT_MS);

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
      suppressExternalEffectsForRun:job.suppressExternalEffectsForRun===true,
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
    }catch(error){this.retireSlot(slot,error instanceof Error?error:new Error(String(error)));}
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
    suppressExternalEffectsForRun=false,
  ):Promise<CoreSpiritWorkerRunResult>{
    const { CoreSpiritRuntime } = await import('./runtime');
    const artifactId=artifactIdFor(artifact);
    const runtimeOptionsSignature=stableSignature(runtimeOptions??{});
    const hmmSignature=(hmmArtifacts??[]).map(binding=>binding.artifactHash+':'+binding.modelAlias).sort().join('|');
    let context=this.fallbackContexts.get(contextKey);

    const installHMMArtifacts=(models:Map<string,CoreSpiritGaussianHMM>)=>{
      models.clear();
      for(const binding of hmmArtifacts??[]){
        const inferenceBoundary=binding.inferenceBoundaryTimestampMs;
        if(!Number.isFinite(inferenceBoundary) ||
          (Number.isFinite(binding.trainingEndTimestampMs) && inferenceBoundary! <= binding.trainingEndTimestampMs!)){
          throw new Error('Invalid CoreSpirit HMM post-validation inference boundary');
        }
        const model=CoreSpiritGaussianHMM.fromTrainedState(binding.state);
        model.setInferenceBoundaryExclusive(Math.floor(inferenceBoundary!/1000));
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

    const tailSnapshot=!readOnly&&datasetVersion>context.datasetVersion&&datasetVersion>1&&!!dirtyRange&&
      dirtyRange.to>=bars.length&&dirtyRange.from>=Math.max(0,bars.length-2);
    const incremental=tailSnapshot&&context.initialized;
    let result;
    if(incremental){
      const latest=bars.at(-1);
      if(!latest)throw new Error('CoreSpirit worker received an empty market dataset');
      result=suppressExternalEffectsForRun
        ? context.runtime.executeBarReadOnly(latest,'realtime')
        : context.runtime.executeBar(latest,'realtime');
    }else{
      // An incremental tick can be the first request after a runtime-settings
      // change. Its full-history reconstruction is a baseline, not a live run.
      const warmReadOnly=readOnly||(tailSnapshot&&!context.initialized);
      result=warmReadOnly?context.runtime.executeIrReadOnly(artifact.ir,bars):context.runtime.executeIr(artifact.ir,bars);
      context.initialized=true;
    }
    context.datasetVersion=datasetVersion;
    return {outputs:result.outputs,diagnostics:result.diagnostics,state:result.state};
  }
}

export const coreSpiritWorkerPool=new CoreSpiritWorkerPool();

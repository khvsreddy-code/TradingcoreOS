import type { CoreSpiritMarketBar } from './marketData';
import type { CoreSpiritObject } from './types';
import type { CoreSpiritExecutableArtifact } from './artifact';
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
  sharedMarket?:CoreSpiritSharedMarketDescriptor;
  bars?:CoreSpiritMarketBar[];
  graphSnapshot?:CoreSpiritGraphSnapshot;
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
  private queueCursor = 0;
  private disposed = false;
  private readonly maxWorkers:number;
  private readonly contextSlots = new Map<string,WorkerSlot>();
  private readonly sharedBuffers = new Map<string,CoreSpiritSharedMarketBuffer>();
  private readonly contextArtifacts = new Map<string,string>();
  private readonly contextGraphRevisions = new Map<string,number>();

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
    options?:{contextKey?:string;datasetVersion?:number;dirtyRange?:DirtyRange;graphSnapshot?:CoreSpiritGraphSnapshot},
  ):Promise<CoreSpiritWorkerRunResult> {
    const { compileCoreSpirit } = await import('./coreSpiritPipeline');
    const compiled = compileCoreSpirit(source, sourceId);
    if (!compiled.artifact || compiled.diagnostics.some(d => d.severity === 'error')) {
      throw new Error(compiled.diagnostics.map(d => d.message).join('; ') || 'CoreSpirit compilation failed');
    }
    return this.runArtifact(compiled.artifact, source, bars, sourceId, options);
  }

  runArtifact(
    artifact:CoreSpiritExecutableArtifact|undefined,
    source:string|undefined,
    bars:CoreSpiritMarketBar[],
    sourceId='coreSpirit',
    options?:{contextKey?:string;datasetVersion?:number;dirtyRange?:DirtyRange;graphSnapshot?:CoreSpiritGraphSnapshot},
  ):Promise<CoreSpiritWorkerRunResult> {
    if(this.disposed) return Promise.reject(new Error('CoreSpirit worker pool disposed'));
    if(typeof Worker==='undefined'){
      if(!artifact || !validateExecutableArtifact(artifact)) return Promise.reject(new Error('CoreSpirit worker requires a valid executable artifact'));
      return this.runFallback(artifact,bars,sourceId,options?.graphSnapshot);
    }

    return new Promise((resolve,reject)=>{
      const contextKey=options?.contextKey || sourceId;
      this.queue.push({
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
      });
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
    for(let i=this.queueCursor;i<this.queue.length;i++) this.queue[i].reject(new Error('CoreSpirit worker pool disposed'));
    this.queue.length=0;
    this.queueCursor=0;
    this.contextSlots.clear();
    this.sharedBuffers.clear();
    this.contextArtifacts.clear();
    this.contextGraphRevisions.clear();
  }

  private dispatch():void {
    if(this.disposed) return;

    while(this.queueCursor<this.queue.length){
      const job=this.queue[this.queueCursor]!;
      let slot=this.contextSlots.get(job.contextKey);

      if(slot && slot.busy) return;
      if(!slot){
        slot=this.slots.find(candidate=>!candidate.busy);
        if(!slot && this.slots.length<this.maxWorkers) slot=this.createSlot();
        if(!slot) return;
        this.contextSlots.set(job.contextKey,slot);
        slot.contexts.add(job.contextKey);
      }

      this.queueCursor+=1;
      this.attachJob(slot,job);
      if(this.queueCursor===this.queue.length){
        this.queue.length=0;
        this.queueCursor=0;
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

    if (!job.artifact || !validateExecutableArtifact(job.artifact)) {
      job.reject(new Error('CoreSpirit worker job requires a valid executable artifact'));
      slot.busy=false;
      slot.job=undefined;
      this.dispatch();
      return;
    }

    const artifactId=artifactIdFor(job.artifact);
    const artifactChanged=this.contextArtifacts.get(job.contextKey)!==artifactId;
    const graphChanged=!!job.graphSnapshot && this.contextGraphRevisions.get(job.contextKey)!==job.graphSnapshot.revision;
    const sendArtifact=artifactChanged ? {
      type:'loadArtifact' as const,
      requestId,
      artifact:job.artifact,
      contextKey:job.contextKey,
      sourceId:job.sourceId,
      graphSnapshot:job.graphSnapshot,
    } : null;
    const sendGraph=(!artifactChanged&&graphChanged&&job.graphSnapshot) ? {
      type:'updateGraph' as const,
      requestId,
      contextKey:job.contextKey,
      graphSnapshot:job.graphSnapshot,
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
          if(artifactChanged)this.contextArtifacts.set(job.contextKey,artifactId);
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
      for(const [key,value] of this.contextSlots){if(value===slot){this.contextSlots.delete(key);this.contextArtifacts.delete(key);this.contextGraphRevisions.delete(key);this.sharedBuffers.delete(key);}}
      cleanup();
    };

    const mode:WorkerRunEnvelope['mode'] =
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
      ...(sharedMarket?{sharedMarket}:{bars:job.bars}),
    };

    try{
      if(sendArtifact)slot.worker.postMessage(sendArtifact, job.graphSnapshot ? graphSnapshotTransferables(job.graphSnapshot) : []);
      else if(sendGraph)slot.worker.postMessage(sendGraph, graphSnapshotTransferables(job.graphSnapshot!));
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
    graphSnapshot?:CoreSpiritGraphSnapshot,
  ):Promise<CoreSpiritWorkerRunResult>{
    const { CoreSpiritRuntime } = await import('./runtime');
    const runtime=new CoreSpiritRuntime({
      sourceId,
      dataResolver:graphSnapshot?createGraphResolver(graphSnapshot):undefined,
    });
    runtime.loadIr(artifact.ir);
    const result=runtime.executeIr(artifact.ir,bars);
    return {outputs:result.outputs,diagnostics:result.diagnostics,state:result.state};
  }
}

export const coreSpiritWorkerPool=new CoreSpiritWorkerPool();

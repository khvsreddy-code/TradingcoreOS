import { CoreSpiritRuntime } from './runtime';
import {
  coreSpiritMarketFrameArrayFacade,
  coreSpiritMarketFrameFromBars,
  coreSpiritMarketFrameFromColumns,
  emptyCoreSpiritMarketFrame,
  type CoreSpiritMarketBar,
  type CoreSpiritMarketFrame,
} from './marketData';
import { CoreSpiritGaussianHMM, type CoreSpiritHMMArtifactBinding } from './quantMath';
import {
  readCoreSpiritSharedMarketDescriptor,
  type CoreSpiritSharedMarketDescriptor,
} from './sharedMarketBuffer';
import type { CoreSpiritExecutableArtifact } from './artifact';
import type { CoreSpiritWorkerRuntimeOptions } from './coreSpiritWorkerPool';
import { validateExecutableArtifact } from './artifact';
import { artifactIdFor } from './artifactAbi';
import { createSharedSeriesOutput } from './sharedOutputBuffer';
import { createGraphResolver, type CoreSpiritDataGraphResolver, type CoreSpiritGraphSnapshot } from '../core/data/marketDataGraph';
import { isRecord } from '../boundary/brokerApiValidation';
import { requireCoreSpiritOutputs } from './boundaryValidation';

type WorkerContext={
  artifact:CoreSpiritExecutableArtifact;
  sourceId:string;
  runtime:CoreSpiritRuntime;
  /** Canonical columns, normally backed by the host's SharedArrayBuffer. */
  marketFrame:CoreSpiritMarketFrame;
  /** Read-only compatibility facade; no retained object per bar. */
  bars:CoreSpiritMarketBar[];
  datasetVersion:number;
  initialized:boolean;
  graphResolver:CoreSpiritDataGraphResolver;
  hmmModels:Map<string,CoreSpiritGaussianHMM>;
  runtimeOptionsSignature:string;
};

type LoadArtifactMessage={
  type:'loadArtifact';
  requestId:string;
  contextKey:string;
  sourceId:string;
  artifact:CoreSpiritExecutableArtifact;
  graphSnapshot?:CoreSpiritGraphSnapshot;
  graphBaseSymbol?:string;
  graphBaseTimeframe?:string;
  hmmArtifacts?:readonly CoreSpiritHMMArtifactBinding[];
  replaceHMMArtifacts?:boolean;
  runtimeOptions?:CoreSpiritWorkerRuntimeOptions;
};

type UpdateHMMArtifactsMessage={
  type:'updateHMMArtifacts';
  requestId:string;
  contextKey:string;
  hmmArtifacts:readonly CoreSpiritHMMArtifactBinding[];
};

type UpdateGraphMessage={
  type:'updateGraph';
  requestId:string;
  contextKey:string;
  graphSnapshot:CoreSpiritGraphSnapshot;
  graphBaseSymbol?:string;
  graphBaseTimeframe?:string;
};

type RunMessage={
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
};

type Message=LoadArtifactMessage|UpdateHMMArtifactsMessage|UpdateGraphMessage|RunMessage;

const contexts=new Map<string,WorkerContext>();

function syncSharedMarket(
  context:WorkerContext,
  descriptor:CoreSpiritSharedMarketDescriptor,
):{dirtyFrom:number;dirtyTo:number}{
  const columns=readCoreSpiritSharedMarketDescriptor(descriptor);
  const length=Math.max(0,Math.min(descriptor.length,descriptor.capacity));
  // Zero-copy views over the descriptor; no per-bar object mutation or allocation.
  context.marketFrame=coreSpiritMarketFrameFromColumns({...columns,length,timeUnit:'seconds'},length);
  const dirtyFrom=Math.max(0,Math.min(length,Math.floor(descriptor.dirtyFrom)));
  const dirtyTo=Math.max(dirtyFrom,Math.min(length,Math.ceil(descriptor.dirtyTo)));
  return {dirtyFrom,dirtyTo};
}

function syncObjectBars(context:WorkerContext,bars:CoreSpiritMarketBar[]):{dirtyFrom:number;dirtyTo:number}{
  // The compatibility transport is converted once into columns; the input array
  // is not retained across runs.
  context.marketFrame=coreSpiritMarketFrameFromBars(bars);
  return {dirtyFrom:0,dirtyTo:context.marketFrame.length};
}

function replaceHMMArtifacts(context:WorkerContext, bindings:readonly CoreSpiritHMMArtifactBinding[]):void {
  const next=new Map<string,CoreSpiritGaussianHMM>();
  for(const binding of bindings){
    const inferenceBoundary=binding?.inferenceBoundaryTimestampMs ?? binding?.trainingEndTimestampMs;
    if(!binding || typeof binding.modelAlias!=='string' || !binding.modelAlias.trim() ||
      typeof binding.artifactHash!=='string' || !/^[a-f0-9]{64}$/.test(binding.artifactHash) ||
      !Number.isFinite(inferenceBoundary)){
      throw new Error('Invalid CoreSpirit HMM artifact binding or inference boundary');
    }
    if(next.has(binding.modelAlias))throw new Error('Duplicate CoreSpirit HMM artifact alias: '+binding.modelAlias);
    const model=CoreSpiritGaussianHMM.fromTrainedState(binding.state);
    model.setInferenceBoundaryExclusive(Math.floor(inferenceBoundary!/1000));
    next.set(binding.modelAlias,model);
  }
  context.hmmModels.clear();
  for(const [alias,model] of next)context.hmmModels.set(alias,model);
}

function stableRuntimeSignature(value:unknown):string {
  if(value===null||typeof value!=='object')return JSON.stringify(value)??'undefined';
  if(Array.isArray(value))return `[${value.map(stableRuntimeSignature).join(',')}]`;
  const record=value as Record<string,unknown>;
  return `{${Object.keys(record).sort().map(key=>`${JSON.stringify(key)}:${stableRuntimeSignature(record[key])}`).join(',')}}`;
}

function installArtifact(message:LoadArtifactMessage):void{
  if(!validateExecutableArtifact(message.artifact))throw new Error('Invalid CoreSpirit executable artifact');
  const current=contexts.get(message.contextKey);
  const sameArtifact=Boolean(current&&artifactIdFor(current.artifact)===artifactIdFor(message.artifact));
  const runtimeOptionsSignature=stableRuntimeSignature(message.runtimeOptions??{});
  if(sameArtifact&&current!.runtimeOptionsSignature===runtimeOptionsSignature){
    if(message.graphSnapshot)current!.graphResolver.replaceSnapshot(message.graphSnapshot);
    if(message.replaceHMMArtifacts)replaceHMMArtifacts(current!,message.hmmArtifacts ?? []);
    return;
  }

  const graphResolver=createGraphResolver(
    message.graphSnapshot ?? {version:1,revision:0,nodes:[]},
    message.graphBaseSymbol ?? message.sourceId,
    message.graphBaseTimeframe ?? 'chart',
  );
  const hmmModels=sameArtifact?current!.hmmModels:new Map<string,CoreSpiritGaussianHMM>();
  const context:WorkerContext=sameArtifact?current!:{
    artifact:message.artifact,
    sourceId:message.sourceId,
    runtime:undefined as unknown as CoreSpiritRuntime,
    marketFrame:emptyCoreSpiritMarketFrame(),
    bars:[] as CoreSpiritMarketBar[],
    datasetVersion:0,
    initialized:false,
    graphResolver,
    hmmModels,
    runtimeOptionsSignature,
  };
  context.artifact=message.artifact;
  context.sourceId=message.sourceId;
  context.graphResolver=graphResolver;
  context.hmmModels=hmmModels;
  context.runtimeOptionsSignature=runtimeOptionsSignature;
  context.datasetVersion=0;
  context.initialized=false;
  if(!sameArtifact)context.bars=coreSpiritMarketFrameArrayFacade(()=>context.marketFrame);
  const runtime=new CoreSpiritRuntime({
    ...(message.runtimeOptions??{}),
    sourceId:message.sourceId,
    dataResolver:graphResolver,
    hmmArtifactResolver:modelName=>hmmModels.get(modelName),
    marketFrame:()=>context.marketFrame,
  });
  runtime.loadIr(message.artifact.ir);
  context.runtime=runtime;
  contexts.set(message.contextKey,context);
  if(message.replaceHMMArtifacts||!sameArtifact)replaceHMMArtifacts(context,message.hmmArtifacts ?? []);
}
function getContext(message:RunMessage):WorkerContext{
  const context=contexts.get(message.contextKey);
  if(!context)throw new Error('CoreSpirit worker context is not loaded: '+message.contextKey);
  if(artifactIdFor(context.artifact)!==message.artifactId)throw new Error('CoreSpirit artifact/context mismatch for '+message.contextKey);
  return context;
}

self.onmessage=(event:MessageEvent<Message>)=>{
  const message=event.data;
  try{
    if(message.type==='loadArtifact'){
      installArtifact(message);
      self.postMessage({
        type:'loaded',
        requestId:message.requestId,
        contextKey:message.contextKey,
        artifactId:artifactIdFor(message.artifact),
      });
      return;
    }

    if(message.type==='updateHMMArtifacts'){
      const context=contexts.get(message.contextKey);
      if(!context)throw new Error('CoreSpirit worker HMM context is not loaded: '+message.contextKey);
      replaceHMMArtifacts(context,message.hmmArtifacts);
      self.postMessage({
        type:'updatedHMMArtifacts',
        requestId:message.requestId,
        contextKey:message.contextKey,
        artifactHashes:message.hmmArtifacts.map(binding=>binding.artifactHash),
      });
      return;
    }

    if(message.type==='updateGraph'){
      const context=contexts.get(message.contextKey);
      if(!context)throw new Error('CoreSpirit worker graph context is not loaded: '+message.contextKey);
      context.graphResolver.replaceSnapshot(message.graphSnapshot);
      self.postMessage({
        type:'updatedGraph',
        requestId:message.requestId,
        contextKey:message.contextKey,
        revision:message.graphSnapshot.revision,
      });
      return;
    }

    if(!isRecord(message)||message.type!=='run')return;
    const context=getContext(message);

    const sync=message.sharedMarket
      ? syncSharedMarket(context,message.sharedMarket)
      : syncObjectBars(context,message.bars || []);

    const fullReset=
      message.readOnly ||
      message.mode==='historical' ||
      !context.initialized ||
      message.datasetVersion<=context.datasetVersion;

    let result;
    if(fullReset){
      context.runtime.reset();
      context.runtime.loadIr(context.artifact.ir);
      // If an incremental tick arrives before a context has warmed (for
      // example after an input/artifact swap), reconstruct history read-only.
      // Only the actual forming-bar executeBar call may follow that baseline.
      const warmReadOnly=message.readOnly||(message.mode==='incremental'&&!context.initialized);
      result=warmReadOnly
        ? context.runtime.executeIrReadOnly(context.artifact.ir,context.bars)
        : context.runtime.executeIr(context.artifact.ir,context.bars);
      context.initialized=true;
    }else{
      const latest=context.bars.at(-1);
      if(!latest)throw new Error('CoreSpirit worker received an empty market dataset');
      result=message.suppressExternalEffectsForRun
        ? context.runtime.executeBarReadOnly(latest,'realtime')
        : context.runtime.executeBar(latest,'realtime');
    }

    context.datasetVersion=message.datasetVersion;

    const transported=createSharedSeriesOutput(requireCoreSpiritOutputs(result.outputs));
    self.postMessage({
      type:'result',
      requestId:message.requestId,
      contextKey:message.contextKey,
      artifactId:artifactIdFor(context.artifact),
      outputs:transported.passthrough,
      ...(transported.descriptor ? {sharedSeries:transported.descriptor} : {}),
      state:result.state,
      diagnostics:result.diagnostics,
      dirtyFrom:sync.dirtyFrom,
      dirtyTo:sync.dirtyTo,
    });
  }catch(error){
    self.postMessage({
      type:'error',
      requestId:(message as any)?.requestId,
      message:error instanceof Error?error.message:String(error),
    });
  }
};

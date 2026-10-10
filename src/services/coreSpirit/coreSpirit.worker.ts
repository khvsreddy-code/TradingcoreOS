import { CoreSpiritRuntime } from './runtime';
import type { CoreSpiritMarketBar } from './marketData';
import { CoreSpiritGaussianHMM, type CoreSpiritHMMArtifactBinding } from './quantMath';
import {
  readCoreSpiritSharedMarketDescriptor,
  type CoreSpiritSharedMarketDescriptor,
} from './sharedMarketBuffer';
import type { CoreSpiritExecutableArtifact } from './artifact';
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
  bars:CoreSpiritMarketBar[];
  datasetVersion:number;
  initialized:boolean;
  graphResolver:CoreSpiritDataGraphResolver;
  hmmModels:Map<string,CoreSpiritGaussianHMM>;
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
  sharedMarket?:CoreSpiritSharedMarketDescriptor;
  bars?:CoreSpiritMarketBar[];
};

type Message=LoadArtifactMessage|UpdateHMMArtifactsMessage|UpdateGraphMessage|RunMessage;

const contexts=new Map<string,WorkerContext>();

function ensureBarArray(context:WorkerContext,length:number):void {
  if(context.bars.length===length)return;
  if(context.bars.length>length)context.bars.length=length;
  while(context.bars.length<length){
    context.bars.push({
      timestamp:new Date(0).toISOString(),
      open:0,
      high:0,
      low:0,
      close:0,
      volume:0,
    });
  }
}

function syncSharedMarket(
  context:WorkerContext,
  descriptor:CoreSpiritSharedMarketDescriptor,
):{dirtyFrom:number;dirtyTo:number}{
  const columns=readCoreSpiritSharedMarketDescriptor(descriptor);
  const length=Math.max(0,Math.min(descriptor.length,descriptor.capacity));
  ensureBarArray(context,length);

  const dirtyFrom=Math.max(0,Math.min(length,Math.floor(descriptor.dirtyFrom)));
  const dirtyTo=Math.max(dirtyFrom,Math.min(length,Math.ceil(descriptor.dirtyTo)));

  for(let i=dirtyFrom;i<dirtyTo;i+=1){
    const bar=context.bars[i]!;
    bar.timestamp=new Date(columns.time[i]! * 1000).toISOString();
    bar.open=columns.open[i]!;
    bar.high=columns.high[i]!;
    bar.low=columns.low[i]!;
    bar.close=columns.close[i]!;
    bar.volume=columns.volume[i]!;
  }

  return {dirtyFrom,dirtyTo};
}

function syncObjectBars(context:WorkerContext,bars:CoreSpiritMarketBar[]):{dirtyFrom:number;dirtyTo:number}{
  context.bars=bars;
  return {dirtyFrom:0,dirtyTo:bars.length};
}

function replaceHMMArtifacts(context:WorkerContext, bindings:readonly CoreSpiritHMMArtifactBinding[]):void {
  const next=new Map<string,CoreSpiritGaussianHMM>();
  for(const binding of bindings){
    if(!binding || typeof binding.modelAlias!=='string' || !binding.modelAlias.trim() ||
      typeof binding.artifactHash!=='string' || !/^[a-f0-9]{64}$/.test(binding.artifactHash) ||
      binding.artifactName !== undefined && (typeof binding.artifactName !== 'string' || !binding.artifactName.trim() || binding.artifactName.length > 120) ||
      !Number.isFinite(binding.trainingEndTimestampMs)){
      throw new Error('Invalid CoreSpirit HMM artifact binding');
    }
    const model=CoreSpiritGaussianHMM.fromTrainedState(binding.state);
    model.setInferenceBoundaryExclusive(Math.floor(binding.trainingEndTimestampMs/1000));
    // The VM may resolve the same sealed model by its internal model alias,
    // immutable artifact name, or SHA-256. Register all identities to the
    // same per-runtime posterior so loadModel("name") actually works in the
    // persistent chart worker, not only in the one-shot resolver.
    const aliases = new Set([binding.modelAlias, binding.artifactName, binding.artifactHash].filter(
      (alias): alias is string => typeof alias === 'string' && Boolean(alias.trim()),
    ));
    for (const alias of aliases) {
      if (next.has(alias)) throw new Error('Duplicate CoreSpirit HMM artifact alias: ' + alias);
      next.set(alias, model);
    }
  }
  context.hmmModels.clear();
  for(const [alias,model] of next)context.hmmModels.set(alias,model);
}

function installArtifact(message:LoadArtifactMessage):void{
  if(!validateExecutableArtifact(message.artifact))throw new Error('Invalid CoreSpirit executable artifact');
  const current=contexts.get(message.contextKey);
  if(current && artifactIdFor(current.artifact)===artifactIdFor(message.artifact)){
    if(message.graphSnapshot)current.graphResolver.replaceSnapshot(message.graphSnapshot);
    if(message.replaceHMMArtifacts)replaceHMMArtifacts(current,message.hmmArtifacts ?? []);
    return;
  }

  const graphResolver=createGraphResolver(
    message.graphSnapshot ?? {version:1,revision:0,nodes:[]},
    message.graphBaseSymbol ?? message.sourceId,
    message.graphBaseTimeframe ?? 'chart',
  );
  const hmmModels=new Map<string,CoreSpiritGaussianHMM>();
  const runtime=new CoreSpiritRuntime({
    sourceId:message.sourceId,
    executionMode:'historical',
    executionTarget:'chart',
    executionTier:'optimized',
    dataResolver:graphResolver,
    hmmArtifactResolver:modelName=>hmmModels.get(modelName),
  });
  runtime.loadIr(message.artifact.ir);
  contexts.set(message.contextKey,{
    artifact:message.artifact,
    sourceId:message.sourceId,
    runtime,
    bars:[],
    datasetVersion:0,
    initialized:false,
    graphResolver,
    hmmModels,
  });
  replaceHMMArtifacts(contexts.get(message.contextKey)!,message.hmmArtifacts ?? []);
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
      message.mode==='historical' ||
      !context.initialized ||
      message.datasetVersion<=context.datasetVersion;

    let result;
    if(fullReset){
      context.runtime.reset();
      context.runtime.loadIr(context.artifact.ir);
      result=context.runtime.executeIr(context.artifact.ir,context.bars);
      context.initialized=true;
    }else{
      const latest=context.bars.at(-1);
      if(!latest)throw new Error('CoreSpirit worker received an empty market dataset');
      result=context.runtime.executeBar(latest,'realtime');
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

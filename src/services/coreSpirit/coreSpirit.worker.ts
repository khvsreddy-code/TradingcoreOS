import { CoreSpiritRuntime } from './runtime';
import type { CoreSpiritMarketBar } from './marketData';
import {
  readCoreSpiritSharedMarketDescriptor,
  type CoreSpiritSharedMarketDescriptor,
} from './sharedMarketBuffer';
import type { CoreSpiritExecutableArtifact } from './artifact';
import { validateExecutableArtifact } from './artifact';
import { isRecord } from '../boundary/brokerApiValidation';
import { requireCoreSpiritOutputs } from './boundaryValidation';

type WorkerContext={
  artifact:CoreSpiritExecutableArtifact;
  sourceId:string;
  runtime:CoreSpiritRuntime;
  bars:CoreSpiritMarketBar[];
  datasetVersion:number;
  initialized:boolean;
};

type LoadArtifactMessage={
  type:'loadArtifact';
  requestId:string;
  contextKey:string;
  sourceId:string;
  artifact:CoreSpiritExecutableArtifact;
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

type Message=LoadArtifactMessage|RunMessage;

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

function installArtifact(message:LoadArtifactMessage):void{
  if(!validateExecutableArtifact(message.artifact))throw new Error('Invalid CoreSpirit executable artifact');
  const current=contexts.get(message.contextKey);
  if(current && current.artifact.checksum===message.artifact.checksum)return;

  const runtime=new CoreSpiritRuntime({
    sourceId:message.sourceId,
    executionMode:'historical',
    executionTarget:'chart',
    executionTier:'optimized',
  });
  runtime.loadIr(message.artifact.ir);
  contexts.set(message.contextKey,{
    artifact:message.artifact,
    sourceId:message.sourceId,
    runtime,
    bars:[],
    datasetVersion:0,
    initialized:false,
  });
}

function getContext(message:RunMessage):WorkerContext{
  const context=contexts.get(message.contextKey);
  if(!context)throw new Error('CoreSpirit worker context is not loaded: '+message.contextKey);
  if(context.artifact.checksum!==message.artifactId)throw new Error('CoreSpirit artifact/context mismatch for '+message.contextKey);
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
        artifactId:message.artifact.checksum,
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

    self.postMessage({
      type:'result',
      requestId:message.requestId,
      contextKey:message.contextKey,
      artifactId:context.artifact.checksum,
      outputs:requireCoreSpiritOutputs(result.outputs),
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

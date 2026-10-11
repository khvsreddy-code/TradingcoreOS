import { compileCoreSpirit } from './coreSpiritPipeline';
import { coreSpiritChecksum, validateExecutableArtifact, type CoreSpiritExecutableArtifact } from './artifact';
import type { CoreSpiritCompileResult, CoreSpiritCompileSymbol } from './compiler';
import { CoreSpiritRuntime } from './runtime';
import type { CoreSpiritMarketBar } from './marketData';

type CompileRequest={
  type:'compile';
  requestId:string;
  sourceVersion:number;
  source:string;
  sourceId:string;
  layer?:string;
};
type ValidateArtifactRequest={type:'validateArtifact';requestId:string;artifact:CoreSpiritExecutableArtifact};
type ReplayPreviewRequest={
  type:'replayPreview';requestId:string;artifact:CoreSpiritExecutableArtifact;
  bars:CoreSpiritMarketBar[];symbol?:string;timeframe?:string;sourceId?:string;
};
type CompileResponse=
  | {
      type:'compiled';requestId:string;sourceVersion:number;
      diagnostics:CoreSpiritCompileResult['diagnostics'];
      symbols:readonly CoreSpiritCompileSymbol[];
      artifact?:CoreSpiritExecutableArtifact;
      artifactHash?:string;
    }
  | {type:'compileError';requestId:string;sourceVersion:number;message:string}
  | {type:'artifactValidated';requestId:string;valid:boolean;message?:string}
  | {type:'replayPreviewed';requestId:string;barsProcessed:number;plotsEmitted:number;signalsEmitted:number;orderIntentsEmitted:number;diagnostics:string[];outputChecksum:string}
  | {type:'replayPreviewError';requestId:string;message:string};

self.onmessage=(event:MessageEvent<CompileRequest|ValidateArtifactRequest|ReplayPreviewRequest>)=>{
  const message=event.data;
  if(!message||typeof message.requestId!=='string')return;
  if(message.type==='validateArtifact'){
    try{
      self.postMessage({type:'artifactValidated',requestId:message.requestId,valid:validateExecutableArtifact(message.artifact)});
    }catch(error){
      self.postMessage({type:'artifactValidated',requestId:message.requestId,valid:false,message:error instanceof Error?error.message:String(error)});
    }
    return;
  }
  if(message.type==='replayPreview'){
    try{
      if(!validateExecutableArtifact(message.artifact))throw new Error('Historical replay requires a valid CoreSpirit artifact.');
      if(!Array.isArray(message.bars)||message.bars.length<1||message.bars.length>3000){
        throw new Error('Historical replay preview requires 1–3,000 normalized bars.');
      }
      const runtime=new CoreSpiritRuntime({
        sourceId:message.sourceId||'corespirit-copilot-preview',
        symbol:message.symbol,
        timeframe:message.timeframe,
        executionMode:'replay',
        executionTarget:'chart',
        layer:'script',
        suppressExternalEffects:true,
      });
      runtime.loadIr(message.artifact.ir);
      // Bounded, read-only replay: no broker calls, order dispatch, alerts,
      // webhooks, or mutations of the active Vela chart.
      const result=runtime.executeIrReadOnly(message.artifact.ir,message.bars);
      const outputs=result.outputs;
      self.postMessage({
        type:'replayPreviewed',
        requestId:message.requestId,
        barsProcessed:message.bars.length,
        plotsEmitted:outputs.filter(item=>item.kind==='series').length,
        signalsEmitted:outputs.filter(item=>item.kind==='signal').length,
        orderIntentsEmitted:outputs.filter(item=>item.kind==='orderIntent').length,
        diagnostics:result.diagnostics.slice(0,50),
        outputChecksum:coreSpiritChecksum(outputs),
      } satisfies CompileResponse);
    }catch(error){
      self.postMessage({type:'replayPreviewError',requestId:message.requestId,message:error instanceof Error?error.message:String(error)} satisfies CompileResponse);
    }
    return;
  }
  if(message.type!=='compile')return;
  try{
    const compiled=compileCoreSpirit(message.source,message.sourceId,{layer:message.layer as any});
    let artifact=compiled.artifact;
    let diagnostics=[...(compiled.diagnostics ?? [])];
    if(artifact && !validateExecutableArtifact(artifact)){
      diagnostics.push({
        severity:'error',
        message:'Compiler produced an invalid CoreSpirit executable artifact.',
        code:'INVALID_EXECUTABLE_ARTIFACT',
      });
      artifact=undefined;
    }
    const response:CompileResponse={
      type:'compiled',
      requestId:message.requestId,
      sourceVersion:message.sourceVersion,
      diagnostics,
      symbols:compiled.symbols ?? [],
      ...(artifact?{artifact,artifactHash:artifact.abi?.artifactHash}:{}),
    };
    self.postMessage(response);
  }catch(error){
    const response:CompileResponse={
      type:'compileError',
      requestId:message.requestId,
      sourceVersion:message.sourceVersion,
      message:error instanceof Error?error.message:String(error),
    };
    self.postMessage(response);
  }
};

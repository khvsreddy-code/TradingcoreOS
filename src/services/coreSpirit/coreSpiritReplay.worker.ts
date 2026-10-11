import { coreSpiritChecksum, validateExecutableArtifact, type CoreSpiritExecutableArtifact } from './artifact';
import { CoreSpiritRuntime } from './runtime';
import type { CoreSpiritMarketBar } from './marketData';

type ReplayPreviewRequest={
  type:'replayPreview';requestId:string;artifact:CoreSpiritExecutableArtifact;
  bars:CoreSpiritMarketBar[];symbol?:string;timeframe?:string;sourceId?:string;
};
type ReplayResponse=
  | {type:'replayPreviewed';requestId:string;barsProcessed:number;plotsEmitted:number;signalsEmitted:number;orderIntentsEmitted:number;diagnostics:string[];outputChecksum:string}
  | {type:'replayPreviewError';requestId:string;message:string};

self.onmessage=(event:MessageEvent<ReplayPreviewRequest>)=>{
  const message=event.data;
  if(!message||message.type!=='replayPreview'||typeof message.requestId!=='string')return;
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
      type:'replayPreviewed',requestId:message.requestId,barsProcessed:message.bars.length,
      plotsEmitted:outputs.filter(item=>item.kind==='series').length,
      signalsEmitted:outputs.filter(item=>item.kind==='signal').length,
      orderIntentsEmitted:outputs.filter(item=>item.kind==='orderIntent').length,
      diagnostics:result.diagnostics.slice(0,50),outputChecksum:coreSpiritChecksum(outputs),
    } satisfies ReplayResponse);
  }catch(error){
    self.postMessage({type:'replayPreviewError',requestId:message.requestId,message:error instanceof Error?error.message:String(error)} satisfies ReplayResponse);
  }
};

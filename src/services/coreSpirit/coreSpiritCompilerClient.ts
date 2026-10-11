import { validateExecutableArtifact, type CoreSpiritExecutableArtifact } from './artifact';
import type { CoreSpiritCompileResult } from './compiler';
import type { CoreSpiritMarketBar } from './marketData';

type CompilerWorkerOptions={layer?:string};
type CompileWorkerResponse=
  | {
      type:'compiled';requestId:string;sourceVersion:number;
      diagnostics:CoreSpiritCompileResult['diagnostics'];
      symbols:NonNullable<CoreSpiritCompileResult['symbols']>;
      artifact?:CoreSpiritExecutableArtifact;
      artifactHash?:string;
    }
  | {type:'compileError';requestId:string;sourceVersion:number;message:string}
  | {type:'artifactValidated';requestId:string;valid:boolean;message?:string}
;
type PendingCompile={
  resolve:(result:CoreSpiritOffThreadCompileResult)=>void;
  reject:(error:Error)=>void;
  timeout:ReturnType<typeof setTimeout>;
};
type PendingValidation={
  resolve:(valid:boolean)=>void;
  reject:(error:Error)=>void;
  timeout:ReturnType<typeof setTimeout>;
};
export type CoreSpiritHistoricalReplayPreview=Readonly<{
  barsProcessed:number;plotsEmitted:number;signalsEmitted:number;orderIntentsEmitted:number;diagnostics:readonly string[];outputChecksum:string;
}>;
type PendingReplay={
  resolve:(result:CoreSpiritHistoricalReplayPreview)=>void;
  reject:(error:Error)=>void;
  timeout:ReturnType<typeof setTimeout>;
};

export type CoreSpiritOffThreadCompileResult = CoreSpiritCompileResult & Readonly<{
  sourceVersion:number;
  artifactHash?:string;
}>;

let compilerWorker:Worker|undefined;
let compilerWorkerBootError:Error|undefined;
let sequence=0;
const pending=new Map<string,PendingCompile>();
const pendingValidation=new Map<string,PendingValidation>();
const pendingReplay=new Map<string,PendingReplay>();

function rejectCompilerRequests(error:Error):void{
  for(const request of pending.values()){clearTimeout(request.timeout);request.reject(error);}
  pending.clear();
  for(const request of pendingValidation.values()){clearTimeout(request.timeout);request.reject(error);}
  pendingValidation.clear();
}

function rejectReplayRequests(error:Error):void{
  for(const request of pendingReplay.values()){clearTimeout(request.timeout);request.reject(error);}
  pendingReplay.clear();
}

function getCompilerWorker():Worker|undefined{
  if(typeof Worker==='undefined')return undefined;
  if(compilerWorker)return compilerWorker;
  let worker:Worker;
  try{
    worker=new Worker(new URL('./coreSpiritCompiler.worker.ts',import.meta.url),{type:'module',name:'CoreSpiritCompiler'});
  }catch(error){
    compilerWorkerBootError=error instanceof Error?error:new Error(String(error));
    return undefined;
  }
  compilerWorkerBootError=undefined;
  worker.onmessage=(event:MessageEvent<CompileWorkerResponse>)=>{
    const message=event.data;
    if(!message || typeof message.requestId!=='string')return;
    const request=pending.get(message.requestId);
    if(request){
      pending.delete(message.requestId);
      clearTimeout(request.timeout);
      if(message.type==='compileError'){
        request.reject(new Error(message.message || 'CoreSpirit worker compilation failed'));
        return;
      }
      if(message.type!=='compiled'){
        request.reject(new Error('Unexpected CoreSpirit compiler worker response'));
        return;
      }
      request.resolve({
        ir:message.artifact?.ir,
        artifact:message.artifact,
        diagnostics:message.diagnostics,
        symbols:message.symbols ?? [],
        sourceVersion:message.sourceVersion,
        artifactHash:message.artifactHash,
      });
      return;
    }
    const validation=pendingValidation.get(message.requestId);
    if(validation){
      pendingValidation.delete(message.requestId);
      clearTimeout(validation.timeout);
      if(message.type==='artifactValidated')validation.resolve(message.valid);
      else if(message.type==='compileError')validation.reject(new Error(message.message || 'Artifact validation worker failed'));
      else validation.reject(new Error('Unexpected artifact validation response'));
      return;
    }
  };
  worker.onerror=(event)=>{
    rejectCompilerRequests(new Error(event.message || 'CoreSpirit compiler worker failed'));
    try{worker.terminate();}catch{}
    if(compilerWorker===worker)compilerWorker=undefined;
  };
  compilerWorker=worker;
  return worker;
}

type ReplayWorkerResponse =
  | {type:'replayPreviewed';requestId:string;barsProcessed:number;plotsEmitted:number;signalsEmitted:number;orderIntentsEmitted:number;diagnostics:string[];outputChecksum:string}
  | {type:'replayPreviewError';requestId:string;message:string};

let replayWorker:Worker|undefined;
let replayWorkerBootError:Error|undefined;

function getReplayWorker():Worker|undefined {
  if(typeof Worker==='undefined')return undefined;
  if(replayWorker)return replayWorker;
  let worker:Worker;
  try{
    worker=new Worker(new URL('./coreSpiritReplay.worker.ts',import.meta.url),{type:'module',name:'CoreSpiritReplay'});
  }catch(error){
    replayWorkerBootError=error instanceof Error?error:new Error(String(error));
    return undefined;
  }
  replayWorkerBootError=undefined;
  worker.onmessage=(event:MessageEvent<ReplayWorkerResponse>)=>{
    const message=event.data;
    if(!message||typeof message.requestId!=='string')return;
    const request=pendingReplay.get(message.requestId);
    if(!request)return;
    pendingReplay.delete(message.requestId);
    clearTimeout(request.timeout);
    if(message.type==='replayPreviewError'){
      request.reject(new Error(message.message||'CoreSpirit historical replay failed'));
      return;
    }
    request.resolve({
      barsProcessed:message.barsProcessed,plotsEmitted:message.plotsEmitted,
      signalsEmitted:message.signalsEmitted,orderIntentsEmitted:message.orderIntentsEmitted,
      diagnostics:message.diagnostics,outputChecksum:message.outputChecksum,
    });
  };
  worker.onerror=(event)=>{
    const error=new Error(event.message||'CoreSpirit replay worker failed');
    rejectReplayRequests(error);
    try{worker.terminate();}catch{}
    if(replayWorker===worker)replayWorker=undefined;
    replayWorkerBootError=error;
  };
  replayWorker=worker;
  return worker;
}

function resetReplayWorker(error:Error):void {
  rejectReplayRequests(error);
  const worker=replayWorker;
  replayWorker=undefined;
  try{worker?.terminate();}catch{}
  replayWorkerBootError=error;
}

/** Debounce at the editor boundary; this request compiles only the submitted immutable source snapshot. */
export async function compileCoreSpiritSourceOffThread(
  source:string,
  sourceVersion:number,
  sourceId='coreSpirit-editor',
  options:CompilerWorkerOptions={},
):Promise<CoreSpiritOffThreadCompileResult>{
  const worker=getCompilerWorker();
  if(!worker){
    // Never run an expensive compiler pass on the browser main thread: the
    // trading terminal, live quotes and chart interactions must remain responsive.
    if(typeof window!=='undefined')throw new Error('CoreSpirit interactive compilation requires Web Worker support; inline browser-thread compilation is disabled.');
    if(typeof Worker!=='undefined')throw new Error(`CoreSpirit compiler worker could not start: ${compilerWorkerBootError?.message || 'worker unavailable'}`);
    // Node/SSR compatibility only. Browser callers fail closed above.
    const {compileCoreSpirit}=await import('./coreSpiritPipeline');
    const compiled=compileCoreSpirit(source,sourceId,{layer:options.layer as any});
    if(compiled.artifact && !validateExecutableArtifact(compiled.artifact)){
      throw new Error('CoreSpirit compiler fallback produced an invalid executable artifact');
    }
    return {
      ...compiled,
      sourceVersion,
      artifactHash:compiled.artifact?.abi?.artifactHash,
    };
  }
  const requestId=`cs-compile-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{
      const active=pending.get(requestId);
      if(!active)return;
      pending.delete(requestId);
      reject(new Error('CoreSpirit compiler worker timed out; try compiling the latest source again.'));
    },20_000);
    pending.set(requestId,{resolve,reject,timeout});
    try{
      worker.postMessage({type:'compile',requestId,sourceVersion,source,sourceId,layer:options.layer});
    }catch(error){
      clearTimeout(timeout);
      pending.delete(requestId);
      reject(error instanceof Error?error:new Error(String(error)));
    }
  });
}

/** Existing Vela/cache caller API: require a valid artifact and fail on compiler errors. */
export async function compileCoreSpiritArtifactOffThread(
  source:string,
  sourceId='coreSpirit',
  options:CompilerWorkerOptions={},
):Promise<CoreSpiritExecutableArtifact>{
  const result=await compileCoreSpiritSourceOffThread(source,0,sourceId,options);
  const diagnostic=result.diagnostics.find(item=>item.severity==='error');
  // The dedicated worker has already performed the expensive integrity check.
  // The no-Worker source compilation fallback validates inline before returning.
  if(!result.artifact || diagnostic){
    throw new Error(diagnostic?.message || 'CoreSpirit compilation failed or produced an invalid artifact');
  }
  return result.artifact;
}

export async function validateCoreSpiritExecutableArtifactOffThread(
  artifact:CoreSpiritExecutableArtifact,
):Promise<boolean>{
  if(!artifact||!artifact.abi?.artifactHash||!artifact.ir)return false;
  const worker=getCompilerWorker();
  if(!worker){
    if(typeof window!=='undefined')return false;
    return typeof Worker==='undefined'?validateExecutableArtifact(artifact):false;
  }
  const requestId=`cs-validate-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{
      const active=pendingValidation.get(requestId);
      if(!active)return;
      pendingValidation.delete(requestId);
      reject(new Error('CoreSpirit artifact integrity worker timed out.'));
    },10_000);
    pendingValidation.set(requestId,{resolve,reject,timeout});
    try{worker.postMessage({type:'validateArtifact',requestId,artifact});}
    catch(error){clearTimeout(timeout);pendingValidation.delete(requestId);reject(error instanceof Error?error:new Error(String(error)));}
  });
}

/** Bounded read-only history preflight for artifacts that already passed validation. */
export async function previewCoreSpiritArtifactOffThread(
  artifact:CoreSpiritExecutableArtifact,
  bars:readonly CoreSpiritMarketBar[],
  options:{symbol?:string;timeframe?:string;sourceId?:string}={},
):Promise<CoreSpiritHistoricalReplayPreview>{
  if(!artifact||!artifact.abi?.artifactHash||!artifact.ir)throw new Error('Historical replay requires a compiled artifact.');
  if(!bars.length||bars.length>3000)throw new Error('Historical replay preflight supports 1–3,000 bars.');
  const worker=getReplayWorker();
  if(!worker){
    if(typeof Worker!=='undefined')throw new Error(`CoreSpirit replay worker could not start: ${replayWorkerBootError?.message||'worker unavailable'}`);
    throw new Error('Historical replay preflight requires Web Worker support.');
  }
  const requestId=`cs-replay-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{
      if(!pendingReplay.has(requestId))return;
      // A wedged replay must not hold the dedicated worker forever. Restarting
      // it cannot affect compiler diagnostics because those use another worker.
      resetReplayWorker(new Error('CoreSpirit historical replay preflight timed out; replay worker restarted.'));
    },20_000);
    pendingReplay.set(requestId,{resolve,reject,timeout});
    try{
      worker.postMessage({type:'replayPreview',requestId,artifact,bars:Array.from(bars),symbol:options.symbol,timeframe:options.timeframe,sourceId:options.sourceId});
    }catch(error){
      clearTimeout(timeout);pendingReplay.delete(requestId);
      reject(error instanceof Error?error:new Error(String(error)));
    }
  });
}

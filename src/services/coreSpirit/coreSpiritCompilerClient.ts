import { validateExecutableArtifact, type CoreSpiritExecutableArtifact } from './artifact';
import type { CoreSpiritCompileResult } from './compiler';
import type { CoreSpiritMarketBar } from './marketData';

type CompilerWorkerOptions={layer?:string;signal?:AbortSignal};
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
  sourceId:string;sourceVersion:number;signal?:AbortSignal;abortHandler?:()=>void;
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
const latestCompileVersionBySource=new Map<string,number>();
const MAX_PENDING_COMPILATIONS=32;
const pendingValidation=new Map<string,PendingValidation>();
const pendingReplay=new Map<string,PendingReplay>();

function abortError(message:string):Error { const error=new Error(message);error.name='AbortError';return error; }
function cleanupCompileRequest(request:PendingCompile):void {
  clearTimeout(request.timeout);
  if(request.signal&&request.abortHandler)request.signal.removeEventListener('abort',request.abortHandler);
  request.abortHandler=undefined;
}
function rejectCompileRequest(requestId:string,error:Error):void {
  const request=pending.get(requestId);if(!request)return;
  pending.delete(requestId);cleanupCompileRequest(request);request.reject(error);
}
function rejectCompilerRequests(error:Error):void {
  for(const [id,request] of pending){pending.delete(id);cleanupCompileRequest(request);request.reject(error);}
  for(const [id,request] of pendingValidation){pendingValidation.delete(id);clearTimeout(request.timeout);request.reject(error);}
}
function restartCompilerWorker(error:Error,abortedRequestId?:string):void {
  const worker=compilerWorker;compilerWorker=undefined;compilerWorkerBootError=error;
  try{worker?.terminate();}catch{}
  if(abortedRequestId==null){rejectCompilerRequests(error);return;}
  for(const [id,request] of pending){
    pending.delete(id);cleanupCompileRequest(request);
    request.reject(id===abortedRequestId?error:abortError('Compiler worker restarted because work was cancelled.'));
  }
  for(const [id,request] of pendingValidation){
    pendingValidation.delete(id);clearTimeout(request.timeout);
    request.reject(abortError('Compiler validation cancelled because its worker restarted.'));
  }
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
      if(message.type!=='compiled'&&message.type!=='compileError'){rejectCompileRequest(message.requestId,new Error('Unexpected CoreSpirit compiler worker response'));return;}
      const latestVersion=latestCompileVersionBySource.get(request.sourceId);
      if(request.sourceVersion>0&&latestVersion!=null&&request.sourceVersion<latestVersion){rejectCompileRequest(message.requestId,abortError('Compiler result belongs to an obsolete source version.'));return;}
      if(message.sourceVersion!==request.sourceVersion){rejectCompileRequest(message.requestId,new Error('Compiler response source version mismatch.'));return;}
      if(message.type==='compileError'){rejectCompileRequest(message.requestId,new Error(message.message||'CoreSpirit worker compilation failed'));return;}
      pending.delete(message.requestId);cleanupCompileRequest(request);
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
    const error=new Error(event.message||'CoreSpirit compiler worker failed');
    if(compilerWorker===worker)restartCompilerWorker(error);else try{worker.terminate();}catch{}
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
  if(options.signal?.aborted)throw abortError('CoreSpirit compilation cancelled before admission.');
  if(sourceVersion>0){
    const latest=latestCompileVersionBySource.get(sourceId);
    if(latest!=null&&sourceVersion<latest)throw abortError('CoreSpirit source version is already obsolete.');
    if(latest==null||sourceVersion>latest){
      latestCompileVersionBySource.set(sourceId,sourceVersion);
      for(const key of latestCompileVersionBySource.keys()){
        if(latestCompileVersionBySource.size<=256)break;
        if([...pending.values()].some(request=>request.sourceId===key))continue;
        latestCompileVersionBySource.delete(key);
      }
      for(const [id,request] of pending){
        if(request.sourceId===sourceId&&request.sourceVersion>0&&request.sourceVersion<sourceVersion)rejectCompileRequest(id,abortError('Superseded by a newer CoreSpirit source version.'));
      }
    }
  }
  const worker=getCompilerWorker();
  if(!worker){
    // Never run an expensive compiler pass on the browser main thread: the
    // trading terminal, live quotes and chart interactions must remain responsive.
    if(typeof window!=='undefined')throw new Error('CoreSpirit interactive compilation requires Web Worker support; inline browser-thread compilation is disabled.');
    if(typeof Worker!=='undefined')throw new Error(`CoreSpirit compiler worker could not start: ${compilerWorkerBootError?.message || 'worker unavailable'}`);
    // Node/SSR compatibility only. Browser callers fail closed above.
    const {compileCoreSpirit}=await import('./coreSpiritPipeline');
    if(options.signal?.aborted)throw abortError('CoreSpirit compilation cancelled before fallback execution.');
    const compiled=compileCoreSpirit(source,sourceId,{layer:options.layer as any});
    if(options.signal?.aborted)throw abortError('CoreSpirit compilation cancelled after fallback execution.');
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
    if(pending.size>=MAX_PENDING_COMPILATIONS){reject(new Error('CoreSpirit compiler queue is saturated; retry the latest source version.'));return;}
    const timeout=setTimeout(()=>{if(pending.has(requestId))restartCompilerWorker(new Error('CoreSpirit compiler timed out; worker terminated and will restart on demand.'));},20_000);
    const request:PendingCompile={resolve,reject,timeout,sourceId,sourceVersion,signal:options.signal};
    pending.set(requestId,request);
    if(options.signal){request.abortHandler=()=>restartCompilerWorker(abortError('CoreSpirit compilation cancelled.'),requestId);options.signal.addEventListener('abort',request.abortHandler,{once:true});}
    if(options.signal?.aborted){restartCompilerWorker(abortError('CoreSpirit compilation cancelled.'),requestId);return;}
    try{worker.postMessage({type:'compile',requestId,sourceVersion,source,sourceId,layer:options.layer});}
    catch(error){rejectCompileRequest(requestId,error instanceof Error?error:new Error(String(error)));}
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

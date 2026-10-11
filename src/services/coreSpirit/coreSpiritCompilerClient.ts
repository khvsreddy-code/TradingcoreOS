import type { CoreSpiritExecutableArtifact } from './artifact';

type CompilerWorkerOptions={layer?:string};
type CompileWorkerResponse=
  | {type:'compiled';requestId:string;artifact:CoreSpiritExecutableArtifact}
  | {type:'compileError';requestId:string;message:string};
type PendingCompile={resolve:(artifact:CoreSpiritExecutableArtifact)=>void;reject:(error:Error)=>void};

let compilerWorker:Worker|undefined;
let sequence=0;
const pending=new Map<string,PendingCompile>();

function rejectAll(error:Error):void{
  for(const request of pending.values())request.reject(error);
  pending.clear();
}

function getCompilerWorker():Worker|undefined{
  if(typeof Worker==='undefined')return undefined;
  if(compilerWorker)return compilerWorker;
  const worker=new Worker(new URL('./coreSpiritCompiler.worker.ts',import.meta.url),{type:'module',name:'CoreSpiritCompiler'});
  worker.onmessage=(event:MessageEvent<CompileWorkerResponse>)=>{
    const message=event.data;
    if(!message || typeof message.requestId!=='string')return;
    const request=pending.get(message.requestId);
    if(!request)return;
    pending.delete(message.requestId);
    if(message.type==='compileError')request.reject(new Error(message.message || 'CoreSpirit worker compilation failed'));
    else if(message.type==='compiled')request.resolve(message.artifact);
    else request.reject(new Error('Invalid CoreSpirit compiler worker response'));
  };
  worker.onerror=(event)=>{
    rejectAll(new Error(event.message || 'CoreSpirit compiler worker failed'));
    try{worker.terminate();}catch{}
    if(compilerWorker===worker)compilerWorker=undefined;
  };
  compilerWorker=worker;
  return worker;
}

/**
 * Compiles CoreScript off the UI thread. Dynamic import is only used when
 * Worker is unavailable (SSR/test/legacy hosts), keeping compiler code out of
 * Vela's eager dependency graph.
 */
export async function compileCoreSpiritArtifactOffThread(
  source:string,
  sourceId='coreSpirit',
  options:CompilerWorkerOptions={},
):Promise<CoreSpiritExecutableArtifact>{
  const worker=getCompilerWorker();
  if(!worker){
    const {compileCoreSpirit}=await import('./coreSpiritPipeline');
    const result=compileCoreSpirit(source,sourceId,{layer:options.layer as any});
    const diagnostic=result.diagnostics?.find(item=>item.severity==='error');
    if(!result.artifact || diagnostic)throw new Error(diagnostic?.message || 'CoreSpirit compilation failed');
    return result.artifact;
  }
  const requestId=`cs-compile-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
  return new Promise((resolve,reject)=>{
    pending.set(requestId,{resolve,reject});
    try{worker.postMessage({type:'compile',requestId,source,sourceId,layer:options.layer});}
    catch(error){pending.delete(requestId);reject(error instanceof Error?error:new Error(String(error)));}
  });
}

import { validateExecutableArtifact, type CoreSpiritExecutableArtifact } from './artifact';
import type { CoreSpiritCompileResult } from './compiler';

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
  | {type:'artifactValidated';requestId:string;valid:boolean;message?:string};
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

export type CoreSpiritOffThreadCompileResult = CoreSpiritCompileResult & Readonly<{
  sourceVersion:number;
  artifactHash?:string;
}>;

let compilerWorker:Worker|undefined;
let sequence=0;
const pending=new Map<string,PendingCompile>();
const pendingValidation=new Map<string,PendingValidation>();

function rejectAll(error:Error):void{
  for(const request of pending.values()){clearTimeout(request.timeout);request.reject(error);}
  pending.clear();
  for(const request of pendingValidation.values()){clearTimeout(request.timeout);request.reject(error);}
  pendingValidation.clear();
}

function getCompilerWorker():Worker|undefined{
  if(typeof Worker==='undefined')return undefined;
  if(compilerWorker)return compilerWorker;
  let worker:Worker;
  try{
    worker=new Worker(new URL('./coreSpiritCompiler.worker.ts',import.meta.url),{type:'module',name:'CoreSpiritCompiler'});
  }catch{
    return undefined;
  }
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
    if(!validation)return;
    pendingValidation.delete(message.requestId);
    clearTimeout(validation.timeout);
    if(message.type==='artifactValidated')validation.resolve(message.valid);
    else if(message.type==='compileError')validation.reject(new Error(message.message || 'Artifact validation worker failed'));
    else validation.reject(new Error('Unexpected artifact validation response'));
  };
  worker.onerror=(event)=>{
    rejectAll(new Error(event.message || 'CoreSpirit compiler worker failed'));
    try{worker.terminate();}catch{}
    if(compilerWorker===worker)compilerWorker=undefined;
  };
  compilerWorker=worker;
  return worker;
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
  if(!worker)return validateExecutableArtifact(artifact);
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

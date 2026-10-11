import { compileCoreSpirit } from './coreSpiritPipeline';
import { validateExecutableArtifact, type CoreSpiritExecutableArtifact } from './artifact';
import type { CoreSpiritCompileResult, CoreSpiritCompileSymbol } from './compiler';

type CompileRequest={
  type:'compile';
  requestId:string;
  sourceVersion:number;
  source:string;
  sourceId:string;
  layer?:string;
};
type ValidateArtifactRequest={type:'validateArtifact';requestId:string;artifact:CoreSpiritExecutableArtifact};
type CompileResponse=
  | {
      type:'compiled';requestId:string;sourceVersion:number;
      diagnostics:CoreSpiritCompileResult['diagnostics'];
      symbols:readonly CoreSpiritCompileSymbol[];
      artifact?:CoreSpiritExecutableArtifact;
      artifactHash?:string;
    }
  | {type:'compileError';requestId:string;sourceVersion:number;message:string}
  | {type:'artifactValidated';requestId:string;valid:boolean;message?:string};

self.onmessage=(event:MessageEvent<CompileRequest|ValidateArtifactRequest>)=>{
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

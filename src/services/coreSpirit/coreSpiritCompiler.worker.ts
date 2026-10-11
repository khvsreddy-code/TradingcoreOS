import { compileCoreSpirit } from './coreSpiritPipeline';
import { validateExecutableArtifact, type CoreSpiritExecutableArtifact } from './artifact';

type CompileRequest={type:'compile';requestId:string;source:string;sourceId:string;layer?:string};
type CompileResponse=
  | {type:'compiled';requestId:string;artifact:CoreSpiritExecutableArtifact}
  | {type:'compileError';requestId:string;message:string};

self.onmessage=(event:MessageEvent<CompileRequest>)=>{
  const message=event.data;
  if(!message || message.type!=='compile' || typeof message.requestId!=='string')return;
  try{
    const compiled=compileCoreSpirit(message.source,message.sourceId,{layer:message.layer as any});
    const diagnostic=compiled.diagnostics?.find(item=>item.severity==='error');
    if(!compiled.artifact || diagnostic || !validateExecutableArtifact(compiled.artifact)){
      throw new Error(diagnostic?.message || 'CoreSpirit compilation produced an invalid artifact');
    }
    self.postMessage({type:'compiled',requestId:message.requestId,artifact:compiled.artifact} satisfies CompileResponse);
  }catch(error){
    self.postMessage({
      type:'compileError',
      requestId:message.requestId,
      message:error instanceof Error?error.message:String(error),
    } satisfies CompileResponse);
  }
};

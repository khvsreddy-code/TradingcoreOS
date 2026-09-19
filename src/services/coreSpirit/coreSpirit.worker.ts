import { makeCoreSpiritProgram } from './coreSpiritPipeline';
import { CoreSpiritRuntime } from './runtime';

/** Dedicated worker boundary for CoreSpirit execution. No chart objects cross this boundary. */
type RunMessage = { type:'run'; source:string; sourceId?:string; bars:any[] };
type LoadMessage = { type:'load'; source:string; sourceId?:string };
type Message = RunMessage | LoadMessage | {type:'reset'};
const runtime = new CoreSpiritRuntime();

self.onmessage = (event: MessageEvent<Message>) => {
  try {
    const msg=event.data;
    if(msg.type==='reset'){runtime.reset();self.postMessage({type:'reset.done'});return;}
    if(msg.type==='load'){const program=makeCoreSpiritProgram(msg.source,msg.sourceId||'coreSpirit');const ir=runtime.loadProgram(program);self.postMessage({type:'loaded',sourceId:ir.sourceId,maxLookback:ir.maxLookback,instructionCount:ir.entry.instructions.length});return;}
    if(msg.type==='run'){const program=makeCoreSpiritProgram(msg.source,msg.sourceId||'coreSpirit');runtime.loadProgram(program);const result=runtime.executeIr(runtime.getLoadedIr()!,msg.bars as any);self.postMessage({type:'result',outputs:result.outputs,state:result.state,diagnostics:result.diagnostics});}
  } catch(error) { self.postMessage({type:'error',message:error instanceof Error?error.message:String(error)}); }
};

/**
 * CoreSpirit Polyglot Module ABI.
 * Language runtimes are host capabilities; the VM never receives process,
 * filesystem, socket, broker or arbitrary native-pointer access.
 */
export const CORE_SPIRIT_POLYGLOT_ABI_VERSION = 1 as const;
export type CoreSpiritPolyglotLanguage = 'python' | 'rust' | 'cpp' | 'julia' | 'r' | 'onnx' | 'wasm';
export type CoreSpiritPolyglotTransport = 'host' | 'native-rpc' | 'onnx-runtime' | 'wasm';
export type CoreSpiritPolyglotTensor = Readonly<{ dtype:'f64'|'i64'|'bool'; shape:readonly number[]; data:readonly number[] }>;
export type CoreSpiritPolyglotDependency = Readonly<{ name:string; version:string; artifactHash:string }>;
export type CoreSpiritPolyglotModuleManifest = Readonly<{
  abiVersion: typeof CORE_SPIRIT_POLYGLOT_ABI_VERSION; moduleId:string; version:string;
  language:CoreSpiritPolyglotLanguage; transport:CoreSpiritPolyglotTransport;
  deterministic:true; stateless:true; exports:readonly string[]; dependencies?:readonly CoreSpiritPolyglotDependency[];
  inputs:Readonly<Record<string,{dtype:CoreSpiritPolyglotTensor['dtype'];shape:readonly number[]}>>;
  outputs:Readonly<Record<string,{dtype:CoreSpiritPolyglotTensor['dtype'];shape:readonly number[]}>>;
  maxInputBytes:number; maxOutputBytes:number; maxMemoryBytes:number; maxSteps:number; maxLatencyMs:number;
}>;
export type CoreSpiritPolyglotRequest = Readonly<{
  requestId:string; moduleId:string; version:string; exportName:string;
  context:Readonly<{runId:string;symbol:string;timeframe:string;barIndex:number;timestamp:number;confirmed:boolean;deterministicSeed:string}>;
  inputs:Readonly<Record<string,CoreSpiritPolyglotTensor>>;
}>;
export type CoreSpiritPolyglotResponse = Readonly<{outputs:Readonly<Record<string,CoreSpiritPolyglotTensor>>;checksum:string}>;
export interface CoreSpiritPolyglotHost {
  readonly language:CoreSpiritPolyglotLanguage; readonly transport:CoreSpiritPolyglotTransport;
  invoke(manifest:CoreSpiritPolyglotModuleManifest,request:CoreSpiritPolyglotRequest,signal?:AbortSignal):Promise<CoreSpiritPolyglotResponse>;
}
export function validateCoreSpiritPolyglotManifest(manifest:CoreSpiritPolyglotModuleManifest):void {
  if(manifest.abiVersion!==1) throw new Error('Unsupported CoreSpirit Polyglot ABI version.');
  if(!/^[a-z][a-z0-9-]{1,79}$/.test(manifest.moduleId)) throw new Error('Polyglot moduleId must be a normalized identifier.');
  if(!/^[a-f0-9]{64}$/.test(manifest.version)) throw new Error('Polyglot module version must be a SHA-256 artifact identity.');
  if(!manifest.deterministic||!manifest.stateless) throw new Error('Polyglot v1 modules must be deterministic and stateless.');
  if(!manifest.exports.length||new Set(manifest.exports).size!==manifest.exports.length) throw new Error('Polyglot exports must be non-empty and unique.');
  for(const [name,value] of Object.entries({maxInputBytes:manifest.maxInputBytes,maxOutputBytes:manifest.maxOutputBytes,maxMemoryBytes:manifest.maxMemoryBytes,maxSteps:manifest.maxSteps,maxLatencyMs:manifest.maxLatencyMs}))
    if(!Number.isSafeInteger(value)||value<=0) throw new Error('Polyglot '+name+' must be a positive safe integer.');
  if(manifest.maxInputBytes>8*1024*1024||manifest.maxOutputBytes>8*1024*1024) throw new Error('Polyglot tensor payload limits may not exceed 8 MiB.');
  if(manifest.maxMemoryBytes>512*1024*1024||manifest.maxSteps>100_000_000||manifest.maxLatencyMs>30_000) throw new Error('Polyglot resource limits exceed v1 host policy.');
  if(manifest.language==='python'&&manifest.transport!=='host') throw new Error('Python modules must use host-owned service transport.');
  if(['rust','cpp','julia','r'].includes(manifest.language)&&manifest.transport!=='native-rpc') throw new Error('Native language modules must use native-rpc transport.');
  if(manifest.language==='onnx'&&manifest.transport!=='onnx-runtime') throw new Error('ONNX modules must use onnx-runtime transport.');
  if(manifest.language==='wasm'&&manifest.transport!=='wasm') throw new Error('WASM modules must use wasm transport.');
  const dependencyNames=new Set<string>();
  for(const dependency of manifest.dependencies??[]){
    if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(dependency.name)||dependencyNames.has(dependency.name)) throw new Error('Polyglot dependencies must have unique normalized names.');
    if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(dependency.version)) throw new Error('Polyglot dependencies must use exact pinned versions.');
    if(!/^[a-f0-9]{64}$/.test(dependency.artifactHash)) throw new Error('Polyglot dependency artifacts require SHA-256 identities.');
    dependencyNames.add(dependency.name);
  }
  for(const [name,spec] of Object.entries(manifest.inputs)) validateTensorSpec(name,spec.shape);
  for(const [name,spec] of Object.entries(manifest.outputs)) validateTensorSpec(name,spec.shape);
}
function validateTensorSpec(name:string,shape:readonly number[]):void {
  if(!name||shape.length>8||shape.some(size=>!Number.isSafeInteger(size)||size<0)) throw new Error("Polyglot tensor '"+name+"' has an invalid shape.");
  const elements=shape.reduce((count,size)=>count*size,1);
  if(!Number.isSafeInteger(elements)||elements>1_000_000) throw new Error("Polyglot tensor '"+name+"' exceeds the one-million-element ABI limit.");
}
function tensorBytes(tensor:CoreSpiritPolyglotTensor):number{return tensor.data.length*(tensor.dtype==='bool'?1:8);}
function validateTensor(name:string,tensor:CoreSpiritPolyglotTensor|undefined,spec:{dtype:CoreSpiritPolyglotTensor['dtype'];shape:readonly number[]}):void {
  if(!tensor||tensor.dtype!==spec.dtype||tensor.shape.length!==spec.shape.length||tensor.shape.some((size,index)=>size!==spec.shape[index])) throw new Error("Polyglot tensor '"+name+"' does not match declared dtype/shape.");
  if(!Array.isArray(tensor.data)) throw new Error("Polyglot tensor '"+name+"' data must be a numeric array.");
  const count=tensor.shape.reduce((product,size)=>product*size,1);
  if(count!==tensor.data.length||tensor.data.some(value=>!Number.isFinite(value))) throw new Error("Polyglot tensor '"+name+"' has invalid data or shape length.");
  if(tensor.dtype==='i64'&&tensor.data.some(value=>!Number.isSafeInteger(value))) throw new Error("Polyglot int64 tensor '"+name+"' must contain safe integers.");
  if(tensor.dtype==='bool'&&tensor.data.some(value=>value!==0&&value!==1)) throw new Error("Polyglot boolean tensor '"+name+"' must contain only 0 or 1.");
}
function payloadBytes(values:Readonly<Record<string,CoreSpiritPolyglotTensor>>):number{return Object.values(values).reduce((total,tensor)=>total+tensorBytes(tensor),0);}
function canonical(value:unknown):string {
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  const object=value as Record<string,unknown>;
  return '{'+Object.keys(object).sort().map(key=>JSON.stringify(key)+':'+canonical(object[key])).join(',')+'}';
}
/** SHA-256 binds a response to the exact module artifact, request and output tensors. */
export function coreSpiritPolyglotResponseChecksum(manifest:CoreSpiritPolyglotModuleManifest,request:CoreSpiritPolyglotRequest,outputs:Readonly<Record<string,CoreSpiritPolyglotTensor>>):string {
  return sha256HexSync(canonical({moduleId:manifest.moduleId,version:manifest.version,requestId:request.requestId,exportName:request.exportName,outputs}));
}
export class CoreSpiritPolyglotRegistry {
  private readonly entries=new Map<string,{manifest:CoreSpiritPolyglotModuleManifest;host:CoreSpiritPolyglotHost}>();
  register(manifest:CoreSpiritPolyglotModuleManifest,host:CoreSpiritPolyglotHost):void {
    validateCoreSpiritPolyglotManifest(manifest);
    if(host.language!==manifest.language||host.transport!==manifest.transport) throw new Error('Polyglot host does not match module manifest.');
    const key=manifest.moduleId+'@'+manifest.version;
    if(this.entries.has(key)) throw new Error("Polyglot module '"+key+"' is already registered.");
    this.entries.set(key,{manifest,host});
  }
  list():CoreSpiritPolyglotModuleManifest[]{return [...this.entries.values()].map(entry=>entry.manifest);}
  async execute(request:CoreSpiritPolyglotRequest,options:Readonly<{signal?:AbortSignal}>={}):Promise<CoreSpiritPolyglotResponse>{
    const entry=this.entries.get(request.moduleId+'@'+request.version);
    if(!entry) throw new Error("Polyglot module '"+request.moduleId+"@"+request.version+"' is not registered.");
    const {manifest,host}=entry;
    if(!manifest.exports.includes(request.exportName)) throw new Error("Polyglot export '"+request.exportName+"' is not declared.");
    if(!request.context.confirmed) throw new Error('Polyglot v1 inference accepts confirmed-bar inputs only.');
    if(!request.context.symbol||!request.context.timeframe||!request.context.deterministicSeed) throw new Error('Polyglot request context is incomplete.');
    for(const [name,spec] of Object.entries(manifest.inputs)) validateTensor(name,request.inputs[name],spec);
    if(Object.keys(request.inputs).some(name=>!(name in manifest.inputs))) throw new Error('Polyglot request contains undeclared inputs.');
    if(payloadBytes(request.inputs)>manifest.maxInputBytes) throw new Error('Polyglot input byte quota exceeded.');
    if(options.signal?.aborted) throw new Error('Polyglot execution was cancelled.');
    const controller=new AbortController();
    const abort=()=>controller.abort(options.signal?.reason??new Error('Polyglot execution was cancelled.'));
    options.signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>controller.abort(new Error('Polyglot execution exceeded its latency budget.')),manifest.maxLatencyMs);
    let timeoutHandle:ReturnType<typeof setTimeout>|undefined;
    try {
      const timeout=new Promise<never>((_,reject)=>{timeoutHandle=setTimeout(()=>reject(new Error('Polyglot execution exceeded its latency budget.')),manifest.maxLatencyMs);});
      const cancelled=options.signal?new Promise<never>((_,reject)=>options.signal!.addEventListener('abort',()=>reject(new Error('Polyglot execution was cancelled.')),{once:true})):new Promise<never>(()=>{});
      const response=await Promise.race([host.invoke(manifest,request,controller.signal),timeout,cancelled]);
      if(controller.signal.aborted) throw new Error('Polyglot execution was cancelled or exceeded its latency budget.');
      for(const [name,spec] of Object.entries(manifest.outputs)) validateTensor(name,response.outputs[name],spec);
      if(Object.keys(response.outputs).some(name=>!(name in manifest.outputs))) throw new Error('Polyglot response contains undeclared outputs.');
      if(payloadBytes(response.outputs)>manifest.maxOutputBytes) throw new Error('Polyglot output byte quota exceeded.');
      const expected=coreSpiritPolyglotResponseChecksum(manifest,request,response.outputs);
      if(response.checksum!==expected) throw new Error('Polyglot response checksum does not match its module/request/output payload.');
      return response;
    } finally {
      clearTimeout(timer);
      if(timeoutHandle!==undefined)clearTimeout(timeoutHandle);
      options.signal?.removeEventListener('abort',abort);
    }
  }
}
abstract class CoreSpiritPolyglotAdapter implements CoreSpiritPolyglotHost {
  abstract readonly language:CoreSpiritPolyglotLanguage; abstract readonly transport:CoreSpiritPolyglotTransport;
  constructor(private readonly invokeHost:CoreSpiritPolyglotHost['invoke']){}
  invoke(manifest:CoreSpiritPolyglotModuleManifest,request:CoreSpiritPolyglotRequest,signal?:AbortSignal):Promise<CoreSpiritPolyglotResponse>{
    if(manifest.language!==this.language||manifest.transport!==this.transport) return Promise.reject(new Error('Polyglot adapter/manifest mismatch.'));
    return this.invokeHost(manifest,request,signal);
  }
}
/** First-class Python host-service adapter; Python never executes inside the browser VM. */
export class CoreSpiritPythonModuleAdapter extends CoreSpiritPolyglotAdapter {
  readonly language='python' as const; readonly transport='host' as const;
}
/** Rust/C++/Julia/R run in isolated native RPC workers, never direct VM FFI. */
export class CoreSpiritNativeModuleAdapter extends CoreSpiritPolyglotAdapter {
  readonly transport='native-rpc' as const;
  constructor(readonly language:'rust'|'cpp'|'julia'|'r',invoke:CoreSpiritPolyglotHost['invoke']){super(invoke);}
}
export class CoreSpiritOnnxModuleAdapter extends CoreSpiritPolyglotAdapter {
  readonly language='onnx' as const; readonly transport='onnx-runtime' as const;
}
export class CoreSpiritWasmModuleAdapter extends CoreSpiritPolyglotAdapter {
  readonly language='wasm' as const; readonly transport='wasm' as const;
}

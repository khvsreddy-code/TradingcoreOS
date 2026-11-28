/**
 * Vendor-neutral module ABI shared by indicators, strategies, automation,
 * prediction, research and compute workloads. Language adapters are transports,
 * never separate security authorities.
 */
export const CORE_SPIRIT_MODULE_ABI_VERSION = 1 as const;
export type CoreSpiritModuleWorkload = 'indicator'|'strategy'|'automation'|'prediction'|'research'|'compute';
export type CoreSpiritModuleLanguage = 'corescript'|'python'|'rust'|'cpp'|'julia'|'r'|'onnx'|'wasm';
export type CoreSpiritModuleTransport = 'native'|'host'|'native-rpc'|'onnx-runtime'|'wasm';
export type CoreSpiritModuleCapability =
  | 'market:read'|'series:read'|'features:read'|'state:read'|'state:write'
  | 'visual:write'|'alerts:emit'|'orders:simulate'|'orders:submit'
  | 'models:invoke'|'research:read'|'storage:read'|'storage:write';
export type CoreSpiritModuleResourceLimits = Readonly<{
  cpuBudgetMs:number; memoryBudgetBytes:number; timeoutMs:number;
  maxOutputBytes:number; maxCollectionSize:number; maxRecursionDepth:number;
  maxDrawingObjects:number; maxHistoricalLookback:number; maxCalls:number;
}>;
export type CoreSpiritModuleManifest = Readonly<{
  abiVersion:typeof CORE_SPIRIT_MODULE_ABI_VERSION;
  moduleId:string; artifactHash:string; workload:CoreSpiritModuleWorkload;
  language:CoreSpiritModuleLanguage; transport:CoreSpiritModuleTransport;
  runtimeVersion:string; deterministic:boolean; capabilities:readonly CoreSpiritModuleCapability[];
  dependencies:readonly Readonly<{name:string;version:string;artifactHash:string}>[];
  resources:CoreSpiritModuleResourceLimits;
  inputSchema:Readonly<Record<string,Readonly<{type:string;required:boolean}>>>;
  outputSchema:Readonly<Record<string,Readonly<{type:string;required:boolean}>>>;
}>;
export interface CoreSpiritModuleAdapter {
  readonly language:CoreSpiritModuleLanguage;
  readonly transport:CoreSpiritModuleTransport;
  compile?(manifest:CoreSpiritModuleManifest,source:Uint8Array,signal:AbortSignal):Promise<Uint8Array>;
  execute(manifest:CoreSpiritModuleManifest,input:unknown,context:CoreSpiritModuleExecutionContext,signal:AbortSignal):Promise<unknown>;
}
export type CoreSpiritModuleExecutionContext=Readonly<{
  runId:string;barIndex:number;timestamp:number;symbol:string;timeframe:string;
  mode:'historical'|'realtime'|'replay'|'backtest';confirmed:boolean;
}>;
export interface CoreSpiritModuleResolver { resolve(moduleId:string,artifactHash:string):Promise<CoreSpiritModuleManifest|undefined>; }
export interface CoreSpiritModuleCompiler { compile(manifest:CoreSpiritModuleManifest,source:Uint8Array,signal:AbortSignal):Promise<Uint8Array>; }
export interface CoreSpiritModuleValidator { validate(manifest:CoreSpiritModuleManifest,artifact:Uint8Array):Promise<void>|void; }
export interface CoreSpiritModuleSandbox { create(manifest:CoreSpiritModuleManifest,signal:AbortSignal):Promise<Readonly<{dispose():Promise<void>|void}>>; }
export interface CoreSpiritModuleExecutor { execute(manifest:CoreSpiritModuleManifest,artifact:Uint8Array,input:unknown,context:CoreSpiritModuleExecutionContext,signal:AbortSignal):Promise<unknown>; }
export interface CoreSpiritModuleArtifactStore { get(artifactHash:string):Promise<Uint8Array|undefined>; put(artifactHash:string,artifact:Uint8Array):Promise<void>; }
export interface CoreSpiritModuleTelemetry { record(event:Readonly<{moduleId:string;workload:CoreSpiritModuleWorkload;durationMs:number;success:boolean;resourceUsage?:unknown}>):void; }
export interface CoreSpiritModuleCapabilityPolicy { authorize(manifest:CoreSpiritModuleManifest,capability:CoreSpiritModuleCapability,context:CoreSpiritModuleExecutionContext):boolean; }
export interface IndicatorModule<TInput=unknown,TOutput=unknown> extends CoreSpiritModuleWorkloadContract<TInput,TOutput> { readonly workload:'indicator'; }
export interface StrategyModule<TInput=unknown,TOutput=unknown> extends CoreSpiritModuleWorkloadContract<TInput,TOutput> { readonly workload:'strategy'; }
export interface AutomationModule<TInput=unknown,TOutput=unknown> extends CoreSpiritModuleWorkloadContract<TInput,TOutput> { readonly workload:'automation'; }
export interface PredictionModule<TInput=unknown,TOutput=unknown> extends CoreSpiritModuleWorkloadContract<TInput,TOutput> { readonly workload:'prediction'; }
export interface ResearchModule<TInput=unknown,TOutput=unknown> extends CoreSpiritModuleWorkloadContract<TInput,TOutput> { readonly workload:'research'; }
export interface ComputeModule<TInput=unknown,TOutput=unknown> extends CoreSpiritModuleWorkloadContract<TInput,TOutput> { readonly workload:'compute'; }

export interface CoreSpiritModuleWorkloadContract<TInput=unknown,TOutput=unknown> {
  readonly workload:CoreSpiritModuleWorkload;
  validateInput(value:unknown):TInput;
  validateOutput(value:unknown):TOutput;
}
const CAPABILITIES=new Set<CoreSpiritModuleCapability>([
 'market:read','series:read','features:read','state:read','state:write','visual:write',
 'alerts:emit','orders:simulate','orders:submit','models:invoke','research:read','storage:read','storage:write'
]);
const MAXIMUMS:CoreSpiritModuleResourceLimits=Object.freeze({
 cpuBudgetMs:30_000,memoryBudgetBytes:512*1024*1024,timeoutMs:30_000,
 maxOutputBytes:8*1024*1024,maxCollectionSize:1_000_000,maxRecursionDepth:128,
 maxDrawingObjects:10_000,maxHistoricalLookback:1_000_000,maxCalls:100_000
});
export function validateCoreSpiritModuleManifest(m:CoreSpiritModuleManifest):void {
 if(!m||m.abiVersion!==CORE_SPIRIT_MODULE_ABI_VERSION)throw new Error('Unsupported CoreSpirit module ABI version.');
 if(!/^[a-z][a-z0-9-]{1,79}$/.test(m.moduleId))throw new Error('Module ID is invalid.');
 if(!/^[a-f0-9]{64}$/.test(m.artifactHash))throw new Error('Module artifact identity must be SHA-256.');
 if(!Number.isSafeInteger(m.runtimeVersion.length)||!m.runtimeVersion.trim()||m.runtimeVersion.length>128)throw new Error('Module runtime version is invalid.');
 if(!['indicator','strategy','automation','prediction','research','compute'].includes(m.workload))throw new Error('Module workload is invalid.');
 if(!['corescript','python','rust','cpp','julia','r','onnx','wasm'].includes(m.language))throw new Error('Module language is invalid.');
 if(!['native','host','native-rpc','onnx-runtime','wasm'].includes(m.transport))throw new Error('Module transport is invalid.');
 if(!Array.isArray(m.capabilities)||new Set(m.capabilities).size!==m.capabilities.length||m.capabilities.some(c=>!CAPABILITIES.has(c)))throw new Error('Module capabilities are invalid or duplicated.');
 if(!Array.isArray(m.dependencies)||m.dependencies.length>256)throw new Error('Module dependencies are invalid.');
 const names=new Set<string>();
 for(const d of m.dependencies){
  if(!d||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(d.name)||names.has(d.name)||!/^[a-f0-9]{64}$/.test(d.artifactHash))throw new Error('Module dependency identity is invalid.');
  names.add(d.name);
 }
 for(const [key,max] of Object.entries(MAXIMUMS) as [keyof CoreSpiritModuleResourceLimits,number][]){
  const value=m.resources?.[key];
  if(!Number.isSafeInteger(value)||value<=0||value>max)throw new Error('Module resource limit '+key+' is outside host policy.');
 }
 for(const schema of [m.inputSchema,m.outputSchema]){
  if(!schema||typeof schema!=='object'||Array.isArray(schema)||Object.keys(schema).length>256)throw new Error('Module schema is invalid.');
  for(const [name,field] of Object.entries(schema))if(!/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(name)||!field||typeof field.type!=='string'||typeof field.required!=='boolean')throw new Error('Module schema field is invalid.');
 }
}
export class CoreSpiritModuleRegistry {
 private readonly modules=new Map<string,{manifest:CoreSpiritModuleManifest;adapter:CoreSpiritModuleAdapter}>();
 register(manifest:CoreSpiritModuleManifest,adapter:CoreSpiritModuleAdapter):void {
  validateCoreSpiritModuleManifest(manifest);
  if(!adapter||adapter.language!==manifest.language||adapter.transport!==manifest.transport)throw new Error('Module adapter does not match manifest language and transport.');
  const key=manifest.moduleId+'@'+manifest.artifactHash;
  if(this.modules.has(key))throw new Error('Module artifact is already registered.');
  const snapshot=Object.freeze({...manifest,capabilities:Object.freeze([...manifest.capabilities]),dependencies:Object.freeze(manifest.dependencies.map(d=>Object.freeze({...d}))),resources:Object.freeze({...manifest.resources}),inputSchema:Object.freeze({...manifest.inputSchema}),outputSchema:Object.freeze({...manifest.outputSchema})});
  this.modules.set(key,{manifest:snapshot,adapter});
 }
 get(moduleId:string,artifactHash:string){const found=this.modules.get(moduleId+'@'+artifactHash);if(!found)throw new Error('CoreSpirit module is not registered.');return found;}
 list():CoreSpiritModuleManifest[]{return [...this.modules.values()].map(x=>x.manifest);}
}

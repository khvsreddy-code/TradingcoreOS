export type CoreSpiritWasmKernelVariant = 'scalar' | 'simd';

export type CoreSpiritWasmLifecycleState = 'idle' | 'loading' | 'ready' | 'failed';

export type CoreSpiritWasmKernelManifest = Readonly<{
  abiVersion:2;
  simd:boolean;
  kernels:readonly Readonly<{
    name:string;
    operationCode:number;
    variant:CoreSpiritWasmKernelVariant;
    inputCount:number;
    outputCount:number;
    stateful:boolean;
    deterministic:boolean;
  }>[];
}>;

export type CoreSpiritWasmExports = {
  memory:WebAssembly.Memory;
  alloc:(bytes:number)=>number;
  free?: (ptr:number, bytes?:number)=>void;
  runKernel:(inputPtrs:number, inputCount:number, outputPtrs:number, outputCount:number, length:number, paramsPtr:number, paramsCount:number)=>number|void;
};

export type CoreSpiritWasmExecutionRequest = Readonly<{
  kernel:string;
  inputs:readonly Float64Array[];
  outputs:readonly Float64Array[];
  params?:readonly number[];
}>;

export type CoreSpiritWasmExecutionResult = Readonly<{
  kernel:string;
  variant:CoreSpiritWasmKernelVariant;
  bars:number;
  inputBytes:number;
  outputBytes:number;
  wasmElapsedMs:number;
  elapsedMs:number;
}>;

const MAX_WASM_SERIES_ELEMENTS=4_194_304;
const MAX_WASM_KERNEL_ARGUMENTS=32;
function validateManifest(manifest:CoreSpiritWasmKernelManifest):void {
  if(!manifest || manifest.abiVersion!==2) throw new Error('unsupported CoreSpirit WASM ABI; expected ABI 2');
  if(typeof manifest.simd!=='boolean' || !Array.isArray(manifest.kernels) || manifest.kernels.length===0)
    throw new Error('CoreSpirit WASM manifest must declare SIMD state and at least one kernel');
  const names=new Set<string>();
  const codes=new Set<number>();
  for(const kernel of manifest.kernels) {
    if(!kernel || typeof kernel.name!=='string' || !kernel.name.trim() || kernel.name!==kernel.name.trim())
      throw new Error('WASM kernel names must be non-empty and trimmed');
    if(names.has(kernel.name)) throw new Error(`duplicate CoreSpirit WASM kernel '${kernel.name}'`);
    names.add(kernel.name);
    if(!Number.isInteger(kernel.operationCode)||kernel.operationCode<0||kernel.operationCode>5) throw new Error(`unsupported compiled WASM operation code for '${kernel.name}'`);
    if(codes.has(kernel.operationCode)) throw new Error(`duplicate CoreSpirit WASM operation code '${kernel.operationCode}'`);
    codes.add(kernel.operationCode);
    if(kernel.variant!=='scalar' && kernel.variant!=='simd') throw new Error(`unsupported WASM kernel variant for '${kernel.name}'`);
    if(kernel.variant==='simd' && !manifest.simd) throw new Error(`SIMD kernel '${kernel.name}' requires manifest.simd=true`);
    if(!Number.isInteger(kernel.inputCount)||kernel.inputCount<1||kernel.inputCount>MAX_WASM_KERNEL_ARGUMENTS||
       !Number.isInteger(kernel.outputCount)||kernel.outputCount<1||kernel.outputCount>MAX_WASM_KERNEL_ARGUMENTS)
      throw new Error(`WASM kernel '${kernel.name}' input/output counts must be in [1, ${MAX_WASM_KERNEL_ARGUMENTS}]`);
    if(typeof kernel.stateful!=='boolean'||typeof kernel.deterministic!=='boolean')
      throw new Error(`WASM kernel '${kernel.name}' must declare stateful and deterministic flags`);
  }
}
function checkMemoryRange(memory:WebAssembly.Memory,pointer:number,bytes:number,label:string,alignment=1):void {
  if(!Number.isSafeInteger(pointer)||pointer<0||pointer%alignment!==0||!Number.isSafeInteger(bytes)||bytes<0||
     pointer+bytes>memory.buffer.byteLength)
    throw new Error(`CoreSpirit WASM ${label} points outside linear memory or is misaligned`);
}
function allocateChecked(exports:CoreSpiritWasmExports,bytes:number,label:string,alignment=1):{ptr:number;bytes:number} {
  const allocatedBytes=Math.max(alignment,bytes);
  const ptr=exports.alloc(allocatedBytes);
  checkMemoryRange(exports.memory,ptr,allocatedBytes,label,alignment);
  return {ptr,bytes:allocatedBytes};
}
function safelyFree(exports:CoreSpiritWasmExports,allocation:{ptr:number;bytes:number}|undefined):void {
  if(!allocation||!exports.free)return;
  try{exports.free(allocation.ptr,allocation.bytes);}catch{/* cleanup must not mask kernel failure */}
}
function now():number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function asUint8Array(value:Float64Array|number[]):Uint8Array {
  if (value instanceof Float64Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const typed=new Float64Array(value);
  return new Uint8Array(typed.buffer);
}

export class CoreSpiritWasmBackend {
  private instance?:WebAssembly.Instance;
  private manifest?:CoreSpiritWasmKernelManifest;
  private variantByKernel=new Map<string,CoreSpiritWasmKernelVariant>();
  private lifecycleState:CoreSpiritWasmLifecycleState='idle';
  private loadError?:string;
  lifecycle():Readonly<{state:CoreSpiritWasmLifecycleState;error?:string}>{return Object.freeze({state:this.lifecycleState,...(this.loadError?{error:this.loadError}:{})});}
  markLoading():void{this.lifecycleState='loading';this.loadError=undefined;}
  recordLoadFailure(error:unknown):void{this.instance=undefined;this.manifest=undefined;this.variantByKernel.clear();this.lifecycleState='failed';this.loadError=error instanceof Error?error.message:String(error);}

  async load(source:WebAssembly.Module|WebAssembly.Instance|ArrayBuffer|Uint8Array,manifest:CoreSpiritWasmKernelManifest):Promise<void>{
    this.markLoading();
    try {
      validateManifest(manifest);
      let instance:WebAssembly.Instance;
      if(source instanceof WebAssembly.Instance)instance=source;
      else if(source instanceof WebAssembly.Module)instance=await WebAssembly.instantiate(source,{});
      else { const made=await WebAssembly.instantiate(source,{});instance=made instanceof WebAssembly.Instance?made:made.instance; }
      const exports=instance.exports as unknown as Partial<CoreSpiritWasmExports>;
      if(!exports.memory||!exports.alloc||!exports.runKernel)throw new Error('CoreSpirit WASM module is missing memory/alloc/runKernel exports');
      this.instance=instance;this.manifest=manifest;this.variantByKernel.clear();
      for(const kernel of manifest.kernels)this.variantByKernel.set(kernel.name,kernel.variant);
      for(const kernel of manifest.kernels)this.warmKernel(kernel.name);
      this.lifecycleState='ready';this.loadError=undefined;
    }catch(error){this.recordLoadFailure(error);throw error;}
  }
  private warmKernel(name:string):void{
    const expectedByKernel: Readonly<Record<string, readonly number[]>> = {
      rollingMean: [Number.NaN, 1.5, 2.5, 3.5],
      rollingSum: [Number.NaN, 3, 5, 7],
      rollingVariance: [Number.NaN, .25, .25, .25],
      rollingMin: [Number.NaN, 1, 2, 3],
      rollingMax: [Number.NaN, 2, 3, 4],
      rollingStd: [Number.NaN, .5, .5, .5],
    };
    const expected: readonly number[] | undefined = expectedByKernel[name];
    if(!expected)throw new Error(`No numerical reference warm-up registered for WASM kernel '${name}'`);
    const input=Float64Array.from([1,2,3,4]),output=new Float64Array(4);
    this.executeRequest({kernel:name,inputs:[input],outputs:[output],params:[2,0]});
    for(let i=0;i<expected.length;i++){
      const got=output[i]!,want=expected[i]!;
      if(Number.isNaN(want)){if(!Number.isNaN(got))throw new Error(`WASM warm-up mismatch for ${name} at index ${i}`);}
      else if(!Number.isFinite(got)||Math.abs(got-want)>1e-12*Math.max(1,Math.abs(want)))throw new Error(`WASM warm-up mismatch for ${name} at index ${i}: expected ${want}, got ${got}`);
    }
  }

  unload():void{this.instance=undefined;this.manifest=undefined;this.variantByKernel.clear();this.loadError=undefined;this.lifecycleState='idle';}

  isLoaded():boolean{return this.lifecycleState==='ready'&&this.instance!==undefined&&this.manifest!==undefined;}

  hasKernel(kernel:string):boolean {
    return this.variantByKernel.has(kernel);
  }

  kernelVariant(kernel:string):CoreSpiritWasmKernelVariant|undefined {
    return this.variantByKernel.get(kernel);
  }

  profile():Readonly<{backend:'wasm';available:boolean;deterministic:boolean;vectorized:boolean;supportedOperations:readonly string[];kernelVariants:Readonly<Record<string,CoreSpiritWasmKernelVariant>>;lifecycleState:CoreSpiritWasmLifecycleState}>|undefined {
    if (!this.isLoaded() || !this.manifest) return undefined;
    return Object.freeze({backend:'wasm',available:true,deterministic:this.manifest.kernels.every(k=>k.deterministic),vectorized:true,supportedOperations:Object.freeze(this.manifest.kernels.map(k=>k.name)),kernelVariants:Object.freeze(Object.fromEntries(this.manifest.kernels.map(k=>[k.name,k.variant]))),lifecycleState:this.lifecycleState});
  }

  executeSync(request:CoreSpiritWasmExecutionRequest):CoreSpiritWasmExecutionResult {
    if((this.lifecycleState!=='ready'&&this.lifecycleState!=='loading')||!this.instance||!this.manifest)throw new Error('CoreSpirit WASM backend is not ready');
    return this.executeRequest(request);
  }
  async execute(request:CoreSpiritWasmExecutionRequest):Promise<CoreSpiritWasmExecutionResult>{return this.executeSync(request);}
  private executeRequest(request:CoreSpiritWasmExecutionRequest):CoreSpiritWasmExecutionResult {
    if(!this.instance||!this.manifest)throw new Error('CoreSpirit WASM backend is not loaded');
    if(!request||typeof request.kernel!=='string'||!request.kernel.trim())throw new Error('WASM execution requires a kernel name');
    const kernel=this.manifest.kernels.find(item=>item.name===request.kernel);
    if(!kernel)throw new Error(`CoreSpirit WASM kernel '${request.kernel}' is not registered`);
    if(!Array.isArray(request.inputs)||!Array.isArray(request.outputs)||request.inputs.length!==kernel.inputCount)
      throw new Error(`WASM kernel '${request.kernel}' expected ${kernel.inputCount} input(s), got ${request.inputs?.length??0}`);
    if(request.outputs.length!==kernel.outputCount)
      throw new Error(`WASM kernel '${request.kernel}' expected ${kernel.outputCount} output(s), got ${request.outputs.length}`);
    const bars=request.outputs[0]?.length??request.inputs[0]?.length??0;
    if(!Number.isInteger(bars)||bars<0||bars>MAX_WASM_SERIES_ELEMENTS)
      throw new Error(`WASM bar count must be between 0 and ${MAX_WASM_SERIES_ELEMENTS}`);
    if(request.inputs.some(input=>!(input instanceof Float64Array)||input.length!==bars)||
       request.outputs.some(output=>!(output instanceof Float64Array)||output.length!==bars))
      throw new Error('WASM kernel input/output lengths must match and use Float64Array');
    const params=request.params??[];
    if(!Array.isArray(params)||params.length<1||params.some(value=>!Number.isFinite(value)))throw new Error('WASM rolling kernels require finite period parameters');
    if(params.length>MAX_WASM_KERNEL_ARGUMENTS)throw new Error(`WASM kernels accept at most ${MAX_WASM_KERNEL_ARGUMENTS} parameters`);
    const wasmParams=[kernel.operationCode,...params];
    if(wasmParams.length>MAX_WASM_KERNEL_ARGUMENTS)throw new Error(`WASM kernels accept at most ${MAX_WASM_KERNEL_ARGUMENTS} parameters`);
    const totalStart=now();
    const exports=this.instance.exports as unknown as CoreSpiritWasmExports;
    const inputBytes=request.inputs.reduce((sum,input)=>sum+input.byteLength,0);
    const outputBytes=request.outputs.reduce((sum,output)=>sum+output.byteLength,0);
    const ptrBytes=(request.inputs.length+request.outputs.length)*4,paramBytes=wasmParams.length*8;
    const inputPtrs:number[]=[],outputPtrs:number[]=[];
    const inputAllocations:{ptr:number;bytes:number}[]=[],outputAllocations:{ptr:number;bytes:number}[]=[];
    let ptrTableAllocation:{ptr:number;bytes:number}|undefined,paramsAllocation:{ptr:number;bytes:number}|undefined;
    try{
      ptrTableAllocation=allocateChecked(exports,ptrBytes,'pointer table',4);
      if(paramBytes)paramsAllocation=allocateChecked(exports,paramBytes,'parameter buffer',8);
      for(const input of request.inputs){
        const allocation=allocateChecked(exports,input.byteLength,'input buffer',8);
        inputAllocations.push(allocation);
        new Uint8Array(exports.memory.buffer,allocation.ptr,input.byteLength).set(asUint8Array(input));
        inputPtrs.push(allocation.ptr);
      }
      for(const output of request.outputs){
        const allocation=allocateChecked(exports,output.byteLength,'output buffer',8);
        outputAllocations.push(allocation);
        new Float64Array(exports.memory.buffer,allocation.ptr,output.length).fill(Number.NaN);
        outputPtrs.push(allocation.ptr);
      }
      checkMemoryRange(exports.memory,ptrTableAllocation.ptr,ptrBytes,'pointer table',4);
      const table=new DataView(exports.memory.buffer,ptrTableAllocation.ptr,ptrBytes);
      for(let i=0;i<inputPtrs.length;i++)table.setUint32(i*4,inputPtrs[i]!,true);
      for(let i=0;i<outputPtrs.length;i++)table.setUint32((inputPtrs.length+i)*4,outputPtrs[i]!,true);
      if(paramsAllocation){
        checkMemoryRange(exports.memory,paramsAllocation.ptr,paramBytes,'parameter buffer',8);
        new Float64Array(exports.memory.buffer,paramsAllocation.ptr,paramBytes/8).set(wasmParams);
      }
      const start=now();
      const status=exports.runKernel(ptrTableAllocation.ptr,inputPtrs.length,ptrTableAllocation.ptr+inputPtrs.length*4,outputPtrs.length,bars,paramsAllocation?.ptr??0,wasmParams.length);
      const elapsed=now()-start;
      if(typeof status==='number'&&status!==0)throw new Error(`CoreSpirit WASM kernel '${request.kernel}' returned status ${status}`);
      for(let i=0;i<request.outputs.length;i++){
        const output=request.outputs[i]!;
        checkMemoryRange(exports.memory,outputPtrs[i]!,output.byteLength,'output buffer',8);
      }
      for(let i=0;i<request.outputs.length;i++){
        const output=request.outputs[i]!;
        new Uint8Array(output.buffer,output.byteOffset,output.byteLength)
          .set(new Uint8Array(exports.memory.buffer,outputPtrs[i]!,output.byteLength));
      }
      return Object.freeze({kernel:request.kernel,variant:kernel.variant,bars,inputBytes,outputBytes,wasmElapsedMs:elapsed,elapsedMs:Math.max(0,now()-totalStart)});
    }finally{
      safelyFree(exports,ptrTableAllocation);safelyFree(exports,paramsAllocation);
      for(const allocation of inputAllocations)safelyFree(exports,allocation);
      for(const allocation of outputAllocations)safelyFree(exports,allocation);
    }
  }
}




export const CORE_SPIRIT_BUNDLED_WASM_SIMD_URL = '/coreSpirit/numerical-kernels-simd.wasm';

export const CORE_SPIRIT_BUNDLED_WASM_SIMD_MANIFEST:CoreSpiritWasmKernelManifest=Object.freeze({abiVersion:2,simd:true,kernels:Object.freeze([
 Object.freeze({name:'rollingMean',operationCode:0,variant:'simd' as const,inputCount:1,outputCount:1,stateful:false,deterministic:true}),
 Object.freeze({name:'rollingSum',operationCode:1,variant:'scalar' as const,inputCount:1,outputCount:1,stateful:false,deterministic:true}),
 Object.freeze({name:'rollingVariance',operationCode:2,variant:'scalar' as const,inputCount:1,outputCount:1,stateful:false,deterministic:true}),
 Object.freeze({name:'rollingMin',operationCode:3,variant:'scalar' as const,inputCount:1,outputCount:1,stateful:false,deterministic:true}),
 Object.freeze({name:'rollingMax',operationCode:4,variant:'scalar' as const,inputCount:1,outputCount:1,stateful:false,deterministic:true}),
 Object.freeze({name:'rollingStd',operationCode:5,variant:'scalar' as const,inputCount:1,outputCount:1,stateful:false,deterministic:true}),
])});

/**
 * Lazily load the bundled SIMD module for historical/research jobs.
 * Capabilities are visible only after warm-up succeeds.
 */
/**
 * Lazily load the bundled SIMD module for historical/research jobs.
 * Callers can pass bytes explicitly in tests, server hosts, or offline runtimes.
 */
export async function loadCoreSpiritBundledWasmSimdBackend(options:{
 backend?:CoreSpiritWasmBackend;source?:WebAssembly.Module|WebAssembly.Instance|ArrayBuffer|Uint8Array;url?:string;
 onStateChange?:(state:Readonly<{state:CoreSpiritWasmLifecycleState;error?:string}>)=>void;
}={}):Promise<CoreSpiritWasmBackend>{
 const backend=options.backend??new CoreSpiritWasmBackend();backend.markLoading();options.onStateChange?.(backend.lifecycle());
 try{
  let source=options.source;
  if(source===undefined){if(typeof fetch!=='function')throw new Error('fetch is unavailable; provide the bundled CoreSpirit WASM bytes explicitly');const response=await fetch(options.url??CORE_SPIRIT_BUNDLED_WASM_SIMD_URL);if(!response.ok)throw new Error(`CoreSpirit WASM asset request failed with HTTP ${response.status}`);source=await response.arrayBuffer();}
  await backend.load(source,CORE_SPIRIT_BUNDLED_WASM_SIMD_MANIFEST);options.onStateChange?.(backend.lifecycle());return backend;
 }catch(error){backend.recordLoadFailure(error);options.onStateChange?.(backend.lifecycle());throw error;}
}

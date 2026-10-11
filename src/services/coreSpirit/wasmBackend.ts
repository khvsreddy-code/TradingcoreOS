export type CoreSpiritWasmKernelVariant = 'scalar' | 'simd';

export type CoreSpiritWasmKernelManifest = Readonly<{
  abiVersion:1;
  simd:boolean;
  kernels:readonly Readonly<{
    name:string;
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
}>;

const MAX_WASM_SERIES_ELEMENTS=4_194_304;
const MAX_WASM_KERNEL_ARGUMENTS=32;
function validateManifest(manifest:CoreSpiritWasmKernelManifest):void {
  if(!manifest || manifest.abiVersion!==1) throw new Error('unsupported CoreSpirit WASM ABI');
  if(typeof manifest.simd!=='boolean' || !Array.isArray(manifest.kernels) || manifest.kernels.length===0)
    throw new Error('CoreSpirit WASM manifest must declare SIMD state and at least one kernel');
  const names=new Set<string>();
  for(const kernel of manifest.kernels) {
    if(!kernel || typeof kernel.name!=='string' || !kernel.name.trim() || kernel.name!==kernel.name.trim())
      throw new Error('WASM kernel names must be non-empty and trimmed');
    if(names.has(kernel.name)) throw new Error(`duplicate CoreSpirit WASM kernel '${kernel.name}'`);
    names.add(kernel.name);
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

  async load(
    source:WebAssembly.Module|WebAssembly.Instance|ArrayBuffer|Uint8Array,
    manifest:CoreSpiritWasmKernelManifest,
  ):Promise<void> {
    validateManifest(manifest);
    let instance:WebAssembly.Instance;
    if (source instanceof WebAssembly.Instance) {
      instance=source;
    } else if (source instanceof WebAssembly.Module) {
      instance=await WebAssembly.instantiate(source, {});
    } else {
      const instantiated=await WebAssembly.instantiate(source, {});
      instance=instantiated instanceof WebAssembly.Instance ? instantiated : instantiated.instance;
    }
    const exports=instance.exports as unknown as Partial<CoreSpiritWasmExports>;
    if (!exports.memory || !exports.alloc || !exports.runKernel) throw new Error('CoreSpirit WASM module is missing memory/alloc/runKernel exports');
    this.instance=instance;
    this.manifest=manifest;
    this.variantByKernel.clear();
    for (const kernel of manifest.kernels) this.variantByKernel.set(kernel.name, kernel.variant);
  }

  unload():void {
    this.instance=undefined;
    this.manifest=undefined;
    this.variantByKernel.clear();
  }

  isLoaded():boolean {
    return this.instance !== undefined;
  }

  hasKernel(kernel:string):boolean {
    return this.variantByKernel.has(kernel);
  }

  kernelVariant(kernel:string):CoreSpiritWasmKernelVariant|undefined {
    return this.variantByKernel.get(kernel);
  }

  profile():Readonly<{backend:'wasm';available:boolean;deterministic:boolean;vectorized:boolean}>|undefined {
    if (!this.instance || !this.manifest) return undefined;
    return {
      backend:'wasm',
      available:true,
      deterministic:this.manifest.kernels.every((kernel)=>kernel.deterministic),
      vectorized:this.manifest.kernels.some((kernel)=>kernel.variant==='simd'),
    };
  }

  async execute(request:CoreSpiritWasmExecutionRequest):Promise<CoreSpiritWasmExecutionResult> {
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
    if(!Array.isArray(params)||params.some(value=>!Number.isFinite(value)))throw new Error('WASM kernel parameters must be finite numbers');
    if(params.length>MAX_WASM_KERNEL_ARGUMENTS)throw new Error(`WASM kernels accept at most ${MAX_WASM_KERNEL_ARGUMENTS} parameters`);
    const exports=this.instance.exports as unknown as CoreSpiritWasmExports;
    const inputBytes=request.inputs.reduce((sum,input)=>sum+input.byteLength,0);
    const outputBytes=request.outputs.reduce((sum,output)=>sum+output.byteLength,0);
    const ptrBytes=(request.inputs.length+request.outputs.length)*4,paramBytes=params.length*8;
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
        new Float64Array(exports.memory.buffer,paramsAllocation.ptr,paramBytes/8).set(params);
      }
      const start=now();
      const status=exports.runKernel(ptrTableAllocation.ptr,inputPtrs.length,ptrTableAllocation.ptr+inputPtrs.length*4,outputPtrs.length,bars,paramsAllocation?.ptr??0,params.length);
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
      return Object.freeze({kernel:request.kernel,variant:kernel.variant,bars,inputBytes,outputBytes,wasmElapsedMs:elapsed});
    }finally{
      safelyFree(exports,ptrTableAllocation);safelyFree(exports,paramsAllocation);
      for(const allocation of inputAllocations)safelyFree(exports,allocation);
      for(const allocation of outputAllocations)safelyFree(exports,allocation);
    }
  }
}



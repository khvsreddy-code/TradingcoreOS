import type { CoreSpiritSeriesBackendProfile } from './seriesBackendDispatcher';

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
    if (manifest.abiVersion !== 1) throw new Error('unsupported CoreSpirit WASM ABI');
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

  profile():CoreSpiritSeriesBackendProfile|undefined {
    if (!this.instance || !this.manifest) return undefined;
    return {
      backend:'wasm',
      available:true,
      deterministic:this.manifest.kernels.every((kernel)=>kernel.deterministic),
      vectorized:this.manifest.simd || this.manifest.kernels.some((kernel)=>kernel.variant==='simd'),
    };
  }

  async execute(request:CoreSpiritWasmExecutionRequest):Promise<CoreSpiritWasmExecutionResult> {
    if (!this.instance || !this.manifest) throw new Error('CoreSpirit WASM backend is not loaded');
    const kernel=this.manifest.kernels.find((item)=>item.name===request.kernel);
    if (!kernel) throw new Error(`CoreSpirit WASM kernel '${request.kernel}' is not registered`);
    if (request.inputs.length !== kernel.inputCount) throw new Error(`WASM kernel '${request.kernel}' expected ${kernel.inputCount} input(s), got ${request.inputs.length}`);
    if (request.outputs.length !== kernel.outputCount) throw new Error(`WASM kernel '${request.kernel}' expected ${kernel.outputCount} output(s), got ${request.outputs.length}`);
    const bars=request.outputs[0]?.length ?? request.inputs[0]?.length ?? 0;
    if (request.inputs.some((input)=>input.length!==bars) || request.outputs.some((output)=>output.length!==bars)) throw new Error('WASM kernel input/output lengths must match');

    const exports=this.instance.exports as unknown as CoreSpiritWasmExports;
    const inputBytes=request.inputs.reduce((sum,input)=>sum+input.byteLength,0);
    const outputBytes=request.outputs.reduce((sum,output)=>sum+output.byteLength,0);
    const ptrBytes=(request.inputs.length+request.outputs.length)*4;
    const params=request.params ?? [];
    const paramBytes=params.length*8;

    const inputPtrs:number[]=[];
    const outputPtrs:number[]=[];
    const inputAllocations:{ptr:number;bytes:number}[]=[];
    const outputAllocations:{ptr:number;bytes:number}[]=[];
    let ptrTable=exports.alloc(ptrBytes);
    let paramsPtr=paramBytes ? exports.alloc(paramBytes) : 0;

    try {
      for(const input of request.inputs){
        const ptr=exports.alloc(input.byteLength);
        inputAllocations.push({ptr,bytes:input.byteLength});
        new Uint8Array(exports.memory.buffer,ptr,input.byteLength).set(asUint8Array(input));
        inputPtrs.push(ptr);
      }
      for(const output of request.outputs){
        const ptr=exports.alloc(output.byteLength);
        outputAllocations.push({ptr,bytes:output.byteLength});
        outputPtrs.push(ptr);
      }

      const table=new DataView(exports.memory.buffer,ptrTable,ptrBytes);
      for(let i=0;i<inputPtrs.length;i+=1) table.setUint32(i*4,inputPtrs[i]!,true);
      for(let i=0;i<outputPtrs.length;i+=1) table.setUint32((inputPtrs.length+i)*4,outputPtrs[i]!,true);
      if(paramsPtr){
        new Float64Array(exports.memory.buffer,paramsPtr,paramBytes/8).set(params);
      }

      const start=now();
      const status=exports.runKernel(ptrTable,inputPtrs.length,ptrTable+inputPtrs.length*4,outputPtrs.length,bars,paramsPtr,params.length);
      const elapsed=now()-start;
      if(typeof status==='number' && status!==0) throw new Error(`CoreSpirit WASM kernel '${request.kernel}' returned status ${status}`);
      for(let i=0;i<request.outputs.length;i+=1){
        const output=request.outputs[i]!;
        const bytes=new Uint8Array(exports.memory.buffer,outputPtrs[i]!,output.byteLength);
        new Uint8Array(output.buffer,output.byteOffset,output.byteLength).set(bytes);
      }
      return Object.freeze({
        kernel:request.kernel,
        variant:kernel.variant,
        bars,
        inputBytes,
        outputBytes,
        wasmElapsedMs:elapsed,
      });
    } finally {
      exports.free?.(ptrTable,ptrBytes);
      if(paramsPtr) exports.free?.(paramsPtr,paramBytes);
      for(const allocation of inputAllocations) exports.free?.(allocation.ptr,allocation.bytes);
      for(const allocation of outputAllocations) exports.free?.(allocation.ptr,allocation.bytes);
    }
  }
}



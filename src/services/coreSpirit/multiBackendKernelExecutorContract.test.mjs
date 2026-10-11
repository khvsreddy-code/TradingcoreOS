import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCoreSpiritBundledWasmSimdBackend } from './wasmBackend.ts';
import { executeCoreSpiritNumericalKernelPlanned } from './numericalKernelExecutor.ts';
import { createCoreSpiritBackendRegistry } from './backendRegistry.ts';
import { makeCoreSpiritCompilerPipelineTrace, validateCoreSpiritCompilerPipelineTrace, CORE_SPIRIT_COMPILER_STAGE_ORDER } from './compilerPipeline.ts';

const trace=makeCoreSpiritCompilerPipelineTrace();
assert.equal(trace.version,2);
assert.ok(trace.stages.includes('backend-planner'));
assert.ok(trace.stages.indexOf('optimizer')<trace.stages.indexOf('backend-planner'));
assert.ok(trace.stages.indexOf('backend-planner')<trace.stages.indexOf('execution-plan'));
assert.ok(validateCoreSpiritCompilerPipelineTrace(trace));
assert.ok(validateCoreSpiritCompilerPipelineTrace({version:1,stages:['source','cst','ast','semantic-analysis','semantic-graph','typed-ir','dependency-graph','optimizer','execution-plan'],runtimeBoundary:'CoreSpiritExecutionVM'}));
assert.equal(CORE_SPIRIT_COMPILER_STAGE_ORDER.at(-2),'backend-planner');

const values=Float64Array.from([1,2,3,4,5]);
const live=await executeCoreSpiritNumericalKernelPlanned('rollingMean',[values],[2],{purpose:'live'});
assert.equal(live.backend,'cpu-optimized');assert.equal(live.result[4],4.5);
const bundledWasmBytes = await readFile(new URL('../../../public/coreSpirit/numerical-kernels-simd.wasm', import.meta.url));
const bundledWasm = await loadCoreSpiritBundledWasmSimdBackend({ source: bundledWasmBytes });
assert.equal(bundledWasm.profile()?.vectorized, true);
const historicalValues = Float64Array.from({ length: 64 }, (_, i) => 5000 + i);
const acceleratedMean = await executeCoreSpiritNumericalKernelPlanned('rollingMean', [historicalValues], [8], {
  purpose: 'historical', wasm: bundledWasm, minWasmWorkUnits: 1,
});
assert.equal(acceleratedMean.backend, 'wasm-simd',
  'large historical rolling mean should execute the bundled SIMD kernel when explicitly supplied');
assert.ok(Math.abs(acceleratedMean.result[63] - 5059.5) < 1e-8);
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(bundledWasmBytes, { status: 200 });
try {
  const autoLoadedMean = await executeCoreSpiritNumericalKernelPlanned('rollingMean', [historicalValues], [8], {
    purpose: 'historical', minWasmWorkUnits: 1,
  });
  assert.equal(autoLoadedMean.backend, 'wasm-simd',
    'large historical rollingMean should lazy-load and dispatch to the bundled SIMD module');
  assert.ok(Math.abs(autoLoadedMean.result[63] - 5059.5) < 1e-8);
} finally {
  globalThis.fetch = previousFetch;
}
const gapMean = await executeCoreSpiritNumericalKernelPlanned('rollingMean', [[1, 2, Number.NaN, 4, 5, 6]], [2], {
  purpose: 'historical', wasm: bundledWasm, minWasmWorkUnits: 1,
});
assert.ok(Number.isNaN(gapMean.result[0]));
assert.equal(gapMean.result[1], 1.5);
assert.ok(Number.isNaN(gapMean.result[2]));
assert.ok(Number.isNaN(gapMean.result[3]));
assert.equal(gapMean.result[4], 4.5);
assert.equal(gapMean.result[5], 5.5);

let fallbackCount=0;
const brokenWasm={isLoaded:()=>true,profile:()=>({backend:'wasm',available:true,deterministic:true,vectorized:true}),hasKernel:name=>name==='rollingMean',kernelVariant:name=>name==='rollingMean'?'simd':undefined,execute:async()=>{throw new Error('simulated WASM trap');}};
const registry=createCoreSpiritBackendRegistry({wasm:brokenWasm});
const fallback=await executeCoreSpiritNumericalKernelPlanned('rollingMean',[values],[2],{purpose:'historical',wasm:brokenWasm,registry,minWasmWorkUnits:1,onBackendFallback:()=>{fallbackCount++;}});
assert.equal(fallback.plan.backend,'wasm-simd');assert.equal(fallback.backend,'cpu-optimized');assert.equal(fallback.fallbackReason,'simulated WASM trap');assert.equal(fallbackCount,1);
const registryOnlyFallback = await executeCoreSpiritNumericalKernelPlanned('rollingMean',[values],[2],{
 purpose:'historical',registry,minWasmWorkUnits:1,
});
assert.equal(registryOnlyFallback.fallbackReason,'simulated WASM trap',
  'the executor must run the same WASM adapter registered with the planner even when the adapter is only supplied via the registry');

const incompatibleRegistry=createCoreSpiritBackendRegistry({wasm:{isLoaded:()=>true,profile:()=>({backend:'wasm',available:true,deterministic:true,vectorized:true}),hasKernel:name=>name==='dotProduct',kernelVariant:name=>name==='dotProduct'?'simd':undefined}});
const dot=await executeCoreSpiritNumericalKernelPlanned('dotProduct',[[1,2,3],[4,5,6]],[],{purpose:'historical',registry:incompatibleRegistry,minWasmWorkUnits:1});
assert.notEqual(dot.plan.backend,'wasm-simd');assert.equal(dot.result,32);

const x=Float64Array.from([1e12+.125,1e12+.25,1e12+.375,1e12+.5]);
const y=Float64Array.from([2e12+.25,2e12+.5,2e12+.75,2e12+1]);
const corr=await executeCoreSpiritNumericalKernelPlanned('correlation',[x,y],[3],{purpose:'live'});
assert.ok(Math.abs(corr.result[2]-1)<1e-7);assert.ok(Math.abs(corr.result[3]-1)<1e-7);
console.log('CORESPIRIT_MULTIBACKEND_KERNEL_EXECUTOR_CONTRACT_OK');

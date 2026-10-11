import assert from 'node:assert/strict';
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

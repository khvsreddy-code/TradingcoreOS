import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCoreSpiritBundledWasmSimdBackend } from './wasmBackend.ts';
import { executeCoreSpiritNumericalKernelPlanned } from './numericalKernelExecutor.ts';
import { createCoreSpiritBackendRegistry } from './backendRegistry.ts';
import { rollingMean, rollingSum, rollingVariance, rollingStd, rollingMin, rollingMax } from './numericalKernels.ts';
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
const kernelProbeInput = Float64Array.from([1, 2, 3, 4, Number.NaN, 6, 7, 8, -2, 10, 12]);
const kernelChecks = [
  ['rollingMean', rollingMean, 'wasm-simd'],
  ['rollingSum', rollingSum, 'wasm-scalar'],
  ['rollingVariance', rollingVariance, 'wasm-scalar'],
  ['rollingStd', rollingStd, 'wasm-scalar'],
  ['rollingMin', rollingMin, 'wasm-scalar'],
  ['rollingMax', rollingMax, 'wasm-scalar'],
];
function assertSeriesClose(actual, expected, label, tolerance = 1e-7) {
  assert.equal(actual.length, expected.length, label + ' output length');
  for (let i = 0; i < expected.length; i += 1) {
    const a = actual[i], e = expected[i];
    if (Number.isNaN(e)) { assert.ok(Number.isNaN(a), label + ' expected NaN at index ' + i + ', got ' + a); continue; }
    if (!Number.isFinite(e)) { assert.equal(a, e, label + ' non-finite value at index ' + i); continue; }
    assert.ok(Number.isFinite(a) && Math.abs(a - e) <= tolerance * Math.max(1, Math.abs(e)),
      label + ' mismatch at index ' + i + ': expected ' + e + ', got ' + a);
  }
}
for (const [name, referenceKernel, expectedBackend] of kernelChecks) {
  const reference = referenceKernel(kernelProbeInput, 3);
  const execution = await executeCoreSpiritNumericalKernelPlanned(name, [kernelProbeInput], [3], {
    purpose: 'historical', wasm: bundledWasm, minWasmWorkUnits: 1,
  });
  assert.equal(execution.backend, expectedBackend, name + ' must report the kernel variant that actually ran');
  assert.equal(execution.selectedBackend, expectedBackend, name + ' selected backend must match its manifest variant');
  assertSeriesClose(execution.result, reference, name + ' WASM/CPU differential');
}
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
  const autoLoadedSum = await executeCoreSpiritNumericalKernelPlanned('rollingSum', [historicalValues], [8], {
    purpose: 'historical', minWasmWorkUnits: 1,
  });
  assert.equal(autoLoadedSum.backend, 'wasm-scalar');
  assert.equal(autoLoadedSum.result[63], 40476);
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
let executionTelemetry;
const telemetryResult = await executeCoreSpiritNumericalKernelPlanned('rollingMean', [historicalValues], [8], {
  purpose: 'historical', wasm: bundledWasm, minWasmWorkUnits: 1,
  onBackendExecution: event => { executionTelemetry = event; },
});
assert.equal(telemetryResult.backend, 'wasm-simd');
assert.equal(executionTelemetry.requestedBackend, 'auto');
assert.equal(executionTelemetry.selectedBackend, 'wasm-simd');
assert.equal(executionTelemetry.executedBackend, 'wasm-simd');
assert.ok(executionTelemetry.elapsedMs >= 0);

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

#!/usr/bin/env node
import fs from 'node:fs/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { compileCoreSpirit } from '../src/services/coreSpirit/coreSpiritPipeline.ts';
import {
  planCoreSpiritSeriesFusion,
  executeCoreSpiritSeriesFusionGroupInto,
} from '../src/services/coreSpirit/seriesFusion.ts';
import {
  executeCoreSpiritSeriesFusionGroupDispatched,
  loadCoreSpiritBundledWasmSeriesRuntime,
} from '../src/services/coreSpirit/seriesBackendDispatcher.ts';
import { coreSpiritKernelOperationForBuiltin } from '../src/services/coreSpirit/kernelOperationMap.ts';
import { CORE_SPIRIT_MAX_KERNEL_SERIES_LENGTH } from '../src/services/coreSpirit/numericalKernels.ts';

const DEFAULT_SIZES = [50_000, 250_000, 1_000_000];
const SOURCE = `
let firstMean = sma(close, 20)
let secondMean = sma(firstMean, 10)
show line(secondMean)
`;

function sizes() {
  const raw = process.env.TCO_BENCH_BAR_COUNTS;
  const requested = raw ? raw.split(',').map(value => Number(value.trim())) : DEFAULT_SIZES;
  if (!requested.length || requested.some(value =>
    !Number.isSafeInteger(value) || value < 1 || value > CORE_SPIRIT_MAX_KERNEL_SERIES_LENGTH)) {
    throw new Error(`TCO_BENCH_BAR_COUNTS must be comma-separated integers in [1, ${CORE_SPIRIT_MAX_KERNEL_SERIES_LENGTH}]`);
  }
  return [...new Set(requested)].sort((a, b) => a - b);
}

function iterations() {
  const count = Number(process.env.TCO_BENCH_ITERATIONS ?? 5);
  if (!Number.isInteger(count) || count < 3 || count > 25) {
    throw new Error('TCO_BENCH_ITERATIONS must be an integer in [3, 25]');
  }
  return count;
}

function series(length, withGaps = true) {
  const values = new Float64Array(length);
  for (let i = 0; i < length; i += 1) {
    values[i] = 100 + Math.sin(i * 0.013) * 2.2 + Math.cos(i * 0.031) * 0.7 + i * 0.0002;
  }
  if (withGaps && length > 32) {
    values[31] = Number.NaN;
    values[Math.floor(length * 0.37)] = Number.POSITIVE_INFINITY;
    values[Math.floor(length * 0.61)] = Number.NaN;
  }
  return values;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)].toFixed(3));
}

function summarize(values) {
  return {
    samples: values.length,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    minMs: Number(Math.min(...values).toFixed(3)),
    maxMs: Number(Math.max(...values).toFixed(3)),
  };
}

function assertEquivalent(actual, expected, label, tolerance = 1e-7) {
  if (actual.length !== expected.length) {
    throw new Error(`${label}: output length mismatch ${actual.length} !== ${expected.length}`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    const want = expected[index];
    const got = actual[index];
    if (Number.isNaN(want)) {
      if (!Number.isNaN(got)) throw new Error(`${label}: expected NaN at ${index}, got ${got}`);
    } else if (!Number.isFinite(want)) {
      if (got !== want) throw new Error(`${label}: expected ${want} at ${index}, got ${got}`);
    } else if (!Number.isFinite(got) || Math.abs(got - want) > tolerance * Math.max(1, Math.abs(want))) {
      throw new Error(`${label}: numerical mismatch at ${index}, expected ${want}, got ${got}`);
    }
  }
}

function elapsed(action) {
  const started = performance.now();
  const value = action();
  return { value, ms: performance.now() - started };
}

async function main() {
  const barCounts = sizes();
  const repeatCount = iterations();
  const compile = compileCoreSpirit(SOURCE, 'backend-dispatch-benchmark', { layer: 'script' });
  const errors = compile.diagnostics.filter(item => item.severity === 'error');
  if (!compile.ir || !compile.artifact || errors.length) {
    throw new Error('backend-dispatch benchmark source failed compilation: ' + errors.map(item => item.message).join('; '));
  }
  const fusion = planCoreSpiritSeriesFusion(compile.ir);
  const group = fusion.groups.find(candidate =>
    candidate.operations.length >= 2 &&
    candidate.operations.every(operation => coreSpiritKernelOperationForBuiltin(operation.name) === 'rollingMean'));
  if (!group) {
    throw new Error('compiler IR did not produce the expected fused rolling-mean group; refusing to benchmark an unrelated path');
  }

  const wasmBytes = await fs.readFile(new URL('../public/coreSpirit/numerical-kernels-simd.wasm', import.meta.url));
  const wasmRuntime = await loadCoreSpiritBundledWasmSeriesRuntime({ source: wasmBytes });
  if (!wasmRuntime.backend.isLoaded()) throw new Error('bundled WASM backend did not load into ready state');

  const rows = [];
  for (const bars of barCounts) {
    const inputValues = series(bars, true);
    const input = { register: group.inputRegister, values: inputValues };
    const referenceOutput = new Float64Array(bars);
    executeCoreSpiritSeriesFusionGroupInto(group, input, referenceOutput);

    const cpuSamples = [];
    for (let repeat = 0; repeat < repeatCount; repeat += 1) {
      const output = new Float64Array(bars);
      const measured = elapsed(() => executeCoreSpiritSeriesFusionGroupInto(group, input, output));
      cpuSamples.push(measured.ms);
      assertEquivalent(output, referenceOutput, `CPU reference ${bars} bars sample ${repeat}`);
    }

    const dispatchSamples = [];
    const executions = [];
    let finalOutput = new Float64Array(bars);
    for (let repeat = 0; repeat < repeatCount; repeat += 1) {
      finalOutput = new Float64Array(bars);
      const measured = elapsed(() => executeCoreSpiritSeriesFusionGroupDispatched(
        group,
        input,
        finalOutput,
        {
          realtime: false,
          bars,
          symbols: 1,
          timeframes: 1,
          deterministic: true,
          backends: wasmRuntime.backends,
          onBackendExecution: event => executions.push(event),
        },
        wasmRuntime.executors,
      ));
      dispatchSamples.push(measured.ms);
      assertEquivalent(finalOutput, referenceOutput, `dispatched ${bars} bars sample ${repeat}`);
    }

    const executedCounts = executions.reduce((counts, event) => {
      counts[event.executed] = (counts[event.executed] ?? 0) + 1;
      return counts;
    }, {});
    const cpuMedianMs = percentile(cpuSamples, 0.5);
    const dispatchMedianMs = percentile(dispatchSamples, 0.5);
    rows.push({
      bars,
      operations: group.operations.map(operation => ({ name: operation.name, length: operation.length })),
      workUnits: bars * group.operations.length,
      cpu: summarize(cpuSamples),
      dispatchedEndToEnd: summarize(dispatchSamples),
      actualExecutedBackends: executedCounts,
      actualKernelVariants: Object.fromEntries(group.operations.map(operation => {
        const kernel = coreSpiritKernelOperationForBuiltin(operation.name);
        return [kernel, wasmRuntime.backend.kernelVariant(kernel)];
      })),
      endToEndSpeedup: Number((cpuMedianMs / Math.max(dispatchMedianMs, 0.001)).toFixed(3)),
      endToEndWin: cpuMedianMs > dispatchMedianMs,
      numericParityIncludingMissingValues: 'passed',
      outputElements: finalOutput.length,
      finiteOutputCount: finalOutput.reduce((count, value) => count + (Number.isFinite(value) ? 1 : 0), 0),
    });
    console.log(`[backend] ${bars} bars: CPU/actual-dispatch parity passed; executed=${JSON.stringify(executedCounts)}`);
  }

  // Small and adversarial fixtures cover the cold window, NaN/Infinity gaps and
  // the complete post-gap warm-up boundary. Force the real WASM executor even
  // below the normal production work threshold so this remains a correctness test.
  const edgeCases = [];
  for (const bars of [1, 9, 19, 20, 21, 29, 30, 31, 64, 257]) {
    const inputValues = series(bars, true);
    const input = { register: group.inputRegister, values: inputValues };
    const expected = new Float64Array(bars);
    const actual = new Float64Array(bars);
    executeCoreSpiritSeriesFusionGroupInto(group, input, expected);
    const events = [];
    const executed = executeCoreSpiritSeriesFusionGroupDispatched(
      group, input, actual,
      {
        realtime: false, bars, deterministic: true, backends: wasmRuntime.backends,
        minWasmWorkUnits: 1,
        onBackendExecution: event => events.push(event),
      },
      wasmRuntime.executors,
    );
    if (executed !== 'wasm') throw new Error(`short/gap parity case ${bars}: expected actual WASM execution, got ${executed}`);
    assertEquivalent(actual, expected, `short/gap WASM parity ${bars}`);
    edgeCases.push({ bars, executed, missingInputValues: Array.from(inputValues).filter(value => !Number.isFinite(value)).length, parity: 'passed' });
  }

  // A historical correction and a forming-bar replacement are tested as new
  // immutable canonical snapshots. Neither path may leak a cached prior output.
  const correctionInputValues = series(257, true);
  const correctedValues = correctionInputValues.slice();
  correctedValues[128] = correctedValues[128] + 0.42;
  const correctedCpu = new Float64Array(correctedValues.length);
  const correctedWasm = new Float64Array(correctedValues.length);
  executeCoreSpiritSeriesFusionGroupInto(group, { register: group.inputRegister, values: correctedValues }, correctedCpu);
  const correctedExecution = executeCoreSpiritSeriesFusionGroupDispatched(
    group, { register: group.inputRegister, values: correctedValues }, correctedWasm,
    { realtime: false, bars: correctedValues.length, deterministic: true, backends: wasmRuntime.backends, minWasmWorkUnits: 1 },
    wasmRuntime.executors,
  );
  if (correctedExecution !== 'wasm') throw new Error('historical-correction parity fixture did not execute through WASM');
  assertEquivalent(correctedWasm, correctedCpu, 'historical correction WASM parity');

  const formingValues = series(257, true);
  const revisedValues = formingValues.slice();
  revisedValues[revisedValues.length - 1] += 0.12;
  const formingCpu = new Float64Array(revisedValues.length);
  const formingWasm = new Float64Array(revisedValues.length);
  executeCoreSpiritSeriesFusionGroupInto(group, { register: group.inputRegister, values: revisedValues }, formingCpu);
  const formingExecution = executeCoreSpiritSeriesFusionGroupDispatched(
    group, { register: group.inputRegister, values: revisedValues }, formingWasm,
    { realtime: false, bars: revisedValues.length, deterministic: true, backends: wasmRuntime.backends, minWasmWorkUnits: 1 },
    wasmRuntime.executors,
  );
  if (formingExecution !== 'wasm') throw new Error('forming-bar parity fixture did not execute through WASM');
  assertEquivalent(formingWasm, formingCpu, 'forming-bar replacement WASM parity');

  // In a live context the planner must remain CPU-only, despite a ready WASM module.
  const realtimeOutput = new Float64Array(257);
  const realtimeEvents = [];
  const realtimeExecution = executeCoreSpiritSeriesFusionGroupDispatched(
    group, { register: group.inputRegister, values: series(257, true) }, realtimeOutput,
    {
      realtime: true, bars: realtimeOutput.length, deterministic: true, backends: wasmRuntime.backends,
      onBackendExecution: event => realtimeEvents.push(event),
    },
    wasmRuntime.executors,
  );
  if (realtimeExecution !== 'cpu' || realtimeEvents.at(-1)?.executed !== 'cpu') {
    throw new Error('realtime dispatcher must stay on CPU even when WASM is available');
  }

  // Fail closed and prove the previous output buffer is never contaminated by
  // a partially-written failed accelerator execution.
  const fallbackInputValues = series(257, true);
  const fallbackInput = { register: group.inputRegister, values: fallbackInputValues };
  const fallbackExpected = new Float64Array(257);
  executeCoreSpiritSeriesFusionGroupInto(group, fallbackInput, fallbackExpected);
  const failedOutput = new Float64Array(257);
  const fallbackEvents = [];
  const fallbacks = [];
  const fallbackExecuted = executeCoreSpiritSeriesFusionGroupDispatched(
    group, fallbackInput, failedOutput,
    {
      realtime: false, bars: 257, deterministic: true, backends: wasmRuntime.backends, minWasmWorkUnits: 1,
      onBackendFallback: (_backend, error) => fallbacks.push(error instanceof Error ? error.message : String(error)),
      onBackendExecution: event => fallbackEvents.push(event),
    },
    { wasm: (_group, _input, output) => { output.fill(12345); throw new Error('synthetic test failure after partial write'); } },
  );
  if (fallbackExecuted !== 'cpu' || fallbackEvents.at(-1)?.executed !== 'cpu' || !fallbackEvents.at(-1)?.fallbackReason) {
    throw new Error('failed WASM execution must be reported as CPU fallback, not as accelerated success');
  }
  assertEquivalent(failedOutput, fallbackExpected, 'failed-WASM staged output CPU fallback');
  if (!fallbacks.some(message => message.includes('synthetic test failure'))) {
    throw new Error('failed WASM fallback reason was not surfaced to diagnostics');
  }

  const unavailableOutput = new Float64Array(257);
  const unavailableEvents = [];
  const unavailableExecuted = executeCoreSpiritSeriesFusionGroupDispatched(
    group, fallbackInput, unavailableOutput,
    {
      realtime: false, bars: 257, deterministic: true, backends: wasmRuntime.backends, minWasmWorkUnits: 1,
      onBackendExecution: event => unavailableEvents.push(event),
    },
    {},
  );
  if (unavailableExecuted !== 'cpu' || unavailableEvents.at(-1)?.fallbackReason !== 'executor unavailable') {
    throw new Error('missing backend executor must be reported and fall back to the CPU computation');
  }
  assertEquivalent(unavailableOutput, fallbackExpected, 'missing-executor CPU fallback parity');

  const report = {
    benchmark: 'CoreSpirit actual series-dispatcher CPU/WASM acceptance and performance',
    capturedAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    wasmLifecycle: wasmRuntime.backend.lifecycle(),
    wasmManifest: wasmRuntime.backend.profile(),
    compile: {
      sourceCharacters: SOURCE.length,
      instructionCount: compile.ir.entry.instructions.length,
      fusionGroups: fusion.groups.length,
      measuredGroup: { id: group.id, operations: group.operations, inputRegister: group.inputRegister, outputRegister: group.outputRegister },
    },
    configuration: { sizes: barCounts, iterations: repeatCount },
    performancePolicy: 'Only end-to-end timings are compared. A speed win is reported for this environment only when the actual dispatched median beats CPU and all outputs pass parity.',
    correctness: {
      actualDispatcherOutputParity: 'passed',
      shortHistoriesAndMissingValues: edgeCases,
      historicalCorrectionParity: 'passed',
      formingBarReplacementParity: 'passed',
      realtimeStaysOnCpu: 'passed',
      failedAcceleratorUsesStagedOutputAndCpuFallback: 'passed',
      unavailableExecutorCpuFallback: 'passed',
      canonicalMarketDataInvariant: 'one input Float64Array is the fixture source; no runtime OHLCV store is created',
    },
    rows,
  };
  const serialized = JSON.stringify(report, null, 2);
  console.log(serialized);
  const outputFile = process.env.TCO_BENCH_OUTPUT_FILE?.trim();
  if (outputFile) {
    const path = resolve(outputFile);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, serialized + '\n', 'utf8');
    console.error(`[backend] machine-readable report saved to ${path}`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

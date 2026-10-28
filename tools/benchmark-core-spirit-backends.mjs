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
const OPERATION_CASES = [
  { id: 'rollingMean', builtin: 'sma', kernel: 'rollingMean' },
  { id: 'rollingSum', builtin: 'sum', kernel: 'rollingSum' },
  { id: 'rollingVariance', builtin: 'variance', kernel: 'rollingVariance' },
  { id: 'rollingStd', builtin: 'stdev', kernel: 'rollingStd' },
  { id: 'rollingMin', builtin: 'lowest', kernel: 'rollingMin' },
  { id: 'rollingMax', builtin: 'highest', kernel: 'rollingMax' },
];

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

function minWasmWorkUnits() {
  const raw = process.env.TCO_BENCH_MIN_WASM_WORK_UNITS;
  if (raw == null || raw.trim() === '') return undefined;
  const requested = Number(raw);
  if (!Number.isSafeInteger(requested) || requested < 1) {
    throw new Error('TCO_BENCH_MIN_WASM_WORK_UNITS must be a positive safe integer');
  }
  return requested;
}

function sourceFor(testCase) {
  return [
    `let firstWindow = ${testCase.builtin}(close, 20)`,
    `let secondWindow = ${testCase.builtin}(firstWindow, 10)`,
    'show line(secondWindow)',
  ].join('\n');
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
    const want = expected[index], got = actual[index];
    if (Number.isNaN(want)) {
      if (!Number.isNaN(got)) throw new Error(`${label}: expected NaN at ${index}, got ${got}`);
    } else if (!Number.isFinite(want)) {
      if (got !== want) throw new Error(`${label}: expected ${want} at ${index}, got ${got}`);
    } else if (!Number.isFinite(got) || Math.abs(got - want) > tolerance * Math.max(1, Math.abs(want))) {
      throw new Error(`${label}: numerical mismatch at ${index}, expected ${want}, got ${got}`);
    }
  }
}

function prepareOperation(testCase) {
  const source = sourceFor(testCase);
  const compile = compileCoreSpirit(source, 'backend-dispatch-benchmark:' + testCase.id, { layer: 'script' });
  const errors = compile.diagnostics.filter(item => item.severity === 'error');
  if (!compile.ir || !compile.artifact || errors.length) {
    throw new Error(testCase.id + ' benchmark source failed compilation: ' + errors.map(item => item.message).join('; '));
  }
  const fusion = planCoreSpiritSeriesFusion(compile.ir);
  const group = fusion.groups.find(candidate =>
    candidate.operations.length >= 2 &&
    candidate.operations.every(operation => coreSpiritKernelOperationForBuiltin(operation.name) === testCase.kernel));
  if (!group) {
    throw new Error(`compiler IR did not produce the actual fused ${testCase.kernel} group for ${testCase.builtin}; refusing to benchmark an unrelated path`);
  }
  return { source, compile, fusion, group };
}

function runDispatched(testCase, group, wasmRuntime, values, minWork, options = {}) {
  const input = { register: group.inputRegister, values };
  const expected = new Float64Array(values.length);
  executeCoreSpiritSeriesFusionGroupInto(group, input, expected);
  const output = new Float64Array(values.length);
  const events = [];
  const fallbacks = [];
  const executed = executeCoreSpiritSeriesFusionGroupDispatched(
    group, input, output,
    {
      realtime: options.realtime === true,
      bars: values.length,
      symbols: 1,
      timeframes: 1,
      deterministic: true,
      minWasmWorkUnits: minWork,
      backends: wasmRuntime.backends,
      onBackendFallback: (backend, error) => fallbacks.push({
        backend,
        error: error instanceof Error ? error.message : (error == null ? undefined : String(error)),
      }),
      onBackendExecution: event => events.push(event),
    },
    options.executors ?? wasmRuntime.executors,
  );
  assertEquivalent(output, expected, `${testCase.id} actual dispatcher parity`);
  return { executed, output, expected, events, fallbacks };
}

async function main() {
  const barCounts = sizes();
  const repeatCount = iterations();
  const benchmarkMinWasmWorkUnits = minWasmWorkUnits();
  const wasmBytes = await fs.readFile(new URL('../public/coreSpirit/numerical-kernels-simd.wasm', import.meta.url));
  const loadStarted = performance.now();
  const wasmRuntime = await loadCoreSpiritBundledWasmSeriesRuntime({ source: wasmBytes });
  const moduleLoadAndWarmupMs = performance.now() - loadStarted;
  if (!wasmRuntime.backend.isLoaded() || wasmRuntime.backend.lifecycle().state !== 'ready') {
    throw new Error('bundled WASM backend did not load into ready state');
  }

  const preparedCases = OPERATION_CASES.map(testCase => ({ testCase, ...prepareOperation(testCase) }));
  const rows = [];
  const correctnessCases = [];
  const edgeBarCounts = [...new Set([1, 9, 19, 20, 21, 29, 30, 31, 64, 257])];

  for (const prepared of preparedCases) {
    const { testCase, source, compile, fusion, group } = prepared;
    for (const bars of barCounts) {
      const inputValues = series(bars, true);
      const input = { register: group.inputRegister, values: inputValues };
      const referenceOutput = new Float64Array(bars);
      executeCoreSpiritSeriesFusionGroupInto(group, input, referenceOutput);

      const cpuSamples = [];
      for (let repeat = 0; repeat < repeatCount; repeat += 1) {
        const output = new Float64Array(bars);
        const started = performance.now();
        executeCoreSpiritSeriesFusionGroupInto(group, input, output);
        cpuSamples.push(performance.now() - started);
        assertEquivalent(output, referenceOutput, `${testCase.id} CPU reference ${bars} bars sample ${repeat}`);
      }

      const dispatchSamples = [];
      const executions = [];
      let finalOutput = new Float64Array(bars);
      for (let repeat = 0; repeat < repeatCount; repeat += 1) {
        finalOutput = new Float64Array(bars);
        const started = performance.now();
        const result = executeCoreSpiritSeriesFusionGroupDispatched(
          group, input, finalOutput,
          {
            realtime: false,
            bars,
            symbols: 1,
            timeframes: 1,
            deterministic: true,
            minWasmWorkUnits: benchmarkMinWasmWorkUnits,
            backends: wasmRuntime.backends,
            onBackendExecution: event => executions.push(event),
          },
          wasmRuntime.executors,
        );
        dispatchSamples.push(performance.now() - started);
        const productionThreshold = 100_000 * Math.max(1, group.operations.length);
        const expectedBackend = benchmarkMinWasmWorkUnits === undefined
          ? (bars * group.operations.length >= productionThreshold ? 'wasm' : 'cpu')
          : 'wasm';
        assert.equal(result, expectedBackend,
          `${testCase.id} ${bars}-bar dispatch must respect the active backend work threshold`);
        assertEquivalent(finalOutput, referenceOutput, `${testCase.id} dispatched ${bars} bars sample ${repeat}`);
      }

      const executedCounts = executions.reduce((counts, event) => {
        counts[event.executed] = (counts[event.executed] ?? 0) + 1;
        return counts;
      }, {});
      const productionThreshold = 100_000 * Math.max(1, group.operations.length);
      const expectedBackend = benchmarkMinWasmWorkUnits === undefined
        ? (bars * group.operations.length >= productionThreshold ? 'wasm' : 'cpu')
        : 'wasm';
      if (executedCounts[expectedBackend] !== repeatCount) {
        throw new Error(`${testCase.id} ${bars} bars: expected ${expectedBackend} per backend policy but telemetry reported ${JSON.stringify(executedCounts)}`);
      }
      const cpuMedianMs = percentile(cpuSamples, 0.5);
      const dispatchMedianMs = percentile(dispatchSamples, 0.5);
      rows.push({
        operation: testCase.id,
        builtin: testCase.builtin,
        bars,
        sourceCharacters: source.length,
        instructionCount: compile.ir.entry.instructions.length,
        fusionGroupCount: fusion.groups.length,
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
    }

    // Make sure short histories and post-gap warm-up parity execute through the
    // real WASM dispatcher, even if the production cost gate would choose CPU.
    for (const bars of edgeBarCounts) {
      const values = series(bars, true);
      const result = runDispatched(testCase, group, wasmRuntime, values, 1);
      if (result.executed !== 'wasm') {
        throw new Error(`${testCase.id} short/gap parity case ${bars}: expected actual WASM execution, got ${result.executed}`);
      }
      correctnessCases.push({
        operation: testCase.id,
        case: 'short-history-and-missing-values',
        bars,
        missingInputCount: Array.from(values).filter(value => !Number.isFinite(value)).length,
        executed: result.executed,
        parity: 'passed',
      });
    }

    const correctionValues = series(257, true);
    correctionValues[128] += 0.42;
    const corrected = runDispatched(testCase, group, wasmRuntime, correctionValues, 1);
    if (corrected.executed !== 'wasm') throw new Error(testCase.id + ' historical correction did not execute through WASM');
    correctnessCases.push({ operation: testCase.id, case: 'historical-correction', bars: 257, executed: corrected.executed, parity: 'passed' });

    const formingValues = series(257, true);
    formingValues[formingValues.length - 1] += 0.12;
    const forming = runDispatched(testCase, group, wasmRuntime, formingValues, 1);
    if (forming.executed !== 'wasm') throw new Error(testCase.id + ' forming-bar replacement did not execute through WASM');
    correctnessCases.push({ operation: testCase.id, case: 'forming-bar-replacement', bars: 257, executed: forming.executed, parity: 'passed' });

    const realtimeValues = series(257, true);
    const realtime = runDispatched(testCase, group, wasmRuntime, realtimeValues, 1, { realtime: true });
    if (realtime.executed !== 'cpu' || realtime.events.at(-1)?.executed !== 'cpu') {
      throw new Error(testCase.id + ' realtime dispatcher must remain CPU-only while WASM is available');
    }
    correctnessCases.push({ operation: testCase.id, case: 'realtime-stays-on-cpu', executed: realtime.executed, parity: 'passed' });

    const failureValues = series(257, true);
    const failureReference = new Float64Array(257);
    executeCoreSpiritSeriesFusionGroupInto(group, { register: group.inputRegister, values: failureValues }, failureReference);
    const failure = runDispatched(testCase, group, wasmRuntime, failureValues, 1, {
      executors: {
        wasm: (_group, _input, output) => { output.fill(12345); throw new Error('synthetic test failure after partial write'); },
      },
    });
    if (failure.executed !== 'cpu' || failure.events.at(-1)?.executed !== 'cpu' ||
        !failure.events.at(-1)?.fallbackReason ||
        !failure.fallbacks.some(item => item.error?.includes('synthetic test failure after partial write'))) {
      throw new Error(testCase.id + ' failed accelerator did not produce an observable CPU fallback');
    }
    assertEquivalent(failure.output, failureReference, testCase.id + ' staged accelerator failure fallback');
    correctnessCases.push({ operation: testCase.id, case: 'failed-accelerator-staged-output-fallback', executed: failure.executed, parity: 'passed' });

    const missingExecutor = runDispatched(testCase, group, wasmRuntime, failureValues, 1, { executors: {} });
    if (missingExecutor.executed !== 'cpu' || missingExecutor.events.at(-1)?.executed !== 'cpu' ||
        missingExecutor.events.at(-1)?.fallbackReason !== 'executor unavailable') {
      throw new Error(testCase.id + ' missing executor must be reported and fall back to CPU');
    }
    correctnessCases.push({ operation: testCase.id, case: 'unavailable-executor-fallback', executed: missingExecutor.executed, parity: 'passed' });
  }

  const report = {
    benchmark: 'CoreSpirit actual series-dispatcher CPU/WASM acceptance and performance',
    capturedAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    wasmLifecycle: wasmRuntime.backend.lifecycle(),
    wasmManifest: wasmRuntime.backend.profile(),
    configuration: {
      sizes: barCounts,
      iterations: repeatCount,
      benchmarkMinWasmWorkUnits: benchmarkMinWasmWorkUnits ?? 'production-default',
      defaultProductionWorkThreshold: '100000 work units per fused operation',
    },
    performancePolicy: 'Only end-to-end timings are compared. A speed win is reported for this environment only when the actual dispatched median beats CPU and all outputs pass parity.',
    correctnessPolicy: 'Each dispatcher measurement must prove that WASM actually executed, and all finite values must meet relative tolerance 1e-7 while NaN/Infinity semantics must match exactly.',
    correctness: {
      actualDispatcherOutputParity: 'passed',
      shortHistoriesAndMissingValues: correctnessCases.filter(item => item.case === 'short-history-and-missing-values'),
      historicalCorrections: correctnessCases.filter(item => item.case === 'historical-correction'),
      formingBarReplacements: correctnessCases.filter(item => item.case === 'forming-bar-replacement'),
      realtimeStaysOnCpu: correctnessCases.filter(item => item.case === 'realtime-stays-on-cpu'),
      failedAcceleratorUsesStagedOutputAndCpuFallback: correctnessCases.filter(item => item.case === 'failed-accelerator-staged-output-fallback'),
      unavailableExecutorCpuFallback: correctnessCases.filter(item => item.case === 'unavailable-executor-fallback'),
      canonicalMarketDataInvariant: 'one canonical fixture series per measured run; no separate OHLCV history store is created',
    },
    rows,
  };
  const serialized = JSON.stringify(report, null, 2);
  console.log(serialized);
  const outputFile = process.env.TCO_BENCH_OUTPUT_FILE?.trim();
  if (outputFile) {
    const outputPath = resolve(outputFile);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized + '\n', 'utf8');
    console.error('[backend] machine-readable report saved to ' + outputPath);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

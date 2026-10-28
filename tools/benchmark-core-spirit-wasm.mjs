#!/usr/bin/env node
import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { dirname, resolve } from 'node:path';
import {
  CORE_SPIRIT_MAX_KERNEL_SERIES_LENGTH,
  rollingMean, rollingSum, rollingVariance, rollingStd, rollingMin, rollingMax,
} from '../src/services/coreSpirit/numericalKernels.ts';
import { loadCoreSpiritBundledWasmSimdBackend } from '../src/services/coreSpirit/wasmBackend.ts';

const DEFAULT_SIZES = [50_000, 250_000, 1_000_000];
const DEFAULT_PERIOD = 20;

function sizes() {
  const raw = process.env.TCO_BENCH_BAR_COUNTS;
  const requested = raw ? raw.split(',').map(value => Number(value.trim())) : DEFAULT_SIZES;
  if (!requested.length || requested.some(value => !Number.isInteger(value) || value < 1 || value > CORE_SPIRIT_MAX_KERNEL_SERIES_LENGTH)) {
    throw new Error(`TCO_BENCH_BAR_COUNTS must be comma-separated integers in [1, ${CORE_SPIRIT_MAX_KERNEL_SERIES_LENGTH}]`);
  }
  return requested;
}
function iterations() {
  const value = Number(process.env.TCO_BENCH_ITERATIONS ?? 5);
  if (!Number.isInteger(value) || value < 3 || value > 25) throw new Error('TCO_BENCH_ITERATIONS must be an integer in [3, 25]');
  return value;
}
function makeCloseSeries(length) {
  const out = new Float64Array(length);
  let value = 100;
  for (let i = 0; i < length; i += 1) {
    value += Math.sin(i * 0.013) * 0.25 + Math.cos(i * 0.007) * 0.07;
    out[i] = value;
  }
  return out;
}
function makeGappedSeries(length) {
  const output = makeCloseSeries(length);
  if (length > 5) output[Math.floor(length / 3)] = Number.NaN;
  if (length > 12) output[Math.floor((length * 2) / 3)] = Number.POSITIVE_INFINITY;
  return output;
}
function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function assertEquivalent(actual, expected, label, tolerance = 1e-7) {
  if (actual.length !== expected.length) throw new Error(`${label}: output length mismatch ${actual.length} !== ${expected.length}`);
  for (let i = 0; i < expected.length; i += 1) {
    const want = expected[i], got = actual[i];
    if (Number.isNaN(want)) {
      if (!Number.isNaN(got)) throw new Error(`${label}: expected NaN at index ${i}, got ${got}`);
    } else if (!Number.isFinite(want)) {
      if (got !== want) throw new Error(`${label}: expected ${want} at index ${i}, got ${got}`);
    } else if (!Number.isFinite(got) || Math.abs(got - want) > tolerance * Math.max(1, Math.abs(want))) {
      throw new Error(`${label}: numerical mismatch at index ${i}, expected ${want}, got ${got}`);
    }
  }
}
const KERNELS = [
  { name: 'rollingMean', reference: (input, period) => rollingMean(input, period), params: period => [period] },
  { name: 'rollingSum', reference: (input, period) => rollingSum(input, period), params: period => [period] },
  { name: 'rollingVariance', reference: (input, period) => rollingVariance(input, period), params: period => [period] },
  { name: 'rollingStd', reference: (input, period) => rollingStd(input, period), params: period => [period] },
  { name: 'rollingMin', reference: (input, period) => rollingMin(input, period), params: period => [period] },
  { name: 'rollingMax', reference: (input, period) => rollingMax(input, period), params: period => [period] },
];

async function main() {
  const barCounts = sizes();
  const repeatCount = iterations();
  const bytes = await fs.readFile(new URL('../public/coreSpirit/numerical-kernels-simd.wasm', import.meta.url));
  const loadStarted = performance.now();
  const wasm = await loadCoreSpiritBundledWasmSimdBackend({ source: bytes });
  const moduleLoadAndWarmupMs = performance.now() - loadStarted;
  const lifecycle = wasm.lifecycle();
  if (lifecycle.state !== 'ready') throw new Error('bundled WASM failed its load/warm-up lifecycle');
  const rows = [];
  for (const bars of barCounts) {
    const input = makeCloseSeries(bars);
    for (const kernel of KERNELS) {
      const expected = kernel.reference(input, DEFAULT_PERIOD);
      const warmOutput = new Float64Array(bars);
      const warmResult = await wasm.execute({ kernel: kernel.name, inputs: [input], outputs: [warmOutput], params: kernel.params(DEFAULT_PERIOD) });
      assertEquivalent(warmOutput, expected, kernel.name + ' warm-up parity');

      const cpuSamples = [];
      for (let i = 0; i < repeatCount; i += 1) {
        const started = performance.now();
        const output = kernel.reference(input, DEFAULT_PERIOD);
        cpuSamples.push(performance.now() - started);
        if (i === 0) assertEquivalent(output, expected, kernel.name + ' CPU repeat parity');
      }
      const wasmEndToEndSamples = [];
      const wasmKernelSamples = [];
      let lastOutput;
      for (let i = 0; i < repeatCount; i += 1) {
        const started = performance.now();
        const output = new Float64Array(bars);
        const result = await wasm.execute({ kernel: kernel.name, inputs: [input], outputs: [output], params: kernel.params(DEFAULT_PERIOD) });
        wasmEndToEndSamples.push(performance.now() - started);
        wasmKernelSamples.push(result.wasmElapsedMs);
        lastOutput = output;
      }
      assertEquivalent(lastOutput, expected, kernel.name + ' measured parity');
      const cpuMedianMs = median(cpuSamples);
      const wasmEndToEndMedianMs = median(wasmEndToEndSamples);
      const wasmKernelMedianMs = median(wasmKernelSamples);
      rows.push({
        bars,
        operation: kernel.name,
        actualKernelVariant: wasm.kernelVariant(kernel.name),
        actualBackend: wasm.kernelVariant(kernel.name) === 'simd' ? 'wasm-simd' : 'wasm-scalar',
        cpuMedianMs: Number(cpuMedianMs.toFixed(3)),
        wasmKernelMedianMs: Number(wasmKernelMedianMs.toFixed(3)),
        wasmEndToEndMedianMs: Number(wasmEndToEndMedianMs.toFixed(3)),
        cpuBarsPerSecond: Math.round(bars * 1000 / Math.max(cpuMedianMs, 0.001)),
        wasmEndToEndBarsPerSecond: Math.round(bars * 1000 / Math.max(wasmEndToEndMedianMs, 0.001)),
        endToEndSpeedup: Number((cpuMedianMs / Math.max(wasmEndToEndMedianMs, 0.001)).toFixed(3)),
        endToEndWin: cpuMedianMs > wasmEndToEndMedianMs,
        inputOutputBytes: bars * Float64Array.BYTES_PER_ELEMENT * 2,
        parity: 'passed',
        wasmModuleLoadAndWarmupMs: Number(moduleLoadAndWarmupMs.toFixed(3)),
        wasmLoadWarmupKernelMs: Number(warmResult.wasmElapsedMs.toFixed(3)),
      });
    }
  }
  // Correctness gate across every operation exposed by the bundled WASM
  // manifest: warm-up/short history, missing values, corrections and forming-bar
  // replacement are compared against the canonical CPU typed-array functions.
  const edgeCaseResults = [];
  const correctionResults = [];
  const formingBarResults = [];
  const edgeBarCounts = [...new Set([1, DEFAULT_PERIOD - 1, DEFAULT_PERIOD, DEFAULT_PERIOD + 1, 257])];
  for (const kernel of KERNELS) {
    for (const bars of edgeBarCounts) {
      const input = makeGappedSeries(bars);
      const expected = kernel.reference(input, DEFAULT_PERIOD);
      const output = new Float64Array(bars);
      const execution = await wasm.execute({
        kernel: kernel.name,
        inputs: [input],
        outputs: [output],
        params: kernel.params(DEFAULT_PERIOD),
      });
      assertEquivalent(output, expected, `${kernel.name} short/gap parity ${bars} bars`);
      edgeCaseResults.push({
        operation: kernel.name,
        bars,
        actualKernelVariant: execution.variant,
        missingInputCount: Array.from(input).filter(value => !Number.isFinite(value)).length,
        parity: 'passed',
      });
    }

    const correctedInput = makeGappedSeries(257);
    correctedInput[127] = Number(correctedInput[127]) + 0.333;
    const correctedExpected = kernel.reference(correctedInput, DEFAULT_PERIOD);
    const correctedOutput = new Float64Array(correctedInput.length);
    await wasm.execute({
      kernel: kernel.name,
      inputs: [correctedInput],
      outputs: [correctedOutput],
      params: kernel.params(DEFAULT_PERIOD),
    });
    assertEquivalent(correctedOutput, correctedExpected, kernel.name + ' historical-correction parity');
    correctionResults.push({ operation: kernel.name, bars: correctedInput.length, parity: 'passed' });

    const formingInput = makeGappedSeries(257);
    formingInput[formingInput.length - 1] = Number(formingInput[formingInput.length - 1]) + 0.217;
    const formingExpected = kernel.reference(formingInput, DEFAULT_PERIOD);
    const formingOutput = new Float64Array(formingInput.length);
    await wasm.execute({
      kernel: kernel.name,
      inputs: [formingInput],
      outputs: [formingOutput],
      params: kernel.params(DEFAULT_PERIOD),
    });
    assertEquivalent(formingOutput, formingExpected, kernel.name + ' forming-bar replacement parity');
    formingBarResults.push({ operation: kernel.name, bars: formingInput.length, parity: 'passed' });
  }
  console.log('[wasm] all supported kernels passed short-history, gap, correction and forming-bar parity');
  console.table(rows);
  const report = {
    capturedAt: new Date().toISOString(),
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    benchmark: 'CoreSpirit bundled numerical kernel backend comparison',
    wasmAbi: 2,
    wasmLifecycle: lifecycle,
    moduleLoadAndWarmupMs: Number(moduleLoadAndWarmupMs.toFixed(3)),
    kernelVariants: Object.fromEntries(KERNELS.map(kernel => [kernel.name, wasm.kernelVariant(kernel.name)])),
    period: DEFAULT_PERIOD,
    sizes: barCounts,
    iterations: repeatCount,
    tolerance: '1e-7 relative for finite outputs; NaN and infinities must match exactly',
    measurements: ['CPU typed-array reference', 'WASM kernel-only time', 'WASM end-to-end time including transfer/allocation'],
    policy: 'Performance ratios are measured per environment; the benchmark never labels WASM as a win unless end-to-end speedup exceeds 1.0x.',
    results: rows,
    correctness: {
      shortHistoriesAndMissingValues: edgeCaseResults,
      historicalCorrections: correctionResults,
      formingBarReplacements: formingBarResults,
      canonicalReference: 'numericalKernels.ts typed-array CPU implementations',
    },
  };
  const serializedReport = JSON.stringify(report, null, 2);
  console.log(serializedReport);
  const outputFile = process.env.TCO_WASM_BENCH_OUTPUT_FILE?.trim();
  if (outputFile) {
    const resolvedOutputFile = resolve(outputFile);
    await fs.mkdir(dirname(resolvedOutputFile), { recursive: true });
    await fs.writeFile(resolvedOutputFile, serializedReport + '\n', 'utf8');
    console.error('[wasm] machine-readable report saved to ' + resolvedOutputFile);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

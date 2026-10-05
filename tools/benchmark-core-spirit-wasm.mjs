#!/usr/bin/env node
import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { CoreSpiritExecutionVM } from '../src/services/coreSpirit/executionVM.ts';
import { CoreSpiritOutputCollector } from '../src/services/coreSpirit/outputCollector.ts';
import { CoreSpiritFusedSeriesCursor } from '../src/services/coreSpirit/seriesVector.ts';
import { CoreSpiritWasmBackend, type CoreSpiritWasmKernelManifest } from '../src/services/coreSpirit/wasmBackend.ts';

const DEFAULT_SIZES = [5_000, 50_000, 500_000, 5_000_000];

function sizes() {
  const raw = process.env.TCO_BENCH_BAR_COUNTS;
  if (!raw) return DEFAULT_SIZES;
  return raw.split(',').map((x) => Math.max(1, Math.floor(Number(x)))).filter(Number.isFinite);
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

function bench(fn) {
  const start = performance.now();
  fn();
  const elapsed = performance.now() - start;
  return Object.freeze({ ms: elapsed, barsPerSecond: elapsed > 0 ? Math.round(1_000 * (fn.bars || 0) / elapsed) : Infinity });
}

function runJsVm(input) {
  const instructions = [
    { op:'loadSeries', dest:'t0', name:'close', offset:0 },
    { op:'const', dest:'t1', value:20 },
    { op:'call', dest:'t2', name:'ema', args:['t0','t1'], seriesArgs:['close'], callId:'bench:ema' },
    { op:'const', dest:'t3', value:14 },
    { op:'call', dest:'t4', name:'sma', args:['t0','t3'], seriesArgs:['close'], callId:'bench:sma' },
  ];
  const vm = new CoreSpiritExecutionVM();
  const output = new CoreSpiritOutputCollector(1);
  const ema = { seed:[], value:null };
  const sma = [];
  let last = 0;
  const host = {
    maxStepsPerBar:100,
    throwIfAborted(){},
    loadSeries(name, offset){ return name === 'close' && offset === 0 ? input[last] : null; },
    moveLocal(){ return null; },
    setLocal(){},
    unary(){ return null; },
    binary(){ return null; },
    tryFused(){ return false; },
    call(instruction,args){
      const x = Number(args[0]);
      const period = Math.max(1, Math.floor(Number(args[1] ?? 20)));
      if (instruction.name === 'sma') {
        sma.push(x);
        if (sma.length > period) sma.shift();
        if (sma.length < period) return null;
        let sum = 0;
        for (let i = sma.length - period; i < sma.length; i += 1) sum += sma[i];
        return sum / period;
      }
      if (instruction.name === 'ema') {
        ema.seed.push(x);
        if (ema.seed.length < period) return null;
        if (ema.seed.length === period && ema.value == null) {
          let sum = 0;
          for (const value of ema.seed) sum += value;
          ema.value = sum / period;
          return ema.value;
        }
        if (ema.seed.length > period) ema.seed.shift();
        const alpha = 2 / (period + 1);
        ema.value = alpha * x + (1 - alpha) * ema.value;
        return ema.value;
      }
      return null;
    },
    loadIndexed(){ return null; },
    truthy(value){ return !!value; },
    emit(){},
    setLocalBySeriesId(){},
    loadIndexedSeriesById(){ return null; },
  };
  for (last = 0; last < input.length; last += 1) vm.run(instructions, last, host, output);
  return ema.value;
}

function runJsFused(input) {
  const cursor = new CoreSpiritFusedSeriesCursor([
    { name:'sma', length:20 },
    { name:'ema', length:20 },
  ]);
  const output = new Float64Array(input.length);
  for (let i = 0; i < input.length; i += 1) output[i] = cursor.update(input[i], i)[1] ?? Number.NaN;
  return output[input.length - 1];
}

async function loadWasm(path, variant) {
  if (!path) return null;
  const bytes = await fs.readFile(path);
  const backend = new CoreSpiritWasmBackend();
  const manifest = {
    abiVersion:1,
    simd:variant === 'simd',
    kernels:[{name:'bench.sma_ema',variant,inputCount:1,outputCount:1,stateful:true,deterministic:true}],
  };
  await backend.load(bytes, manifest);
  return backend;
}

async function main() {
  const scalarWasm = await loadWasm(process.env.TCO_CORESPIRIT_WASM_SCALAR, 'scalar');
  const simdWasm = await loadWasm(process.env.TCO_CORESPIRIT_WASM_SIMD, 'simd');

  const rows = [];
  for (const bars of sizes()) {
    const input = makeCloseSeries(bars);

    const vmStart = performance.now();
    const vmLast = runJsVm(input);
    const vmMs = performance.now() - vmStart;

    const fusedStart = performance.now();
    const fusedLast = runJsFused(input);
    const fusedMs = performance.now() - fusedStart;

    const row = {
      bars,
      jsVmMs: Number(vmMs.toFixed(3)),
      jsVmBarsPerSec: Math.round(1_000 * bars / Math.max(vmMs, 0.001)),
      jsVmLast: Number(vmLast ?? NaN),
      jsFusedMs: Number(fusedMs.toFixed(3)),
      jsFusedBarsPerSec: Math.round(1_000 * bars / Math.max(fusedMs, 0.001)),
      jsFusedLast: Number(fusedLast ?? NaN),
      wasmScalarMs:'not-configured',
      wasmScalarBarsPerSec:'not-configured',
      wasmSimdMs:'not-configured',
      wasmSimdBarsPerSec:'not-configured',
    };

    const runWasm = async (backend, key) => {
      if (!backend) return;
      const output = new Float64Array(bars);
      const start = performance.now();
      await backend.execute({ kernel:'bench.sma_ema', inputs:[input], outputs:[output], params:[20] });
      const elapsed = performance.now() - start;
      row[key + 'Ms'] = Number(elapsed.toFixed(3));
      row[key + 'BarsPerSec'] = Math.round(1_000 * bars / Math.max(elapsed, 0.001));
    };

    await runWasm(scalarWasm, 'wasmScalar');
    await runWasm(simdWasm, 'wasmSimd');
    rows.push(row);
  }

  console.table(rows);
  console.log(JSON.stringify({
    benchmark:'CoreSpirit backend comparison',
    lanes:['js VM','js fused','WASM scalar','WASM SIMD'],
    sizes:sizes(),
    wasmAbi:1,
    note:'WASM results appear only when TCO_CORESPIRIT_WASM_SCALAR and/or TCO_CORESPIRIT_WASM_SIMD point to compatible kernel modules.',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import { CoreSpiritCompiler } from '../src/services/coreSpirit/compiler.ts';
import { CoreSpiritIncrementalCompiler } from '../src/services/coreSpirit/incrementalCompiler.ts';
import { CoreSpiritRuntime } from '../src/services/coreSpirit/runtime.ts';
import { CORESPIRIT_LUXALGO_SMC_SOURCE } from '../src/services/coreSpirit/luxAlgoSmcCoreSource.ts';

const DEFAULT_BAR_COUNTS = [2_000, 5_000, 20_000, 50_000];
const START_MS = Date.UTC(2020, 0, 1);

function barCounts() {
  const raw = process.env.TCO_BENCH_BAR_COUNTS;
  const values = raw ? raw.split(',').map(value => Number(value.trim())) : DEFAULT_BAR_COUNTS;
  if (!values.length || values.some(value => !Number.isSafeInteger(value) || value < 2_000 || value > 50_000)) {
    throw new Error('TCO_BENCH_BAR_COUNTS must be comma-separated integers in [2000, 50000]');
  }
  return [...new Set(values)].sort((a, b) => a - b);
}
function updateIterations() {
  const value = Number(process.env.TCO_BENCH_UPDATE_ITERATIONS ?? 100);
  if (!Number.isInteger(value) || value < 20 || value > 250) {
    throw new Error('TCO_BENCH_UPDATE_ITERATIONS must be an integer in [20, 250]');
  }
  return value;
}
function timeMs(action) {
  const started = performance.now();
  const value = action();
  return { value, elapsedMs: performance.now() - started };
}
function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)].toFixed(3));
}
function summary(values) {
  return {
    samples: values.length,
    p50Ms: percentile(values, 0.50),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    minMs: Number(Math.min(...values).toFixed(3)),
    maxMs: Number(Math.max(...values).toFixed(3)),
  };
}
function syntheticBar(index) {
  const timestamp = new Date(START_MS + index * 60_000).toISOString();
  const close = 100 + index * 0.001 + Math.sin(index * 0.021) * 3.5 + Math.cos(index * 0.007) * 1.2;
  const open = close - Math.sin(index * 0.17) * 0.35;
  return {
    timestamp,
    open,
    high: Math.max(open, close) + 0.25 + (index % 7) * 0.01,
    low: Math.min(open, close) - 0.20 - (index % 5) * 0.01,
    close,
    volume: 500 + (index % 900) * 3 + Math.abs(Math.sin(index * 0.13)) * 200,
  };
}
function barsFor(count) {
  return Array.from({ length: count }, (_, index) => syntheticBar(index));
}
function timeframeSeconds(timeframe) {
  const match = String(timeframe).trim().match(/^(\d+)([mhd])$/i);
  if (!match) return 300;
  const unit = match[2].toLowerCase();
  return Number(match[1]) * (unit === 'm' ? 60 : unit === 'h' ? 3_600 : 86_400);
}
function symbolFactor(symbol) {
  let code = 0;
  for (const character of String(symbol)) code = (code * 31 + character.charCodeAt(0)) >>> 0;
  return 0.65 + (code % 900) / 1_000;
}
function fixtureValue(request, context) {
  const seconds = timeframeSeconds(request.timeframe);
  const asOf = Math.floor(Number(context?.asOfTimestamp) || START_MS / 1000);
  // last-confirmed semantics: the secondary candle must have closed by asOf.
  const timestamp = (Math.floor(asOf / seconds) - 1) * seconds;
  const index = Math.max(0, Math.floor((timestamp - START_MS / 1000) / seconds));
  const factor = symbolFactor(request.symbol);
  const tfFactor = Math.max(1, seconds / 300);
  const close = 75 * factor + index * 0.002 * factor +
    Math.sin(index * 0.031 / Math.sqrt(tfFactor)) * 2.2 * factor +
    Math.cos(index * 0.011) * 0.8 * factor;
  const open = close - Math.sin(index * 0.23) * 0.22 * factor;
  const valueByField = {
    open,
    high: Math.max(open, close) + 0.18 * factor,
    low: Math.min(open, close) - 0.16 * factor,
    close,
    volume: 1_000 + (index % 500) * 2 * factor,
    time: timestamp,
  };
  return {
    value: valueByField[request.field],
    source: 'corespirit-benchmark-fixture',
    symbol: request.symbol,
    timeframe: request.timeframe,
    timestamp,
    closeTimestamp: timestamp + seconds,
    state: 'confirmed',
    confirmationPhase: 'confirmed',
    receivedAt: asOf,
    revision: index,
    dataRevision: `fixture:${request.symbol}:${request.timeframe}:${index}`,
  };
}
function fixtureResolver() {
  return {
    requestAt: (request, context) => fixtureValue(request, context),
    requestBatch: (requests, context) => requests.map(request => fixtureValue(request, context)),
    cacheKey: request => `fixture:${request.symbol}:${request.timeframe}:${request.field}:${request.offset ?? 0}`,
  };
}
function outputFingerprint(outputs) {
  let hash = 0x811c9dc5;
  let count = 0;
  for (const output of outputs) {
    const encoded = JSON.stringify(output, (_key, value) => {
      if (typeof value === 'number' && Number.isNaN(value)) return '__NaN__';
      if (value === Infinity) return '__Infinity__';
      if (value === -Infinity) return '__-Infinity__';
      return value;
    }) ?? 'undefined';
    for (let i = 0; i < encoded.length; i += 1) {
      hash ^= encoded.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    count += 1;
  }
  return `${count}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
function assertSame(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: reference/optimized output mismatch (${actual} !== ${expected})`);
}

const WORKLOADS = [
  {
    id: 'single-symbol-dependent-graph',
    source: `
let fast = ema(close, 9)
let slow = ema(close, 21)
let ratio = close / close[1]
let volatility = stdev(ratio, 20)
let spread = fast - slow
let normalized = zscore(spread, 50)
let bullish = fast > slow and normalized > 0
when bullish
  show signal("BUY")
show line(fast)
show line(slow)
show line(normalized)
`,
    symbol: 'NSE:NIFTY50',
    timeframe: '1m',
  },
  {
    id: 'multi-symbol-timeframe-dependent-graph',
    source: `
data nifty = market("NSE:NIFTY50", "5m")
data bank = market("NSE:BANKNIFTY", "15m")
let niftyTrend = ema(nifty.close, 9)
let bankTrend = ema(bank.close, 9)
let relative = niftyTrend / bankTrend
let relativeChange = relative - relative[1]
let smoothedRelative = ema(relativeChange, 12)
when smoothedRelative > 0
  show signal("RELATIVE-STRENGTH")
show line(smoothedRelative)
`,
    symbol: 'NSE:NIFTY50',
    timeframe: '1m',
  },
  {
    id: 'luxalgo-smc-stateful-drawings',
    source: CORESPIRIT_LUXALGO_SMC_SOURCE,
    symbol: 'NSE:NIFTY50',
    timeframe: '1m',
  },
];

function makeRuntime(tier, workload) {
  return new CoreSpiritRuntime({
    executionTarget: 'chart',
    executionTier: tier,
    executionMode: 'historical',
    sourceId: 'benchmark:' + workload.id,
    symbol: workload.symbol,
    timeframe: workload.timeframe,
    maxStepsPerBar: 10_000,
    dataResolver: fixtureResolver(),
  });
}

async function main() {
  const sizes = barCounts();
  const updateCount = updateIterations();
  const report = {
    benchmark: 'CoreSpirit compiler + reference/optimized runtime + live output pipeline',
    version: '1',
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    barCounts: sizes,
    liveUpdateSamples: updateCount,
    liveLatencyQuantilesNote: 'P95/P99 are descriptive sample quantiles; compare runs on the same machine with identical settings.',
    performancePolicy: 'No universal Pine Script speed claim; only same-process reference/optimized parity and measured latencies are reported.',
    memoryPolicy: 'Heap/ArrayBuffer values are retained-memory deltas, not allocation counts; browser paint time is not measured.',
    workloads: [],
  };

  for (const workload of WORKLOADS) {
    // Separate compiler instances prevent the cold compile from being mistaken
    // for a warm-cache hit. The executable runtime still uses the canonical compiler.
    const coldCompile = timeMs(() => new CoreSpiritCompiler().compileSource(workload.source, 'benchmark:' + workload.id));
    if (!coldCompile.value.ir || coldCompile.value.diagnostics.some(item => item.severity === 'error')) {
      throw new Error(`${workload.id} failed to compile: ${coldCompile.value.diagnostics.map(item => item.message).join('; ')}`);
    }
    const incrementalCompiler = new CoreSpiritIncrementalCompiler();
    const incrementalCold = timeMs(() => incrementalCompiler.compile(workload.source, 'benchmark:' + workload.id));
    const incrementalWarm = timeMs(() => incrementalCompiler.compile(workload.source, 'benchmark:' + workload.id));
    if (!incrementalWarm.value.cacheHit) throw new Error('incremental compiler warm pass did not hit its cache');
    const ir = coldCompile.value.ir;
    const workloadReport = {
      id: workload.id,
      instructions: ir.entry.instructions.length,
      sourceCharacters: workload.source.length,
      compileColdMs: Number(coldCompile.elapsedMs.toFixed(3)),
      incrementalCompileColdMs: Number(incrementalCold.elapsedMs.toFixed(3)),
      incrementalCompileWarmMs: Number(incrementalWarm.elapsedMs.toFixed(3)),
      incrementalCacheHit: incrementalWarm.value.cacheHit,
      incrementalParseCacheHit: incrementalWarm.value.parseCacheHit,
      bars: [],
    };

    for (const count of sizes) {
      const inputBars = barsFor(count);
      const originalByTier = {};
      const correctedByTier = {};
      const tierReports = [];
      for (const tier of ['reference', 'optimized']) {
        const runtime = makeRuntime(tier, workload);
        const beforeMemory = process.memoryUsage();
        const coldRun = timeMs(() => runtime.executeIr(ir, inputBars));
        const coldFingerprint = outputFingerprint(coldRun.value.outputs);
        const warmRuns = [];
        let lastHistoricalFingerprint = coldFingerprint;
        // Two warm replays keep the default run bounded while still separating
        // first-plan cost from repeat execution. Set TCO_BENCH_BAR_COUNTS to run a subset.
        for (let repeat = 0; repeat < 2; repeat += 1) {
          const warm = timeMs(() => runtime.executeIr(ir, inputBars));
          warmRuns.push(warm.elapsedMs);
          lastHistoricalFingerprint = outputFingerprint(warm.value.outputs);
        }
        assertSame(lastHistoricalFingerprint, coldFingerprint, `${workload.id} ${count} ${tier} repeated historical execution`);
        originalByTier[tier] = coldFingerprint;
        const afterMemory = process.memoryUsage();

        // The first append makes the new bar live. Following updates exercise the
        // same-bucket dirty-range path; each sample measures time-to-output-ready.
        let liveBar = syntheticBar(count);
        const append = timeMs(() => runtime.executeBar(liveBar));
        const liveTicks = [];
        let visibleLatencyMs = append.elapsedMs;
        for (let tick = 0; tick < updateCount; tick += 1) {
          liveBar = { ...liveBar, close: liveBar.close + (tick % 2 ? -0.015 : 0.021), high: Math.max(liveBar.high, liveBar.close + 0.04), low: Math.min(liveBar.low, liveBar.close - 0.04) };
          const update = timeMs(() => runtime.executeBar(liveBar));
          liveTicks.push(update.elapsedMs);
          visibleLatencyMs = update.elapsedMs;
        }

        const correctedBars = inputBars.slice();
        const correctionIndex = Math.floor(count * 0.55);
        correctedBars[correctionIndex] = { ...correctedBars[correctionIndex], close: correctedBars[correctionIndex].close + 0.125 };
        const correction = timeMs(() => runtime.executeIr(ir, correctedBars));
        const correctedFingerprint = outputFingerprint(correction.value.outputs);
        correctedByTier[tier] = correctedFingerprint;
        tierReports.push({
          tier,
          coldHistoricalReplayMs: Number(coldRun.elapsedMs.toFixed(3)),
          warmHistoricalReplay: summary(warmRuns),
          historicalOutputFingerprint: coldFingerprint,
          liveAppendOutputReadyMs: Number(append.elapsedMs.toFixed(3)),
          liveTickOutputReady: summary(liveTicks),
          lastObservedOutputReadyMs: Number(visibleLatencyMs.toFixed(3)),
          historicalCorrectionReplayMs: Number(correction.elapsedMs.toFixed(3)),
          correctedOutputFingerprint: correctedFingerprint,
          retainedHeapDeltaBytes: afterMemory.heapUsed - beforeMemory.heapUsed,
          retainedArrayBufferDeltaBytes: afterMemory.arrayBuffers - beforeMemory.arrayBuffers,
          outputCount: correction.value.outputs.length,
          outputKindCounts: correction.value.outputs.reduce((counts, output) => {
            const kind = String(output.kind ?? 'unknown');
            counts[kind] = (counts[kind] ?? 0) + 1;
            return counts;
          }, {}),
          drawingOutputCount: correction.value.outputs.filter(output =>
            ['line', 'arrow', 'zone', 'box', 'label', 'marker', 'shape', 'polyline', 'polygon', 'hline'].includes(output.kind)
          ).length,
        });
      }
      assertSame(originalByTier.reference, originalByTier.optimized, `${workload.id} ${count} historical outputs`);
      assertSame(correctedByTier.reference, correctedByTier.optimized, `${workload.id} ${count} corrected historical outputs`);
      workloadReport.bars.push({ count, referenceVsOptimizedParity: 'passed', tiers: tierReports });
      console.log(`[pipeline] ${workload.id} ${count} bars: reference/optimized parity passed`);
    }
    report.workloads.push(workloadReport);
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const provider = read('src/TcoVelaDataProvider.ts');
const dataPlane = read('src/services/marketData/chartDataPlane.ts');
const workspace = read('src/LiveTradingWorkspace.tsx');
const verifier = read('tools/verify-chart-performance.mjs');
const vela = read('vendor/vela/src/workspace/VelaWorkspace.ts');

if (!provider.includes('return chartDataPlaneKey(brokerId, runtimeSymbol(symbol), runtimeTimeframe(timeframe));')) {
  throw new Error('Vela telemetry key must normalize symbol/timeframe into the canonical chart data-plane key');
}
if (!dataPlane.includes('chartPerformanceTelemetry.recordPacket(this.key);')) {
  throw new Error('Per-chart data plane must record market packets under its canonical key');
}
if (!dataPlane.includes('chartPerformanceTelemetry.recordCompute(this.key')) {
  throw new Error('Per-chart data plane must record compute samples under the same key');
}
if (!provider.includes('recordVelaRenderUpdate(performanceKey')) {
  throw new Error('Vela bar submission must record its renderer-frame opportunity');
}
if (!vela.includes('symbol: cell.chart.market.symbol, timeframe: cell.chart.market.timeframe')) {
  throw new Error('Vela performance samples must identify symbol and timeframe');
}
if (!workspace.includes('tcoVelaPerformanceKey(brokerId, sample.symbol, sample.timeframe)')) {
  throw new Error('Live workspace must join Vela renderer statistics to canonical active chart keys');
}
if (!workspace.includes('pipeline: [...activePipelineKeys].map(key => chartPerformanceTelemetry.snapshot(key))')) {
  throw new Error('Live workspace pipeline must exclude unrelated stale/profiler telemetry keys');
}
if (workspace.includes('chartPerformanceTelemetry.keys().map(key => chartPerformanceTelemetry.snapshot(key))')) {
  throw new Error('Live workspace must not publish every historical telemetry key as current live data');
}
if (!verifier.includes('lastMarketUpdateAgeMs') || !verifier.includes('maxMarketUpdateAgeMs')) {
  throw new Error('Browser performance verification must reject stale market streams');
}
if (!verifier.includes('if (perf.pipeline.length < 1)')) {
  throw new Error('Browser performance verification must require at least one active pipeline sample');
}

console.log('TCO Vela end-to-end performance telemetry contract: OK');

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const ring = read('src/services/marketData/TickRingBuffer.ts');
const marketStore = read('src/services/marketData/chartMarketStore.ts');
const rates = read('src/services/core/chart/realtimeRateScheduler.ts');
const realtime = read('src/services/core/chart/controllers/ChartRealtimeController.ts');
const chartStore = read('src/services/core/chart/ChartStore.ts');
const provider = read('src/TcoVelaDataProvider.ts');
const liveChart = read('src/components/workspace/LiveChart.tsx');
const runtime = read('src/services/core/chart/ChartRuntimeController.ts');
const perf = read('src/services/marketData/chartPerformanceTelemetry.ts');

if (!/Float64Array/.test(ring) || !/Uint8Array/.test(ring)) throw new Error('TickRingBuffer must use typed scalar storage');
if (!/timestamp|price|quantity|bid|ask|flags/.test(ring)) throw new Error('TickRingBuffer hot fields are incomplete');
if (/Array<NormalizedMarketTick\s*\|\s*undefined>/.test(ring)) throw new Error('TickRingBuffer must not retain object ticks in its hot ring');
if (!/new TickRingBuffer/.test(marketStore) || !/getSequence/.test(marketStore) || !/forEachTickSince/.test(marketStore)) throw new Error('ChartMarketStore is missing typed ring-buffer sequence APIs');
if (!/requestAnimationFrame/.test(marketStore)) throw new Error('React market notifications must remain frame-coalesced');
if (!/pending/.test(rates) || !/intervalMs/.test(rates) || !/coalesced/.test(rates)) throw new Error('Compute-rate scheduler missing coalescing controls');
if (!/RealtimeRateScheduler/.test(realtime) || !/computeIntervalMs/.test(realtime)) throw new Error('ChartRealtimeController is missing an independent compute clock');
if (!/scheduleLatest\('realtime-bar'/.test(realtime)) throw new Error('Chart render updates must be latest-only and rAF scheduled');
if (/onIndicatorWorker\(data,bucketChanged\)/.test(realtime) && !/computeScheduler/.test(realtime)) throw new Error('Indicator work escaped the compute-rate scheduler');
if (!/private readonly hot/.test(chartStore) || !/Object\.freeze\(/.test(chartStore)) throw new Error('ChartStore must use mutable hot state plus immutable UI snapshots');
if (!/requestAnimationFrame/.test(provider)) throw new Error('Vela provider must have an rAF render gate');
if (!/let scheduled = false/.test(provider)) throw new Error('Vela provider render gate missing latest-update coalescing state');
if (!/<Profiler/.test(liveChart) || !/recordReactCommit/.test(liveChart)) throw new Error('LiveChart React commit telemetry missing');
if ((runtime.match(/onVisibleLogicalRangeChange|onChartClick|onPointerDown|resizeObserver/g) || []).length > 0) throw new Error('ChartRuntimeController must not own raw interaction handlers');
if (!/createChartInteractionController/.test(runtime)) throw new Error('ChartRuntimeController must delegate interaction lifecycle');
for (const field of ['tickToComputeP95Ms','tickToPatchP95Ms','tickToRenderP95Ms','reactCommitCountDuringTicks','fullSeriesRewriteCount','formingBarReplaceLastCount']) {
  if (!new RegExp(field).test(perf)) throw new Error(`Missing performance field: ${field}`);
}
if (/WebGPU|webgpu/i.test(rates)) throw new Error('Realtime rate scheduler must not introduce WebGPU compute');

console.log('TRADINGCORE_REALTIME_3_RATE_RING_BUFFER_CONTRACT_OK');

import { chartMarketKey, chartMarketStore } from '../../services/marketData/chartMarketStore';
import { chartPerformanceTelemetry } from '../../services/marketData/chartPerformanceTelemetry';

const key = chartMarketKey('fyers', 'NSE:NIFTY50-INDEX');
const tick = { ltp: 100, lastTradeTimestamp: Date.now() } as any;
let immediate = 0;
let reactFrames = 0;
const scheduled: Array<FrameRequestCallback> = [];
const previousRAF = (globalThis as any).requestAnimationFrame;
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => { scheduled.push(cb); return scheduled.length; };

const unsubscribe = chartMarketStore.subscribe(key, () => { immediate += 1; });
const unsubscribeReact = chartMarketStore.subscribeSnapshot(key, () => { reactFrames += 1; });
chartMarketStore.publish(key, tick);
chartMarketStore.publish(key, { ...tick, ltp: 101 });

if (immediate !== 2) throw new Error(`expected 2 immediate renderer notifications, got ${immediate}`);
let metrics = chartMarketStore.getPerformanceSnapshot(key);
if (metrics.packets !== 2) throw new Error(`expected 2 packets, got ${metrics.packets}`);
if (metrics.reactNotificationRequests !== 2) throw new Error(`expected 2 React notification requests, got ${metrics.reactNotificationRequests}`);
if (metrics.reactFrames !== 0) throw new Error(`expected no frame flush before RAF, got ${metrics.reactFrames}`);
if (metrics.coalescedReactNotifications !== 2) throw new Error(`expected 2 coalesced notifications before RAF, got ${metrics.coalescedReactNotifications}`);

scheduled.shift()?.(0);
if (reactFrames !== 1) throw new Error(`expected one React frame flush, got ${reactFrames}`);
metrics = chartMarketStore.getPerformanceSnapshot(key);
if (metrics.reactFrames !== 1 || metrics.coalescedReactNotifications !== 1) throw new Error('React coalescing accounting is inconsistent');

chartPerformanceTelemetry.recordRendererUpdate(key, 2.5);
chartPerformanceTelemetry.recordRendererUpdate(key, 7.5);
metrics = chartMarketStore.getPerformanceSnapshot(key);
if (metrics.rendererUpdates !== 2) throw new Error(`expected 2 renderer updates, got ${metrics.rendererUpdates}`);
if (metrics.averageRendererMs !== 5) throw new Error(`expected 5ms average renderer time, got ${metrics.averageRendererMs}`);
if (metrics.worstRendererMs !== 7.5) throw new Error(`expected 7.5ms worst renderer time, got ${metrics.worstRendererMs}`);
if (metrics.packetsPerRendererUpdate !== 1) throw new Error(`expected 1 packet/update ratio, got ${metrics.packetsPerRendererUpdate}`);

unsubscribe();
unsubscribeReact();
chartMarketStore.clear(key);
if (chartPerformanceTelemetry.snapshot(key).packets !== 0) throw new Error('chart clear should reset performance telemetry');
(globalThis as any).requestAnimationFrame = previousRAF;
console.log('STAGE85_CHART_PERFORMANCE_OK');

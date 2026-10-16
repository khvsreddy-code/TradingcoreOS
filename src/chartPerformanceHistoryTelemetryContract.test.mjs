import assert from 'node:assert/strict';

import { chartPerformanceTelemetry } from './services/marketData/chartPerformanceTelemetry.ts';

const key = 'contract:chart-performance';
chartPerformanceTelemetry.reset(key);
chartPerformanceTelemetry.recordPacket(key);
chartPerformanceTelemetry.recordCompute(key, 0.4, 1);
chartPerformanceTelemetry.recordStage(key, 'transport', 1.1);
chartPerformanceTelemetry.recordStage(key, 'normalization', 2.2);
chartPerformanceTelemetry.recordStage(key, 'ingestion', 3.3);
chartPerformanceTelemetry.recordStage(key, 'patch', 4.4);
chartPerformanceTelemetry.recordRendererUpdate(key, 5.5);
chartPerformanceTelemetry.ingestRendererSnapshot(key, {
  frames: 2, totalFrameMs: 18, worstFrameMs: 12, longFrames: 0,
  p95FrameMs: 11, fps: 60, backend: 'canvas2d',
});
chartPerformanceTelemetry.recordHistoryLoad(key, 'initial', 42, 500);
chartPerformanceTelemetry.recordHistoryLoad(key, 'older', 17, 250);
chartPerformanceTelemetry.recordFormingBarReplaceLast(key);
chartPerformanceTelemetry.recordIndicatorIncrementalUpdate(key);

const snapshot = chartPerformanceTelemetry.snapshot(key);

assert.equal(snapshot.stageMs.transport, 1.1);
assert.equal(snapshot.stageMs.normalization, 2.2);
assert.equal(snapshot.stageMs.ingestion, 3.3);
assert.equal(snapshot.stageMs.compute, 0.4);
assert.equal(snapshot.stageMs.patch, 4.4);
assert.equal(snapshot.stageMs.renderer, 5.5);
assert.equal(snapshot.stageMs.frame, 18);
assert.equal(snapshot.initialHistoryLoadMs, 42);
assert.equal(snapshot.initialHistoryCandles, 500);
assert.ok(Number.isFinite(snapshot.lastMarketUpdateAgeMs) && snapshot.lastMarketUpdateAgeMs >= 0 && snapshot.lastMarketUpdateAgeMs < 1000, 'latest market packet age should prove the live stream was recently active');
assert.equal(snapshot.olderHistoryLoadMs, 17);
assert.equal(snapshot.olderHistoryCandles, 250);
assert.equal(snapshot.historyPrependOps, 1);
assert.equal(snapshot.formingBarReplaceLastCount, 1);
assert.equal(snapshot.indicatorIncrementalUpdateCount, 1);

chartPerformanceTelemetry.reset(key);
console.log('CHART_PERFORMANCE_HISTORY_TELEMETRY_CONTRACT_OK');

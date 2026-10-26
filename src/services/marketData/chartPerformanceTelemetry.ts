import type { CandleMutationKind } from './chartCandleEvents';
import { marketLatencyTrace, type MarketLatencySample } from '../core/performance/marketLatencyTrace';

export type ChartPerformanceSnapshot = {
  key: string;
  packets: number;
  rendererUpdates: number;
  reactNotificationRequests: number;
  reactFrames: number;
  reactCommitCountDuringTicks: number;
  coalescedReactNotifications: number;
  totalRendererMs: number;
  averageRendererMs: number;
  worstRendererMs: number;
  packetsPerRendererUpdate: number;
  reactCoalescingRate: number;
  frames: number;
  totalFrameMs: number;
  averageFrameMs: number;
  worstFrameMs: number;
  p95FrameMs: number;
  fps: number;
  frameBudgetMs: number;
  frameBudgetMisses: number;
  frameBudgetMissRate: number;
  longFrames: number;
  backend: 'webgl2' | 'canvas2d' | 'unknown';
  marketUpdatesPerSec: number;
  lastMarketUpdateAgeMs: number;
  computeUpdatesPerSec: number;
  renderUpdatesPerSec: number;
  computeCoalescingRate: number;
  tickToComputeP95Ms: number;
  tickToPatchP95Ms: number;
  tickToRenderP95Ms: number;
  fullSeriesRewriteCount: number;
  formingBarReplaceLastCount: number;
  indicatorIncrementalUpdateCount: number;
  initialHistoryLoadMs: number;
  olderHistoryLoadMs: number;
  initialHistoryCandles: number;
  olderHistoryCandles: number;
  historyPrependOps: number;
  candleChanges: number;
  staleHistoryResponses: number;
  incrementalInvalidations: number;
  fullReplayInvalidations: number;
  invalidationMs: number;
  estimatedHistoryBytes: number;
  computeCoalescedTicks: number;
  stageMs: Readonly<{ transport:number; normalization:number; ingestion:number; compute:number; patch:number; renderer:number; frame:number }>;
  /** Bounded sampled stages sharing a dataset timeline key and revision. */
  latencyTrace: readonly MarketLatencySample[];
};

type MutableMetrics = {
  packets: number;
  rendererUpdates: number;
  reactNotificationRequests: number;
  reactFrames: number;
  reactCommitCountDuringTicks: number;
  totalRendererMs: number;
  worstRendererMs: number;
  frames: number;
  totalFrameMs: number;
  worstFrameMs: number;
  p95FrameMs: number;
  fps: number;
  frameBudgetMs: number;
  frameBudgetMisses: number;
  frameBudgetMissRate: number;
  longFrames: number;
  backend: 'webgl2' | 'canvas2d' | 'unknown';
  firstPacketAt: number;
  lastPacketAt: number;
  computeUpdates: number;
  renderUpdates: number;
  computeCoalescedTicks: number;
  packetsAtLastCompute: number;
  tickToComputeSamples: Float64Array;
  tickToPatchSamples: Float64Array;
  tickToRenderSamples: Float64Array;
  tickToComputeCount: number;
  tickToPatchCount: number;
  tickToRenderCount: number;
  tickToComputeCursor: number;
  tickToPatchCursor: number;
  tickToRenderCursor: number;
  lastPacketAtForLatency: number;
  fullSeriesRewriteCount: number;
  formingBarReplaceLastCount: number;
  indicatorIncrementalUpdateCount: number;
  initialHistoryLoadMs: number;
  olderHistoryLoadMs: number;
  initialHistoryCandles: number;
  olderHistoryCandles: number;
  historyPrependOps: number;
  candleChanges: number;
  staleHistoryResponses: number;
  incrementalInvalidations: number;
  fullReplayInvalidations: number;
  invalidationMs: number;
  estimatedHistoryBytes: number;
  stageMs: { transport:number; normalization:number; ingestion:number; compute:number; patch:number; renderer:number; frame:number };
};

const SAMPLE_CAPACITY = 256;
const LATENCY_TRACE_SAMPLES_PER_KEY = 64;
const LATENCY_TRACE_MAX_KEYS = 32;

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function sampleP95(samples: Float64Array, count: number, cursor: number): number {
  const size = Math.min(count, samples.length);
  if (!size) return 0;
  const values = new Array<number>(size);
  const start = count < samples.length ? 0 : cursor;
  for (let i = 0; i < size; i += 1) values[i] = samples[(start + i) % samples.length]!;
  values.sort((a, b) => a - b);
  return values[Math.min(size - 1, Math.max(0, Math.ceil(size * 0.95) - 1))]!;
}

class ChartPerformanceTelemetry {
  private readonly metrics = new Map<string, MutableMetrics>();
  private readonly latencyTraceByKey = new Map<string, MarketLatencySample[]>();

  recordLatencyTraceSample(sample: MarketLatencySample): void {
    const key = String(sample.timelineKey || '').trim();
    if (!key) return;
    let samples = this.latencyTraceByKey.get(key);
    if (!samples) samples = [];
    samples.push(sample);
    if (samples.length > LATENCY_TRACE_SAMPLES_PER_KEY) samples.splice(0, samples.length - LATENCY_TRACE_SAMPLES_PER_KEY);
    this.latencyTraceByKey.delete(key);
    this.latencyTraceByKey.set(key, samples);
    while (this.latencyTraceByKey.size > LATENCY_TRACE_MAX_KEYS) {
      const oldest = this.latencyTraceByKey.keys().next().value;
      if (oldest == null) break;
      this.latencyTraceByKey.delete(oldest);
    }
  }

  private latencyTraceSnapshot(key: string): readonly MarketLatencySample[] {
    return Object.freeze((this.latencyTraceByKey.get(String(key || '').trim()) || []).slice());
  }

  private entry(key: string): MutableMetrics {
    let value = this.metrics.get(key);
    if (!value) {
      value = {
        packets: 0, rendererUpdates: 0, reactNotificationRequests: 0, reactFrames: 0, reactCommitCountDuringTicks: 0,
        totalRendererMs: 0, worstRendererMs: 0, frames: 0, totalFrameMs: 0, worstFrameMs: 0, p95FrameMs: 0, fps: 0,
        frameBudgetMs: 1000 / 60, frameBudgetMisses: 0, frameBudgetMissRate: 0, longFrames: 0, backend: 'unknown',
        firstPacketAt: 0, lastPacketAt: 0, computeUpdates: 0, renderUpdates: 0, computeCoalescedTicks: 0, packetsAtLastCompute: 0,
        tickToComputeSamples: new Float64Array(SAMPLE_CAPACITY),
        tickToPatchSamples: new Float64Array(SAMPLE_CAPACITY),
        tickToRenderSamples: new Float64Array(SAMPLE_CAPACITY),
        tickToComputeCount: 0, tickToPatchCount: 0, tickToRenderCount: 0,
        tickToComputeCursor: 0, tickToPatchCursor: 0, tickToRenderCursor: 0,
        lastPacketAtForLatency: 0, fullSeriesRewriteCount: 0, formingBarReplaceLastCount: 0, indicatorIncrementalUpdateCount: 0, initialHistoryLoadMs: 0, olderHistoryLoadMs: 0, initialHistoryCandles: 0, olderHistoryCandles: 0, historyPrependOps: 0,
        candleChanges: 0, staleHistoryResponses: 0, incrementalInvalidations: 0, fullReplayInvalidations: 0, invalidationMs: 0, estimatedHistoryBytes: 0,
        stageMs: { transport:0, normalization:0, ingestion:0, compute:0, patch:0, renderer:0, frame:0 },
      };
      this.metrics.set(key, value);
    }
    return value;
  }

  recordPacket(key: string): void {
    const m = this.entry(key);
    const at = now();
    m.packets += 1;
    if (!m.firstPacketAt) m.firstPacketAt = at;
    m.lastPacketAt = at;
    m.lastPacketAtForLatency = at;
  }

  getLastPacketAt(key: string): number { return this.entry(key).lastPacketAtForLatency; }

  recordCompute(key: string, durationMs = 0, inputSequence?: number): void {
    const m = this.entry(key);
    const at = now();
    const batchSize = Math.max(1, m.packets - m.packetsAtLastCompute);
    m.computeCoalescedTicks += Math.max(0, batchSize - 1);
    m.packetsAtLastCompute = m.packets;
    m.computeUpdates += 1;
    this.recordSample(m.tickToComputeSamples, m, 'tickToComputeCount', 'tickToComputeCursor', Math.max(0, at - m.lastPacketAtForLatency));
    this.recordStage(key, 'compute', durationMs);
    void inputSequence;
  }

  recordRenderUpdate(key: string, tickToPatchMs: number, tickToRenderMs: number, rendererDurationMs: number): void {
    const m = this.entry(key);
    m.renderUpdates += 1;
    this.recordSample(m.tickToPatchSamples, m, 'tickToPatchCount', 'tickToPatchCursor', Math.max(0, tickToPatchMs));
    this.recordSample(m.tickToRenderSamples, m, 'tickToRenderCount', 'tickToRenderCursor', Math.max(0, tickToRenderMs));
    this.recordRendererUpdate(key, rendererDurationMs);
  }

  recordReactCommit(key: string): void {
    const m=this.entry(key);
    const at=now();
    if(m.packets>0 && at-m.lastPacketAt<1000) m.reactCommitCountDuringTicks += 1;
  }

  recordFullSeriesRewrite(key: string): void {
    this.entry(key).fullSeriesRewriteCount += 1;
  }

  recordFormingBarReplaceLast(key: string): void {
    this.entry(key).formingBarReplaceLastCount += 1;
  }

  recordIndicatorIncrementalUpdate(key: string): void {
    this.entry(key).indicatorIncrementalUpdateCount += 1;
  }

  recordHistoryLoad(key: string, kind: 'initial' | 'older', durationMs: number, candles: number): void {
    const m = this.entry(key);
    const duration = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    const count = Math.max(0, Math.floor(Number(candles) || 0));
    if (kind === 'initial') {
      m.initialHistoryLoadMs = duration;
      m.initialHistoryCandles = count;
    } else {
      m.olderHistoryLoadMs = Math.max(m.olderHistoryLoadMs, duration);
      m.olderHistoryCandles += count;
      m.historyPrependOps += 1;
    }
  }

  recordCandleChange(key: string, kind: CandleMutationKind, durationMs = 0): void {
    const m = this.entry(key);
    m.candleChanges += 1;
    if (kind === 'append' || kind === 'replace') m.incrementalInvalidations += 1;
    else m.fullReplayInvalidations += 1;
    m.invalidationMs += Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  }

  recordStaleResponse(key: string): void { this.entry(key).staleHistoryResponses += 1; }

  recordCacheMemory(key: string, estimatedBytes: number): void {
    this.entry(key).estimatedHistoryBytes = Math.max(0, Math.floor(Number(estimatedBytes) || 0));
  }

  private recordSample(
    samples: Float64Array,
    metrics: MutableMetrics,
    countKey: 'tickToComputeCount'|'tickToPatchCount'|'tickToRenderCount',
    cursorKey: 'tickToComputeCursor'|'tickToPatchCursor'|'tickToRenderCursor',
    value: number,
  ): void {
    const cursor = metrics[cursorKey];
    samples[cursor] = value;
    metrics[cursorKey] = (cursor + 1) % samples.length;
    metrics[countKey] = Math.min(metrics[countKey] + 1, samples.length);
  }

  recordReactNotificationRequest(key: string): void { this.entry(key).reactNotificationRequests += 1; }
  recordReactFrame(key: string): void { this.entry(key).reactFrames += 1; }
  recordStage(key: string, stage: 'transport'|'normalization'|'ingestion'|'compute'|'patch'|'renderer'|'frame', durationMs: number): void {
    const duration = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    this.entry(key).stageMs[stage] += duration;
  }

  recordRendererUpdate(key: string, durationMs: number): void {
    const m = this.entry(key);
    const duration = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    m.rendererUpdates += 1;
    m.totalRendererMs += duration;
    m.stageMs.renderer += duration;
    m.worstRendererMs = Math.max(m.worstRendererMs, duration);
  }

  ingestRendererSnapshot(key: string, snapshot: {
    frames: number;
    totalFrameMs: number;
    worstFrameMs: number;
    longFrames: number;
    averageFrameMs?: number;
    lastFrameMs?: number;
    lastFrameAt?: number;
    p95FrameMs?: number;
    fps?: number;
    frameBudgetMs?: number;
    frameBudgetMisses?: number;
    frameBudgetMissRate?: number;
    backend: 'webgl2' | 'canvas2d' | 'unknown';
  }): void {
    const m = this.entry(key);
    m.frames = Math.max(0, Number(snapshot.frames) || 0);
    const nextTotalFrameMs = Math.max(0, Number(snapshot.totalFrameMs) || 0);
    // Renderer snapshots are cumulative; add only the new observed frame time.
    m.stageMs.frame += Math.max(0, nextTotalFrameMs - m.totalFrameMs);
    m.totalFrameMs = nextTotalFrameMs;
    m.worstFrameMs = Math.max(0, Number(snapshot.worstFrameMs) || 0);
    m.p95FrameMs = Math.max(0, Number(snapshot.p95FrameMs) || 0);
    m.fps = Math.max(0, Number(snapshot.fps) || 0);
    m.frameBudgetMs = Math.max(0, Number(snapshot.frameBudgetMs) || (1000 / 60));
    m.frameBudgetMisses = Math.max(0, Number(snapshot.frameBudgetMisses) || 0);
    m.frameBudgetMissRate = Math.max(0, Number(snapshot.frameBudgetMissRate) || 0);
    m.longFrames = Math.max(0, Number(snapshot.longFrames) || 0);
    m.backend = snapshot.backend;
  }

  snapshot(key: string): ChartPerformanceSnapshot {
    const m = this.metrics.get(key) || {
      packets:0, rendererUpdates:0, reactNotificationRequests:0, reactFrames:0, reactCommitCountDuringTicks:0,
      totalRendererMs:0, worstRendererMs:0, frames:0, totalFrameMs:0, worstFrameMs:0, p95FrameMs:0, fps:0,
      frameBudgetMs:1000/60, frameBudgetMisses:0, frameBudgetMissRate:0, longFrames:0, backend:'unknown' as const,
      firstPacketAt:0, lastPacketAt:0, computeUpdates:0, renderUpdates:0, computeCoalescedTicks:0, packetsAtLastCompute:0,
      tickToComputeSamples:new Float64Array(SAMPLE_CAPACITY), tickToPatchSamples:new Float64Array(SAMPLE_CAPACITY), tickToRenderSamples:new Float64Array(SAMPLE_CAPACITY),
      tickToComputeCount:0, tickToPatchCount:0, tickToRenderCount:0, tickToComputeCursor:0, tickToPatchCursor:0, tickToRenderCursor:0, lastPacketAtForLatency:0,
      fullSeriesRewriteCount:0, formingBarReplaceLastCount:0, indicatorIncrementalUpdateCount:0, initialHistoryLoadMs:0, olderHistoryLoadMs:0, initialHistoryCandles:0, olderHistoryCandles:0, historyPrependOps:0, candleChanges:0, staleHistoryResponses:0, incrementalInvalidations:0, fullReplayInvalidations:0, invalidationMs:0, estimatedHistoryBytes:0, stageMs:{transport:0,normalization:0,ingestion:0,compute:0,patch:0,renderer:0,frame:0},
    };
    const coalesced = Math.max(0, m.reactNotificationRequests - m.reactFrames);
    const elapsedMs = m.firstPacketAt && m.lastPacketAt ? Math.max(1, m.lastPacketAt - m.firstPacketAt) : 0;
    const elapsedSeconds = elapsedMs / 1000;
    return {
      key,
      packets: m.packets,
      rendererUpdates: m.rendererUpdates,
      reactNotificationRequests: m.reactNotificationRequests,
      reactFrames: m.reactFrames,
      reactCommitCountDuringTicks: m.reactCommitCountDuringTicks,
      coalescedReactNotifications: coalesced,
      totalRendererMs: m.totalRendererMs,
      averageRendererMs: m.rendererUpdates ? m.totalRendererMs / m.rendererUpdates : 0,
      worstRendererMs: m.worstRendererMs,
      packetsPerRendererUpdate: m.rendererUpdates ? m.packets / m.rendererUpdates : 0,
      reactCoalescingRate: m.reactNotificationRequests ? coalesced / m.reactNotificationRequests : 0,
      frames: m.frames,
      totalFrameMs: m.totalFrameMs,
      averageFrameMs: m.frames ? m.totalFrameMs / m.frames : 0,
      worstFrameMs: m.worstFrameMs,
      p95FrameMs: m.p95FrameMs,
      fps: m.fps,
      frameBudgetMs: m.frameBudgetMs,
      frameBudgetMisses: m.frameBudgetMisses,
      frameBudgetMissRate: m.frameBudgetMissRate,
      longFrames: m.longFrames,
      backend: m.backend,
      marketUpdatesPerSec: elapsedSeconds > 0 ? m.packets / elapsedSeconds : 0,
      lastMarketUpdateAgeMs: m.lastPacketAt ? Math.max(0, now() - m.lastPacketAt) : Number.MAX_SAFE_INTEGER,
      computeUpdatesPerSec: elapsedSeconds > 0 ? m.computeUpdates / elapsedSeconds : 0,
      renderUpdatesPerSec: elapsedSeconds > 0 ? m.renderUpdates / elapsedSeconds : 0,
      computeCoalescingRate: m.packets ? m.computeCoalescedTicks / m.packets : 0,
      tickToComputeP95Ms: sampleP95(m.tickToComputeSamples, m.tickToComputeCount, m.tickToComputeCursor),
      tickToPatchP95Ms: sampleP95(m.tickToPatchSamples, m.tickToPatchCount, m.tickToPatchCursor),
      tickToRenderP95Ms: sampleP95(m.tickToRenderSamples, m.tickToRenderCount, m.tickToRenderCursor),
      fullSeriesRewriteCount: m.fullSeriesRewriteCount,
      formingBarReplaceLastCount: m.formingBarReplaceLastCount,
      indicatorIncrementalUpdateCount: m.indicatorIncrementalUpdateCount,
      initialHistoryLoadMs: m.initialHistoryLoadMs,
      olderHistoryLoadMs: m.olderHistoryLoadMs,
      initialHistoryCandles: m.initialHistoryCandles,
      olderHistoryCandles: m.olderHistoryCandles,
      historyPrependOps: m.historyPrependOps,
      candleChanges: m.candleChanges,
      staleHistoryResponses: m.staleHistoryResponses,
      incrementalInvalidations: m.incrementalInvalidations,
      fullReplayInvalidations: m.fullReplayInvalidations,
      invalidationMs: m.invalidationMs,
      estimatedHistoryBytes: m.estimatedHistoryBytes,
      computeCoalescedTicks: m.computeCoalescedTicks,
      stageMs: Object.freeze({ ...m.stageMs }),
      latencyTrace: this.latencyTraceSnapshot(key),
    };
  }

  keys(): readonly string[] { return Object.freeze([...this.metrics.keys()]); }

  reset(key?: string): void {
    if (key == null) {
      this.metrics.clear();
      this.latencyTraceByKey.clear();
    } else {
      this.metrics.delete(key);
      this.latencyTraceByKey.delete(key);
    }
  }
}

export const chartPerformanceTelemetry = new ChartPerformanceTelemetry();
marketLatencyTrace.setSink(sample => chartPerformanceTelemetry.recordLatencyTraceSample(sample));

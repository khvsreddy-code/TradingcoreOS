#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const urls = (process.env.TCO_BROWSER_URLS || process.env.TCO_BROWSER_URL || 'http://localhost:5173/live').split(',').map((value) => value.trim()).filter(Boolean);
const expectedCellsList = (process.env.TCO_EXPECTED_CELLS || '1').split(',').map((value) => Math.max(1, Number(value) || 1));
const requireAuth = process.env.TCO_REQUIRE_AUTH === 'true';
const authMarker = String(process.env.TCO_AUTH_MARKER || 'TradingCoreOS').trim();
const maxP95FrameMs = Number(process.env.TCO_MAX_P95_FRAME_MS || 25);
const maxRenderRateHz = Number(process.env.TCO_MAX_RENDER_RATE_HZ || 150);
const maxComputeRateHz = Number(process.env.TCO_MAX_COMPUTE_RATE_HZ || 60);
const settleMs = Math.max(0, Math.min(60000, Number(process.env.TCO_BROWSER_SETTLE_MS || 5000)));
const maxTickToComputeP95Ms = Number(process.env.TCO_MAX_TICK_TO_COMPUTE_P95_MS || 20);
const maxTickToPatchP95Ms = Number(process.env.TCO_MAX_TICK_TO_PATCH_P95_MS || 25);
const maxTickToRenderP95Ms = Number(process.env.TCO_MAX_TICK_TO_RENDER_P95_MS || 25);
const maxMarketUpdateAgeMs = Number(process.env.TCO_MAX_MARKET_UPDATE_AGE_MS || 2000);
const maxTelemetryAgeMs = Math.max(1000, Number(process.env.TCO_MAX_TELEMETRY_AGE_MS || 15000));
const maxLongTaskP95Ms = Number(process.env.TCO_MAX_LONG_TASK_P95_MS || 50);
const requireHeapMetrics = process.env.TCO_REQUIRE_HEAP_METRICS === 'true';
const failOnWebglContextLoss = process.env.TCO_FAIL_ON_WEBGL_CONTEXT_LOSS !== 'false';
const requireSharedMemory = process.env.TCO_REQUIRE_SHARED_MEMORY !== 'false';
const requiredPipelineFields = ['marketUpdatesPerSec','lastMarketUpdateAgeMs','computeUpdatesPerSec','renderUpdatesPerSec','tickToComputeP95Ms','tickToPatchP95Ms','tickToRenderP95Ms','reactCommitCountDuringTicks','fullSeriesRewriteCount','formingBarReplaceLastCount','indicatorIncrementalUpdateCount','initialHistoryLoadMs','initialHistoryCandles','historyPrependOps','olderHistoryLoadMs','olderHistoryCandles'];
const requiredStageMs = ['transport','normalization','ingestion','compute','patch','renderer','frame'];

function run(args) {
  const result = spawnSync('agent-browser', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(`agent-browser ${args.join(' ')} failed: ${result.stderr || result.stdout || 'unknown error'}`);
  }
  return String(result.stdout || '').trim();
}

try {
for (let caseIndex = 0; caseIndex < urls.length; caseIndex += 1) {
  const url = urls[caseIndex];
  const expectedCells = expectedCellsList[Math.min(caseIndex, expectedCellsList.length - 1)] || 1;
  run(['open', url]);
  run(['wait', '--load', 'networkidle']);
  if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));

  const content = run(['eval', 'document.body.innerText.trim().length > 0 ? "HAS_CONTENT" : "BLANK"']);
  if (content !== 'HAS_CONTENT') throw new Error(`Browser verification: blank page for ${url}`);
  if (requireAuth) {
    const authJson = run(['eval', `(() => { const body=document.body.innerText||''; const supaKeys=Object.keys(localStorage||{}).filter(k=>/supabase|auth/i.test(k)); const loginVisible=/sign\\s*in|log\\s*in|authentication required/i.test(body); return JSON.stringify({loginVisible,supaKeys,marker:body.includes(${JSON.stringify(authMarker)})}); })()`]);
    const authState = JSON.parse(authJson);
    if (authState.loginVisible || !authState.supaKeys.length) {
      throw new Error(`Browser verification: authenticated session not detected for ${url}; provide a logged-in browser context (auth marker: ${authMarker}).`);
    }
  }

  const overlay = run(['eval', 'document.querySelector("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay") ? "ERROR_OVERLAY" : "OK"']);
  if (overlay !== 'OK') throw new Error(`Browser verification: framework error overlay detected for ${url}`);

  const workspace = run(['eval', 'document.querySelector(".vela-workspace") ? "VELA_OK" : "VELA_MISSING"']);
  if (workspace !== 'VELA_OK') throw new Error(`Browser verification: Vela workspace not mounted for ${url}`);

  const perfJson = run(['eval', 'JSON.stringify(window.__TCO_PERF__ || null)']);
  const perf = JSON.parse(perfJson || 'null');
  if (!perf || !Array.isArray(perf.cells)) throw new Error(`Browser verification: __TCO_PERF__ missing for ${url}`);
  if (!Array.isArray(perf.pipeline)) throw new Error(`Browser verification: realtime pipeline telemetry missing for ${url}`);
  if (!perf.capturedAt) throw new Error(`Browser verification: telemetry capture timestamp missing for ${url}`);
  const capturedAtMs = typeof perf.capturedAt === 'number' ? perf.capturedAt : Date.parse(perf.capturedAt);
  if (!Number.isFinite(capturedAtMs)) throw new Error(`Browser verification: telemetry capture timestamp is invalid for ${url}`);
  const telemetryAgeMs = Date.now() - capturedAtMs;
  if (telemetryAgeMs < -5000 || telemetryAgeMs > maxTelemetryAgeMs) {
    throw new Error(`Browser verification: telemetry is stale or clock-skewed (${telemetryAgeMs.toFixed(0)}ms old; allowed 0-${maxTelemetryAgeMs}ms) for ${url}; cached samples cannot count as live-load evidence.`);
  }
  const runtime = perf.runtime;
  if (!runtime?.longTasks || !runtime?.memory || !runtime?.webgl) {
    throw new Error(`Browser verification: runtime health telemetry (long tasks, heap, WebGL context) missing for ${url}`);
  }
  for (const field of ['count', 'totalMs', 'worstMs', 'recentP95Ms']) {
    if (!Number.isFinite(Number(runtime.longTasks[field]))) {
      throw new Error(`Browser verification: invalid runtime long-task metric ${field} for ${url}`);
    }
  }
  if (!Number.isFinite(Number(runtime.webgl.contextLossCount)) ||
      !Number.isFinite(Number(runtime.webgl.contextRestoreCount))) {
    throw new Error(`Browser verification: invalid WebGL context-loss telemetry for ${url}`);
  }
  if (failOnWebglContextLoss && Number(runtime.webgl.contextLossCount) > 0) {
    throw new Error(`Browser verification: ${runtime.webgl.contextLossCount} WebGL context-loss event(s) detected for ${url}`);
  }
  if (requireHeapMetrics && !runtime.memory.available) {
    throw new Error(`Browser verification: JavaScript heap metrics unavailable for ${url}; run Chromium with performance.memory enabled.`);
  }
  if (runtime.memory.available) {
    if (!Number.isFinite(Number(runtime.memory.usedBytes)) ||
        !Number.isFinite(Number(runtime.memory.sampleCount))) {
      throw new Error(`Browser verification: invalid JavaScript heap sample for ${url}`);
    }
    if (Number(runtime.memory.sampleCount) > 1 &&
        !Number.isFinite(Number(runtime.memory.windowDeltaBytes))) {
      throw new Error(`Browser verification: heap growth window is invalid for ${url}`);
    }
  }
  if (Number(runtime.longTasks.recentP95Ms) > maxLongTaskP95Ms) {
    console.warn(`Browser performance warning: recent long-task p95 ${Number(runtime.longTasks.recentP95Ms).toFixed(2)}ms exceeds ${maxLongTaskP95Ms}ms for ${url}`);
  }
  if (perf.cells.length < expectedCells) throw new Error(`Browser verification: expected at least ${expectedCells} telemetry cell(s), got ${perf.cells.length}`);
  if (perf.pipeline.length < 1) throw new Error(`Browser verification: no active Vela chart data-plane telemetry for ${url}`);
  for (const cell of perf.cells) {
    if (!(Number(cell.frames) > 0)) throw new Error(`Browser verification: no rendered-frame samples for cell ${cell.cellId || 'unknown'}`);
    if (!['webgl2', 'canvas2d'].includes(String(cell.backend))) throw new Error(`Browser verification: renderer backend not identified for cell ${cell.cellId || 'unknown'}`);
    if (!Number.isFinite(Number(cell.p95FrameMs))) throw new Error(`Browser verification: invalid p95 frame sample for cell ${cell.cellId || 'unknown'}`);
  }
  if (requireSharedMemory && (!perf.sharedMemory?.crossOriginIsolated || !perf.sharedMemory?.sharedArrayBuffer)) throw new Error(`Browser verification: SharedArrayBuffer isolation unavailable for ${url}`);
  for (const sample of perf.pipeline) {
    for (const field of requiredPipelineFields) {
      if (!(field in sample)) throw new Error(`Browser verification: pipeline telemetry field missing: ${field}`);
      if (!Number.isFinite(Number(sample[field]))) throw new Error(`Browser verification: non-finite pipeline telemetry value: ${field}`);
    }
    if (!sample.stageMs || typeof sample.stageMs !== 'object') {
      throw new Error(`Browser verification: per-stage timing breakdown missing for ${sample.key || url}`);
    }
    for (const stage of requiredStageMs) {
      if (!(stage in sample.stageMs) || !Number.isFinite(Number(sample.stageMs[stage])) || Number(sample.stageMs[stage]) < 0) {
        throw new Error(`Browser verification: invalid stage timing ${stage} for ${sample.key || url}`);
      }
    }
    const marketRate = Number(sample.marketUpdatesPerSec) || 0;
    const lastMarketUpdateAgeMs = Number(sample.lastMarketUpdateAgeMs);
    const renderRate = Number(sample.renderUpdatesPerSec) || 0;
    const computeRate = Number(sample.computeUpdatesPerSec) || 0;
    const tickToComputeP95Ms = Number(sample.tickToComputeP95Ms) || 0;
    const tickToPatchP95Ms = Number(sample.tickToPatchP95Ms) || 0;
    const tickToRenderP95Ms = Number(sample.tickToRenderP95Ms) || 0;
    const initialHistoryCandles = Number(sample.initialHistoryCandles) || 0;
    if (marketRate <= 0 || computeRate <= 0 || renderRate <= 0) {
      throw new Error(`Browser verification: no sustained market → compute → render activity for ${sample.key || url}; this run did not prove performance under live load.`);
    }
    if (lastMarketUpdateAgeMs > maxMarketUpdateAgeMs) throw new Error(`Browser verification: market stream is stale (${lastMarketUpdateAgeMs.toFixed(0)}ms since last packet; limit ${maxMarketUpdateAgeMs}ms); live-load proof requires a currently active feed.`);
    if (tickToComputeP95Ms > maxTickToComputeP95Ms) throw new Error(`Browser verification: tick-to-compute p95 exceeded (${tickToComputeP95Ms.toFixed(2)}ms > ${maxTickToComputeP95Ms}ms)`);
    if (tickToPatchP95Ms > maxTickToPatchP95Ms) throw new Error(`Browser verification: tick-to-patch p95 exceeded (${tickToPatchP95Ms.toFixed(2)}ms > ${maxTickToPatchP95Ms}ms)`);
    if (tickToRenderP95Ms > maxTickToRenderP95Ms) throw new Error(`Browser verification: tick-to-render p95 exceeded (${tickToRenderP95Ms.toFixed(2)}ms > ${maxTickToRenderP95Ms}ms)`);
    if (initialHistoryCandles < 1 || initialHistoryCandles > 5000) throw new Error(`Browser verification: invalid initial history size (${initialHistoryCandles}); expected 1-5000 candles.`);
    if (renderRate > maxRenderRateHz) throw new Error(`Browser verification: render rate exceeded (${renderRate.toFixed(2)}Hz > ${maxRenderRateHz}Hz)`);
    if (computeRate > maxComputeRateHz) throw new Error(`Browser verification: compute rate exceeded (${computeRate.toFixed(2)}Hz > ${maxComputeRateHz}Hz)`);
  }
  const slowestP95 = Math.max(0, ...perf.cells.map((cell) => Number(cell.p95FrameMs) || 0));
  if (slowestP95 > maxP95FrameMs) throw new Error(`Browser verification: p95 frame budget exceeded (${slowestP95.toFixed(2)}ms > ${maxP95FrameMs}ms)`);

  console.log(JSON.stringify({
    ok: true,
    url,
    expectedCells,
    observedCells: perf.cells.length,
    capturedAt: perf.capturedAt,
    maxP95FrameMs,
    maxRenderRateHz,
    maxComputeRateHz,
    settleMs,
    maxTickToComputeP95Ms,
    maxTickToPatchP95Ms,
    maxTickToRenderP95Ms,
    maxMarketUpdateAgeMs,
    maxTelemetryAgeMs,
    maxLongTaskP95Ms,
    requireHeapMetrics,
    failOnWebglContextLoss,
    telemetryAgeMs,
    requireSharedMemory,
    requireAuth,
    sharedMemory: perf.sharedMemory,
    runtime: {
      longTasks: runtime.longTasks,
      memory: runtime.memory,
      webgl: runtime.webgl,
    },
    slowestP95,
    pipeline: perf.pipeline.map((sample) => ({
      key: sample.key,
      marketHz: sample.marketUpdatesPerSec,
      lastMarketUpdateAgeMs: sample.lastMarketUpdateAgeMs,
      computeHz: sample.computeUpdatesPerSec,
      renderHz: sample.renderUpdatesPerSec,
      computeCoalescingRate: sample.computeCoalescingRate,
      tickToComputeP95Ms: sample.tickToComputeP95Ms,
      tickToPatchP95Ms: sample.tickToPatchP95Ms,
      tickToRenderP95Ms: sample.tickToRenderP95Ms,
      reactCommitCountDuringTicks: sample.reactCommitCountDuringTicks,
      fullSeriesRewriteCount: sample.fullSeriesRewriteCount,
      formingBarReplaceLastCount: sample.formingBarReplaceLastCount,
      indicatorIncrementalUpdateCount: sample.indicatorIncrementalUpdateCount,
      initialHistoryLoadMs: sample.initialHistoryLoadMs,
      initialHistoryCandles: sample.initialHistoryCandles,
      historyPrependOps: sample.historyPrependOps,
      olderHistoryLoadMs: sample.olderHistoryLoadMs,
      olderHistoryCandles: sample.olderHistoryCandles,
      frameBudgetMissRate: sample.frameBudgetMissRate,
      stageMs: sample.stageMs,
    })),
    backends: perf.cells.map((cell) => ({ cellId: cell.cellId, backend: cell.backend, fps: cell.fps, p95FrameMs: cell.p95FrameMs, budgetMissRate: cell.frameBudgetMissRate })),
  }, null, 2));
}
} finally {
  try { run(['close']); } catch {}
}

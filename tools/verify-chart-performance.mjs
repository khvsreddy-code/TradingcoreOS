#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const urls = (process.env.TCO_BROWSER_URLS || process.env.TCO_BROWSER_URL || 'http://localhost:5173/live').split(',').map((value) => value.trim()).filter(Boolean);
const expectedCellsList = (process.env.TCO_EXPECTED_CELLS || '1').split(',').map((value) => Math.max(1, Number(value) || 1));
const maxP95FrameMs = Number(process.env.TCO_MAX_P95_FRAME_MS || 25);
const maxRenderRateHz = Number(process.env.TCO_MAX_RENDER_RATE_HZ || 150);
const maxComputeRateHz = Number(process.env.TCO_MAX_COMPUTE_RATE_HZ || 60);
const requiredPipelineFields = ['marketUpdatesPerSec','computeUpdatesPerSec','renderUpdatesPerSec','tickToComputeP95Ms','tickToPatchP95Ms','tickToRenderP95Ms','reactCommitCountDuringTicks','fullSeriesRewriteCount','formingBarReplaceLastCount'];

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

  const content = run(['eval', 'document.body.innerText.trim().length > 0 ? "HAS_CONTENT" : "BLANK"']);
  if (content !== 'HAS_CONTENT') throw new Error(`Browser verification: blank page for ${url}`);

  const overlay = run(['eval', 'document.querySelector("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay") ? "ERROR_OVERLAY" : "OK"']);
  if (overlay !== 'OK') throw new Error(`Browser verification: framework error overlay detected for ${url}`);

  const workspace = run(['eval', 'document.querySelector(".vela-workspace") ? "VELA_OK" : "VELA_MISSING"']);
  if (workspace !== 'VELA_OK') throw new Error(`Browser verification: Vela workspace not mounted for ${url}`);

  const perfJson = run(['eval', 'JSON.stringify(window.__TCO_PERF__ || null)']);
  const perf = JSON.parse(perfJson || 'null');
  if (!perf || !Array.isArray(perf.cells)) throw new Error(`Browser verification: __TCO_PERF__ missing for ${url}`);
  if (!Array.isArray(perf.pipeline)) throw new Error(`Browser verification: realtime pipeline telemetry missing for ${url}`);
  for (const sample of perf.pipeline) {
    for (const field of requiredPipelineFields) {
      if (!(field in sample)) throw new Error(`Browser verification: pipeline telemetry field missing: ${field}`);
    }
    const renderRate = Number(sample.renderUpdatesPerSec) || 0;
    const computeRate = Number(sample.computeUpdatesPerSec) || 0;
    if (renderRate > maxRenderRateHz) throw new Error(`Browser verification: render rate exceeded (${renderRate.toFixed(2)}Hz > ${maxRenderRateHz}Hz)`);
    if (computeRate > maxComputeRateHz) throw new Error(`Browser verification: compute rate exceeded (${computeRate.toFixed(2)}Hz > ${maxComputeRateHz}Hz)`);
  }
  if (perf.cells.length < expectedCells) throw new Error(`Browser verification: expected at least ${expectedCells} telemetry cell(s), got ${perf.cells.length}`);
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
    slowestP95,
    pipeline: perf.pipeline.map((sample) => ({
      key: sample.key,
      marketHz: sample.marketUpdatesPerSec,
      computeHz: sample.computeUpdatesPerSec,
      renderHz: sample.renderUpdatesPerSec,
      computeCoalescingRate: sample.computeCoalescingRate,
      tickToComputeP95Ms: sample.tickToComputeP95Ms,
      tickToPatchP95Ms: sample.tickToPatchP95Ms,
      tickToRenderP95Ms: sample.tickToRenderP95Ms,
      reactCommitCountDuringTicks: sample.reactCommitCountDuringTicks,
      fullSeriesRewriteCount: sample.fullSeriesRewriteCount,
      formingBarReplaceLastCount: sample.formingBarReplaceLastCount,
      frameBudgetMissRate: sample.frameBudgetMissRate,
    })),
    backends: perf.cells.map((cell) => ({ cellId: cell.cellId, backend: cell.backend, fps: cell.fps, p95FrameMs: cell.p95FrameMs, budgetMissRate: cell.frameBudgetMissRate })),
  }, null, 2));
}
} finally {
  try { run(['close']); } catch {}
}

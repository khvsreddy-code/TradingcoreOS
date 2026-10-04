#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const url = process.env.TCO_BROWSER_URL || 'http://localhost:5173/live';
const expectedCells = Number(process.env.TCO_EXPECTED_CELLS || 1);

function run(args) {
  const result = spawnSync('agent-browser', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(`agent-browser ${args.join(' ')} failed: ${result.stderr || result.stdout || 'unknown error'}`);
  }
  return String(result.stdout || '').trim();
}

try {
  run(['open', url]);
  run(['wait', '--load', 'networkidle']);

  const content = run(['eval', 'document.body.innerText.trim().length > 0 ? "HAS_CONTENT" : "BLANK"']);
  if (content !== 'HAS_CONTENT') throw new Error('Browser verification: blank page');

  const overlay = run(['eval', 'document.querySelector("[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay") ? "ERROR_OVERLAY" : "OK"']);
  if (overlay !== 'OK') throw new Error('Browser verification: framework error overlay detected');

  const workspace = run(['eval', 'document.querySelector(".vela-workspace") ? "VELA_OK" : "VELA_MISSING"']);
  if (workspace !== 'VELA_OK') throw new Error('Browser verification: Vela workspace not mounted');

  const perfJson = run(['eval', 'JSON.stringify(window.__TCO_PERF__ || null)']);
  const perf = JSON.parse(perfJson || 'null');
  if (!perf || !Array.isArray(perf.cells)) throw new Error('Browser verification: __TCO_PERF__ missing');
  if (perf.cells.length < expectedCells) {
    throw new Error(`Browser verification: expected at least ${expectedCells} telemetry cell(s), got ${perf.cells.length}`);
  }

  console.log(JSON.stringify({
    ok: true,
    url,
    expectedCells,
    observedCells: perf.cells.length,
    capturedAt: perf.capturedAt,
    backends: perf.cells.map((cell) => ({ cellId: cell.cellId, backend: cell.backend })),
  }, null, 2));
} finally {
  try { run(['close']); } catch {}
}

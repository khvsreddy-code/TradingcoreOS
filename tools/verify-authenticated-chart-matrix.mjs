#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const baseUrl = String(process.env.TCO_E2E_BASE_URL || '').trim();
const layouts = (process.env.TCO_E2E_LAYOUTS || '1,4,8').split(',').map((x) => x.trim()).filter(Boolean);
const outDir = String(process.env.TCO_E2E_OUTPUT_DIR || 'artifacts/tco-chart-matrix').trim();
const stateFile = String(process.env.TCO_E2E_STATE_FILE || '').trim();

if (!baseUrl) throw new Error('TCO_E2E_BASE_URL is required.');
if (!layouts.length) throw new Error('TCO_E2E_LAYOUTS must contain at least one layout.');

fs.mkdirSync(outDir, { recursive: true });

function run(args) {
  const globalArgs = stateFile ? ['--state', stateFile] : [];
  const result = spawnSync('agent-browser', [...globalArgs, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`agent-browser ${args.join(' ')} failed: ${result.stderr || result.stdout || 'unknown error'}`);
  }
  return String(result.stdout || '').trim();
}

function wait(ms) {
  run(['wait', String(ms)]);
}

function evalJson(expression) {
  const raw = run(['eval', expression]);
  return JSON.parse(raw);
}

try {
  run(['open', baseUrl]);
  run(['wait', '--load', 'networkidle']);
  wait(1500);

  const bootstrap = evalJson(`(() => {
    const body = document.body.innerText || '';
    const loginVisible = /sign\\s*in|log\\s*in|authentication required/i.test(body);
    const supaKeys = Object.keys(localStorage || {}).filter((key) => /supabase|auth/i.test(key));
    const vela = Boolean(globalThis.__TCO_VELA__);
    const workspace = Boolean(document.querySelector('.vela-workspace'));
    return { loginVisible, supabaseKeys: supaKeys.length, vela, workspace };
  })()`);

  if (bootstrap.loginVisible || bootstrap.supabaseKeys === 0) {
    throw new Error('Authenticated chart evidence requires a valid authenticated browser state.');
  }
  if (!bootstrap.vela || !bootstrap.workspace) {
    throw new Error('Vela workspace was not mounted during authenticated evidence bootstrap.');
  }

  const evidence = [];
  for (const layout of layouts) {
    const applied = run(['eval', `(() => {
      const api = globalThis.__TCO_VELA__;
      if (!api?.setLayout) return "NO_VELA_TEST_API";
      api.setLayout(${JSON.stringify(layout)});
      return "LAYOUT_SET";
    })()`]);
    if (applied !== 'LAYOUT_SET') throw new Error(`Could not set Vela layout ${layout}`);

    wait(3000);

    const content = run(['eval', 'document.body.innerText.trim().length > 0 ? "HAS_CONTENT" : "BLANK"']);
    if (content !== 'HAS_CONTENT') throw new Error(`Blank Vela workspace in layout ${layout}`);

    const errors = run(['eval', 'JSON.stringify({velaErrors: window.__TCO_VELA_ERRORS__ || []})']);
    const errorState = JSON.parse(errors);
    if (errorState.velaErrors?.length) throw new Error(`Vela runtime errors in layout ${layout}: ${JSON.stringify(errorState.velaErrors)}`);

    const perf = evalJson('JSON.stringify({capturedAt: Date.now(), cells: globalThis.__TCO_VELA__?.getPerformanceStats?.() || [], pipeline: globalThis.__TCO_PERF__?.pipeline || [], sharedMemory: globalThis.__TCO_PERF__?.sharedMemory || null})');
    const health = evalJson('globalThis.__TCO_VELA__?.getCellHealth ? JSON.stringify(await globalThis.__TCO_VELA__.getCellHealth()) : "[]"');

    const expectedCells = layout === '8' ? 8 : layout === '4' ? 4 : 1;
    if (!Array.isArray(perf.cells) || perf.cells.length < expectedCells) {
      throw new Error(`Layout ${layout}: expected at least ${expectedCells} Vela telemetry cells, observed ${perf.cells?.length || 0}`);
    }
    if (!Array.isArray(health) || health.length < expectedCells) {
      throw new Error(`Layout ${layout}: expected at least ${expectedCells} Vela chart-health cells, observed ${health?.length || 0}`);
    }
    for (const cell of health) {
      if (!cell?.symbol || !cell?.timeframe) throw new Error(`Layout ${layout}: cell identity is missing.`);
      if (Number(cell?.totals?.series || 0) < 1 && Number(cell?.totals?.indicators || 0) < 1) {
        throw new Error(`Layout ${layout}: ${cell.id} has no rendered scene series/indicators.`);
      }
    }
    if (perf.sharedMemory && (!perf.sharedMemory.crossOriginIsolated || !perf.sharedMemory.sharedArrayBuffer)) {
      throw new Error(`Layout ${layout}: SharedArrayBuffer isolation is unavailable.`);
    }

    const screenshotPath = `${outDir}/layout-${layout}.png`;
    run(['screenshot', screenshotPath]);

    evidence.push({
      layout,
      expectedCells,
      observedCells: perf.cells.length,
      capturedAt: perf.capturedAt,
      sharedMemory: perf.sharedMemory,
      cells: perf.cells.map((cell) => ({
        cellId: cell.cellId,
        backend: cell.backend,
        fps: cell.fps,
        p95FrameMs: cell.p95FrameMs,
        frameBudgetMissRate: cell.frameBudgetMissRate,
      })),
      pipeline: perf.pipeline,
      chartHealth: health,
      screenshot: screenshotPath,
    });
  }

  const result = {
    ok: true,
    baseUrl,
    authenticated: true,
    layouts,
    generatedAt: new Date().toISOString(),
    evidence,
  };

  fs.writeFileSync(`${outDir}/evidence.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  try { run(['close']); } catch {}
}

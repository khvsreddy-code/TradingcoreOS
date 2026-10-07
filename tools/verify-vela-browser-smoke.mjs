#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const url = String(process.env.TCO_VELA_SMOKE_URL || 'http://localhost:3000/__smoke/vela').trim();
const timeoutMs = Math.max(5_000, Number(process.env.TCO_VELA_SMOKE_TIMEOUT_MS || 30_000));

function run(args) {
  const result = spawnSync('agent-browser', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(`agent-browser ${args.join(' ')} failed: ${result.stderr || result.stdout || 'unknown error'}`);
  }
  return String(result.stdout || '').trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

try {
  run(['open', url]);
  run(['wait', '--load', 'domcontentloaded']);
  run(['wait', '[data-tco-vela-smoke]']);

  const started = Date.now();
  let state = null;
  while (Date.now() - started < timeoutMs) {
    const raw = run(['eval', 'JSON.stringify(window.__TCO_VELA_SMOKE__ || null)']);
    state = raw ? JSON.parse(raw) : null;
    if (state?.phase === 'failed') {
      throw new Error(`Vela browser smoke failed: ${state.error || 'unknown chart error'}`);
    }
    if (state?.phase === 'indicator-ready') break;
    await sleep(250);
  }

  if (!state || state.phase !== 'indicator-ready') {
    throw new Error(`Vela browser smoke timed out after ${timeoutMs}ms; state=${JSON.stringify(state)}`);
  }
  if (Number(state.bars) < 300) throw new Error(`Vela browser smoke loaded too few bars: ${state.bars}`);
  if (Number(state.canvasCount) < 1) throw new Error('Vela browser smoke mounted no canvas renderer');
  if (state.historyComplete !== true) throw new Error('Vela browser smoke did not reach historyComplete');
  if (!state.nativeIndicator) throw new Error('Vela browser smoke did not mount a native indicator');

  const domState = JSON.parse(run(['eval', 'JSON.stringify({phase:document.querySelector("[data-tco-vela-smoke]")?.dataset.tcoVelaSmoke || null,error:document.querySelector("[data-tco-vela-smoke-error]")?.getAttribute("data-tco-vela-smoke-error") || null})']));
  if (domState.phase !== 'indicator-ready') throw new Error(`Vela browser smoke DOM state mismatch: ${JSON.stringify(domState)}`);
  if (domState.error) throw new Error(`Vela browser smoke DOM error: ${domState.error}`);

  console.log(JSON.stringify({
    ok: true,
    url,
    phase: state.phase,
    bars: state.bars,
    canvasCount: state.canvasCount,
    historyComplete: state.historyComplete,
    nativeIndicator: state.nativeIndicator,
  }, null, 2));
} catch (error) {
  try { console.error('[vela-smoke] url=' + run(['get', 'url'])); } catch {}
  try { console.error('[vela-smoke] title=' + run(['get', 'title'])); } catch {}
  try { console.error('[vela-smoke] errors=' + run(['errors', '--json'])); } catch {}
  try { console.error('[vela-smoke] console=' + run(['console', '--json'])); } catch {}
  throw error;
} finally {
  try { run(['close']); } catch {}
}

#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const baseUrl = (process.env.TCO_BROWSER_URL || 'http://localhost:5173/live').trim();
const requireAuth = process.env.TCO_REQUIRE_AUTH === 'true';
const timeoutMs = Math.max(10_000, Math.min(90_000, Number(process.env.TCO_SMC_BROWSER_TIMEOUT_MS || 38_000)));
const sourceFile = await readFile(new URL('../src/services/coreSpirit/luxAlgoSmcCoreSource.ts', import.meta.url), 'utf8');
const match = sourceFile.match(/export const CORESPIRIT_LUXALGO_SMC_SOURCE = \x60([\s\S]*?)\x60;\s*$/);
if (!match) throw new Error('Could not load the bundled SMC acceptance source from luxAlgoSmcCoreSource.ts.');
const smcSource = match[1];

function run(args) {
  const result = spawnSync('agent-browser', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`agent-browser ${args.join(' ')} failed: ${result.stderr || result.stdout || 'unknown error'}`);
  }
  return String(result.stdout || '').trim();
}
function evaluate(expression) {
  return run(['eval', expression]);
}
function evaluateJson(expression) {
  const raw = evaluate(`JSON.stringify((${expression}))`);
  try { return JSON.parse(raw); }
  catch { throw new Error('Browser eval did not return valid JSON: ' + raw.slice(0, 500)); }
}
function pause(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  run(['open', baseUrl]);
  run(['wait', '--load', 'networkidle']);

  const hasContent = evaluate('document.body.innerText.trim().length > 0');
  assert(hasContent === 'true' || hasContent === 'HAS_CONTENT', `Browser acceptance opened a blank page at ${baseUrl}.`);
  const initial = evaluateJson(`({
    workspace: !!document.querySelector('.vela-workspace'),
    errorOverlay: !!document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay'),
    loginVisible: /sign\\s*in|log\\s*in|authentication required/i.test(document.body.innerText || ''),
    supabaseKeys: Object.keys(localStorage || {}).filter(key => /supabase|auth/i.test(key)).length
  })`);
  assert(!initial.errorOverlay, `Framework error overlay detected at ${baseUrl}.`);
  assert(initial.workspace, `Vela workspace did not mount at ${baseUrl}.`);
  if (requireAuth) assert(!initial.loginVisible && initial.supabaseKeys > 0,
    'Authenticated SMC browser acceptance requested, but no authenticated Supabase session was detected.');

  // Put the known bundled source into the editor's existing persisted draft,
  // then reload so editor bootstrap and active-chart integration follow the
  // same path used by a normal user session.
  evaluate(`(() => {
    const source = ${JSON.stringify(smcSource)};
    localStorage.setItem('tradingcore:corespirit:v1:editor', source);
    localStorage.setItem('tradingcore:corespirit:editor', source);
    localStorage.setItem('tradingcore:corespirit:chart-source', source);
    localStorage.setItem('tradingcore:corespirit:editor-name', 'Smart Money Concepts [CoreSpirit]');
    localStorage.setItem('tradingcore:corespirit:editor-category', 'CoreSpirit Indicators');
    location.reload();
    return 'RELOADING_SMC_SOURCE';
  })()`);
  run(['wait', '--load', 'networkidle']);

  const dockState = evaluateJson(`(() => {
    let editor = document.querySelector('textarea[aria-label="CoreSpirit source editor"]');
    if (!editor) {
      const toggle = document.querySelector('[aria-label="Toggle CoreSpirit coding terminal"]');
      if (toggle) toggle.click();
      editor = document.querySelector('textarea[aria-label="CoreSpirit source editor"]');
    }
    return {
      editorVisible: !!editor,
      sourceLoaded: !!editor && editor.value.includes('indicator("Smart Money Concepts [CoreSpirit]")') && editor.value.includes('showFairValueGaps'),
      hasCompileButton: Array.from(document.querySelectorAll('button')).some(button => (button.innerText || '').includes('Compile & Run')),
      chartCanvases: Array.from(document.querySelectorAll('.vela-workspace canvas')).filter(canvas => {
        const rect = canvas.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length
    };
  })()`);
  assert(dockState.editorVisible, 'CoreSpirit terminal is not visible or its source editor did not mount.');
  assert(dockState.sourceLoaded, 'CoreSpirit terminal did not load the canonical bundled SMC source.');
  assert(dockState.hasCompileButton, 'Compile & Run is missing from the mounted CoreSpirit terminal.');

  evaluate(`(() => {
    window.__TCO_SMC_VISUAL_COMMITS__ = [];
    window.addEventListener('tco:corespirit:visual-commit', event => {
      window.__TCO_SMC_VISUAL_COMMITS__.push(event.detail || {});
      if (window.__TCO_SMC_VISUAL_COMMITS__.length > 50) window.__TCO_SMC_VISUAL_COMMITS__.shift();
    });
    return 'SMC_VISUAL_COMMIT_LISTENER_ARMED';
  })()`);
  evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find(item => (item.innerText || '').includes('Compile & Run'));
    if (!button || button.disabled) throw new Error('Compile & Run is missing or disabled.');
    button.click();
    return 'SMC_COMPILE_RUN_CLICKED';
  })()`);

  const deadline = Date.now() + timeoutMs;
  let last = null;
  let status = 'waiting';
  while (Date.now() < deadline) {
    last = evaluateJson(`({
      success: (document.body.innerText || '').includes('is now running on the active Vela chart'),
      body: (document.body.innerText || '').slice(-1600),
      commits: window.__TCO_SMC_VISUAL_COMMITS__ || [],
      canvases: Array.from(document.querySelectorAll('.vela-workspace canvas')).filter(canvas => {
        const rect = canvas.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length,
      errorOverlay: !!document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')
    })`);
    if (last.errorOverlay) throw new Error('Framework error overlay appeared during SMC compile/run.');
    const commit = last.commits.find(item => Number(item.objectCount) > 0 &&
      Object.keys(item.kindCounts || {}).some(kind => ['line','zone','box','label','marker','shape','polyline','polygon','hline'].includes(kind)));
    if (last.success && commit && last.canvases > 0) {
      status = 'accepted';
      console.log(JSON.stringify({
        status,
        url: baseUrl,
        acceptance: 'compile-and-run + committed visible native Vela drawing objects + visible chart canvas',
        revision: { streamId: commit.streamId, datasetRevision: commit.datasetRevision, outputRevision: commit.outputRevision },
        objectCount: commit.objectCount,
        kindCounts: commit.kindCounts,
        paneCount: commit.paneCount,
        visibleChartCanvases: last.canvases,
      }, null, 2));
      break;
    }
    await pause(500);
  }
  if (status !== 'accepted') {
    const excerpt = String(last?.body || '').slice(-1200);
    throw new Error(`SMC browser acceptance timed out after ${timeoutMs} ms. Compile success: ${Boolean(last?.success)}; visible canvas count: ${last?.canvases ?? 0}; visual commits: ${last?.commits?.length ?? 0}. Last page text: ${excerpt}`);
  }
  console.log('CORESPIRIT_SMC_BROWSER_ACCEPTANCE_OK');
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}

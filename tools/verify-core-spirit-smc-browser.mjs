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
async function waitForPageContent(timeout = 20_000) {
  // Waiting for network-idle can hang on live market-data sockets and polling.
  // DOM readiness plus a bounded content poll is deterministic for this route.
  run(['wait', '--load', 'domcontentloaded']);
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = evaluateJson(`({
      hasText: (document.body?.innerText || '').trim().length > 0,
      workspace: !!document.querySelector('.vela-workspace'),
      loginVisible: /sign\\s*in|log\\s*in|authentication required/i.test(document.body?.innerText || ''),
      errorOverlay: !!document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')
    })`);
    if (state.errorOverlay || state.workspace || state.loginVisible) return state;
    await pause(200);
  }
  throw new Error(`No page content became available at ${baseUrl} within ${timeout} ms.`);
}

try {
  run(['open', baseUrl]);
  await waitForPageContent();
  const initial = evaluateJson(`({
    workspace: !!document.querySelector('.vela-workspace'),
    errorOverlay: !!document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay'),
    loginVisible: /sign\\s*in|log\\s*in|authentication required/i.test(document.body.innerText || ''),
    supabaseKeys: Object.keys(localStorage || {}).filter(key => /supabase|auth/i.test(key)).length
  })`);
  assert(!initial.errorOverlay, `Framework error overlay detected at ${baseUrl}.`);
  if (requireAuth) assert(!initial.loginVisible && initial.supabaseKeys > 0,
    'Authenticated SMC browser acceptance requested, but no authenticated Supabase session was detected.');
  assert(initial.workspace, `Vela workspace did not mount at ${baseUrl}.`);

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
    return 'SMC_SOURCE_STAGED';
  })()`);
  run(['open', baseUrl]);
  await waitForPageContent();

  let dockState = null;
  const dockDeadline = Date.now() + 8_000;
  while (Date.now() < dockDeadline) {
    dockState = evaluateJson(`(() => {
      let editor = document.querySelector('textarea[aria-label="CoreSpirit source editor"]');
      const toggle = document.querySelector('[aria-label="Toggle CoreSpirit coding terminal"]');
      if (!editor && toggle && window.__TCO_SMC_DOCK_TOGGLE_CLICKED__ !== true) {
        toggle.click();
        window.__TCO_SMC_DOCK_TOGGLE_CLICKED__ = true;
      }
      editor = document.querySelector('textarea[aria-label="CoreSpirit source editor"]');
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
    if (dockState.editorVisible && dockState.hasCompileButton) break;
    await pause(200);
  }
  assert(dockState?.editorVisible, 'CoreSpirit terminal is not visible or its source editor did not mount.');
  assert(dockState.sourceLoaded, 'CoreSpirit terminal did not load the canonical bundled SMC source.');
  assert(dockState.hasCompileButton, 'Compile & Run is missing from the mounted CoreSpirit terminal.');

  evaluate(`(() => {
    window.__TCO_SMC_VISUAL_COMMITS__ = [];
    window.__TCO_SMC_VISUAL_PAINTS__ = [];
    window.__TCO_CORESPIRIT_VISUAL_ACCEPTANCE__ = false;
    window.__TCO_CORESPIRIT_VISUAL_ACCEPTANCE_LAST_PROBE__ = 0;
    window.addEventListener('tco:corespirit:visual-commit', event => {
      const detail = event.detail || {};
      window.__TCO_SMC_VISUAL_COMMITS__.push(detail);
      const hasDrawingKind = Object.keys(detail.kindCounts || {}).some(kind =>
        ['line','zone','box','label','marker','shape','polyline','polygon','hline'].includes(kind));
      if (Number(detail.objectCount) > 0 && hasDrawingKind) {
        window.__TCO_CORESPIRIT_VISUAL_ACCEPTANCE__ = true;
      }
      if (window.__TCO_SMC_VISUAL_COMMITS__.length > 50) window.__TCO_SMC_VISUAL_COMMITS__.shift();
    });
    window.addEventListener('tco:corespirit:visual-paint', event => {
      window.__TCO_SMC_VISUAL_PAINTS__.push(event.detail || {});
      if (window.__TCO_SMC_VISUAL_PAINTS__.length > 20) window.__TCO_SMC_VISUAL_PAINTS__.shift();
    });
    return 'SMC_VISUAL_COMMIT_AND_PAINT_LISTENERS_ARMED';
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
      paints: window.__TCO_SMC_VISUAL_PAINTS__ || [],
      canvases: Array.from(document.querySelectorAll('.vela-workspace canvas')).filter(canvas => {
        const rect = canvas.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length,
      errorOverlay: !!document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')
    })`);
    if (last.errorOverlay) throw new Error('Framework error overlay appeared during SMC compile/run.');
    const commit = last.commits.find(item => Number(item.objectCount) > 0 &&
      Object.keys(item.kindCounts || {}).some(kind => ['line','zone','box','label','marker','shape','polyline','polygon','hline'].includes(kind)));
    const paint = last.paints.find(item => Number(item.nonTransparentPixels) > 0 && Number(item.visualObjectCount) > 0);
    if (last.success && commit && paint && last.canvases > 0) {
      const persisted = evaluateJson(`({
        versionedDraft: localStorage.getItem('tradingcore:corespirit:v1:editor') === ${JSON.stringify(smcSource)},
        legacyDraft: localStorage.getItem('tradingcore:corespirit:editor') === ${JSON.stringify(smcSource)},
        chartDraft: localStorage.getItem('tradingcore:corespirit:chart-source') === ${JSON.stringify(smcSource)}
      })`);
      assert(persisted.versionedDraft && persisted.legacyDraft && persisted.chartDraft,
        'Successful Compile & Run did not persist the SMC source into all compatibility draft keys.');
      // Exercise both viewport gestures before accepting the chart overlay.
      // The probe is re-armed for one paint so the test verifies the overlay
      // still paints after Vela applies new time/price transforms.
      const canvasCenter = evaluateJson(`(() => {
        const boxes = Array.from(document.querySelectorAll('.vela-workspace canvas')).map(canvas => {
          const rect = canvas.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
        }).filter(box => box.width > 80 && box.height > 80).sort((a, b) => b.width * b.height - a.width * a.height);
        return boxes[0] || null;
      })()`);
      assert(canvasCenter, 'Cannot exercise Vela viewport: no usable chart canvas was found.');
      const paintCountBeforeViewportGestures = last.paints.length;
      run(['mouse', 'move', String(Math.round(canvasCenter.x)), String(Math.round(canvasCenter.y))]);
      run(['mouse', 'wheel', '-120', '0']);
      run(['mouse', 'move', String(Math.round(canvasCenter.x)), String(Math.round(canvasCenter.y))]);
      run(['mouse', 'down', 'left']);
      run(['mouse', 'move', String(Math.round(canvasCenter.x - 54)), String(Math.round(canvasCenter.y)), '--duration', '180', '--steps', '8']);
      run(['mouse', 'up', 'left']);
      evaluate(`(() => {
        window.__TCO_CORESPIRIT_VISUAL_ACCEPTANCE__ = true;
        window.__TCO_CORESPIRIT_VISUAL_ACCEPTANCE_LAST_PROBE__ = 0;
        return 'SMC_VIEWPORT_PAINT_PROBE_REARMED';
      })()`);
      let viewportPaint = null;
      const viewportDeadline = Date.now() + 8_000;
      while (Date.now() < viewportDeadline) {
        const viewportState = evaluateJson(`({
          paints: window.__TCO_SMC_VISUAL_PAINTS__ || [],
          canvases: Array.from(document.querySelectorAll('.vela-workspace canvas')).filter(canvas => {
            const rect = canvas.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }).length,
          errorOverlay: !!document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')
        })`);
        if (viewportState.errorOverlay) throw new Error('Framework error overlay appeared after Vela zoom/pan gestures.');
        viewportPaint = viewportState.paints.slice(paintCountBeforeViewportGestures)
          .find(item => Number(item.nonTransparentPixels) > 0 && Number(item.visualObjectCount) > 0) || null;
        if (viewportPaint && viewportState.canvases > 0) break;
        await pause(200);
      }
      assert(viewportPaint, 'CoreSpirit drawings stopped producing visible pixels after Vela zoom/pan gestures.');
      const viewportInteraction = {
        zoomWheelDelta: -120,
        horizontalPanPixels: 54,
        rendererPaintAfterGesture: {
          nonTransparentPixels: viewportPaint.nonTransparentPixels,
          paneId: viewportPaint.paneId,
          layerRole: viewportPaint.layerRole,
        },
      };
      const visualEvidence = {
        url: baseUrl,
        acceptance: 'compile-and-run + committed visible native Vela drawing objects + visible chart canvas',
        revision: { streamId: commit.streamId, datasetRevision: commit.datasetRevision, outputRevision: commit.outputRevision },
        objectCount: commit.objectCount,
        kindCounts: commit.kindCounts,
        paneCount: commit.paneCount,
        visibleChartCanvases: last.canvases,
        persistedDraftKeys: Object.keys(persisted).filter(key => persisted[key]),
        rendererPaint: {
          nonTransparentPixels: paint.nonTransparentPixels,
          canvasWidth: paint.canvasWidth,
          canvasHeight: paint.canvasHeight,
          paneId: paint.paneId,
          layerRole: paint.layerRole,
          visualObjectCount: paint.visualObjectCount,
        },
        viewportInteraction,
      };
      // Reload after the successful chart commit and confirm that the source
      // saved by the real Compile & Run path is the source restored by the dock.
      run(['open', baseUrl]);
      await waitForPageContent();
      let restored = false;
      const restoreDeadline = Date.now() + 8_000;
      while (Date.now() < restoreDeadline) {
        const restoreState = evaluateJson(`(() => {
          const editor = document.querySelector('textarea[aria-label="CoreSpirit source editor"]');
          const toggle = document.querySelector('[aria-label="Toggle CoreSpirit coding terminal"]');
          if (!editor && toggle && window.__TCO_SMC_RESTORE_TOGGLE_CLICKED__ !== true) {
            toggle.click();
            window.__TCO_SMC_RESTORE_TOGGLE_CLICKED__ = true;
          }
          const restoredEditor = document.querySelector('textarea[aria-label="CoreSpirit source editor"]');
          return {
            sourceMatches: !!restoredEditor && restoredEditor.value === ${JSON.stringify(smcSource)},
            workspace: !!document.querySelector('.vela-workspace'),
            errorOverlay: !!document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')
          };
        })()`);
        if (restoreState.errorOverlay) throw new Error('Framework error overlay appeared while restoring the SMC source draft.');
        if (restoreState.sourceMatches && restoreState.workspace) { restored = true; break; }
        await pause(200);
      }
      assert(restored, 'The SMC source saved by Compile & Run did not restore exactly after page reload.');
      status = 'accepted';
      console.log(JSON.stringify({ status, ...visualEvidence, sourceDraftRestoredAfterReload: true }, null, 2));
      break;
    }
    await pause(500);
  }
  if (status !== 'accepted') {
    const excerpt = String(last?.body || '').slice(-1200);
    throw new Error(`SMC browser acceptance timed out after ${timeoutMs} ms. Compile success: ${Boolean(last?.success)}; visible canvas count: ${last?.canvases ?? 0}; visual commits: ${last?.commits?.length ?? 0}; pixel paint evidence: ${last?.paints?.length ?? 0}. Last page text: ${excerpt}`);
  }
  console.log('CORESPIRIT_SMC_BROWSER_ACCEPTANCE_OK');
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}

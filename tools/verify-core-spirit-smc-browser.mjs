#!/usr/bin/env node
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
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
function decodePng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) throw new Error('Screenshot is not a valid PNG.');
  let offset = 8, width = 0, height = 0, bitDepth = 0, colorType = -1, interlace = -1;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8, end = start + length;
    if (end + 4 > buffer.length) throw new Error('Truncated PNG chunk: ' + type);
    const data = buffer.subarray(start, end);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset = end + 4;
  }
  if (!width || !height) throw new Error('PNG screenshot has invalid dimensions.');
  if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw new Error('Unsupported screenshot PNG format: bitDepth=' + bitDepth + ', colorType=' + colorType + ', interlace=' + interlace);
  }
  const channels = colorType === 6 ? 4 : 3, stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  if (inflated.length !== height * (stride + 1)) throw new Error('PNG scanline payload length does not match dimensions.');
  const pixels = new Uint8Array(height * stride);
  let input = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[input++], row = y * stride, previous = row - stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[input++], left = x >= channels ? pixels[row + x - channels] : 0;
      const up = y > 0 ? pixels[previous + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[previous + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else if (filter !== 0) throw new Error('Unsupported PNG row filter: ' + filter);
      pixels[row + x] = (raw + predictor) & 255;
    }
  }
  return { width, height, channels, pixels };
}

function countChartPixelDiff(beforeBytes, afterBytes, beforeViewport, afterViewport, threshold = 24) {
  const before = decodePng(beforeBytes), after = decodePng(afterBytes);
  const a = beforeViewport.rect, b = afterViewport.rect;
  const left = Math.max(a.left, b.left, 0), top = Math.max(a.top, b.top, 0);
  const right = Math.min(a.left + a.width, b.left + b.width, beforeViewport.viewportWidth, afterViewport.viewportWidth);
  const bottom = Math.min(a.top + a.height, b.top + b.height, beforeViewport.viewportHeight, afterViewport.viewportHeight);
  if (!(right > left && bottom > top)) throw new Error('Before/after screenshot chart regions do not overlap.');
  const sx1 = before.width / beforeViewport.viewportWidth, sy1 = before.height / beforeViewport.viewportHeight;
  const sx2 = after.width / afterViewport.viewportWidth, sy2 = after.height / afterViewport.viewportHeight;
  let changedPixels = 0, comparedPixels = 0;
  const xStart = Math.max(0, Math.floor(left * sx1)), xEnd = Math.min(before.width, Math.ceil(right * sx1));
  const yStart = Math.max(0, Math.floor(top * sy1)), yEnd = Math.min(before.height, Math.ceil(bottom * sy1));
  for (let py = yStart; py < yEnd; py += 1) {
    const cssY = (py + 0.5) / sy1;
    if (cssY < top || cssY >= bottom) continue;
    const ay = Math.floor(cssY * sy2);
    if (ay < 0 || ay >= after.height) continue;
    for (let px = xStart; px < xEnd; px += 1) {
      const cssX = (px + 0.5) / sx1;
      if (cssX < left || cssX >= right) continue;
      const ax = Math.floor(cssX * sx2);
      if (ax < 0 || ax >= after.width) continue;
      const bi = (py * before.width + px) * before.channels, ai = (ay * after.width + ax) * after.channels;
      const delta = Math.max(Math.abs(before.pixels[bi] - after.pixels[ai]),
        Math.abs(before.pixels[bi + 1] - after.pixels[ai + 1]),
        Math.abs(before.pixels[bi + 2] - after.pixels[ai + 2]));
      comparedPixels += 1;
      if (delta > threshold) changedPixels += 1;
    }
  }
  const minimumChangedPixels = Math.max(80, Math.floor(comparedPixels * 0.0001));
  return { changedPixels, comparedPixels,
    changedRatio: Number((changedPixels / Math.max(1, comparedPixels)).toFixed(5)),
    threshold, minimumChangedPixels,
    regionCss: { left, top, width: right - left, height: bottom - top },
    passed: changedPixels >= minimumChangedPixels };
}

function getLargestChartCanvasRegion() {
  return evaluateJson(`(() => {
    const regions = Array.from(document.querySelectorAll('.vela-workspace canvas')).map(canvas => {
      const rect = canvas.getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, area: rect.width * rect.height };
    }).filter(rect => rect.width > 120 && rect.height > 120 && rect.left < window.innerWidth && rect.top < window.innerHeight);
    regions.sort((a, b) => b.area - a.area);
    if (!regions.length) return null;
    const rect = regions[0];
    return { viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } };
  })()`);
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

const screenshotPaths = [];
function takeScreenshot(name) {
  const path = join(tmpdir(), 'tco-smc-' + process.pid + '-' + name + '.png');
  run(['screenshot', path]);
  screenshotPaths.push(path);
  return path;
}
async function screenshotBytes(path) { return readFile(path); }
async function cleanScreenshots() { await Promise.all(screenshotPaths.map(path => unlink(path).catch(() => undefined))); }

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

  const beforeRegion = getLargestChartCanvasRegion();
  assert(beforeRegion, 'Cannot capture SMC visual baseline: no usable Vela chart canvas was found.');
  const beforeScreenshotPath = takeScreenshot('before');
  const beforeScreenshot = await screenshotBytes(beforeScreenshotPath);

  evaluate(`(() => {
    window.__TCO_SMC_VISUAL_COMMITS__ = [];
    window.addEventListener('tco:corespirit:visual-commit', event => {
      window.__TCO_SMC_VISUAL_COMMITS__.push(event.detail || {});
      if (window.__TCO_SMC_VISUAL_COMMITS__.length > 50) window.__TCO_SMC_VISUAL_COMMITS__.shift();
    });
    return 'SMC_NATIVE_SCENE_COMMIT_LISTENER_ARMED';
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
      // Capture Vela's actual chart output after the native drawing collections commit.
      await pause(350);
      const afterRegion = getLargestChartCanvasRegion();
      assert(afterRegion, 'Vela chart canvas disappeared after SMC compile/run.');
      const afterScreenshotPath = takeScreenshot('after-compile');
      const afterScreenshot = await screenshotBytes(afterScreenshotPath);
      const chartPixelDiff = countChartPixelDiff(beforeScreenshot, afterScreenshot, beforeRegion, afterRegion);
      assert(chartPixelDiff.passed,
        'SMC native objects committed but chart screenshot pixels did not change enough: ' +
        chartPixelDiff.changedPixels + '/' + chartPixelDiff.comparedPixels + '.');
      const persisted = evaluateJson(`({
        versionedDraft: localStorage.getItem('tradingcore:corespirit:v1:editor') === ${JSON.stringify(smcSource)},
        legacyDraft: localStorage.getItem('tradingcore:corespirit:editor') === ${JSON.stringify(smcSource)}
      })`);
      assert(persisted.versionedDraft && persisted.legacyDraft,
        'Successful Compile & Run did not persist the SMC source into the versioned and legacy editor-draft keys.');
      // A second real Compile & Run must replace the same retained scene, not append
      // a second set of drawing objects. Compare the native commit inventory, not just
      // the rendered pixels, so duplicate drawings cannot hide behind a successful smoke test.
      const commitsBeforeReplay = evaluateJson('(window.__TCO_SMC_VISUAL_COMMITS__ || []).length');
      evaluate(`(() => {
        const button = Array.from(document.querySelectorAll('button')).find(item => (item.innerText || '').includes('Compile & Run'));
        if (!button || button.disabled) throw new Error('Compile & Run is missing or disabled during idempotency check.');
        button.click();
        return 'SMC_RECOMPILE_CLICKED';
      })()`);
      let recompileCommit = null;
      const recompileDeadline = Date.now() + timeoutMs;
      while (Date.now() < recompileDeadline) {
        const replayState = evaluateJson(`({
          commits: window.__TCO_SMC_VISUAL_COMMITS__ || [],
          success: (document.body.innerText || '').includes('is now running on the active Vela chart'),
          errorOverlay: !!document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')
        })`);
        if (replayState.errorOverlay) throw new Error('Framework error overlay appeared during SMC recompilation.');
        const freshCommits = replayState.commits.slice(commitsBeforeReplay);
        recompileCommit = freshCommits.find(item => Number(item.objectCount) > 0 &&
          Object.keys(item.kindCounts || {}).some(kind => ['line','zone','box','label','marker','shape','polyline','polygon','hline'].includes(kind)));
        if (replayState.success && recompileCommit) break;
        await pause(250);
      }
      assert(recompileCommit, 'Repeated SMC Compile & Run did not commit a fresh native Vela scene.');
      assert.equal(recompileCommit.objectCount, commit.objectCount,
        'Recompiling identical SMC source/data must not increase the number of retained drawing objects.');
      assert.deepEqual(recompileCommit.kindCounts, commit.kindCounts,
        'Recompiling identical SMC source/data must preserve the native object-kind inventory.');
      if (recompileCommit.streamId === commit.streamId &&
          Number.isFinite(Number(recompileCommit.outputRevision)) &&
          Number.isFinite(Number(commit.outputRevision))) {
        assert(Number(recompileCommit.outputRevision) > Number(commit.outputRevision),
          'Same-stream SMC recompilation must advance its output revision.');
      }
      // Exercise both viewport gestures and compare the actual plot screenshot.
      const canvasCenter = evaluateJson(`(() => {
        const boxes = Array.from(document.querySelectorAll('.vela-workspace canvas')).map(canvas => {
          const rect = canvas.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
        }).filter(box => box.width > 80 && box.height > 80).sort((a, b) => b.width * b.height - a.width * a.height);
        return boxes[0] || null;
      })()`);
      assert(canvasCenter, 'Cannot exercise Vela viewport: no usable chart canvas was found.');
      run(['mouse', 'move', String(Math.round(canvasCenter.x)), String(Math.round(canvasCenter.y))]);
      run(['mouse', 'wheel', '-120', '0']);
      run(['mouse', 'move', String(Math.round(canvasCenter.x)), String(Math.round(canvasCenter.y))]);
      run(['mouse', 'down', 'left']);
      run(['mouse', 'move', String(Math.round(canvasCenter.x - 54)), String(Math.round(canvasCenter.y)), '--duration', '180', '--steps', '8']);
      run(['mouse', 'up', 'left']);
      await pause(250);
      const afterGestureRegion = getLargestChartCanvasRegion();
      assert(afterGestureRegion, 'Vela chart canvas disappeared after zoom/pan gestures.');
      const afterGesturePath = takeScreenshot('after-viewport');
      const afterGestureScreenshot = await screenshotBytes(afterGesturePath);
      const viewportPixelDiff = countChartPixelDiff(afterScreenshot, afterGestureScreenshot, afterRegion, afterGestureRegion);
      assert(viewportPixelDiff.passed,
        'Vela zoom/pan did not update the chart plot pixels: ' + viewportPixelDiff.changedPixels + '/' + viewportPixelDiff.comparedPixels + '.');
      const viewportInteraction = {
        zoomWheelDelta: -120,
        horizontalPanPixels: 54,
        changedPixels: viewportPixelDiff.changedPixels,
        comparedPixels: viewportPixelDiff.comparedPixels,
        changedRatio: viewportPixelDiff.changedRatio,
      };
      const visualEvidence = {
        url: baseUrl,
        acceptance: 'compile-and-run + native Vela drawing commit + chart plot screenshot diffs before/after compile and after zoom/pan',
        revision: { streamId: commit.streamId, datasetRevision: commit.datasetRevision, outputRevision: commit.outputRevision },
        objectCount: commit.objectCount,
        kindCounts: commit.kindCounts,
        paneCount: commit.paneCount,
        visibleChartCanvases: last.canvases,
        recompileObjectCount: recompileCommit.objectCount,
        recompileKindCounts: recompileCommit.kindCounts,
        recompileOutputIdempotent: true,
        persistedDraftKeys: Object.keys(persisted).filter(key => persisted[key]),
        chartPixelDiff: {
          changedPixels: chartPixelDiff.changedPixels,
          comparedPixels: chartPixelDiff.comparedPixels,
          changedRatio: chartPixelDiff.changedRatio,
          threshold: chartPixelDiff.threshold,
        },
        viewportPixelDiff: {
          changedPixels: viewportPixelDiff.changedPixels,
          comparedPixels: viewportPixelDiff.comparedPixels,
          changedRatio: viewportPixelDiff.changedRatio,
          threshold: viewportPixelDiff.threshold,
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
    throw new Error(`SMC browser acceptance timed out after ${timeoutMs} ms. Compile success: ${Boolean(last?.success)}; visible canvas count: ${last?.canvases ?? 0}; visual commits: ${last?.commits?.length ?? 0}. Last page text: ${excerpt}`);
  }
  console.log('CORESPIRIT_SMC_BROWSER_ACCEPTANCE_OK');
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  await cleanScreenshots();
}

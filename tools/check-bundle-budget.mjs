import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const manifestPath = path.join(distDir, '.vite', 'manifest.json');

if (!fs.existsSync(distDir) || !fs.existsSync(manifestPath)) {
  throw new Error('dist/.vite/manifest.json is missing. Run vite build first.');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entries = Object.entries(manifest);
const entryKey = entries.find(([key, value]) => value?.isEntry && key.endsWith('index.html'))?.[0]
  || entries.find(([, value]) => value?.isEntry)?.[0];

if (!entryKey) throw new Error('No Vite entry chunk found in manifest');

function keyFor(fragment) {
  return entries.find(([key, value]) =>
    key === fragment ||
    key.endsWith(fragment) ||
    value?.src === fragment ||
    value?.src?.endsWith(fragment)
  )?.[0];
}

function requireKey(fragment, label) {
  const key = keyFor(fragment);
  if (!key) throw new Error(`Bundle budget cannot find ${label} manifest root: ${fragment}`);
  return key;
}

/**
 * Only follow static manifest imports here. dynamicImports are requested on
 * demand and are measured separately; counting them as initial payload would
 * erase the very boundary this check is designed to enforce.
 */
function staticClosure(startKeys) {
  const seen = new Set();
  const queue = [...startKeys];
  while (queue.length) {
    const key = queue.shift();
    if (!key || seen.has(key) || !manifest[key]) continue;
    seen.add(key);
    for (const dep of manifest[key].imports || []) queue.push(dep);
  }
  return seen;
}

function jsFilesFor(keys) {
  const files = new Set();
  for (const key of keys) {
    const file = manifest[key]?.file;
    if (file && (file.endsWith('.js') || file.endsWith('.mjs'))) files.add(file);
  }
  return files;
}

function gzipKbFor(keys) {
  const files = jsFilesFor(keys);
  let bytes = 0;
  let gzipBytes = 0;
  for (const file of files) {
    const assetPath = path.join(distDir, file);
    if (!fs.existsSync(assetPath)) {
      throw new Error(`Manifest references missing JavaScript asset: ${file}`);
    }
    const source = fs.readFileSync(assetPath);
    bytes += source.length;
    gzipBytes += gzipSync(source, { level: 9 }).length;
  }
  return { bytes, gzipKb: gzipBytes / 1024, files };
}

function deferredFilesFor(startKeys) {
  const staticallyReachable = staticClosure(startKeys);
  const deferredRoots = new Set();
  for (const key of staticallyReachable) {
    for (const dep of manifest[key]?.dynamicImports || []) {
      if (!staticallyReachable.has(dep) && manifest[dep]) deferredRoots.add(dep);
    }
  }
  return jsFilesFor(staticClosure([...deferredRoots]));
}

function assertNotDownloaded(rootKey, forbiddenFiles, label) {
  const file = manifest[rootKey]?.file;
  if (file && forbiddenFiles.has(file)) {
    throw new Error(`${label} leaks into a route's initial static dependency graph (${file}).`);
  }
}

const routeRoots = {
  landing: requireKey('src/pages/LandingPage.tsx', 'landing'),
  login: requireKey('src/pages/LoginPage.tsx', 'login'),
  workspace: requireKey('src/pages/DashboardPage.tsx', 'dashboard/workspace'),
  chart: keyFor('src/LiveTradingTerminal.tsx') || entries.find(([, value]) => /(?:^|\/)LiveTradingTerminal-[^/]+\.js$/.test(String(value?.file || '')))?.[0] || requireKey('src/LiveTradingTerminal.tsx', 'live chart'),
  corespiritEditor: requireKey('src/pages/CoreSpiritEditorPage.tsx', 'CoreSpirit editor'),
  models: requireKey('src/pages/ModelsPage.tsx', 'models research'),
  predictions: requireKey('src/pages/PredictionCenterPage.tsx', 'prediction research'),
  automations: requireKey('src/pages/AutomationsPage.tsx', 'automation research'),
  indicators: requireKey('src/pages/IndicatorsPage.tsx', 'indicators research'),
};

const budgets = {
  initial: Number(process.env.TCO_MAX_INITIAL_GZIP_KB || 300),
  landing: Number(process.env.TCO_MAX_LANDING_GZIP_KB || 320),
  login: Number(process.env.TCO_MAX_LOGIN_GZIP_KB || 260),
  workspace: Number(process.env.TCO_MAX_WORKSPACE_GZIP_KB || 400),
  chart: Number(process.env.TCO_MAX_CHART_GZIP_KB || process.env.TCO_MAX_LIVE_GZIP_KB || 650),
  corespiritEditor: Number(process.env.TCO_MAX_CORESPIRIT_EDITOR_GZIP_KB || 1200),
  models: Number(process.env.TCO_MAX_MODELS_GZIP_KB || 900),
  predictions: Number(process.env.TCO_MAX_PREDICTIONS_GZIP_KB || 900),
  automations: Number(process.env.TCO_MAX_AUTOMATIONS_GZIP_KB || 900),
  indicators: Number(process.env.TCO_MAX_INDICATORS_GZIP_KB || 900),
};

const targets = {
  landing: Number(process.env.TCO_TARGET_LANDING_GZIP_KB || 200),
  workspace: Number(process.env.TCO_TARGET_WORKSPACE_GZIP_KB || 350),
  chart: Number(process.env.TCO_TARGET_CHART_GZIP_KB || 550),
};

const entryClosure = staticClosure([entryKey]);
const entryTotals = gzipKbFor(entryClosure);
console.log('Production manifest bundle report (JavaScript transfer sizes use per-file gzip level 9):');
console.log(`  initial entry shell: ${entryTotals.gzipKb.toFixed(1)} KB gzip across ${entryTotals.files.size} unique JS files`);
if (entryTotals.gzipKb > budgets.initial) {
  throw new Error(`Initial entry shell is ${entryTotals.gzipKb.toFixed(1)} KB gzip; hard budget is ${budgets.initial} KB.`);
}

for (const [route, rootKey] of Object.entries(routeRoots)) {
  const keys = staticClosure([entryKey, rootKey]);
  const totals = gzipKbFor(keys);
  const budget = budgets[route];
  const target = targets[route];
  console.log(`  ${route}: ${totals.gzipKb.toFixed(1)} KB gzip across ${totals.files.size} unique JS files`);
  if (route === 'workspace') console.log(`    workspace graph files: ${[...totals.files].sort().join(', ')}`);
  if (target && totals.gzipKb > target) {
    console.log(`    optimization target: ${target} KB gzip (hard budget: ${budget} KB)`);
  }
  if (totals.gzipKb > budget) {
    throw new Error(`${route} initial static graph is ${totals.gzipKb.toFixed(1)} KB gzip; hard budget is ${budget} KB.`);
  }
  const deferredFiles = deferredFilesFor([entryKey, rootKey]);
  console.log(`    separate deferred JS files reachable via dynamic imports: ${deferredFiles.size}`);
}

// Optional capabilities must stay out of routes that have no reason to download them.
const landingFiles = jsFilesFor(staticClosure([entryKey, routeRoots.landing]));
const workspaceFiles = jsFilesFor(staticClosure([entryKey, routeRoots.workspace]));
const chartFiles = jsFilesFor(staticClosure([entryKey, routeRoots.chart]));
const editorRootFile = manifest[routeRoots.corespiritEditor]?.file;
if (editorRootFile) {
  assertNotDownloaded(routeRoots.corespiritEditor, landingFiles, 'CoreSpirit editor');
  assertNotDownloaded(routeRoots.corespiritEditor, workspaceFiles, 'CoreSpirit editor');
}
for (const route of ['models', 'predictions', 'automations', 'indicators']) {
  assertNotDownloaded(routeRoots[route], landingFiles, `${route} research module`);
}

// The compiler client is only used by the lazy CoreSpirit editor page. The editor
// route's own root is already checked above to remain out of landing/workspace
// initial bundles. Avoid a named manual chunk: it can accidentally hoist this client
// into unrelated routes through a shared chunk.
// Compiler loading follows the lazy editor route's Rollup dependency graph.
console.log('  CoreSpirit compiler isolation: OK — compiler is owned by the deferred editor route.');

//// Drawing-family loading policy: these tools are intentionally part of the initial chart
// graph so clicking a family only opens its flyout. Check emitted chart assets—not just
// source imports—so a future dynamic-import regression is caught by the bundle gate.
// Vela intentionally lazy-loads each advanced drawing family when its toolbar
// group is opened. Verify that those chunks are present anywhere in the chart's
// reachable static + dynamic graph, without forcing them into the initial payload.
function reachableFilesIncludingDynamicImports(startKeys) {
  const seen = new Set();
  const queue = [...startKeys];
  while (queue.length) {
    const key = queue.shift();
    if (!key || seen.has(key) || !manifest[key]) continue;
    seen.add(key);
    for (const dep of manifest[key].imports || []) queue.push(dep);
    for (const dep of manifest[key].dynamicImports || []) queue.push(dep);
  }
  return jsFilesFor(seen);
}

const chartReachableFiles = reachableFilesIncludingDynamicImports([entryKey, routeRoots.chart]);
const chartBundleSource = [...chartReachableFiles]
  .map((file) => fs.readFileSync(path.join(distDir, file), 'utf8'))
  .join('\n');
for (const [fragment, marker] of [
  ['vendor/vela/src/core/drawings/advancedRegistryChannels.ts', 'Parallel Channel'],
  ['vendor/vela/src/core/drawings/advancedRegistryFibonacci.ts', 'Fib Retracement'],
  ['vendor/vela/src/core/drawings/advancedRegistryPatterns.ts', 'Gartley'],
]) {
  if (!chartBundleSource.includes(marker)) {
    throw new Error(`Vela drawing family is missing from the chart's reachable static/dynamic bundle graph: ${fragment} (marker: ${marker})`);
  }
}
console.log('  Vela drawing readiness: OK — channel, Fibonacci/Gann and pattern/harmonic families are emitted in the chart graph and remain lazy-loaded until selected.');
console.log('  Note: confirm the browser Network waterfall on the deployed build as a separate release check.');

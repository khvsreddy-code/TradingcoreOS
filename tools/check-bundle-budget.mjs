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
const entryKey = entries.find(([key, value]) => value?.isEntry && /index\.html$/.test(key))?.[0]
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

function closure(startKeys) {
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

function gzipKbFor(keys) {
  let bytes = 0;
  let gzipBytes = 0;
  for (const key of keys) {
    const file = manifest[key]?.file;
    if (!file) continue;
    const assetPath = path.join(distDir, file);
    if (!fs.existsSync(assetPath) || !/\.m?js$/.test(assetPath)) continue;
    const source = fs.readFileSync(assetPath);
    bytes += source.length;
    gzipBytes += gzipSync(source, { level: 9 }).length;
  }
  return { bytes, gzipKb: gzipBytes / 1024 };
}

const appClosure = closure([entryKey]);

const routeRoots = {
  landing: keyFor('src/pages/LandingPage.tsx'),
  login: keyFor('src/pages/LoginPage.tsx'),
  dashboard: keyFor('src/pages/DashboardPage.tsx'),
  live: keyFor('src/LiveTradingTerminal.tsx'),
};

const budgets = {
  landing: Number(process.env.TCO_MAX_LANDING_GZIP_KB || 320),
  login: Number(process.env.TCO_MAX_LOGIN_GZIP_KB || 260),
  dashboard: Number(process.env.TCO_MAX_DASHBOARD_GZIP_KB || 400),
  live: Number(process.env.TCO_MAX_LIVE_GZIP_KB || 650),
};

console.log('Initial route JavaScript budget report:');

for (const [route, rootKey] of Object.entries(routeRoots)) {
  if (!rootKey) {
    console.log(`  ${route}: route root not present in manifest`);
    continue;
  }
  const keys = closure([entryKey, rootKey]);
  const totals = gzipKbFor(keys);
  console.log(`  ${route}: ${totals.gzipKb.toFixed(1)} KB gzip across ${keys.size} chunks`);
  const budget = budgets[route];
  if (totals.gzipKb > budget) {
    throw new Error(`${route} initial JS is ${totals.gzipKb.toFixed(1)} KB gzip; budget is ${budget} KB.`);
  }
}

console.log(`Entry shell: ${gzipKbFor(appClosure).gzipKb.toFixed(1)} KB gzip across ${appClosure.size} chunks`);

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRealtimeRuntimePath, shouldBuildRealtime } from '../tools/ignore-realtime-build.mjs';

assert.equal(isRealtimeRuntimePath('src/TcoVelaDataProvider.ts'), false, 'Vela UI/data-provider changes must not rebuild the realtime container');
assert.equal(isRealtimeRuntimePath('src/services/coreSpirit/compiler.ts'), false, 'CoreSpirit-only changes must not consume a realtime image');
assert.equal(isRealtimeRuntimePath('src/server/routes/trading.routes.ts'), false, 'HTTP order route changes are not imported by the realtime process');
assert.equal(isRealtimeRuntimePath('src/server/fyers/symbols/FyersSymbolMasterService.ts'), false, 'Symbol-master search changes are not imported by the realtime process');
assert.equal(isRealtimeRuntimePath('src/server/marketData/FyersMarketDataTransport.ts'), true, 'Realtime data transport changes must rebuild');
assert.equal(isRealtimeRuntimePath('realtime-gateway/server.ts'), true, 'Realtime gateway entrypoint changes must rebuild');
assert.equal(isRealtimeRuntimePath('package-lock.json'), true, 'Dependency lock changes must rebuild');
assert.equal(isRealtimeRuntimePath('vercel.json'), false, 'Route-only Vercel config changes must not rebuild the realtime image');
assert.equal(shouldBuildRealtime(['src/TcoVelaDataProvider.ts', 'src/services/coreSpirit/compiler.ts']), false);
assert.equal(shouldBuildRealtime(['vercel.json']), false, 'Vercel rewrites are not a gateway runtime dependency by themselves');
assert.equal(shouldBuildRealtime(['src/TcoVelaDataProvider.ts', 'realtime-gateway/server.ts']), true);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tco-realtime-ignore-'));
const repoRoot = path.resolve(tmp);
const ignoreScript = path.resolve('tools/ignore-realtime-build.mjs');

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8' }).trim();
}

function write(relativePath, value) {
  const target = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function commit(message) {
  git(['add', '.']);
  git(['-c', 'user.name=TradingCore Contract', '-c', 'user.email=contract@example.invalid', 'commit', '-m', message]);
  return git(['rev-parse', 'HEAD']);
}

function runIgnore(previousSha, currentSha, extras = {}) {
  const result = spawnSync(process.execPath, [ignoreScript], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      VERCEL_GIT_PREVIOUS_SHA: previousSha,
      VERCEL_GIT_COMMIT_SHA: currentSha,
      ...extras,
    },
  });
  assert.equal(result.error, undefined, result.error?.message);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

try {
  git(['init', '-q']);
  write('package.json', '{"name":"fixture"}\n');
  write('realtime-gateway/server.ts', 'export const gatewayRevision = 1;\n');
  write('src/server/marketData/FyersMarketDataTransport.ts', 'export const transportRevision = 1;\n');
  write('src/server/routes/trading.routes.ts', 'export const routeRevision = 1;\n');
  write('src/TcoVelaDataProvider.ts', 'export const providerRevision = 1;\n');
  write('vercel.json', JSON.stringify({ services: { web: { framework: 'vite' }, realtimefresh: { root: '.', entrypoint: 'Dockerfile', runtime: 'container' } }, rewrites: [{ source: '/(.*)', destination: { service: 'web' } }] }, null, 2) + '\n');
  const base = commit('base');

  write('src/TcoVelaDataProvider.ts', 'export const providerRevision = 2;\n');
  const frontendOnly = commit('frontend only');
  assert.equal(runIgnore(base, frontendOnly).status, 0, 'unrelated frontend change must skip the realtime image');

  write('vercel.json', JSON.stringify({ services: { web: { framework: 'vite' }, realtimefresh: { root: '.', entrypoint: 'Dockerfile', runtime: 'container' } }, rewrites: [{ source: '/(.*)', destination: { service: 'web', path: '/index.html' } }] }, null, 2) + '\n');
  const spaRoutingOnly = commit('SPA route only');
  assert.equal(runIgnore(frontendOnly, spaRoutingOnly).status, 0, 'SPA routing-only config change must skip the realtime image');

  write('src/server/routes/trading.routes.ts', 'export const routeRevision = 2;\n');
  const httpRouteOnly = commit('HTTP route only');
  assert.equal(runIgnore(spaRoutingOnly, httpRouteOnly).status, 0, 'unrelated HTTP route change must skip the realtime image');

  write('src/server/marketData/FyersMarketDataTransport.ts', 'export const transportRevision = 2;\n');
  const runtimeChange = commit('realtime transport');
  const rebuilt = runIgnore(httpRouteOnly, runtimeChange);
  assert.equal(rebuilt.status, 1, 'realtime dependency change must allow a new image build');
  assert.match(rebuilt.stdout, /Realtime runtime dependency changes detected/);

  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
  config.services.realtimefresh.entrypoint = 'Dockerfile.gateway';
  write('vercel.json', JSON.stringify(config, null, 2) + '\n');
  const realtimeConfigChange = commit('realtime service config change');
  const configRebuilt = runIgnore(runtimeChange, realtimeConfigChange);
  assert.equal(configRebuilt.status, 1, 'realtime service config change must rebuild the image');
  assert.match(configRebuilt.stdout, /realtimefresh service configuration/);

  assert.equal(runIgnore('', runtimeChange).status, 1, 'missing previous SHA must fail open and build');
  assert.equal(runIgnore(httpRouteOnly, runtimeChange, { TCO_REALTIME_FORCE_BUILD: '1' }).status, 1, 'explicit force flag must build');

  console.log('REALTIME_SERVICE_BUILD_SKIP_CONTRACT_OK');
} finally {
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

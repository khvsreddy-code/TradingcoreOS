import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isRealtimeRuntimePath, shouldBuildRealtime } from '../tools/ignore-realtime-build.mjs';

const deploymentConfig = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.ok(deploymentConfig.services?.realtimegateway, 'the Vercel Services config must declare the fresh realtime gateway service');
assert.equal(deploymentConfig.services.realtimegateway.ignoreCommand, 'node tools/ignore-realtime-build.mjs', 'the gateway service must retain its per-service build-skip command');
assert.deepEqual(
  deploymentConfig.rewrites
    .filter((route) => ['/api/realtime/healthz', '/api/realtime/ws'].includes(route.source))
    .map((route) => [route.source, route.destination.service])
    .sort((a, b) => a[0].localeCompare(b[0])),
  [['/api/realtime/healthz', 'realtimegateway'], ['/api/realtime/ws', 'realtimegateway']],
  'public realtime endpoints must route to the renamed gateway service',
);

assert.equal(isRealtimeRuntimePath('src/TcoVelaDataProvider.ts'), false, 'Vela UI/data-provider changes must not rebuild the realtime container');
assert.equal(isRealtimeRuntimePath('src/services/coreSpirit/compiler.ts'), false, 'CoreSpirit-only changes must not consume a realtime image');
assert.equal(isRealtimeRuntimePath('src/server/routes/trading.routes.ts'), false, 'HTTP order route changes are not imported by the realtime process');
assert.equal(isRealtimeRuntimePath('src/server/fyers/symbols/FyersSymbolMasterService.ts'), false, 'Symbol-master search changes are not imported by the realtime process');
assert.equal(isRealtimeRuntimePath('src/server/trading/fyersOrderExecution.ts'), false, 'the HTTP order-execution service is not imported by the realtime gateway');
assert.equal(isRealtimeRuntimePath('src/server/storage/CoreSpiritArtifactRepository.ts'), false, 'CoreSpirit artifact storage changes must not rebuild the realtime gateway');
assert.equal(isRealtimeRuntimePath('src/server/fyers/trading/FyersOrderStreamTransport.ts'), true, 'the gateway order-stream dependency must rebuild');
assert.equal(isRealtimeRuntimePath('src/server/marketData/FyersMarketDataTransport.ts'), true, 'Realtime data transport changes must rebuild');
assert.equal(isRealtimeRuntimePath('package.json'), false, 'package.json is inspected selectively so frontend script changes do not rebuild the gateway');
assert.equal(isRealtimeRuntimePath('realtime-gateway/server.ts'), true, 'Realtime gateway entrypoint changes must rebuild');
assert.equal(isRealtimeRuntimePath('package-lock.json'), true, 'Dependency lock changes must rebuild');
assert.equal(isRealtimeRuntimePath('vercel.json'), false, 'Route-only Vercel config changes must not rebuild the realtime image');
assert.equal(isRealtimeRuntimePath('tools/ignore-realtime-build.mjs'), false, 'updating the ignore policy itself must not consume a container image slot');
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
  write('package.json', JSON.stringify({
    name: 'fixture',
    type: 'module',
    dependencies: { ws: '8.18.0' },
    scripts: {
      'realtime:gateway': 'tsx realtime-gateway/server.ts',
      'test:contracts': 'node tools/run-contracts.mjs',
    },
  }, null, 2) + '\n');
  write('realtime-gateway/server.ts', 'export const gatewayRevision = 1;\n');
  write('src/server/marketData/FyersMarketDataTransport.ts', 'export const transportRevision = 1;\n');
  write('src/server/routes/trading.routes.ts', 'export const routeRevision = 1;\n');
  write('src/server/trading/fyersOrderExecution.ts', 'export const orderExecutionRevision = 1;\n');
  write('src/TcoVelaDataProvider.ts', 'export const providerRevision = 1;\n');
  write('vercel.json', JSON.stringify({ services: { web: { framework: 'vite' }, realtimegateway: { root: '.', entrypoint: 'Dockerfile', runtime: 'container', ignoreCommand: 'node tools/ignore-realtime-build.mjs' } }, rewrites: [{ source: '/(.*)', destination: { service: 'web' } }] }, null, 2) + '\n');
  const base = commit('base');

  write('src/TcoVelaDataProvider.ts', 'export const providerRevision = 2;\n');
  const frontendOnly = commit('frontend only');
  assert.equal(runIgnore(base, frontendOnly).status, 0, 'unrelated frontend change must skip the realtime image');

  const packageScripts = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  packageScripts.scripts['test:contracts'] = 'node tools/run-contracts-v2.mjs';
  write('package.json', JSON.stringify(packageScripts, null, 2) + '\n');
  const toolingOnly = commit('frontend test script only');
  assert.equal(runIgnore(frontendOnly, toolingOnly).status, 0, 'frontend/test script changes in package.json must not rebuild the gateway');

  packageScripts.dependencies.ws = '8.19.0';
  write('package.json', JSON.stringify(packageScripts, null, 2) + '\n');
  const packageRuntimeChange = commit('gateway runtime dependency');
  assert.equal(runIgnore(toolingOnly, packageRuntimeChange).status, 1, 'gateway dependency changes in package.json must rebuild the image');

  packageScripts.dependencies.ws = '8.18.0';
  write('package.json', JSON.stringify(packageScripts, null, 2) + '\n');
  const packageRestored = commit('restore gateway dependency');
  assert.equal(runIgnore(packageRuntimeChange, packageRestored).status, 1, 'reverting a gateway dependency change must also rebuild');

  const policyConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
  policyConfig.services.realtimegateway.ignoreCommand = 'node tools/ignore-realtime-build-v2.mjs';
  write('vercel.json', JSON.stringify(policyConfig, null, 2) + '\n');
  const skipPolicyOnly = commit('change build skip policy');
  assert.equal(runIgnore(packageRestored, skipPolicyOnly).status, 0, 'changing only ignoreCommand must not force a container image rebuild');

  write('vercel.json', JSON.stringify({ services: { web: { framework: 'vite' }, realtimegateway: { root: '.', entrypoint: 'Dockerfile', runtime: 'container', ignoreCommand: 'node tools/ignore-realtime-build-v2.mjs' } }, rewrites: [{ source: '/(.*)', destination: { service: 'web', path: '/index.html' } }] }, null, 2) + '\n');
  const spaRoutingOnly = commit('SPA route only');
  assert.equal(runIgnore(skipPolicyOnly, spaRoutingOnly).status, 0, 'SPA routing-only config change must skip the realtime image');

  write('src/server/routes/trading.routes.ts', 'export const routeRevision = 2;\n');
  const httpRouteOnly = commit('HTTP route only');
  assert.equal(runIgnore(spaRoutingOnly, httpRouteOnly).status, 0, 'unrelated HTTP route change must skip the realtime image');

  write('src/server/trading/fyersOrderExecution.ts', 'export const orderExecutionRevision = 2;\n');
  const unrelatedServerChange = commit('unrelated HTTP order execution');
  assert.equal(runIgnore(httpRouteOnly, unrelatedServerChange).status, 0, 'unrelated server order execution edits must not rebuild the gateway');

  write('src/server/marketData/FyersMarketDataTransport.ts', 'export const transportRevision = 2;\n');
  const runtimeChange = commit('realtime transport');
  const rebuilt = runIgnore(unrelatedServerChange, runtimeChange);
  assert.equal(rebuilt.status, 1, 'realtime dependency change must allow a new image build');
  assert.match(rebuilt.stdout, /Realtime runtime dependency changes detected/);

  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8'));
  config.services.realtimegateway.entrypoint = 'Dockerfile.gateway';
  write('vercel.json', JSON.stringify(config, null, 2) + '\n');
  const realtimeConfigChange = commit('realtime service config change');
  const configRebuilt = runIgnore(runtimeChange, realtimeConfigChange);
  assert.equal(configRebuilt.status, 1, 'realtime service config change must rebuild the image');
  assert.match(configRebuilt.stdout, /realtimegateway service configuration/);

  assert.equal(runIgnore('', frontendOnly).status, 0, 'missing previous SHA should compare against the commit parent for frontend-only changes');
  assert.equal(runIgnore('', runtimeChange).status, 1, 'missing previous SHA must still rebuild when the commit changes realtime runtime code');

  // A missing VERCEL_GIT_COMMIT_SHA falls back to the actual checkout HEAD, not
  // the supplied fixture SHA. Check out each fixture commit so this assertion
  // tests the deployment fallback rather than accidentally testing the latest
  // synthetic commit (which changed the service configuration above).
  git(['checkout', '--detach', frontendOnly]);
  assert.equal(runIgnore('', '', { VERCEL_GIT_COMMIT_SHA: '' }).status, 0,
    'missing Vercel SHA variables should fall back to checked-out HEAD for frontend-only changes');
  git(['checkout', '--detach', runtimeChange]);
  assert.equal(runIgnore('', '', { VERCEL_GIT_COMMIT_SHA: '' }).status, 1,
    'checked-out HEAD fallback must still rebuild for runtime changes');
  assert.equal(runIgnore(httpRouteOnly, runtimeChange, { TCO_REALTIME_FORCE_BUILD: '1' }).status, 1, 'explicit force flag must build');

  console.log('REALTIME_SERVICE_BUILD_SKIP_CONTRACT_OK');
} finally {
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildChartLayoutUrls } from '../tools/browser-test-urls.mjs';

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const ci = read('.github/workflows/ci.yml');
const soak = read('.github/workflows/browser-performance-soak.yml');
const authBootstrap = read('tools/create-browser-auth-state.mjs');
const matrix = read('tools/verify-chart-matrix.mjs');
const contractRunner = read('tools/run-contracts.mjs');

assert.deepEqual(
  buildChartLayoutUrls('https://tradingcoreos.vercel.app/live?symbol=NSE%3ANIFTY50-INDEX&timeframe=5', [1, 4, 8]),
  [
    'https://tradingcoreos.vercel.app/live?symbol=NSE%3ANIFTY50-INDEX&timeframe=5&velaLayout=1',
    'https://tradingcoreos.vercel.app/live?symbol=NSE%3ANIFTY50-INDEX&timeframe=5&velaLayout=4',
    'https://tradingcoreos.vercel.app/live?symbol=NSE%3ANIFTY50-INDEX&timeframe=5&velaLayout=8',
  ],
  'chart-layout URLs must preserve shared symbol/timeframe state and target /live'
);
assert.deepEqual(
  buildChartLayoutUrls('https://tradingcoreos.vercel.app/live?velaLayout=4', ['8']),
  ['https://tradingcoreos.vercel.app/live?velaLayout=8'],
  'the requested layout must replace a pre-existing velaLayout parameter'
);
assert.deepEqual(
  buildChartLayoutUrls('http://localhost:5173/live', [1]),
  ['http://localhost:5173/live?velaLayout=1'],
  'isolated localhost browser tests may use HTTP'
);
assert.throws(() => buildChartLayoutUrls('https://tradingcoreos.vercel.app/', [1]), /complete \/live route/);
assert.throws(() => buildChartLayoutUrls('http://tradingcoreos.vercel.app/live', [1]), /HTTPS/);
assert.throws(() => buildChartLayoutUrls('https://tradingcoreos.vercel.app/live', [0]), /Invalid Vela layout/);
assert.throws(() => buildChartLayoutUrls('https://tradingcoreos.vercel.app/live', [1, 1]), /unique/);

for (const key of [
  'TCO_BROWSER_SUPABASE_URL',
  'TCO_BROWSER_SUPABASE_PUBLISHABLE_KEY',
  'TCO_BROWSER_TEST_EMAIL',
  'TCO_BROWSER_TEST_PASSWORD',
]) {
  assert.match(authBootstrap, new RegExp(`requiredEnv\\('${key}'\\)`), `ephemeral bootstrap must require ${key}`);
  const secretBinding = key + ': ${{ secrets.' + key + ' }}';
  assert.ok(ci.includes(secretBinding), `normal CI browser job must inject ${key}`);
  assert.ok(soak.includes(secretBinding), `scheduled soak must inject ${key}`);
}

assert.match(ci, /TCO_BROWSER_LAYOUTS: '1,4,5,8'/, 'normal CI must cover 1, 4, 5 and 8 chart layouts');
assert.match(ci, /node tools\/create-browser-auth-state\.mjs/, 'normal browser CI must create session state ephemerally');
assert.match(soak, /npm ci --include=dev/, 'soak must install the project dependency used by the Supabase auth bootstrap');
assert.match(soak, /node tools\/create-browser-auth-state\.mjs/, 'soak must use the same ephemeral Supabase auth bootstrap as CI');
assert.doesNotMatch(soak, /TCO_BROWSER_STATE_BASE64/, 'soak must not depend on a separately maintained base64 session secret');
assert.match(soak, /TCO_BROWSER_LAYOUTS: '8'/, 'scheduled soak must exercise the 8-chart layout');
assert.match(soak, /TCO_BROWSER_SOAK_MS: '1800000'/, 'scheduled soak must sustain the browser workload for 30 minutes');
assert.match(soak, /TCO_MIN_HEAP_SAMPLE_WINDOW_MS: '1800000'/, 'scheduled soak must measure heap trend across the full 30-minute window');
assert.match(soak, /TCO_REQUIRE_AUTH: 'true'/, 'scheduled soak must fail closed when the browser is not authenticated');
assert.match(soak, /node tools\/verify-chart-matrix\.mjs/, 'scheduled soak must use the same /live URL builder and verifier');
assert.match(matrix, /buildChartLayoutUrls\(base, layouts\)/, 'matrix runner must validate and construct canonical /live URLs');
assert.match(contractRunner, /browser-performance-auth-bootstrap/, 'the auth and browser-URL contract must run in the full CI contract suite');

console.log('BROWSER_PERFORMANCE_AUTH_BOOTSTRAP_CONTRACT_OK');

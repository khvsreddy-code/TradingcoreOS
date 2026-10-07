import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const provider = readFileSync(new URL('../src/TcoVelaDataProvider.ts', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../src/LiveTradingWorkspace.tsx', import.meta.url), 'utf8');

const start = provider.indexOf('async getBarsColumns');
const end = provider.indexOf('/**', start + 32);
const body = provider.slice(start, end);

assert.match(body, /const cached = plane\.readCanonical\(\)/);
assert.match(body, /if \(cached\.length > 0\)/);
assert.match(body, /await plane\.ensureReady\(requested\)/);
assert.doesNotMatch(body, /getHistoricalDataColumns/);
assert.match(provider, /export function prewarmTcoVelaHistory/);
assert.match(provider, /requestIdleCallback/);
assert.match(workspace, /prewarmTcoVelaHistory\(/);
assert.match(workspace, /NSE:NIFTYBANK-INDEX/);
assert.match(workspace, /BSE:SENSEX-INDEX/);
console.log('TCO_FAST_CANDLE_CACHE_CONTRACT_OK');

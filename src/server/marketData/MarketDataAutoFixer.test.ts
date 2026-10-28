import assert from 'node:assert/strict';
import { MarketDataAutoFixer } from './MarketDataAutoFixer';
let now = 10_000;
const fixer = new MarketDataAutoFixer({
  useSharedCoordination: false,
  now: () => now, baseCooldownMs: 1_000, maxCooldownMs: 8_000,
  authCooldownMs: 15_000, rateLimitFloorMs: 3_000,
});
const resource = 'NSE:NIFTY50-INDEX:5minute';
assert.equal(await fixer.canAttempt('nse', 'history', resource), true);
let state = await fixer.recordFailure('nse', 'history', resource, Object.assign(new Error('gateway timeout'), { status: 503 }));
assert.equal(state.state, 'open');
assert.equal(state.nextProbeAt, now + 1_000);
assert.equal(await fixer.canAttempt('nse', 'history', resource), false);
now += 1_000;
assert.equal(await fixer.canAttempt('nse', 'history', resource), true);
assert.equal(await fixer.canAttempt('nse', 'history', resource), false, 'only one half-open probe is permitted');
state = await fixer.recordSuccess('nse', 'history', resource);
assert.equal(state.state, 'healthy');
assert.equal(state.failures, 0);
assert.equal(state.lastAction, 'automatic-recovery-success');
assert.equal(state.attempts, 2, 'the initial request and the one half-open probe are counted');
assert.equal(state.successes, 1);
assert.equal(await fixer.canAttempt('investiny', 'history', resource), true);
const limited = await fixer.recordFailure('investiny', 'history', resource, Object.assign(new Error('rate limited'), { status: 429, retryAfterMs: 5_000 }));
assert.equal(limited.nextProbeAt, now + 5_000);
assert.equal(await fixer.canAttempt('investiny', 'history', resource), false);
assert.equal(await fixer.canAttempt('nse', 'history', 'NSE:SBIN-EQ:5minute'), true);
const auth = await fixer.recordFailure('nse', 'history', 'NSE:SBIN-EQ:5minute', Object.assign(new Error('credentials expired'), { status: 401 }));
assert.equal(auth.nextProbeAt, now + 15_000);
assert.equal(auth.lastAction, 'credentials-permission-or-mapping-check-required');
assert.equal(fixer.snapshot('nse', 'history', resource)[0]?.lastError, null);
console.log('MARKET_DATA_AUTO_FIXER_OK');

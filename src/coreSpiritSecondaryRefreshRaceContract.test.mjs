import assert from 'node:assert/strict';
import { CoreSpiritVelaEngine } from './CoreSpiritVelaEngine.ts';

function makeBars(count) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index;
    return {
      time: 1_700_000_000 + index * 300,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1000 + index,
    };
  });
}

function secondaryBar(close, time) {
  return {
    time,
    open: close - 1,
    high: close + 1,
    low: close - 1,
    close,
    volume: 5000,
  };
}

const engine = new CoreSpiritVelaEngine();
const prepared = await engine.prepare(`
indicator "Secondary Refresh Race"
let banknifty = market("BANKNIFTY")
plot(banknifty.close)
`, 'secondary-refresh-race-contract');

const bars = makeBars(20);
const mutableBars = bars.map((bar) => ({ ...bar }));
const pending = [];
const fetchSeries = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));

let signalModelReady;
const updated = new Promise((resolve) => { signalModelReady = resolve; });
let modelCount = 0;
let runtimeError;
const session = engine.execute({
  prepared,
  market: { symbol: 'NSE:NIFTY50-INDEX', timeframe: '5' },
  bars,
  getBars: () => mutableBars,
  fetchSeries,
  mode: 'live',
  historyState: 'complete',
}, {
  onModel: () => {
    modelCount += 1;
    if (modelCount >= 1) signalModelReady();
  },
  onScenePatches: () => undefined,
  onError: (error) => { runtimeError = error; },
});

assert.equal(pending.length, 1, 'initial execution should start one secondary-series request');

// Multiple fast settings updates can overlap. The final update must be the only
// one that mutates data or emits an execution result.
session.update({});
session.update({});
assert.equal(pending.length, 3, 'each forced update starts a new refresh generation');

const secondaryTime = bars.at(-1).time - 600;
pending[2].resolve([secondaryBar(222, secondaryTime)]);
await updated;
await new Promise((resolve) => setImmediate(resolve));
assert.equal(runtimeError, undefined, runtimeError?.message);
assert.equal(modelCount, 1, 'superseded updates and startup must not emit duplicate models');
const freshContext = await session.getContext();
const latestValues = (context) => Object.values(context?.plots ?? {}).map((points) => points.at(-1)?.value);
assert.ok(latestValues(freshContext).some((value) => Number(value) === 222),
  'the newest secondary response should be visible to CoreSpirit');

// Deliver older responses after the newest snapshot has been consumed.
pending[1].resolve([secondaryBar(333, secondaryTime)]);
pending[0].resolve([secondaryBar(111, secondaryTime)]);
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));

// Force the retained runtime to read the shared resolver again. If a stale
// response wins, the latest plotted banknifty close becomes 111 or 333.
mutableBars[mutableBars.length - 1] = {
  ...mutableBars.at(-1),
  close: mutableBars.at(-1).close + 1,
  high: mutableBars.at(-1).high + 1,
};
session.notifyBars(undefined);
const afterStaleCompletion = await session.getContext();
assert.equal(runtimeError, undefined, runtimeError?.message);
assert.ok(latestValues(afterStaleCompletion).some((value) => Number(value) === 222),
  'a stale secondary response must not replace the latest snapshot');
assert.ok(!latestValues(afterStaleCompletion).some((value) => Number(value) === 111 || Number(value) === 333),
  'a stale secondary response leaked into live execution');
assert.equal(modelCount, 1, 'stale async update callbacks emitted a duplicate model');

session.stop();

// Stopping while a forced refresh is pending must cancel both the refresh
// result and the update callback waiting on it.
const stopPending = [];
let stoppedModelCount = 0;
const stoppedSession = engine.execute({
  prepared,
  market: { symbol: 'NSE:NIFTY50-INDEX', timeframe: '5' },
  bars,
  getBars: () => bars,
  fetchSeries: () => new Promise((resolve, reject) => stopPending.push({ resolve, reject })),
  mode: 'live',
  historyState: 'complete',
}, {
  onModel: () => { stoppedModelCount += 1; },
  onScenePatches: () => undefined,
  onError: (error) => { throw error; },
});
assert.equal(stopPending.length, 1);
stoppedSession.update({});
assert.equal(stopPending.length, 2);
stoppedSession.stop();
stopPending[1].resolve([secondaryBar(222, secondaryTime)]);
stopPending[0].resolve([secondaryBar(111, secondaryTime)]);
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));
assert.equal(stoppedModelCount, 0, 'a stopped session must not emit after pending secondary data resolves');

console.log('CORESPIRIT_SECONDARY_REFRESH_LATEST_WINS_CONTRACT_OK');

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

// A settings/update operation forces a refresh while the startup request is
// still in flight. Resolve the newer request first, then the stale request.
session.update({});
assert.equal(pending.length, 2, 'forced update should start a new refresh generation');

const secondaryTime = bars.at(-1).time - 600;
pending[1].resolve([secondaryBar(222, secondaryTime)]);
await updated;
assert.equal(runtimeError, undefined, runtimeError?.message);
const freshContext = await session.getContext();
const latestValues = (context) => Object.values(context?.plots ?? {}).map((points) => points.at(-1)?.value);
assert.ok(latestValues(freshContext).some((value) => Number(value) === 222),
  'the newest secondary response should be visible to CoreSpirit');

pending[0].resolve([secondaryBar(111, secondaryTime)]);
await new Promise((resolve) => setImmediate(resolve));

// Force the retained runtime to read the shared resolver again. If the stale
// response was allowed to win, the latest plotted banknifty close becomes 111.
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
assert.ok(!latestValues(afterStaleCompletion).some((value) => Number(value) === 111),
  'a stale secondary response leaked into live execution');

session.stop();
console.log('CORESPIRIT_SECONDARY_REFRESH_LATEST_WINS_CONTRACT_OK');

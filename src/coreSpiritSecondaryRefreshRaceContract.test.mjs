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
input scale: int = 1 min=1 max=5
let banknifty = market("BANKNIFTY")
plot(banknifty.close)
`, 'secondary-refresh-race-contract');

const bars = makeBars(20);
const mutableBars = bars.map((bar) => ({ ...bar }));
const pending = [];
const calendarCalls = [];
const marketCalendar = {
  id: 'secondary-test-session-v1',
  resolveBarCloseTime(symbol, timeframe, barOpenTimeMs) {
    calendarCalls.push({symbol, timeframe, barOpenTimeMs});
    // Test session-aware close boundaries: intentionally not equal to the
    // nominal five-minute end so the resolver must preserve host semantics.
    return barOpenTimeMs + 60_000;
  },
};
const fetchSeries = (symbol, timeframe, range) => new Promise((resolve, reject) => pending.push({
  symbol, timeframe, signal:range.signal, resolve, reject,
}));

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
  marketCalendar,
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
session.update({scale:2});
session.update({scale:3});
assert.equal(pending.length, 3, 'each forced update starts a new refresh generation');
assert.equal(pending[0].signal?.aborted, true, 'a forced refresh must cancel the previous secondary request');
assert.equal(pending[1].signal?.aborted, true, 'only the latest symbol/timeframe generation may remain active');
assert.equal(pending[2].signal?.aborted, false, 'the current request signal must remain live');

// Local/main computation must not wait for the slow secondary provider.
await updated;
assert.equal(runtimeError, undefined, runtimeError?.message);
assert.equal(modelCount, 1, 'a partial safe result may render while secondary data is pending');

// Current chart time is 4 minutes after this secondary candle opens: the host calendar closes it after 60 seconds, but nominal 5m arithmetic would keep it developing.
const secondaryTime = bars.at(-1).time - 240;
pending[2].resolve([secondaryBar(222, secondaryTime)]);
const latestValues = (context) => Object.values(context?.plots ?? {}).map((points) => points.at(-1)?.value);
let freshContext;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await new Promise((resolve) => setImmediate(resolve));
  freshContext = await session.getContext();
  if (latestValues(freshContext).some((value) => Number(value) === 222)) break;
}
assert.equal(runtimeError, undefined, runtimeError?.message);
assert.ok(latestValues(freshContext).some((value) => Number(value) === 222),
  'the newest secondary response should be visible to CoreSpirit after re-evaluation');
assert.ok(calendarCalls.some(call => call.symbol === 'BANKNIFTY' && call.timeframe === '5'),
  'chart timeframe aliases must be resolved to the actual chart timeframe before applying the exchange calendar');
assert.equal(modelCount, 2, 'a changed secondary dataset should cause one fresh model result after the initial partial result');
assert.match((await import('node:fs')).readFileSync(new URL('./CoreSpiritVelaEngine.ts', import.meta.url), 'utf8'), /time:Float64Array\.from\(rows,row=>Math\.floor\(barTimeMillis\(row\.timestamp\)\/1000\)\)/,
  'Vela secondary candle timestamps must be normalized to epoch seconds for the CoreSpirit market graph resolver');
const velaEngineSource=(await import('node:fs')).readFileSync(new URL('./CoreSpiritVelaEngine.ts', import.meta.url),'utf8');
assert.match(velaEngineSource,/dep\.symbol\.trim\(\)\.toUpperCase\(\) === 'CURRENT'/,'current-symbol aliases must be canonicalized before primary-timeframe checks');
assert.match(velaEngineSource,/const symbol=dep\.symbol\.trim\(\)\.toUpperCase\(\)==='CURRENT'\?req\.market\.symbol:dep\.symbol/,'current-symbol secondary timeframes must resolve to the active chart symbol');
assert.match(velaEngineSource,/function secondaryRowsMatch\(/,'secondary refreshes must compare cached OHLCV before allocating replacement objects');
assert.match(velaEngineSource,/if\(!secondaryRowsMatch\(existing,rows/,'unchanged secondary history must not trigger a graph snapshot rebuild');

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
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setTimeout(resolve, 0));
const afterStaleCompletion = await session.getContext();
assert.equal(runtimeError, undefined, runtimeError?.message);
assert.ok(latestValues(afterStaleCompletion).some((value) => Number(value) === 222),
  'a stale secondary response must not replace the latest snapshot');
assert.ok(!latestValues(afterStaleCompletion).some((value) => Number(value) === 111 || Number(value) === 333),
  'a stale secondary response leaked into live execution');
assert.equal(modelCount, 2, 'stale async update callbacks emitted a model beyond the expected refreshed result');

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
  fetchSeries: (symbol, timeframe, range) => new Promise((resolve, reject) => stopPending.push({ symbol, timeframe, signal:range.signal, resolve, reject })),
  mode: 'live',
  historyState: 'complete',
}, {
  onModel: () => { stoppedModelCount += 1; },
  onScenePatches: () => undefined,
  onError: (error) => { throw error; },
});
assert.equal(stopPending.length, 1);
stoppedSession.update({scale:2});
assert.equal(stopPending.length, 2);
assert.equal(stopPending[0].signal?.aborted, true, 'changing the execution configuration must cancel the previous dependency request');
stoppedSession.stop();
assert.equal(stopPending[1].signal?.aborted, true, 'stopping the engine must abort its in-flight dependency request');
stopPending[1].resolve([secondaryBar(222, secondaryTime)]);
stopPending[0].resolve([secondaryBar(111, secondaryTime)]);
await new Promise((resolve) => setImmediate(resolve));
await new Promise((resolve) => setImmediate(resolve));
assert.equal(stoppedModelCount, 0, 'a stopped session must not emit after pending secondary data resolves');

console.log('CORESPIRIT_SECONDARY_REFRESH_LATEST_WINS_CONTRACT_OK');

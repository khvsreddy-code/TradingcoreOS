import assert from 'node:assert/strict';

import { CoreSpiritVelaEngine } from './CoreSpiritVelaEngine.ts';
import { CoreSpiritRuntime } from './services/coreSpirit/runtime.ts';

function makeBars(count: number) {
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

const source = `
indicator "Live Startup"
    input length: int = 3 min=1 max=20
    precision = 2
plot(ema(close, length))
`;

const engine = new CoreSpiritVelaEngine();
const prepared = await engine.prepare(source, 'live-startup-contract');

const originalExecuteIr = CoreSpiritRuntime.prototype.executeIr;
const originalExecuteBar = CoreSpiritRuntime.prototype.executeBar;
let executeIrCalls = 0;
let executeBarCalls = 0;

CoreSpiritRuntime.prototype.executeIr = function (...args) {
  executeIrCalls += 1;
  return originalExecuteIr.apply(this, args);
};
CoreSpiritRuntime.prototype.executeBar = function (...args) {
  executeBarCalls += 1;
  return originalExecuteBar.apply(this, args);
};

try {
  const bars = makeBars(20);
  const mutableBars = bars.map((bar) => ({ ...bar }));

  let modelCount = 0;
  let latestModel;
  const session = engine.execute(
    {
      prepared,
      market: { symbol: 'NSE:NIFTY50-INDEX', timeframe: '5' },
      bars,
      getBars: () => mutableBars,
      mode: 'live',
      historyState: 'complete',
    },
    {
      onModel: (model) => { modelCount += 1; latestModel = model; },
      onScenePatches: () => undefined,
      onError: (error) => { throw error; },
    },
  );

  assert.equal(executeIrCalls, 1, 'live startup must execute historical state exactly once');
  assert.equal(executeBarCalls, 1, 'live startup must evaluate the forming bar exactly once');
  assert.ok(modelCount >= 1);

  session.notifyBars('complete');
  assert.equal(executeIrCalls, 1, 'complete notification must not replay already-initialized history');
  assert.equal(executeBarCalls, 1, 'complete notification must not re-run the forming bar');

  const beforeDisplayUpdateModels = modelCount;
  session.update({ length: 3 }, { precision: 4 });
  assert.equal(executeIrCalls, 1, 'display-only Vela props must not replay historical CoreSpirit execution');
  assert.equal(executeBarCalls, 1, 'display-only Vela props must not reevaluate the forming bar');
  assert.equal(modelCount, beforeDisplayUpdateModels + 1, 'display-only props must refresh Vela metadata');
  assert.equal(latestModel.precision, 4, 'display-only props must reach Vela indicator metadata');

  mutableBars[mutableBars.length - 1] = {
    ...mutableBars[mutableBars.length - 1]!,
    close: 121,
    high: 122,
  };
  session.notifyBars(undefined);
  assert.equal(executeIrCalls, 1, 'intrabar updates must not rebuild historical runtime state');
  assert.equal(executeBarCalls, 2, 'intrabar update should advance only the forming-bar execution');

  session.update({ length: 4 }, { precision: 4 });
  assert.equal(executeIrCalls, 2, 'semantic input changes must rebuild the history-dependent runtime once');
  assert.equal(executeBarCalls, 3, 'semantic input changes must reevaluate the latest forming bar once');
  assert.equal(latestModel.precision, 4, 'semantic input changes must preserve display settings');

  session.stop();
} finally {
  CoreSpiritRuntime.prototype.executeIr = originalExecuteIr;
  CoreSpiritRuntime.prototype.executeBar = originalExecuteBar;
}

executeIrCalls = 0;
executeBarCalls = 0;

const deferredBars = makeBars(20);
const deferred = engine.execute(
  {
    prepared,
    market: { symbol: 'NSE:NIFTY50-INDEX', timeframe: '5' },
    bars: deferredBars,
    getBars: () => deferredBars,
    mode: 'live',
    historyState: 'backfill',
  },
  {
    onModel: () => undefined,
    onScenePatches: () => undefined,
    onError: (error) => { throw error; },
  },
);

assert.equal(executeIrCalls, 0, 'backfill startup must wait for complete history');
assert.equal(executeBarCalls, 0, 'backfill startup must not evaluate a forming bar early');

deferred.notifyBars('backfill');
assert.equal(executeIrCalls, 0);
assert.equal(executeBarCalls, 0);

deferred.notifyBars('complete');
assert.equal(executeIrCalls, 1, 'history must execute once when the initial backfill completes');
assert.equal(executeBarCalls, 1, 'the forming bar must execute once after history initialization');
deferred.stop();

console.log('CORESPIRIT_LIVE_STARTUP_SINGLE_PASS_CONTRACT_OK');

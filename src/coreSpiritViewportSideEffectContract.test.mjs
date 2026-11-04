import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CoreSpiritRuntime } from './services/coreSpirit/runtime.ts';
import { createCoreSpiritOutputSemantics } from './services/coreSpirit/executionSemantics.ts';

const bar = {
  timestamp: '2026-10-01T09:15:00.000Z',
  open: 100, high: 102, low: 99, close: 101, volume: 1000,
};
const outputs = [];
const collector = { push: value => outputs.push(value) };
const diagnostics = [];

function observeExternalEvents(runtime) {
  let calls = 0;
  for (const method of ['executionIntent', 'scriptAlert', 'scriptWebhook', 'scriptEvent', 'scriptSignal']) {
    runtime.eventRouter[method] = () => { calls += 1; };
  }
  return () => calls;
}

const viewportRuntime = new CoreSpiritRuntime({
  sourceId: 'viewport-side-effect-contract',
  suppressExternalEffects: true,
});
const externalCalls = observeExternalEvents(viewportRuntime);
for (const kind of ['orderIntent', 'buy', 'sell', 'entry', 'exit', 'alert', 'webhook']) {
  viewportRuntime.emitIntent(kind, ['long', 'quantity', 1, null, null], bar, 0, collector, diagnostics, kind);
}
assert.equal(outputs.length, 0, 'viewport-only recomputation must not publish order intents or alerts');
assert.equal(externalCalls(), 0, 'viewport-only recomputation must not invoke execution/event adapters');

viewportRuntime.emitIntent('event', ['viewport-refresh'], bar, 0, collector, diagnostics, 'event');
viewportRuntime.emitIntent('signal', ['LONG'], bar, 0, collector, diagnostics, 'signal');
assert.ok(outputs.some(value => value.kind === 'event'), 'visual/event output can remain available to the renderer');
assert.ok(outputs.some(value => value.kind === 'signal'), 'signal output must remain available to read-only rendering');
assert.equal(externalCalls(), 0, 'read-only events/signals must not escape into the host event bus');

const confirmedHistorySemantics = createCoreSpiritOutputSemantics({
  barPhase: 'historical',
  executionMode: 'historical',
  isRealtime: false,
  isConfirmed: true,
});

const normalRuntime = new CoreSpiritRuntime({ sourceId: 'normal-execution-contract' });
normalRuntime.currentOutputSemantics = confirmedHistorySemantics;
const normalExternalCalls = observeExternalEvents(normalRuntime);
const normalOutputs = [];
normalRuntime.emitIntent('orderIntent', ['long', 'quantity', 1, null, null], bar, 0, { push: value => normalOutputs.push(value) }, [], 'order');
assert.equal(normalOutputs[0]?.kind, 'orderIntent', 'normal strategy evaluation must continue producing order intents');
assert.equal(normalExternalCalls(), 1, 'normal strategy evaluation must retain host-owned order-intent routing');

const replayRuntime = new CoreSpiritRuntime({ sourceId: 'historical-replay-scope' });
const replayEvents = observeExternalEvents(replayRuntime);
const executeIrStub = function () {
  // Mirror the confirmed-bar metadata installed by a real executeIr() pass.
  this.currentOutputSemantics = confirmedHistorySemantics;
  this.emitIntent('orderIntent', ['long', 'quantity', 1, null, null], bar, 0, collector, diagnostics, 'history');
  return { outputs: [], state: {}, diagnostics: [] };
};
replayRuntime.executeIr = executeIrStub;
replayRuntime.executeIrReadOnly({}, []);
assert.equal(replayEvents(), 0, 'read-only history replay must suppress historical execution intents');
replayRuntime.executeIr({}, []);
assert.equal(replayEvents(), 1, 'read-only suppression must be restored before the next forming-bar execution');

assert.equal(
  (velaSource.match(/executeIrReadOnly\(token\.ir,/g) ?? []).length,
  6,
  'initial, update, viewport and backfill history-only passes must all use scoped read-only replay',
);

const velaSource = fs.readFileSync('src/CoreSpiritVelaEngine.ts', 'utf8');
assert.equal(
  (velaSource.match(/createRuntime\(\{\s*suppressExternalEffects\s*:\s*true\s*\}\)/g) ?? []).length,
  2,
  'both viewport-range and backfill-range recomputations must use the side-effect-free runtime',
);

console.log('CORESPIRIT_VIEWPORT_SIDE_EFFECT_SUPPRESSION_CONTRACT_OK');

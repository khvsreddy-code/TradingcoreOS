import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CoreSpiritRuntime } from './services/coreSpirit/runtime.ts';
import { createCoreSpiritOutputSemantics } from './services/coreSpirit/executionSemantics.ts';
import { CoreEventBus } from './services/core/event/eventBus.ts';

const bar = {
  timestamp: '2026-10-01T09:15:00.000Z',
  open: 100, high: 102, low: 99, close: 101, volume: 1000,
};
const outputs = [];
const collector = { push: value => outputs.push(value) };
const diagnostics = [];

function observeExternalEvents(bus) {
  let calls = 0;
  for (const event of ['execution.intent', 'script.alert', 'script.webhook', 'script.event', 'script.signal']) {
    bus.on(event, () => { calls += 1; });
  }
  return () => calls;
}

const viewportBus = new CoreEventBus();
const viewportRuntime = new CoreSpiritRuntime({
  sourceId: 'viewport-side-effect-contract',
  suppressExternalEffects: true,
}, viewportBus);
const externalCalls = observeExternalEvents(viewportBus);
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

const normalBus = new CoreEventBus();
const normalRuntime = new CoreSpiritRuntime({ sourceId: 'normal-execution-contract' }, normalBus);
normalRuntime.currentOutputSemantics = confirmedHistorySemantics;
const normalExternalCalls = observeExternalEvents(normalBus);
const normalOutputs = [];
normalRuntime.emitIntent('orderIntent', ['long', 'quantity', 1, null, null], bar, 0, { push: value => normalOutputs.push(value) }, [], 'order');
assert.equal(normalOutputs[0]?.kind, 'orderIntent', 'normal strategy evaluation must continue producing order intents');
assert.equal(normalExternalCalls(), 1, 'normal strategy evaluation must retain host-owned order-intent routing');

const replayBus = new CoreEventBus();
const replayRuntime = new CoreSpiritRuntime({ sourceId: 'historical-replay-scope' }, replayBus);
const replayEvents = observeExternalEvents(replayBus);
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

const velaSource = fs.readFileSync('src/CoreSpiritVelaEngine.ts', 'utf8');
assert.equal(
  (velaSource.match(/executeIrReadOnly\(token\.ir,/g) ?? []).length,
  6,
  'initial, update, viewport and backfill history-only passes must all use scoped read-only replay',
);
assert.equal(
  (velaSource.match(/createRuntime\(\{\s*suppressExternalEffects\s*:\s*true\s*\}\)/g) ?? []).length,
  2,
  'both viewport-range and backfill-range recomputations must use the side-effect-free runtime',
);

console.log('CORESPIRIT_VIEWPORT_SIDE_EFFECT_SUPPRESSION_CONTRACT_OK');

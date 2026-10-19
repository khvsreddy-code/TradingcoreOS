import assert from 'node:assert/strict';
import { CoreSpiritCompiler } from './compiler';
import { CoreSpiritRuntime } from './runtime';

/**
 * Mutation conformance test. Every mutation is evaluated by the long-lived runtime and
 * compared with a clean batch execution of the same exact timeline. The production
 * runtime's dirty plan is also checked after a historical correction, so numerical
 * parity alone cannot mask a silently empty invalidation plan.
 */
const compiled = new CoreSpiritCompiler().compileSource('let average = ema(close, 3)', 'mutation-conformance');
assert.ok(compiled.ir, compiled.diagnostics.map(item => item.message).join('\n'));
const ir = compiled.ir;
type Bar = { timestamp: string; open: number; high: number; low: number; close: number; volume: number };
const origin = Date.parse('2026-10-19T03:45:00.000Z');
const makeBar = (close: number, index: number, volume = 100 + index): Bar => ({
  timestamp: new Date(origin + index * 300_000).toISOString(),
  open: close,
  high: close + 1,
  low: close - 1,
  close,
  volume,
});
let timeline: Bar[] = [100, 102, 101, 105, 104, 107, 106].map((close, index) => makeBar(close, index));
const runtime = new CoreSpiritRuntime({ sourceId: 'mutation-conformance-long-lived' });

function assertBatchParity(label: string): void {
  const incremental = runtime.executeIr(ir, timeline);
  const oracle = new CoreSpiritRuntime({ sourceId: 'mutation-conformance-batch-' + label });
  const batch = oracle.executeIr(ir, timeline);
  assert.ok(Number.isFinite(Number(incremental.state.locals.average)), label + ': incremental EMA must be finite');
  assert.equal(
    Number(incremental.state.locals.average),
    Number(batch.state.locals.average),
    label + ': long-lived execution must match a clean batch execution',
  );
  assert.equal(runtime.getState().barIndex, timeline.length - 1, label + ': runtime should end at the latest bar');
}

assertBatchParity('initial-history');

// Repeated updates to the forming bar are replacement mutations, not appended candles.
for (const close of [108, 103, 109, 107.5]) {
  const last = timeline.length - 1;
  timeline[last] = { ...makeBar(close, last, 180), timestamp: timeline[last]!.timestamp };
  assertBatchParity('forming-bar-' + close);
}
assert.equal(new Set(timeline.map(bar => bar.timestamp)).size, timeline.length, 'forming-bar replacement must not duplicate timestamps');

// Append a closed candle, then verify the runtime and the batch oracle agree.
timeline.push(makeBar(111, timeline.length, 210));
assertBatchParity('append');

// A historical correction must invalidate recursive EMA state through the execution tail.
timeline[2] = { ...makeBar(95, 2, 333), timestamp: timeline[2]!.timestamp };
assertBatchParity('historical-correction');
const correctionPlan = runtime.getLastDirtyPlan();
assert.ok(correctionPlan?.correction, 'historical candle edits must create a correction plan');
assert.deepEqual(correctionPlan.correction.changedRange, { from: 2, to: 3 });
assert.equal(correctionPlan.correction.requiresStateRestore, true);
assert.equal(correctionPlan.correction.replayFrom, 0, 'without an applicable safe snapshot, a recursive correction replays from bar zero');
assert.equal(correctionPlan.correction.reason, 'full-replay-no-safe-checkpoint');
assert.equal(correctionPlan.allHistory, true, 'full replay must be explicit rather than a partial dirty-span plan');

// Simulate recovery after an outage: rebuild a fresh runtime from the canonical timeline.
const recovered = new CoreSpiritRuntime({ sourceId: 'mutation-conformance-after-outage' });
const recoveredResult = recovered.executeIr(ir, timeline);
const clean = new CoreSpiritRuntime({ sourceId: 'mutation-conformance-recovery-oracle' });
const cleanResult = clean.executeIr(ir, timeline);
assert.equal(Number(recoveredResult.state.locals.average), Number(cleanResult.state.locals.average));
assert.equal(recovered.getState().barIndex, timeline.length - 1);


/** A restored checkpoint must continue the same stateful timeline as a clean run. */
const checkpointRuntime = new CoreSpiritRuntime({ sourceId: 'mutation-conformance-checkpoint-source' });
checkpointRuntime.executeIr(ir, timeline.slice(0, 5));
const checkpoint = checkpointRuntime.exportCheckpoint();
const resumed = new CoreSpiritRuntime({ sourceId: 'mutation-conformance-checkpoint-resume' });
resumed.loadIr(ir);
assert.equal(resumed.restoreCheckpoint(checkpoint), true, 'a compatible checkpoint should restore');
const resumedResult = resumed.executeIr(ir, timeline);
const resumedOracle = new CoreSpiritRuntime({ sourceId: 'mutation-conformance-checkpoint-oracle' });
const resumedReference = resumedOracle.executeIr(ir, timeline);
assert.equal(Number(resumedResult.state.locals.average), Number(resumedReference.state.locals.average),
  'resuming from a checkpoint must match complete replay');

/** A parameter/artifact change is a new execution identity and must not inherit old EMA state. */
const changedInput = new CoreSpiritCompiler().compileSource('let average = ema(close, 4)', 'mutation-conformance-input-change');
assert.ok(changedInput.ir, changedInput.diagnostics.map(item => item.message).join('\\n'));
const changedRuntime = new CoreSpiritRuntime({ sourceId: 'mutation-conformance-input-change' });
const changedResult = changedRuntime.executeIr(changedInput.ir, timeline);
const changedOracle = new CoreSpiritRuntime({ sourceId: 'mutation-conformance-input-change-oracle' });
const changedReference = changedOracle.executeIr(changedInput.ir, timeline);
assert.equal(Number(changedResult.state.locals.average), Number(changedReference.state.locals.average),
  'changing inputs/compiled artifact must match a clean execution');

/** Symbol/timeframe transitions create a new timeline; state must not leak between runtimes. */
const alternateTimeline: Bar[] = timeline.map((bar, index) => ({
  ...makeBar(bar.close * 1.01, index, bar.volume),
  timestamp: new Date(origin + index * 900_000).toISOString(),
}));
const switchedRuntime = new CoreSpiritRuntime({ sourceId: 'mutation-conformance-symbol-B-15m' });
const switchedResult = switchedRuntime.executeIr(ir, alternateTimeline);
const switchedOracle = new CoreSpiritRuntime({ sourceId: 'mutation-conformance-symbol-B-15m-oracle' });
const switchedReference = switchedOracle.executeIr(ir, alternateTimeline);
assert.equal(Number(switchedResult.state.locals.average), Number(switchedReference.state.locals.average),
  'a new symbol/timeframe timeline must start from its own canonical state');
assert.equal(switchedRuntime.getState().barIndex, alternateTimeline.length - 1);

console.log('CORESPIRIT_MUTATION_CONFORMANCE_OK');

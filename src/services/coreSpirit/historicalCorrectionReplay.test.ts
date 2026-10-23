import assert from 'node:assert/strict';
import { CoreSpiritCompiler } from './compiler';
import { CoreSpiritRuntime } from './runtime';

const compiled = new CoreSpiritCompiler().compileSource('let average = ema(close, 3)', 'historical-correction-contract');
assert.ok(compiled.ir, compiled.diagnostics.map(item => item.message).join('\n'));
const ir = compiled.ir;

const bars = [10, 11, 12, 13, 14, 15, 16].map((close, index) => ({
  timestamp: new Date(Date.parse('2026-10-14T09:15:00.000Z') + index * 300_000).toISOString(),
  open: close,
  high: close,
  low: close,
  close,
  volume: 100 + index,
}));

const runtime = new CoreSpiritRuntime({ sourceId: 'historical-correction-contract' });
const original = runtime.executeIr(ir, bars);
const originalAverage = Number(original.state.locals.average);
assert.ok(Number.isFinite(originalAverage), 'EMA should publish its latest confirmed value');

const corrected = bars.map(bar => ({ ...bar }));
corrected[2] = { ...corrected[2]!, open: 12, high: 18, low: 12, close: 18 };
const replayed = runtime.executeIr(ir, corrected);
const correctionPlan = runtime.getLastDirtyPlan();

assert.ok(correctionPlan?.correction, 'same-timeline historical changes must be classified by the dirty graph');
assert.deepEqual(correctionPlan.correction.changedRange, { from: 2, to: 3 });
assert.equal(correctionPlan.correction.requiresStateRestore, true, 'EMA state depends on the corrected candle');
assert.equal(correctionPlan.correction.replayFrom, 0, 'without a safely restored checkpoint, recompute from bar zero');
assert.equal(correctionPlan.correction.reason, 'full-replay-no-safe-checkpoint');

const freshRuntime = new CoreSpiritRuntime({ sourceId: 'historical-correction-reference' });
const reference = freshRuntime.executeIr(ir, corrected);
assert.equal(
  Number(replayed.state.locals.average),
  Number(reference.state.locals.average),
  'the replayed result must match a clean deterministic replay',
);
assert.notEqual(Number(replayed.state.locals.average), originalAverage, 'correction must change downstream EMA state');
assert.equal(runtime.getState().barIndex, corrected.length - 1, 'runtime should finish on the latest corrected bar');
assert.ok(runtime.getRecoveryStats().barsReplayed >= corrected.length, 'full-history correction replay must account for every replayed bar');
assert.equal(runtime.getRecoveryStats().lastReplayFrom, 0, 'recursive correction replay must report the safe origin');

// Corrections arrive out of chronological order: first alter a later bar, then
// alter an earlier one. Each accepted update must match a clean replay.
const lateCorrection = corrected.map(bar => ({ ...bar }));
lateCorrection[5] = { ...lateCorrection[5]!, open: 15, high: 22, low: 15, close: 22 };
runtime.executeIr(ir, lateCorrection);
const earlierCorrection = lateCorrection.map(bar => ({ ...bar }));
earlierCorrection[1] = { ...earlierCorrection[1]!, open: 11, high: 19, low: 11, close: 19 };
const afterOutOfOrder = runtime.executeIr(ir, earlierCorrection);
const outOfOrderReferenceRuntime = new CoreSpiritRuntime({ sourceId: 'historical-correction-contract' });
const afterOutOfOrderReference = outOfOrderReferenceRuntime.executeIr(ir, earlierCorrection);
assert.equal(Number(afterOutOfOrder.state.locals.average), Number(afterOutOfOrderReference.state.locals.average),
  'out-of-order historical corrections must be equivalent to a fresh replay');

// Immediately resume live updates after a correction. Repeated updates to the
// forming bar restore a compatible pre-bar checkpoint or trigger full replay.
const nextTimestamp = Date.parse(earlierCorrection.at(-1)!.timestamp) + 300_000;
const formingBar = {
  timestamp: new Date(nextTimestamp).toISOString(),
  open: 20, high: 21, low: 19, close: 20, volume: 150,
};
runtime.executeBar(formingBar);
const correctedLive = runtime.executeBar({ ...formingBar, high: 23, close: 22, volume: 175 });
outOfOrderReferenceRuntime.executeBar(formingBar);
const referenceLive = outOfOrderReferenceRuntime.executeBar({ ...formingBar, high: 23, close: 22, volume: 175 });
assert.equal(Number(correctedLive.state.locals.average), Number(referenceLive.state.locals.average),
  'a live tick after correction must match clean replay plus the same forming-bar updates');
const seriesValues = result => result.outputs.filter(item => item.kind === 'series').map(item => item.kind === 'series' ? item.value : null);
assert.deepEqual(seriesValues(correctedLive), seriesValues(referenceLive),
  'post-correction live outputs must match reference outputs');
assert.ok(runtime.getRecoveryStats().checkpointsRestored > 0,
  'compatible pre-bar checkpoints should be counted when the forming bar is revised');
console.log('CORESPIRIT_HISTORICAL_CORRECTION_REPLAY_OK');

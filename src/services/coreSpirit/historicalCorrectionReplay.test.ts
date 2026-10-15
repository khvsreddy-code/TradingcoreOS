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
console.log('CORESPIRIT_HISTORICAL_CORRECTION_REPLAY_OK');

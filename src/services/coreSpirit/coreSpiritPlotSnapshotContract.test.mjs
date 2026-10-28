import assert from 'node:assert/strict';
import { applyCoreSpiritPlotSnapshot } from './coreSpiritPlotSnapshot.ts';

function makeSeries(initial = []) {
  return {
    data: [...initial], calls: [],
    setData(points) { this.data = [...points]; this.calls.push({ type: 'setData', points: [...points] }); },
    update(point) {
      this.calls.push({ type: 'update', point });
      const index = this.data.findIndex(existing => existing.time === point.time);
      if (index >= 0) this.data[index] = point; else this.data.push(point);
    },
  };
}

const existing = [{ time: 1000, value: 10 }, { time: 2000, value: 11 }];
const emptySnapshot = makeSeries(existing);
applyCoreSpiritPlotSnapshot(emptySnapshot, [], existing);
assert.deepEqual(emptySnapshot.calls, [{ type: 'setData', points: [] }], 'empty snapshots must clear populated native series');
assert.deepEqual(emptySnapshot.data, [], 'cleared native series must expose no stale points');

const invalidInitial = makeSeries();
applyCoreSpiritPlotSnapshot(invalidInitial, [
  { time: Number.NaN, value: 10 }, { time: 1000, value: Number.NaN },
  { time: Number.POSITIVE_INFINITY, value: null },
], []);
assert.deepEqual(invalidInitial.calls, [{ type: 'setData', points: [] }], 'all-invalid initial snapshots must commit an empty series');

const invalidReplacement = makeSeries(existing);
applyCoreSpiritPlotSnapshot(invalidReplacement, [
  { time: 1000, value: Number.NaN }, { time: Number.POSITIVE_INFINITY, value: 99 },
], existing);
assert.deepEqual(invalidReplacement.data, [], 'all-invalid replacement snapshots must not preserve stale EMA values');
assert.deepEqual(invalidReplacement.calls, [{ type: 'setData', points: [] }]);

const invalidTail = makeSeries(existing);
applyCoreSpiritPlotSnapshot(invalidTail, [
  { time: 1000, value: 10 }, { time: 2000, value: 11 }, { time: Number.NaN, value: 12 },
], existing);
assert.deepEqual(invalidTail.data, existing, 'invalid tail forces a filtered full replacement instead of leaving an arbitrary previous snapshot');
assert.equal(invalidTail.calls[0]?.type, 'setData', 'invalid-tail recovery uses a deterministic full replacement');

const formingReplacement = makeSeries(existing);
applyCoreSpiritPlotSnapshot(formingReplacement, [
  { time: 1000, value: 10 }, { time: 2000, value: 12 },
], existing);
assert.deepEqual(formingReplacement.calls, [{ type: 'update', point: { time: 2000, value: 12 } }], 'same-time forming bar updates in place');

const append = makeSeries(existing);
applyCoreSpiritPlotSnapshot(append, [
  { time: 1000, value: 10 }, { time: 2000, value: 12 }, { time: 3000, value: 13 },
], existing);
assert.deepEqual(append.calls, [
  { type: 'update', point: { time: 2000, value: 12 } },
  { type: 'update', point: { time: 3000, value: 13 } },
], 'append must replace the previous forming bar before adding the new bar');

const correction = makeSeries(existing);
applyCoreSpiritPlotSnapshot(correction, [
  { time: 1000, value: 9 }, { time: 2000, value: 11 },
], existing);
assert.deepEqual(correction.calls, [{ type: 'setData', points: [{ time: 1000, value: 9 }, { time: 2000, value: 11 }] }],
  'historical corrections must replace the full series instead of only updating the last point');

const gap = makeSeries(existing);
applyCoreSpiritPlotSnapshot(gap, [
  { time: 1000, value: 10 }, { time: 2000, value: null },
], existing);
assert.deepEqual(gap.calls, [{ type: 'update', point: { time: 2000 } }], 'null values are valid plot gaps, not malformed snapshots');

console.log('CORESPIRIT_PLOT_SNAPSHOT_CONTRACT_OK');

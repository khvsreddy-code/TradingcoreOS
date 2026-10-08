import assert from 'node:assert/strict';

const { CoreSpiritSceneDiff, outputDirtySpan } = await import('./src/services/core/chart/coreSpiritSceneDiff.ts');

const diff = new CoreSpiritSceneDiff('dirty-span-contract');

const inside = {
  kind: 'series',
  time: 100,
  value: 101,
  seriesId: 'inside',
};
const outside = {
  kind: 'series',
  time: 50,
  value: 99,
  seriesId: 'outside',
};

assert.deepEqual(outputDirtySpan(inside), { from: 100, to: 100 });
assert.deepEqual(outputDirtySpan(outside), { from: 50, to: 50 });

diff.seed([inside, outside]);
const patches = diff.apply([
  { ...inside, value: 102 },
  { ...outside, value: 98 },
], { from: 100, to: 100 });

assert.equal(patches.length, 1);
const valuePatch = patches[0];
assert.equal(valuePatch.kind, 'value');
assert.equal(valuePatch.dirty.from, 100);
assert.equal(valuePatch.dirty.to, 100);
assert.equal(valuePatch.series.length, 1);
assert.equal(valuePatch.series[0].seriesId, 'dirty-span-contract:series:inside');

console.log('CORESPIRIT_EXACT_DIRTY_SPAN_CONTRACT_OK');

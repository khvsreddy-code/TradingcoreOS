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


// Emitted patch bounds are the union of changed time-bearing outputs, not the
// caller's potentially much wider dirty request.
const envelopeDiff = new CoreSpiritSceneDiff('dirty-span-envelope');
const earlier = { kind: 'series', time: 95, value: 10, seriesId: 'earlier' };
const later = { kind: 'series', time: 105, value: 20, seriesId: 'later' };
envelopeDiff.seed([earlier, later]);
const envelopePatches = envelopeDiff.apply([
  { ...earlier, value: 11 },
  { ...later, value: 21 },
], { from: 90, to: 110 });
const envelopeValuePatch = envelopePatches.find(patch => patch.kind === 'value');
assert.ok(envelopeValuePatch, 'time-bounded changes should emit a value patch');
assert.deepEqual(envelopeValuePatch.dirty, { from: 95, to: 105 }, 'value patch should carry the exact changed output envelope');
assert.equal(envelopeValuePatch.series.length, 2);

console.log('CORESPIRIT_EXACT_DIRTY_SPAN_CONTRACT_OK');

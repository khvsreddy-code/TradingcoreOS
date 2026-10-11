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


const movedLineDiff = new CoreSpiritSceneDiff('dirty-span-moved-line');
const oldLine = { kind: 'line', id: 'resistance', start: { time: 95, price: 200 }, end: { time: 105, price: 210 } };
movedLineDiff.seed([oldLine]);
const movedLinePatches = movedLineDiff.apply([
  { ...oldLine, start: { time: 200, price: 220 }, end: { time: 220, price: 230 } },
], { from: 90, to: 110 });
const movedLinePatch = movedLinePatches.find(patch => patch.kind === 'value');
assert.ok(movedLinePatch, 'moving a retained line out of the dirty window must emit a patch');
assert.deepEqual(movedLinePatch.dirty, { from: 95, to: 220 }, 'moved line patch must invalidate both prior and replacement geometry');
assert.equal(movedLinePatch.collections[0].values[0].id, 'resistance');

const movedMarkerDiff = new CoreSpiritSceneDiff('dirty-span-moved-marker');
movedMarkerDiff.seed([
  { kind: 'marker', id: 'm1', time: 10, price: 100 },
  { kind: 'marker', id: 'move-me', time: 20, price: 101 },
  { kind: 'marker', id: 'm3', time: 30, price: 102 },
]);
const movedMarkerPatches = movedMarkerDiff.apply([
  { kind: 'marker', id: 'move-me', time: 40, price: 103 },
], { from: 15, to: 25 });
const movedMarkerPatch = movedMarkerPatches.find(patch => patch.kind === 'value');
assert.deepEqual(movedMarkerPatch.dirty, { from: 20, to: 40 }, 'marker relocation must invalidate its old and new bars');
assert.equal(movedMarkerPatch.series.length, 2, 'relocating an identified marker must remove then insert, not overwrite an unrelated index');
assert.equal(movedMarkerPatch.series[0].remove, 1);
assert.equal(movedMarkerPatch.series[0].start, 1);
assert.equal(movedMarkerPatch.series[1].remove, 0);
assert.equal(movedMarkerPatch.series[1].start, 1);

assert.deepEqual(outputDirtySpan({
  kind: 'customVisual',
  id: 'wide-geometry',
  time: 100,
  geometry: { kind: 'polygon', points: [{ x: 80, y: 1 }, { x: 120, y: 2 }] },
}), { from: 80, to: 120 }, 'custom geometry must dirty the full point extent, not only its anchor bar');

console.log('CORESPIRIT_EXACT_DIRTY_SPAN_CONTRACT_OK');

import assert from 'node:assert/strict';

const { CoreSpiritSceneDiff, outputDirtySpan } = await import('./services/core/chart/coreSpiritSceneDiff.ts');
const { applyScenePatch } = await import('../vendor/vela/src/core/model/scenePatch.ts');

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
assert.equal(movedMarkerPatch.series[1].start, 2, 'insert index is computed against the final sorted sequence after removing the old marker');

const velaMarkerModel = {
  series: [{
    id: movedMarkerDiff.markerSeriesId,
    kind: 'markers',
    markers: [{ time: 10, position: 'aboveBar', shape: 'circle', color: '#fff' }, { time: 20, position: 'aboveBar', shape: 'circle', color: '#fff' }, { time: 30, position: 'aboveBar', shape: 'circle', color: '#fff' }],
  }],
  fills: [],
  instanceBatches: [],
};
applyScenePatch(velaMarkerModel, movedMarkerPatch);
assert.deepEqual(
  velaMarkerModel.series[0].markers.map(marker => marker.time),
  [10, 30, 40],
  'Vela must apply marker move deltas in order without overwriting a neighboring marker',
);
assert.deepEqual(movedMarkerDiff.snapshot().markers.map(marker => marker.time), [10, 30, 40]);

const indexedMarkerDiff = new CoreSpiritSceneDiff('dirty-span-indexed-markers');
indexedMarkerDiff.seed(Array.from({ length: 1000 }, (_, index) => ({
  kind: 'marker', id: `marker-${index}`, time: index, price: 100 + index,
})));
assert.equal(indexedMarkerDiff.snapshot().markers.length, 1000, 'ordered marker index should retain every seeded marker');
assert.deepEqual(
  indexedMarkerDiff.snapshot().markers.slice(0, 3).map(marker => marker.time),
  [0, 1, 2],
);
const sameTimeMarkerPatch = indexedMarkerDiff.apply([
  { kind: 'marker', id: 'marker-999', time: 999, price: 9999, metadata: { color: '#0f0' } },
], { from: 999, to: 999 }).find(patch => patch.kind === 'value');
assert.equal(sameTimeMarkerPatch.series.length, 1, 'forming-marker updates should emit one replacement, not reorder the marker list');
assert.equal(sameTimeMarkerPatch.series[0].start, 999);
assert.equal(sameTimeMarkerPatch.series[0].op, 'replace-range');
assert.equal(indexedMarkerDiff.snapshot().markers[999].color, '#0f0');

assert.deepEqual(outputDirtySpan({
  kind: 'customVisual',
  id: 'wide-geometry',
  time: 100,
  geometry: { kind: 'polygon', points: [{ x: 80, y: 1 }, { x: 120, y: 2 }] },
}), { from: 80, to: 120 }, 'custom geometry must dirty the full point extent, not only its anchor bar');

assert.equal(outputDirtySpan({
  kind: 'customVisual',
  id: 'screen-geometry',
  time: 100,
  geometry: { kind: 'polygon', points: [
    { kind: 'point', space: 'screen', x: 8, y: 4 },
    { kind: 'point', space: 'screen', x: 90, y: 4 },
    { kind: 'point', space: 'screen', x: 90, y: 40 },
  ] },
}), null, 'screen-space x values must not be mistaken for market timestamps; null requires conservative dirty-range fallback');

assert.deepEqual(outputDirtySpan({
  kind: 'customVisual',
  id: 'time-geometry',
  geometry: { kind: 'line', from: { kind: 'point', space: 'time', x: 85, y: 4 }, to: { kind: 'point', space: 'time', x: 115, y: 40 } },
}), { from: 85, to: 115 }, 'time-space custom lines should expose their complete market-time span');



assert.deepEqual(outputDirtySpan({
  kind: 'line',
  id: 'anchored-line',
  time: 100,
  start: { time: 80, price: 200 },
  end: { time: 120, price: 220 },
}), { from: 80, to: 120 }, 'an anchor timestamp must not truncate line endpoint invalidation');

assert.deepEqual(outputDirtySpan({
  kind: 'polyline',
  id: 'anchored-polyline',
  time: 100,
  points: [{ time: 70, price: 10 }, { time: 130, price: 20 }],
}), { from: 70, to: 130 }, 'polyline geometry must widen its anchor dirty span');

assert.deepEqual(outputDirtySpan({
  kind: 'footprint',
  id: 'anchored-footprint',
  time: 100,
  points: [{ time: 90, price: 10 }, { time: 110, price: 20 }],
}), { from: 90, to: 110 }, 'footprint geometry must widen its anchor dirty span');

assert.equal(outputDirtySpan({
  kind: 'box',
  id: 'viewport-box',
  time: 100,
  domain: 'viewport',
  left: 80,
  right: 120,
}), null, 'viewport geometry must not be falsely bounded by a market-time anchor');

console.log('CORESPIRIT_EXACT_DIRTY_SPAN_CONTRACT_OK');

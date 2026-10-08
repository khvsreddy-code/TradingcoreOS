import assert from 'node:assert/strict';

import {
  ADVANCED_DRAWING_FAMILIES,
  drawingFamilyForType,
  drawingTypes,
  defaultToolbar,
  loadDrawingFamily,
} from './vendor/vela/src/core/drawings/index.ts';

const advancedTypes = [
  'parallelchannel',
  'fibretracement',
  'gartley',
];

for (const type of advancedTypes) {
  assert.ok(drawingFamilyForType(type), 'advanced drawing family missing for ' + type);
}

const before = new Set(drawingTypes().map((meta) => meta.type));
assert.equal(before.has('parallelchannel'), false);
assert.equal(before.has('fibretracement'), false);
assert.equal(before.has('gartley'), false);

const toolbar = defaultToolbar();
assert.ok(toolbar.groups.some((group) => group.id === 'fibonacci-gann'));
assert.ok(toolbar.groups.some((group) => group.id === 'patterns-waves-harmonics'));

await loadDrawingFamily('channels');
const channelsAfter = new Set(drawingTypes().map((meta) => meta.type));
assert.equal(channelsAfter.has('parallelchannel'), true);
assert.equal(channelsAfter.has('fibretracement'), false, 'loading channels must not hydrate fibonacci');

await loadDrawingFamily('patterns');
const patternsAfter = new Set(drawingTypes().map((meta) => meta.type));
assert.equal(patternsAfter.has('gartley'), true);
assert.equal(patternsAfter.has('fibretracement'), false, 'loading patterns must not hydrate fibonacci');

assert.deepEqual([...ADVANCED_DRAWING_FAMILIES], ['channels', 'fibonacci', 'patterns']);

console.log('VELA_ADVANCED_DRAWING_FAMILY_LAZY_CONTRACT_OK');

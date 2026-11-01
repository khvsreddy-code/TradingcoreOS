import assert from 'node:assert/strict';
import { compileCoreSpirit } from './coreSpiritPipeline.ts';
import { CoreSpiritRuntime } from './runtime.ts';

const source = `indicator("Retained origin-anchored zones") {
  overlay: true
}

let zoneOrigin: state<number> = 0
if bar_index == 1 {
  zoneOrigin := time[0]
}
if bar_index == 3 {
  zoneOrigin := time[0]
}
if zoneOrigin > 0 {
  zone(zoneOrigin, time[0], 12, 10, "#123456", "#123456", 0.2)
}
`;

const compiled = compileCoreSpirit(source, 'retained-zone-identity', { layer: 'script' });
assert.deepEqual(compiled.diagnostics.filter(item => item.severity === 'error'), [],
  'the retained-zone fixture must compile');
assert.ok(compiled.ir, 'the retained-zone fixture must produce executable IR');

const base = Date.parse('2026-10-30T03:45:00.000Z');
const bars = Array.from({ length: 5 }, (_, index) => {
  const price = 100 + index;
  return {
    timestamp: new Date(base + index * 300_000).toISOString(),
    open: price, high: price + 1, low: price - 1, close: price + 0.25, volume: 1000 + index,
  };
});
const epoch = bar => Date.parse(bar.timestamp) / 1000;
const runtime = new CoreSpiritRuntime({ sourceId: 'retained-zone-identity' });
const seeded = runtime.executeIr(compiled.ir, bars.slice(0, 4));
assert.deepEqual(seeded.diagnostics, [], 'the retained-zone history must execute cleanly');
const zones = result => result.outputs
  .filter(item => item.kind === 'zone' && item.style?.fillColor === '#123456')
  .slice()
  .sort((a, b) => a.left - b.left);

const seededZones = zones(seeded);
assert.equal(seededZones.length, 2,
  'a new origin at the same zone() call site must retain the previous historical zone');
assert.equal(seededZones[0].left, epoch(bars[1]), 'the first zone must retain its original left anchor');
assert.equal(seededZones[0].right, epoch(bars[2]),
  'the first zone must keep its last emitted right edge when the active origin changes');
assert.equal(seededZones[1].left, epoch(bars[3]), 'the second zone must use the new origin anchor');
assert.equal(seededZones[1].right, epoch(bars[3]));
assert.notEqual(seededZones[0].id, seededZones[1].id,
  'separate origin times must map to separate retained scene identities');

const firstLive = runtime.executeBar(bars[4], 'realtime');
const firstLiveZone = zones(firstLive).find(item => item.left === epoch(bars[3]));
assert.ok(firstLiveZone, 'the active zone must be emitted on the live bar');
assert.equal(firstLiveZone.id, seededZones[1].id, 'live extension must preserve the active zone identity');
assert.equal(firstLiveZone.right, epoch(bars[4]), 'the active zone must extend to the latest live bar');

const revisedBar = { ...bars[4], high: bars[4].high + 0.5, close: bars[4].close + 0.2 };
const revisedLive = runtime.executeBar(revisedBar, 'realtime');
const revisedZones = zones(revisedLive);
assert.equal(revisedZones.filter(item => item.left === epoch(bars[3])).length, 1,
  'forming-bar replacement must not duplicate the active zone');
assert.equal(revisedZones.find(item => item.left === epoch(bars[3]))?.id, firstLiveZone.id,
  'forming-bar replacement must preserve the active zone identity');
assert.equal(revisedZones.find(item => item.left === epoch(bars[3]))?.right, epoch(revisedBar),
  'the active zone right edge must follow the corrected forming bar');
console.log('CORESPIRIT_RETAINED_ZONE_IDENTITY_OK');

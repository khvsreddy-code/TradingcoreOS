import assert from 'node:assert/strict';
import { CanonicalDataPlane } from './canonicalDataPlane';
import {
  assertCanonicalMarketDataPacket,
  createCanonicalMarketDataPacket,
  packetTransferables,
  sliceCanonicalMarketView,
} from './canonicalMarketDataTransport';

const plane = new CanonicalDataPlane('test:nifty:5m');
plane.replace([
  { time: 100, open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { time: 200, open: 11, high: 13, low: 10, close: 12, volume: 110 },
  { time: 300, open: 12, high: 14, low: 11, close: 13, volume: 120 },
]);

const view = plane.read();
assert.equal(view.timeUnit, 'epoch-seconds');
assert.equal(view.sourceFrom, 0);
assert.equal(view.dirtyRange.timelineKey, 'test:nifty:5m');
assert.equal(view.dirtyRange.revision, view.revision);
assert.deepEqual([view.dirtyRange.from, view.dirtyRange.to], [0, 3]);

const sliced = sliceCanonicalMarketView(view, 1, 3);
assert.equal(sliced.length, 2);
assert.equal(sliced.sourceFrom, 1);
assert.equal(sliced.time[0], 200);
assert.equal(sliced.close[1], 13);
assert.deepEqual([sliced.dirtyFrom, sliced.dirtyTo], [0, 2]);

const packet = createCanonicalMarketDataPacket(view, 1, 3);
assert.equal(packet.version, 1);
assert.equal(packet.length, 2);
assert.equal(packet.timeUnit, 'epoch-seconds');
assert.equal(packet.sourceFrom, 1);
assert.equal(packet.sourceTo, 3);
assert.deepEqual([packet.dirtyRange.from, packet.dirtyRange.to], [0, 3]);
assert.deepEqual(Array.from(packet.time), [200, 300]);
assert.deepEqual(Array.from(packet.close), [12, 13]);
assert.equal(packet.open.buffer !== view.open.buffer, true);
assert.equal(packetTransferables(packet).length, 6);
assertCanonicalMarketDataPacket(packet);

const nestedView = plane.read(1, 3);
const nestedPacket = createCanonicalMarketDataPacket(nestedView, 1, 50);
assert.equal(nestedPacket.sourceFrom, 2, 'nested slices retain the absolute source offset');
assert.equal(nestedPacket.sourceTo, 3, 'sourceTo must match the actual copied slice');
assert.equal(nestedPacket.length, 1);

const outOfBounds = createCanonicalMarketDataPacket(view, 100, 110);
assert.equal(outOfBounds.sourceFrom, 3, 'out-of-range starts clamp to source timeline end');
assert.equal(outOfBounds.sourceTo, 3);
assert.equal(outOfBounds.length, 0);

const nanRange = sliceCanonicalMarketView(view, Number.NaN, Number.POSITIVE_INFINITY);
assert.equal(nanRange.sourceFrom, 0);
assert.equal(nanRange.length, view.length, 'non-finite range inputs use safe defaults');

plane.updateLast({ time: 300, open: 12, high: 15, low: 11, close: 14, volume: 130 });
const nonIntersecting = plane.read(0, 1);
assert.deepEqual(
  [nonIntersecting.dirtyFrom, nonIntersecting.dirtyTo],
  [1, 1],
  'dirty bounds outside a clipped view collapse to an empty local interval',
);

assert.throws(() => assertCanonicalMarketDataPacket({
  ...packet,
  sourceTo: packet.sourceTo - 1,
}), /source bounds/i);
assert.throws(() => assertCanonicalMarketDataPacket({
  ...packet,
  dirtyRange: { ...packet.dirtyRange, revision: packet.revision + 1 },
}), /timeline revision/i);

console.log('CANONICAL_MARKET_TRANSPORT_RUNTIME_OK');

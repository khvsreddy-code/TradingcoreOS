import assert from 'node:assert/strict';
import { CanonicalDataPlane } from './canonicalDataPlane';
import { createCanonicalMarketDataPacket, packetTransferables, sliceCanonicalMarketView } from './canonicalMarketDataTransport';

const plane = new CanonicalDataPlane('test:nifty:5m');
plane.replace([
  { time: 100, open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { time: 200, open: 11, high: 13, low: 10, close: 12, volume: 110 },
  { time: 300, open: 12, high: 14, low: 11, close: 13, volume: 120 },
]);

const view = plane.read();
const sliced = sliceCanonicalMarketView(view, 1, 3);
assert.equal(sliced.length, 2);
assert.equal(sliced.time[0], 200);
assert.equal(sliced.close[1], 13);

const packet = createCanonicalMarketDataPacket(view, 1, 3);
assert.equal(packet.version, 1);
assert.equal(packet.length, 2);
assert.deepEqual(Array.from(packet.time), [200, 300]);
assert.deepEqual(Array.from(packet.close), [12, 13]);
assert.equal(packet.open.buffer !== view.open.buffer, true);
assert.equal(packetTransferables(packet).length, 6);

console.log('TRADINGCORE_V115_CANONICAL_MARKET_TRANSPORT_OK');

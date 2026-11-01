import assert from 'node:assert/strict';
import {
  CORE_SPIRIT_SHARED_HEADER_BYTES,
  CoreSpiritSharedMarketBuffer,
  readCoreSpiritSharedMarketDescriptor,
} from './sharedMarketBuffer.ts';

function bar(index, price = 100 + index) {
  return {
    timestamp: new Date(Date.UTC(2026, 0, 1, 9, 15) + index * 60_000).toISOString(),
    open: price - 0.2,
    high: price + 0.5,
    low: price - 0.5,
    close: price + 0.1,
    volume: 1_000 + index,
  };
}

const market = new CoreSpiritSharedMarketBuffer(256, true);
const seedBars = [bar(0), bar(1)];
const seed = market.writeBars(seedBars, 1, 0, seedBars.length);
assert.equal(seed.capacity, 256, 'small chart contexts should start with a small power-of-two allocation');
assert.equal(seed.length, 2);
assert.equal(seed.buffer.byteLength, CORE_SPIRIT_SHARED_HEADER_BYTES + 256 * 8 * 6);

const expandedBars = Array.from({ length: 600 }, (_, index) => bar(index));
expandedBars[0] = bar(0, 220);
const expanded = market.writeBars(expandedBars, 2, 599, 600);
assert.notEqual(expanded.buffer, seed.buffer, 'fixed-capacity shared memory must be replaced when history exceeds its capacity');
assert.equal(expanded.capacity, 1_024, 'capacity should grow to the next power of two');
assert.equal(expanded.length, 600);
assert.equal(expanded.dirtyFrom, 0, 'resizing must force a full-frame publication even when the caller marked only the tail dirty');
assert.equal(expanded.dirtyTo, 600);
assert.equal(expanded.datasetVersion, 2);
assert.equal(expanded.sequence, seed.sequence + 1, 'buffer replacement must preserve a monotonic publication sequence');

const expandedColumns = readCoreSpiritSharedMarketDescriptor(expanded);
assert.equal(expandedColumns.time[0], Date.parse(expandedBars[0].timestamp) / 1000);
assert.equal(expandedColumns.open[0], expandedBars[0].open,
  'the new buffer must contain the full canonical history, including rows outside the caller dirty range');
assert.equal(expandedColumns.high[599], expandedBars[599].high);
assert.equal(expandedColumns.volume[599], expandedBars[599].volume);

const correctedBars = expandedBars.map(item => ({ ...item }));
correctedBars[20] = bar(20, 333);
const corrected = market.writeBars(correctedBars, 3, 20, 21);
assert.equal(corrected.dirtyFrom, 20);
assert.equal(corrected.dirtyTo, 21);
assert.equal(corrected.sequence, expanded.sequence + 1);
const correctedColumns = readCoreSpiritSharedMarketDescriptor(corrected);
assert.equal(correctedColumns.high[20], correctedBars[20].high,
  'same-capacity historical corrections must update only the requested dirty range');
assert.equal(correctedColumns.high[19], expandedBars[19].high,
  'same-capacity dirty-range writes must leave unaffected rows unchanged');

const transferable = new CoreSpiritSharedMarketBuffer(256, false);
const transferableDescriptor = transferable.writeBars(seedBars, 1, 0, seedBars.length);
assert.equal(transferableDescriptor.shared, false, 'the transferable fallback must remain available without SharedArrayBuffer');
assert.equal(transferableDescriptor.capacity, 256);
assert.equal(readCoreSpiritSharedMarketDescriptor(transferableDescriptor).close[1], seedBars[1].close);

console.log('CORESPIRIT_SHARED_MARKET_BUFFER_CONTRACT_OK');

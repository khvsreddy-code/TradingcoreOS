import assert from 'node:assert/strict';
import { MarketDataStore } from './marketDataStore';

function bar(minute: number, close: number) {
  const timestamp = new Date(Date.UTC(2026, 9, 14, 10, minute)).toISOString();
  return {
    timestamp,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: close * 10,
  };
}

const store = new MarketDataStore('NSE:RECONCILIATION:5m');
store.replaceHistoricalCandleRows([bar(0, 100), bar(5, 105), bar(10, 110)]);
const beforeRevision = store.revision;

store.reconcileHistoricalCandleRows([
  bar(10, 111), // Broker correction to an older/finalized candle.
  bar(2, 102),  // A missing bar inserted into the retained canonical timeline.
  bar(5, 106),  // Second correction in the same REST reconciliation batch.
]);

assert.equal(store.length, 4, 'reconciliation inserts a missing candle without duplicating existing timestamps');
assert.deepEqual(Array.from(store.time), [
  Date.parse(bar(0, 100).timestamp) / 1000,
  Date.parse(bar(2, 102).timestamp) / 1000,
  Date.parse(bar(5, 105).timestamp) / 1000,
  Date.parse(bar(10, 110).timestamp) / 1000,
], 'canonical timeline remains strictly ordered after insertions');

const view = store.views();
assert.equal(view.close[0], 100);
assert.equal(view.close[1], 102);
assert.equal(view.close[2], 106, 'existing finalized bars accept broker corrections');
assert.equal(view.close[3], 111, 'tail correction is reflected when reconciling canonical history');
assert.equal(view.volume[1], 1020);
assert.ok(store.revision > beforeRevision, 'a real correction batch increments the canonical revision');
assert.deepEqual(store.dirtyRange, { from: 1, to: 4 }, 'insertion invalidates shifted indices through the tail');

const committedRevision = store.revision;
store.reconcileHistoricalCandleRows([bar(2, 102), bar(5, 106), bar(10, 111)]);
assert.equal(store.revision, committedRevision, 'identical historical refreshes are idempotent and do not advance revisions');
assert.equal(store.length, 4);
assert.deepEqual(Array.from(store.close), [100, 102, 106, 111]);

console.log('MARKET_DATA_HISTORICAL_RECONCILIATION_RUNTIME_OK');

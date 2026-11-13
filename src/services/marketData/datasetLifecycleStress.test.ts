import assert from 'node:assert/strict';
import {
  getChartDataPlane,
  chartDataPlaneRegistrySize,
  chartDataPlaneRegistryStats,
  trimChartDataPlaneRegistry,
  clearChartDataPlaneRegistry,
} from './chartDataPlane';
import { chartMarketKey, chartMarketStore } from './chartMarketStore';
import { historyStore } from './HistoryStore';
import { MarketDataGraph } from '../core/data/marketDataGraph';
import {
  getCanonicalDataPlane,
  canonicalDataPlaneRegistryStats,
  trimCanonicalDataPlaneRegistry,
  releaseCanonicalDataPlane,
} from '../core/data/canonicalDataPlane';

const candle = (minute: number, close = 100) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 9, minute)).toISOString(),
  open: close - 1, high: close + 1, low: close - 2, close, volume: 10,
  phase: 'confirmed' as const, confirmed: true,
});

async function chartRegistryStress() {
  await clearChartDataPlaneRegistry();
  historyStore.clear();
  const pinned = getChartDataPlane('test-broker', 'PINNED', '1m');
  const releasePinned = pinned.retain();

  for (let index = 0; index < 180; index += 1) {
    const symbol = `SWITCH-${index}`;
    const plane = getChartDataPlane('test-broker', symbol, '1m');
    historyStore.set('test-broker', symbol, '1minute', [
      candle(0, 100 + index),
      { ...candle(1, 101 + index), phase: 'developing' as const, confirmed: false },
    ], 2);
    assert.equal(plane.isDisposed, false);
    await trimChartDataPlaneRegistry({ maxEntries: 12, maxIdleMs: Number.POSITIVE_INFINITY, now: Date.now() + 1 });
    assert.equal(pinned.isDisposed, false, 'active chart lease must pin its entire dataset');
    assert.ok(chartDataPlaneRegistrySize() <= 12, 'chart data plane registry must stay within its idle budget');
  }

  assert.ok(chartDataPlaneRegistryStats().active >= 1);
  releasePinned();
  await trimChartDataPlaneRegistry({ maxEntries: 12, maxIdleMs: 0, now: Date.now() + 1 });
  assert.ok(chartDataPlaneRegistrySize() <= 12);
  assert.equal(pinned.isDisposed, true, 'released chart datasets must become evictable');

  const flushCandidate = getChartDataPlane('test-broker', 'PERSIST-CHECK', '1m');
  historyStore.set('test-broker', 'PERSIST-CHECK', '1minute', [
    candle(0, 200),
    { ...candle(1, 201), phase: 'developing' as const, confirmed: false },
  ], 2);
  assert.equal(await flushCandidate.persistConfirmedHistoryForEviction(), true,
    'eviction must flush confirmed history before releasing resident buffers');
  await trimChartDataPlaneRegistry({ maxEntries: 12, maxIdleMs: 0, now: Date.now() + 1 });
  assert.equal(flushCandidate.isDisposed, true, 'the persisted candidate should be released after its history flush');
  await clearChartDataPlaneRegistry();
}

function chartMarketStoreStress() {
  chartMarketStore.clear();
  const pinnedKey = chartMarketKey('test-broker', 'RING-PIN');
  const release = chartMarketStore.subscribe(pinnedKey, () => {});
  chartMarketStore.publish(pinnedKey, { instrumentKey: 'RING-PIN', ltp: 100 } as any);

  for (let index = 0; index < 120; index += 1) {
    const symbol = `RING-${index}`;
    chartMarketStore.publish(chartMarketKey('test-broker', symbol), {
      instrumentKey: symbol, ltp: 100 + index,
    } as any);
  }
  const stats = chartMarketStore.stats();
  assert.ok(stats.entries <= stats.maxEntries, 'idle tick rings must be bounded by the store LRU');
  assert.equal(stats.activeEntries, 1, 'active tick-ring subscribers must be pinned');
  assert.equal(chartMarketStore.getRevision(pinnedKey), 1, 'active tick ring must survive pressure from other symbols');
  release();
  chartMarketStore.evictIfUnused(pinnedKey);
  chartMarketStore.clear();
}

function graphRegistryStress() {
  const graph = new MarketDataGraph({ anchorSecondsUtc: 0 }, 8);
  const releasePinned = graph.retainSymbol('GRAPH-PIN');
  graph.syncBase('GRAPH-PIN', '1m', [candle(0), candle(1), candle(2)]);

  for (let index = 0; index < 120; index += 1) {
    const symbol = `GRAPH-${index}`;
    graph.syncBase(symbol, '1m', [candle(0, 100 + index), candle(1, 101 + index), candle(2, 102 + index)]);
    assert.ok(graph.ensureNode(symbol, '5m'), 'derived timeframe node should be created');
  }
  const stats = graph.stats();
  assert.ok(stats.symbols <= 8, 'base and derived timeframe nodes must be evicted by symbol group');
  assert.ok(stats.nodes <= 16, 'each retained symbol may hold the tested base and derived timeframe');
  assert.ok(graph.listNodes().some(node => node.symbol === 'GRAPH-PIN'), 'active graph symbol lease must prevent eviction');

  releasePinned();
  graph.trimIdleSymbols();
  assert.ok(graph.stats().symbols <= 8);
  graph.clear();
  assert.equal(graph.stats().nodes, 0, 'graph clear must release graph-owned canonical planes');
}

function canonicalRegistryStress() {
  const pinned = getCanonicalDataPlane('lifecycle-contract:pinned');
  pinned.attachConsumer('lifecycle-contract-owner', 'chart');
  for (let index = 0; index < 80; index += 1) getCanonicalDataPlane(`lifecycle-contract:${index}`);
  trimCanonicalDataPlaneRegistry({ maxUnowned: 6 });
  const stats = canonicalDataPlaneRegistryStats();
  assert.ok(stats.unowned <= 6, 'unowned canonical typed datasets must obey the global LRU budget');
  assert.ok(stats.pinned >= 1, 'consumer-owned canonical datasets must never be evicted');
  pinned.detachConsumer('lifecycle-contract-owner');
  assert.equal(releaseCanonicalDataPlane('lifecycle-contract:pinned', pinned), true);
}

await chartRegistryStress();
chartMarketStoreStress();
graphRegistryStress();
canonicalRegistryStress();
await clearChartDataPlaneRegistry();
historyStore.clear();
console.log('MARKET_DATASET_LIFECYCLE_STRESS_OK');

import assert from 'node:assert/strict';
import { ChartDataPlane } from './chartDataPlane.ts';
import { requiredIndicatorHistoryBars, initialHistoryCandles } from './chartHistoryPolicy.ts';
import { tradingCoreRuntime } from '../runtime/TradingCoreRuntime.ts';

assert.equal(initialHistoryCandles('5m'), 300);
assert.equal(initialHistoryCandles('1D'), 300);
assert.equal(requiredIndicatorHistoryBars([]), 300);
assert.equal(requiredIndicatorHistoryBars([
  { enabled: true, kind: 'EMA', period: 500 },
  { enabled: false, kind: 'SMA', period: 4000 },
]), 532);
assert.equal(requiredIndicatorHistoryBars([
  { enabled: true, kind: 'TradingCore V Price Action', lookback: 900, mtf: 2 },
]), 1832);

const originalColumns = tradingCoreRuntime.getHistoricalDataColumns;
const requests = [];
const baseTime = 1_700_000_000;
tradingCoreRuntime.getHistoricalDataColumns = async (_symbol, _interval, _signal, limit) => {
  requests.push(limit);
  await new Promise(resolve => setTimeout(resolve, 12));
  const count = Number(limit);
  return {
    time: Float64Array.from({ length: count }, (_, index) => baseTime + index * 300),
    open: Float64Array.from({ length: count }, (_, index) => 100 + index),
    high: Float64Array.from({ length: count }, (_, index) => 101 + index),
    low: Float64Array.from({ length: count }, (_, index) => 99 + index),
    close: Float64Array.from({ length: count }, (_, index) => 100.5 + index),
    volume: Float64Array.from({ length: count }, () => 1000),
    timeUnit: 'seconds',
  };
};
const plane = new ChartDataPlane('contract-broker', 'NSE:CONTRACT-HISTORY', '5m');
try {
  const viewportRequest = plane.ensureReadyHistory(300);
  await new Promise(resolve => setTimeout(resolve, 2));
  // A declared script/indicator lookback may exceed the former 2,000-bar
  // compatibility cap. The chart must fetch and retain the requested suffix.
  const lookbackRequest = plane.ensureReadyHistory(3200);
  const [viewportBars, requiredBars] = await Promise.all([viewportRequest, lookbackRequest]);
  assert.equal(viewportBars.length, 300);
  assert.equal(requiredBars.length, 3200);
  assert.deepEqual(requests, [300, 3200]);
  assert.equal(plane.isHistoryDepthSatisfied(3200), true);
} finally {
  plane.dispose();
  tradingCoreRuntime.getHistoricalDataColumns = originalColumns;
}
console.log('CHART_HISTORY_COLD_START_AND_LOOKBACK_CONTRACT_OK');

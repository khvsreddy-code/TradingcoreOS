import assert from 'node:assert/strict';
import { columnarSeriesLength, columnarSeriesValue } from './services/coreSpirit/columnarSeries.ts';

const columns = {
  time: new Float64Array([1000, 1001, 1002]),
  open: new Float64Array([10, 11, 12]),
  high: new Float64Array([11, 12, 13]),
  low: new Float64Array([9, 10, 11]),
  close: new Float64Array([10.5, 11.5, 12.5]),
  volume: new Float64Array([100, 110, 120]),
  length: 3,
};

assert.equal(columnarSeriesLength(columns), 3);
assert.equal(columnarSeriesValue(columns, 'close', 2), 12.5);
assert.equal(columnarSeriesValue(columns, 'close', -1), null);
assert.equal(columnarSeriesValue(columns, 'close', 3), null);

console.log('TRADINGCORE_P0_COLUMNAR_CORESPIRIT_CONTRACT_OK');

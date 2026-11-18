import assert from 'node:assert/strict';
import { ichimokuCloud } from '../vendor/vela/src/core/native-indicators/classics/overlays.ts';
import type { OHLCV } from '../vendor/vela/src/core/model/ohlcv.ts';
const bars: OHLCV[] = Array.from({ length: 80 }, (_, i) => ({
  time: 1_700_000_000_000 + i * 60_000,
  open: 50 + i,
  high: 52 + i,
  low: 48 + i,
  close: 50 + i,
  volume: 100 + i,
}));
const output = ichimokuCloud.compute(bars, {});
const find = (key: string) => output.plots.find((plot) => plot.key === key)!;
assert.equal(find('conversion').values[8], 54, '9-bar conversion line uses the highest high / lowest low midpoint');
assert.equal(find('base').values[25], 37.5 + 50, '26-bar base line uses the correct rolling midpoint');
assert.equal(find('spanB').values[51], 50 + 51 - 25.5, '52-bar leading span B uses the correct rolling midpoint');
assert.equal(find('spanA').offset, 26, 'leading span A is displaced forward');
assert.equal(find('spanB').offset, 26, 'leading span B is displaced forward');
assert.equal(find('chikou').offset, -26, 'lagging close is displaced backward');
assert.equal(find('conversion').values[7], Number.NaN, 'conversion warm-up remains blank');
const custom = ichimokuCloud.compute(bars, { conversionPeriod: 5, basePeriod: 10, spanBPeriod: 20, displacement: 12 });
assert.equal(custom.plots.find((plot) => plot.key === 'spanA')?.offset, 12, 'displacement is configurable');
console.log('VELA_ICHIMOKU_MATH_CONTRACT_OK');

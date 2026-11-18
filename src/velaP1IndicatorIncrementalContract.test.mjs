import assert from 'node:assert/strict';
import { IncrementalIndicatorRuntime } from './services/marketData/incrementalIndicatorEngine.ts';
import { wma, rma } from './services/marketData/coreIndicatorKernel.ts';
const batchVwma = (prices, volumes, period) => { const start=prices.length-period; let pv=0,v=0; for(let i=start;i<prices.length;i++){pv+=prices[i]*volumes[i];v+=volumes[i];} return v>0?pv/v:null; };

const bars = Array.from({ length: 36 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 9, 15 + i)).toISOString(),
  open: 100 + Math.sin(i / 3) * 4,
  high: 102 + Math.sin(i / 3) * 4,
  low: 98 + Math.sin(i / 3) * 4,
  close: 100 + Math.sin(i / 3) * 4 + i * 0.25,
  volume: 100 + i * 3,
}));
const configs = [
  { id: 'wma', kind: 'WMA', period: 9, enabled: true },
  { id: 'rma', kind: 'RMA', period: 9, enabled: true },
  { id: 'vwma', kind: 'VWMA', period: 9, enabled: true },
];
const runtime = new IncrementalIndicatorRuntime();
const seeded = runtime.seed(bars, configs);
assert.equal(seeded.ready, true);
const findLast = (id) => runtime.fullResults().find((item) => item.id === id)?.data.at(-1)?.value;
const values = (key) => bars.map((bar) => bar[key]);
const close = values('close');
const volume = values('volume');
const assertNear = (actual, expected, label) => {
  assert.ok(Number.isFinite(actual), label + ' must be finite');
  assert.ok(Math.abs(actual - expected) < 1e-8, label + ' batch/stream parity: ' + actual + ' vs ' + expected);
};
assertNear(findLast('wma'), wma(close, 9).at(-1), 'WMA seed');
assertNear(findLast('rma'), rma(close, 9).at(-1), 'RMA seed');
assertNear(findLast('vwma'), batchVwma(close, volume, 9), 'VWMA seed');

const forming = { ...bars.at(-1), close: bars.at(-1).close + 2.75, high: bars.at(-1).high + 2.75 };
const replaced = runtime.update(forming, 'replace', configs);
assert.equal(replaced.ready, true);
const replaceClose = [...close.slice(0, -1), forming.close];
const replaceVolume = volume;
assertNear(findLast('wma'), wma(replaceClose, 9).at(-1), 'WMA forming replacement');
assertNear(findLast('rma'), rma(replaceClose, 9).at(-1), 'RMA forming replacement');
assertNear(findLast('vwma'), batchVwma(replaceClose, replaceVolume, 9), 'VWMA forming replacement');

const appended = { ...forming, timestamp: new Date(Date.parse(forming.timestamp) + 60_000).toISOString(), close: forming.close + 0.8, high: forming.high + 0.8, low: forming.low + 0.8, volume: 220 };
const next = runtime.update(appended, 'append', configs);
assert.equal(next.ready, true);
const appendedClose = [...replaceClose, appended.close];
const appendedVolume = [...volume, appended.volume];
assertNear(findLast('wma'), wma(appendedClose, 9).at(-1), 'WMA append');
assertNear(findLast('rma'), rma(appendedClose, 9).at(-1), 'RMA append');
assertNear(findLast('vwma'), batchVwma(appendedClose, appendedVolume, 9), 'VWMA append');
console.log('VELA_P1_INCREMENTAL_AVERAGE_PARITY_OK');
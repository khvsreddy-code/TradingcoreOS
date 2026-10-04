import assert from 'node:assert/strict';
import {
  RollingMean,
  RollingVariance,
  RollingMinMax,
  RollingSum,
  RollingMedian,
  RollingPercentile,
} from './incrementalIndicatorKernel.ts';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

for (const period of [1, 2, 3, 5, 14, 31]) {
  const mean = new RollingMean(period);
  const sum = new RollingSum(period);
  const variance = new RollingVariance(period);
  const minmax = new RollingMinMax(period);
  const med = new RollingMedian(period);
  const pct = new RollingPercentile(period);
  const values: number[] = [];

  for (let i = 0; i < 300; i += 1) {
    const value = Math.sin(i * 0.17) * 10 + (i % 11) - 5;
    values.push(value);
    const gotMean = mean.update(value).value;
    const gotSum = sum.update(value).value;
    const gotVar = variance.update(value).value;
    const gotMM = minmax.update(value);
    const gotMed = med.update(value).value;
    const gotPct = pct.update(value);

    if (values.length >= period) {
      const w = values.slice(-period);
      const expectedMean = w.reduce((a, b) => a + b, 0) / period;
      const expectedSum = expectedMean * period;
      const expectedVariance = w.reduce((a, b) => a + (b - expectedMean) ** 2, 0) / period;
      assert.ok(Math.abs((gotMean ?? NaN) - expectedMean) < 1e-9);
      assert.ok(Math.abs((gotSum ?? NaN) - expectedSum) < 1e-8);
      assert.ok(Math.abs((gotVar ?? NaN) - Math.sqrt(expectedVariance)) < 1e-8);
      assert.equal(gotMM.min, Math.min(...w));
      assert.equal(gotMM.max, Math.max(...w));
      assert.ok(Math.abs((gotMed ?? NaN) - median(w)) < 1e-9);
      assert.ok(Math.abs((pct.rank(value) ?? NaN) - w.filter(v => v <= value).length / period) < 1e-12);
    } else {
      assert.equal(gotMean, null);
      assert.equal(gotVar, null);
      assert.equal(gotMed, null);
    }
  }

  const replacement = values[values.length - 1]! + 7;
  const last = values[values.length - 1]!;
  const prevWindow = values.slice(-period);
  mean.update(replacement, 'replace');
  sum.update(replacement, 'replace');
  variance.update(replacement, 'replace');
  minmax.update(replacement, 'replace');
  med.update(replacement, 'replace');
  pct.update(replacement, 'replace');
  prevWindow[prevWindow.length - 1] = replacement;
  assert.ok(Math.abs((mean.value() ?? NaN) - prevWindow.reduce((a, b) => a + b, 0) / period) < 1e-9);
  assert.equal(minmax.max(), Math.max(...prevWindow));
  assert.equal(minmax.min(), Math.min(...prevWindow));
  assert.ok(Math.abs((med.value() ?? NaN) - median(prevWindow)) < 1e-9);
  void last;
}

console.log('TRADINGCORE_V127_STATEFUL_KERNEL_NUMERIC_PARITY_OK');

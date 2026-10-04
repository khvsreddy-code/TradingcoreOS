import assert from 'node:assert/strict';
import {
  RollingSum,
  RollingMean,
  RollingVariance,
  RollingMinMax,
  RollingMedian,
  RollingPercentile,
  RollingAbsoluteDeviation,
  EMAState,
  WilderState,
  ATRState,
  WMAState,
  VWAPSessionState,
} from './statefulIndicatorKernel';

const nearly = (actual: number | null, expected: number, eps = 1e-9) => {
  assert.ok(actual != null && Number.isFinite(actual), `expected finite value, got ${String(actual)}`);
  assert.ok(Math.abs(actual - expected) <= eps, `expected ${expected}, got ${actual}`);
};

{
  const k = new RollingSum(3);
  assert.equal(k.update(1).value, null);
  assert.equal(k.update(2).value, null);
  nearly(k.update(3).value, 6);
  nearly(k.update(4).value, 9);
  nearly(k.update(10, 'replace').value, 15);
}

{
  const k = new RollingMean(3);
  k.update(1); k.update(2);
  nearly(k.update(3).value, 2);
  nearly(k.update(10, 'replace').value, 13 / 3);
}

{
  const k = new RollingVariance(3);
  k.update(1); k.update(2);
  nearly(k.update(3).value!, Math.sqrt(2 / 3));
  nearly(k.mean()!, 2);
  nearly(k.variance()!, 2 / 3);
  nearly(k.update(4, 'replace').value!, Math.sqrt(14 / 9));
}

{
  const k = new RollingMinMax(3);
  k.update(1); k.update(5); k.update(3);
  nearly(k.min()!, 1); nearly(k.max()!, 5);
  k.update(7);
  nearly(k.min()!, 3); nearly(k.max()!, 7);
  k.update(2, 'replace');
  nearly(k.min()!, 2); nearly(k.max()!, 7);
}

{
  const k = new RollingMedian(4);
  k.update(1); k.update(4); k.update(2);
  assert.equal(k.value(), null);
  nearly(k.update(3).value, 2.5);
  nearly(k.update(9, 'replace').value!, 3.0);
}

{
  const k = new RollingPercentile(4);
  k.update(1); k.update(4); k.update(2); k.update(3);
  nearly(k.percentile(0)!, 1);
  nearly(k.percentile(0.5)!, 2.5);
  nearly(k.percentile(1)!, 4);
  nearly(k.rank(3)!, 0.75);
}

{
  const k = new RollingAbsoluteDeviation(4);
  k.update(1); k.update(2); k.update(3);
  nearly(k.update(4).value!, 1);
  nearly(k.value(3)!, 1);
}

{
  const k = new EMAState(3);
  assert.equal(k.update(1), null);
  assert.equal(k.update(2), null);
  nearly(k.update(3)!, 2);
  nearly(k.update(4)!, 3);
  nearly(k.update(10, 'replace')!, 6);
}

{
  const k = new WilderState(3);
  k.updateWilder(1); k.updateWilder(2);
  nearly(k.updateWilder(3)!, 2);
  nearly(k.updateWilder(5)!, 3);
  nearly(k.updateWilder(10, 'replace')!, 5);
}

{
  const k = new ATRState(3);
  k.update(10, 9, 9.5);
  k.update(11, 10, 10.5);
  nearly(k.update(12, 10, 11)!, 1.3333333333333333);
  nearly(k.update(14, 12, 13)!, 1.8888888888888888);
}

{
  const k = new WMAState(3);
  k.update(1); k.update(2);
  nearly(k.update(3)!, 14 / 6);
  nearly(k.update(4)!, 20 / 6);
  nearly(k.update(10, 'replace')!, 38 / 6);
}

{
  const k = new VWAPSessionState();
  nearly(k.update('2026-10-04T03:45:00.000Z', 100, 10, 100)!, 100);
  nearly(k.update('2026-10-04T03:50:00.000Z', 110, 10, 0)!, 105);
  nearly(k.update('2026-10-04T03:50:00.000Z', 130, 10, 0, 'replace')!, 115);
}

console.log('TRADINGCORE_V128_STATEFUL_KERNEL_PARITY_OK');

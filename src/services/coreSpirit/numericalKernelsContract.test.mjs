import assert from 'node:assert/strict';
import {
  rollingMean, rollingSum, rollingVariance, rollingStd, rollingMin, rollingMax,
  ema, rma, wma, atr, rsi, linearRegression, correlation, covariance,
  zScore, dotProduct, matrixMultiply, matrixDecomposition, softmax, logSumExp,
  executeCoreSpiritNumericalKernel,
} from './numericalKernels.ts';
import { RollingMean, RollingSum, RollingVariance, RollingMinMax, EMAState, WilderState, WMAState, ATRState } from './statefulIndicatorKernel.ts';

const close = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${expected}, received ${actual}`);
const values = Float64Array.from([1, 2, 3, 4]);
assert.deepEqual(Array.from(rollingMean(values, 2), Number.isNaN), [true, false, false, false]);
close(rollingMean(values, 2)[1], 1.5);
close(rollingMean(values, 2)[3], 3.5);

const incrementalMean = new RollingMean(3);
assert.equal(incrementalMean.update(1).value, null, 'rolling mean must remain NaN until a full window forms');
assert.equal(incrementalMean.update(2).value, null, 'rolling mean warm-up must require consecutive finite observations');
close(incrementalMean.update(3).value, 2);
assert.equal(incrementalMean.update(Number.NaN).value, null,
  'a missing observation must reset incremental rolling mean instead of carrying a stale window across a gap');
assert.equal(incrementalMean.update(Number.POSITIVE_INFINITY).value, null,
  'non-finite observations must keep the rolling window invalid');
assert.equal(incrementalMean.update(4).value, null, 'a fresh window must warm up after a gap');
assert.equal(incrementalMean.update(5).value, null, 'a fresh window must still require its full period');
close(incrementalMean.update(6).value, 5);
const correctedMean = new RollingMean(3);
correctedMean.update(1); correctedMean.update(2); correctedMean.update(3);
correctedMean.update(Number.NaN);
correctedMean.update(4); correctedMean.update(5);
assert.equal(correctedMean.update(6, 'replace').value, null,
  'a forming-bar replacement must preserve the fresh-window warm-up boundary');

const incrementalSum = new RollingSum(3);
incrementalSum.update(1); incrementalSum.update(2);
assert.equal(incrementalSum.update(3).value, 6);
assert.equal(incrementalSum.update(Number.NaN).value, null,
  'rolling sum must invalidate its window when a market-data gap appears');
incrementalSum.update(4); incrementalSum.update(5);
assert.equal(incrementalSum.update(6).value, 15,
  'rolling sum must recover only after a complete finite post-gap window');

const incrementalVariance = new RollingVariance(3);
incrementalVariance.update(1); incrementalVariance.update(2);
incrementalVariance.update(3);
close(incrementalVariance.variance(), 2 / 3);
assert.equal(incrementalVariance.update(Number.POSITIVE_INFINITY).value, null,
  'rolling variance and standard deviation must reset across non-finite observations');
assert.equal(incrementalVariance.update(4).value, null);
assert.equal(incrementalVariance.update(5).value, null,
  'rolling variance must remain in warm-up until its entire window is finite');
close(incrementalVariance.update(6).value, Math.sqrt(2 / 3));
incrementalVariance.update(7);
close(incrementalVariance.variance(), 2 / 3);

const incrementalExtrema = new RollingMinMax(3);
incrementalExtrema.update(1); incrementalExtrema.update(2);
assert.deepEqual(incrementalExtrema.update(3), { count: 3, min: 1, max: 3 });
assert.deepEqual(incrementalExtrema.update(Number.NaN), { count: 0, min: null, max: null },
  'rolling high/low must invalidate old extrema instead of retaining a stale price window');
incrementalExtrema.update(4); incrementalExtrema.update(5);
assert.deepEqual(incrementalExtrema.update(6), { count: 3, min: 4, max: 6 },
  'rolling high/low must rewarm over consecutive finite prices after a gap');

const incrementalEma = new EMAState(3);
incrementalEma.update(1); incrementalEma.update(2);
assert.equal(incrementalEma.update(3), 2);
assert.equal(incrementalEma.update(Number.NaN), null,
  'EMA must not carry a stale recursive output across a missing input');
incrementalEma.update(4); incrementalEma.update(5);
close(incrementalEma.update(6), 5);

const incrementalRma = new WilderState(3);
incrementalRma.update(1); incrementalRma.update(2);
close(incrementalRma.update(3), 2);
assert.equal(incrementalRma.update(Number.POSITIVE_INFINITY), null,
  'Wilder/RMA must reset its recursive state on non-finite input');
incrementalRma.update(4); incrementalRma.update(5);
close(incrementalRma.update(6), 5);

const incrementalWma = new WMAState(3);
incrementalWma.update(1); incrementalWma.update(2);
close(incrementalWma.update(3), 14 / 6);
assert.equal(incrementalWma.update(Number.NaN), null,
  'WMA must invalidate its rolling state when a missing candle arrives');
incrementalWma.update(4); incrementalWma.update(5);
close(incrementalWma.update(6), 32 / 6);

const incrementalAtr = new ATRState(3);
incrementalAtr.update(10, 8, 9);
incrementalAtr.update(12, 9, 11);
close(incrementalAtr.update(13, 11, 12), 7 / 3);
assert.equal(incrementalAtr.update(Number.NaN, 10, 11), null,
  'ATR must clear its recursive state and previous-close dependency across missing OHLC');
incrementalAtr.update(14, 12, 13);
incrementalAtr.update(15, 13, 14);
close(incrementalAtr.update(16, 14, 15), 2,
  'ATR must reinitialize from an independent post-gap true-range history');
assert.deepEqual(Array.from(rollingSum(values, 2), Number.isNaN), [true, false, false, false]);
close(rollingSum(values, 2)[3], 7);
close(rollingVariance(Float64Array.from([1, 2, 3]), 2)[1], 0.25);
const highLevelPrices = Float64Array.from([1e12 + 0.125, 1e12 + 0.25, 1e12 + 0.375, 1e12 + 0.5]);
const highLevelVariance = rollingVariance(highLevelPrices, 3);
close(highLevelVariance[2], 1 / 96, 1e-7);
close(highLevelVariance[3], 1 / 96, 1e-7,
  'rolling variance should preserve precision as a high-price-level window advances');
const highLevelSampleVariance = rollingVariance(highLevelPrices, 3, 1);
close(highLevelSampleVariance[2], 1 / 64, 1e-7);
close(highLevelSampleVariance[3], 1 / 64, 1e-7,
  'sample variance should remain stable as the window advances');
close(rollingStd(Float64Array.from([1, 2, 3]), 2)[2], 0.5);
assert.deepEqual(Array.from(rollingMin(values, 2).slice(1)), [1, 2, 3]);
assert.deepEqual(Array.from(rollingMax(values, 2).slice(1)), [2, 3, 4]);
close(ema(Float64Array.from([1, 2, 3]), 2)[1], 5 / 3);
assert.ok(Number.isNaN(rma(Float64Array.from([1, 2, 3]), 2)[0]));
close(rma(Float64Array.from([1, 2, 3]), 2)[1], 1.5);
close(rma(Float64Array.from([1, 2, 3]), 2)[2], 2.25);
close(wma(Float64Array.from([1, 2, 3]), 2)[1], 5 / 3);
close(wma(Float64Array.from([1, 2, 3]), 2)[2], 8 / 3);

const highs = Float64Array.from([10, 12, 13]);
const lows = Float64Array.from([8, 9, 11]);
const closes = Float64Array.from([9, 11, 12]);
close(atr(highs, lows, closes, 2)[1], 2.5);
close(atr(highs, lows, closes, 2)[2], 2.25);
close(rsi(Float64Array.from([1, 2, 3]), 2)[2], 100);

const regression = linearRegression(Float64Array.from([1, 2, 3, 4]), 2);
close(regression.slope[1], 1);
close(regression.fitted[1], 2);
close(regression.fitted[3], 4);
close(regression.rSquared[3], 1);
const highLevelRegression = linearRegression(highLevelPrices, 3);
close(highLevelRegression.slope[2], 0.125, 1e-7,
  'linear regression slope should remain accurate at high absolute price levels');
close(highLevelRegression.fitted[2], highLevelPrices[2], 1e-5,
  'linear regression fitted price should preserve its high-level price anchor');
close(correlation(Float64Array.from([1, 2, 3]), Float64Array.from([2, 4, 6]), 2)[2], 1);
close(covariance(Float64Array.from([1, 2, 3]), Float64Array.from([2, 4, 6]), 2)[2], 0.5);
const highLevelY = Float64Array.from([2e12 + 0.25, 2e12 + 0.5, 2e12 + 0.75, 2e12 + 1]);
const highLevelCovariance = covariance(highLevelPrices, highLevelY, 3);
close(highLevelCovariance[2], 1 / 48, 1e-7);
close(highLevelCovariance[3], 1 / 48, 1e-7,
  'rolling covariance should remain stable as large-level price windows advance');
close(correlation(highLevelPrices, highLevelY, 3)[2], 1, 1e-7);
close(correlation(highLevelPrices, highLevelY, 3)[3], 1, 1e-7,
  'rolling correlation should remain stable as large-level price windows advance');
close(zScore(Float64Array.from([1, 2, 3]), 2)[2], 1);
close(dotProduct(Float64Array.from([1, 2, 3]), Float64Array.from([4, 5, 6])), 32);

const product = matrixMultiply(
  { rows: 2, columns: 2, data: Float64Array.from([1, 2, 3, 4]) },
  { rows: 2, columns: 2, data: Float64Array.from([5, 6, 7, 8]) },
);
assert.deepEqual(Array.from(product.data), [19, 22, 43, 50]);
const decomposition = matrixDecomposition({ rows: 2, columns: 2, data: Float64Array.from([4, 3, 6, 3]) });
assert.equal(decomposition.singular, false);
assert.deepEqual(Array.from(decomposition.permutation), [1, 0]);
close(logSumExp(Float64Array.from([1000, 1000])), 1000 + Math.log(2));
const probabilities = softmax(Float64Array.from([1000, 1001]));
close(probabilities[0] + probabilities[1], 1);
close(probabilities[1], 1 / (1 + Math.exp(-1)));
assert.ok(executeCoreSpiritNumericalKernel('rollingMean', [values], [2]) instanceof Float64Array);
assert.deepEqual(Array.from(executeCoreSpiritNumericalKernel('rollingSum', [values], [2]), Number.isNaN), [true, false, false, false]);

const withSumGap = rollingSum(Float64Array.from([1, Number.NaN, 3, 4]), 2);
assert.ok(Number.isNaN(withSumGap[1]));
assert.ok(Number.isNaN(withSumGap[2]));
close(withSumGap[3], 7);
const withGap = rollingMean(Float64Array.from([1, Number.NaN, 3, 4]), 2);
assert.ok(Number.isNaN(withGap[1]));
assert.ok(Number.isNaN(withGap[2]));
close(withGap[3], 3.5);
assert.throws(() => rollingMean(values, 0), /period/);
assert.throws(() => dotProduct([1], [1, 2]), /equal input lengths/);
assert.throws(() => matrixMultiply(
  { rows: 1, columns: 2, data: Float64Array.from([1, 2]) },
  { rows: 1, columns: 1, data: Float64Array.from([3]) },
), /inner dimensions/);

assert.throws(() => executeCoreSpiritNumericalKernel('matrixMultiply', [[], []], [257, 1, 1]), /dimensions must not exceed/);
assert.throws(() => executeCoreSpiritNumericalKernel('matrixDecomposition', [[1]], [2]), /input length must match/);

console.log('CoreSpirit numerical kernel contract: OK');

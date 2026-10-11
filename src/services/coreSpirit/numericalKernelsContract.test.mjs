import assert from 'node:assert/strict';
import {
  rollingMean, rollingVariance, rollingStd, rollingMin, rollingMax,
  ema, rma, wma, atr, rsi, linearRegression, correlation, covariance,
  zScore, dotProduct, matrixMultiply, matrixDecomposition, softmax, logSumExp,
  executeCoreSpiritNumericalKernel,
} from './numericalKernels.ts';

const close = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${expected}, received ${actual}`);
const values = Float64Array.from([1, 2, 3, 4]);
assert.deepEqual(Array.from(rollingMean(values, 2), Number.isNaN), [true, false, false, false]);
close(rollingMean(values, 2)[1], 1.5);
close(rollingMean(values, 2)[3], 3.5);
close(rollingVariance(Float64Array.from([1, 2, 3]), 2)[1], 0.25);
const highLevelPrices = Float64Array.from([1e12 + 0.125, 1e12 + 0.25, 1e12 + 0.375]);
close(rollingVariance(highLevelPrices, 3)[2], 1 / 96, 1e-7,
  'rolling variance should preserve small intrawindow movement around a large price level');
close(rollingVariance(highLevelPrices, 3, 1)[2], 1 / 32, 1e-7,
  'sample variance should use period - ddof as its denominator');
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
close(correlation(Float64Array.from([1, 2, 3]), Float64Array.from([2, 4, 6]), 2)[2], 1);
close(covariance(Float64Array.from([1, 2, 3]), Float64Array.from([2, 4, 6]), 2)[2], 0.5);
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

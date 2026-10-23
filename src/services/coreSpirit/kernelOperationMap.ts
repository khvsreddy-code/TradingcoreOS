/**
 * Tiny, dependency-free map from CoreScript builtin names to the canonical
 * numerical-kernel ABI. Keep this file safe to import from live/runtime code:
 * it must never import the kernel implementation or a compute provider.
 */
export type CoreSpiritKernelOperationName =
  | 'rollingMean' | 'rollingSum' | 'rollingVariance' | 'rollingStd' | 'rollingMin' | 'rollingMax'
  | 'ema' | 'rma' | 'wma' | 'atr' | 'rsi' | 'linearRegression'
  | 'correlation' | 'covariance' | 'zScore' | 'dotProduct' | 'matrixMultiply'
  | 'matrixDecomposition' | 'softmax' | 'logSumExp';

const BUILTIN_KERNEL_MAP: Readonly<Record<string, CoreSpiritKernelOperationName>> = Object.freeze({
  sma: 'rollingMean',
  mean: 'rollingMean',
  rollingMean: 'rollingMean',
  sum: 'rollingSum',
  rollingSum: 'rollingSum',
  variance: 'rollingVariance',
  rollingVariance: 'rollingVariance',
  stdev: 'rollingStd',
  stddev: 'rollingStd',
  standardDeviation: 'rollingStd',
  rollingStd: 'rollingStd',
  highest: 'rollingMax',
  rollingMax: 'rollingMax',
  lowest: 'rollingMin',
  rollingMin: 'rollingMin',
  ema: 'ema',
  rma: 'rma',
  wma: 'wma',
  atr: 'atr',
  rsi: 'rsi',
  linearRegression: 'linearRegression',
  linreg: 'linearRegression',
  correlation: 'correlation',
  covariance: 'covariance',
  zscore: 'zScore',
  zScore: 'zScore',
  dot: 'dotProduct',
  dotProduct: 'dotProduct',
  matmul: 'matrixMultiply',
  matrixMultiply: 'matrixMultiply',
  matrixDecomposition: 'matrixDecomposition',
  softmax: 'softmax',
  logSumExp: 'logSumExp',
});

export function coreSpiritKernelOperationForBuiltin(name: string): CoreSpiritKernelOperationName | undefined {
  return BUILTIN_KERNEL_MAP[name];
}

export function isCoreSpiritStatefulKernelOperation(operation: string): boolean {
  return ['ema', 'rma', 'atr', 'rsi'].includes(operation);
}

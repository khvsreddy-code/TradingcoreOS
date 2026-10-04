import { executeCoreSpiritFusedSeriesPipeline, type CoreSpiritSeriesOperation } from './seriesVector';

function referenceOne(input: Float64Array, operation: CoreSpiritSeriesOperation): Float64Array {
  const out = new Float64Array(input.length);
  out.fill(Number.NaN);
  const period = Math.max(1, Math.floor(Number(operation.length ?? 14)));

  if (operation.name === 'change' || operation.name === 'pctchange') {
    let previous = Number.NaN;
    for (let i = 0; i < input.length; i += 1) {
      const value = input[i]!;
      if (Number.isFinite(value) && Number.isFinite(previous)) {
        out[i] = operation.name === 'change'
          ? value - previous
          : previous === 0 ? Number.NaN : value / previous - 1;
      }
      previous = value;
    }
    return out;
  }

  if (operation.name === 'ema' || operation.name === 'rma') {
    const alpha = operation.name === 'rma' ? 1 / period : 2 / (period + 1);
    let seedSum = 0;
    let seedCount = 0;
    let state = Number.NaN;
    for (let i = 0; i < input.length; i += 1) {
      const value = input[i]!;
      if (!Number.isFinite(value)) {
        out[i] = Number.NaN;
        continue;
      }
      if (seedCount < period) {
        seedSum += value;
        seedCount += 1;
        if (seedCount === period) state = seedSum / period;
        else {
          out[i] = Number.NaN;
          continue;
        }
      } else {
        state = alpha * value + (1 - alpha) * state;
      }
      out[i] = state;
    }
    return out;
  }

  for (let i = 0; i < input.length; i += 1) {
    if (i + 1 < period) continue;
    const start = i + 1 - period;
    let valid = true;
    let sum = 0;
    let sumSquares = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let j = start; j <= i; j += 1) {
      const value = input[j]!;
      if (!Number.isFinite(value)) {
        valid = false;
        break;
      }
      sum += value;
      sumSquares += value * value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    if (!valid) continue;
    const mean = sum / period;
    switch (operation.name) {
      case 'sum':
        out[i] = sum;
        break;
      case 'mean':
      case 'sma':
        out[i] = mean;
        break;
      case 'highest':
        out[i] = max;
        break;
      case 'lowest':
        out[i] = min;
        break;
      case 'variance':
        out[i] = Math.max(0, sumSquares / period - mean * mean);
        break;
      case 'stdev':
        out[i] = Math.sqrt(Math.max(0, sumSquares / period - mean * mean));
        break;
      case 'wma': {
        let weighted = 0;
        for (let j = 0; j < period; j += 1) weighted += input[start + j]! * (j + 1);
        out[i] = weighted / (period * (period + 1) / 2);
        break;
      }
      case 'median': {
        const values = new Array<number>(period);
        for (let j = 0; j < period; j += 1) values[j] = input[start + j]!;
        values.sort((a, b) => a - b);
        const mid = Math.floor(period / 2);
        out[i] = period % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2;
        break;
      }
      case 'zscore': {
        const deviation = Math.sqrt(Math.max(0, sumSquares / period - mean * mean));
        out[i] = deviation === 0 ? 0 : (input[i]! - mean) / deviation;
        break;
      }
      case 'normalize':
        out[i] = max === min ? 0 : (input[i]! - min) / (max - min);
        break;
      case 'persistence': {
        let same = 0;
        let comparisons = 0;
        for (let j = start + 2; j <= i; j += 1) {
          const a = input[j]! - input[j - 1]!;
          const b = input[j - 1]! - input[j - 2]!;
          if (a && b) {
            comparisons += 1;
            if (Math.sign(a) === Math.sign(b)) same += 1;
          }
        }
        out[i] = comparisons ? same / comparisons : 0;
        break;
      }
      default:
        out[i] = Number.NaN;
    }
  }
  return out;
}

function referenceChain(input: Float64Array, operations: readonly CoreSpiritSeriesOperation[]): Float64Array {
  let current = input;
  for (const operation of operations) current = referenceOne(current, operation);
  return current;
}

function assertSeriesClose(actual: Float64Array, expected: Float64Array, label: string): void {
  if (actual.length !== expected.length) throw new Error(label + ': length mismatch');
  for (let i = 0; i < actual.length; i += 1) {
    const a = actual[i]!;
    const e = expected[i]!;
    if (Number.isNaN(a) && Number.isNaN(e)) continue;
    if (Math.abs(a - e) > 1e-10 * Math.max(1, Math.abs(e))) {
      throw new Error(label + ': mismatch at ' + i + ' actual=' + a + ' expected=' + e);
    }
  }
}

const input = new Float64Array([100, 102, 101, 105, 106, 104, 108, 110, 112, 111, 115, 117, 116, 118, 120, 119]);
const cases: Array<{ label: string; operations: CoreSpiritSeriesOperation[] }> = [
  { label: 'sma-stdev-zscore', operations: [{ name: 'sma', length: 3 }, { name: 'stdev', length: 2 }, { name: 'zscore', length: 2 }] },
  { label: 'ema-change-normalize', operations: [{ name: 'ema', length: 3 }, { name: 'change', length: 1 }, { name: 'normalize', length: 3 }] },
  { label: 'rma-wma-highest', operations: [{ name: 'rma', length: 3 }, { name: 'wma', length: 3 }, { name: 'highest', length: 2 }] },
  { label: 'median-persistence', operations: [{ name: 'median', length: 3 }, { name: 'persistence', length: 4 }] },
];

for (const test of cases) {
  const fused = executeCoreSpiritFusedSeriesPipeline(input, test.operations);
  const expected = referenceChain(input, test.operations);
  if (fused.stats.fusedPasses !== 1) throw new Error(test.label + ': fused pass count mismatch');
  if (fused.stats.intermediateAllocations !== 0) throw new Error(test.label + ': intermediate allocation count is not zero');
  assertSeriesClose(fused.output, expected, test.label);
}

console.log('STAGE93_TRUE_KERNEL_FUSION_NUMERICAL_OK');
console.log('STAGE93_TRUE_KERNEL_FUSION_ZERO_INTERMEDIATE_OK');

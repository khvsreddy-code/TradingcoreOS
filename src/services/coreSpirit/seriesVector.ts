export type CoreSpiritNumericSeries = Float64Array;

export type CoreSpiritSeriesOperationName =
  | 'change' | 'pctchange'
  | 'sma' | 'mean' | 'sum' | 'highest' | 'lowest' | 'stdev' | 'variance'
  | 'wma' | 'median' | 'zscore' | 'normalize' | 'persistence'
  | 'ema' | 'rma';

export type CoreSpiritSeriesOperation = Readonly<{
  name: CoreSpiritSeriesOperationName;
  length?: number;
  parameter?: number;
}>;

export type CoreSpiritSeriesKernelStats = Readonly<{
  bars: number;
  operations: number;
  fusedPasses: number;
  intermediateAllocations: number;
}>;

export type CoreSpiritSeriesExecutionResult = Readonly<{
  output: Float64Array;
  stats: CoreSpiritSeriesKernelStats;
}>;

const len = (op: CoreSpiritSeriesOperation): number =>
  Math.max(1, Math.floor(Number(op.length ?? 14)));

export function asCoreSpiritNumericSeries(values: ArrayLike<number>): Float64Array {
  if (values instanceof Float64Array) return values;
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i += 1) out[i] = Number(values[i]);
  return out;
}

export function coreSpiritSeriesLength(operation: CoreSpiritSeriesOperation): number {
  return len(operation);
}

export function coreSpiritSeriesMaxLookback(
  operations: readonly CoreSpiritSeriesOperation[],
): number {
  let lookback = 0;
  for (let i = 0; i < operations.length; i += 1) {
    lookback += i === 0 ? len(operations[i]!) : Math.max(1, len(operations[i]!) - 1);
  }
  return lookback;
}

const FUSED_OPERATION_SET: ReadonlySet<CoreSpiritSeriesOperationName> = new Set([
  'change', 'pctchange', 'sma', 'mean', 'sum', 'highest', 'lowest',
  'stdev', 'variance', 'wma', 'median', 'zscore', 'normalize',
  'persistence', 'ema', 'rma',
]);

export function isCoreSpiritSeriesOperationFusible(
  name: string,
): name is CoreSpiritSeriesOperationName {
  return FUSED_OPERATION_SET.has(name as CoreSpiritSeriesOperationName);
}

function signOfDelta(value: number, previous: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(previous)) return 0;
  const delta = value - previous;
  return delta > 0 ? 1 : delta < 0 ? -1 : 0;
}

/**
 * Fixed-capacity monotonic deque. It stores only window-local extrema, not a
 * history-sized output array. Each append/eviction is amortized O(1).
 */
class MonotonicDeque {
  private readonly indices: Int32Array;
  private readonly values: Float64Array;
  private head = 0;
  private size = 0;

  constructor(private readonly capacity: number, private readonly minimum: boolean) {
    this.indices = new Int32Array(capacity);
    this.values = new Float64Array(capacity);
  }

  clear(): void {
    this.head = 0;
    this.size = 0;
  }

  private slot(offset: number): number {
    return (this.head + offset) % this.capacity;
  }

  push(index: number, value: number): void {
    if (!Number.isFinite(value)) return;
    while (this.size > 0) {
      const lastSlot = this.slot(this.size - 1);
      const last = this.values[lastSlot]!;
      const dominated = this.minimum ? last >= value : last <= value;
      if (!dominated) break;
      this.size -= 1;
    }
    const write = this.slot(this.size);
    this.indices[write] = index;
    this.values[write] = value;
    this.size += 1;
  }

  evictBefore(index: number): void {
    while (this.size > 0 && this.indices[this.head]! < index) {
      this.head = (this.head + 1) % this.capacity;
      this.size -= 1;
    }
  }

  front(): number {
    return this.size > 0 ? this.values[this.head]! : Number.NaN;
  }
}

/** Rolling numeric state. All memory is bounded by the largest operation period. */
class RollingState {
  readonly values: Float64Array;
  readonly minQueue: MonotonicDeque;
  readonly maxQueue: MonotonicDeque;
  readonly period: number;
  cursor = 0;
  count = 0;
  validCount = 0;
  sum = 0;
  sumSquares = 0;
  weightedSum = 0;

  constructor(period: number) {
    this.period = Math.max(1, period);
    this.values = new Float64Array(this.period);
    this.values.fill(Number.NaN);
    this.minQueue = new MonotonicDeque(this.period, true);
    this.maxQueue = new MonotonicDeque(this.period, false);
  }

  push(value: number, absoluteIndex: number): void {
    const finite = Number.isFinite(value);
    const numeric = finite ? value : 0;
    const full = this.count === this.period;

    if (full) {
      const old = this.values[this.cursor]!;
      const oldNumeric = Number.isFinite(old) ? old : 0;
      this.sum -= oldNumeric;
      this.sumSquares -= oldNumeric * oldNumeric;
      this.validCount -= Number.isFinite(old) ? 1 : 0;
      this.weightedSum = this.weightedSum - (this.sum + oldNumeric) + numeric * this.period;
      this.values[this.cursor] = value;
      this.sum += numeric;
      this.sumSquares += numeric * numeric;
      this.validCount += finite ? 1 : 0;
      this.cursor = (this.cursor + 1) % this.period;
    } else {
      const weight = this.count + 1;
      this.values[this.count] = value;
      this.sum += numeric;
      this.sumSquares += numeric * numeric;
      this.weightedSum += numeric * weight;
      this.validCount += finite ? 1 : 0;
      this.count += 1;
      if (this.count === this.period) this.cursor = 0;
    }

    const oldestVisible = absoluteIndex - Math.min(this.count, this.period) + 1;
    this.minQueue.evictBefore(oldestVisible);
    this.maxQueue.evictBefore(oldestVisible);
    if (finite) {
      this.minQueue.push(absoluteIndex, value);
      this.maxQueue.push(absoluteIndex, value);
    }
  }

  ready(): boolean {
    return this.count === this.period && this.validCount === this.period;
  }

  mean(): number {
    return this.sum / this.period;
  }

  variance(): number {
    return Math.max(0, this.sumSquares / this.period - this.mean() * this.mean());
  }

  weighted(): number {
    return this.weightedSum / (this.period * (this.period + 1) / 2);
  }

  min(): number {
    return this.minQueue.front();
  }

  max(): number {
    return this.maxQueue.front();
  }
}

class MedianState {
  private readonly values: Float64Array;
  private readonly sorted: Float64Array;
  private readonly period: number;
  private cursor = 0;
  private count = 0;
  private validCount = 0;
  private sortedCount = 0;

  constructor(period: number) {
    this.period = Math.max(1, period);
    this.values = new Float64Array(this.period);
    this.values.fill(Number.NaN);
    this.sorted = new Float64Array(this.period);
  }

  private lowerBound(value: number): number {
    let lo = 0;
    let hi = this.sortedCount;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.sorted[mid]! < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private insert(value: number): void {
    const pos = this.lowerBound(value);
    for (let i = this.sortedCount; i > pos; i -= 1) this.sorted[i] = this.sorted[i - 1]!;
    this.sorted[pos] = value;
    this.sortedCount += 1;
  }

  private remove(value: number): void {
    if (!Number.isFinite(value)) return;
    const pos = this.lowerBound(value);
    if (pos >= this.sortedCount || this.sorted[pos] !== value) return;
    for (let i = pos; i + 1 < this.sortedCount; i += 1) this.sorted[i] = this.sorted[i + 1]!;
    this.sortedCount -= 1;
  }

  update(value: number): number {
    if (this.count === this.period) {
      const old = this.values[this.cursor]!;
      if (Number.isFinite(old)) {
        this.remove(old);
        this.validCount -= 1;
      }
      this.values[this.cursor] = value;
      if (Number.isFinite(value)) {
        this.insert(value);
        this.validCount += 1;
      }
      this.cursor = (this.cursor + 1) % this.period;
    } else {
      this.values[this.count] = value;
      if (Number.isFinite(value)) {
        this.insert(value);
        this.validCount += 1;
      }
      this.count += 1;
      if (this.count === this.period) this.cursor = 0;
    }

    if (this.count !== this.period || this.validCount !== this.period) return Number.NaN;
    const mid = Math.floor(this.sortedCount / 2);
    return this.sortedCount % 2 === 1
      ? this.sorted[mid]!
      : (this.sorted[mid - 1]! + this.sorted[mid]!) / 2;
  }
}

class PersistenceState {
  private readonly values: Float64Array;
  private readonly deltaSigns: Int8Array;
  private readonly comparisonValid: Uint8Array;
  private readonly comparisonSame: Uint8Array;
  private readonly period: number;
  private cursor = 0;
  private count = 0;
  private validCount = 0;
  private comparisons = 0;
  private same = 0;
  private seen = 0;

  constructor(period: number) {
    this.period = Math.max(1, period);
    this.values = new Float64Array(this.period);
    this.values.fill(Number.NaN);
    this.deltaSigns = new Int8Array(this.period);
    this.comparisonValid = new Uint8Array(this.period);
    this.comparisonSame = new Uint8Array(this.period);
  }

  update(value: number): number {
    const absoluteIndex = this.seen;
    const slot = absoluteIndex % this.period;
    const previousSlot = (absoluteIndex - 1 + this.period) % this.period;
    const previousValue = absoluteIndex > 0 ? this.values[previousSlot]! : Number.NaN;
    const previousSign = absoluteIndex > 0 ? this.deltaSigns[previousSlot]! : 0;

    if (this.count === this.period) {
      const oldStart = absoluteIndex - this.period;
      const comparisonIndex = oldStart + 2;
      if (comparisonIndex >= 0) {
        const removeSlot = comparisonIndex % this.period;
        if (this.comparisonValid[removeSlot]) {
          this.comparisons -= 1;
          this.same -= this.comparisonSame[removeSlot] ? 1 : 0;
          this.comparisonValid[removeSlot] = 0;
          this.comparisonSame[removeSlot] = 0;
        }
      }
      const old = this.values[this.cursor]!;
      this.validCount -= Number.isFinite(old) ? 1 : 0;
      this.cursor = (this.cursor + 1) % this.period;
    } else {
      this.count += 1;
    }

    this.values[slot] = value;
    this.validCount += Number.isFinite(value) ? 1 : 0;

    const currentSign = signOfDelta(value, previousValue);
    this.deltaSigns[slot] = currentSign;
    if (absoluteIndex >= 2 && currentSign !== 0 && previousSign !== 0) {
      this.comparisonValid[slot] = 1;
      this.comparisonSame[slot] = currentSign === previousSign ? 1 : 0;
      this.comparisons += 1;
      this.same += currentSign === previousSign ? 1 : 0;
    } else {
      this.comparisonValid[slot] = 0;
      this.comparisonSame[slot] = 0;
    }

    this.seen += 1;
    if (this.count !== this.period || this.validCount !== this.period) return Number.NaN;
    return this.comparisons > 0 ? this.same / this.comparisons : 0;
  }
}

class EMAState {
  private readonly period: number;
  private readonly alpha: number;
  private seedSum = 0;
  private seedCount = 0;
  private state = Number.NaN;

  constructor(period: number, wilder = false) {
    this.period = Math.max(1, period);
    this.alpha = wilder ? 1 / this.period : 2 / (this.period + 1);
  }

  update(value: number): number {
    if (!Number.isFinite(value)) return Number.NaN;
    if (this.seedCount < this.period) {
      this.seedSum += value;
      this.seedCount += 1;
      if (this.seedCount < this.period) return Number.NaN;
      this.state = this.seedSum / this.period;
      return this.state;
    }
    this.state = this.alpha * value + (1 - this.alpha) * this.state;
    return this.state;
  }
}

class ChangeState {
  private previous = Number.NaN;
  constructor(private readonly percentage: boolean) {}

  update(value: number): number {
    const previous = this.previous;
    this.previous = value;
    if (!Number.isFinite(value) || !Number.isFinite(previous)) return Number.NaN;
    if (this.percentage) return previous === 0 ? Number.NaN : value / previous - 1;
    return value - previous;
  }
}

class FusedSeriesStage {
  private readonly op: CoreSpiritSeriesOperation;
  private readonly rolling?: RollingState;
  private readonly median?: MedianState;
  private readonly persistence?: PersistenceState;
  private readonly ema?: EMAState;
  private readonly change?: ChangeState;

  constructor(op: CoreSpiritSeriesOperation) {
    this.op = op;
    const period = len(op);
    switch (op.name) {
      case 'sma':
      case 'mean':
      case 'sum':
      case 'highest':
      case 'lowest':
      case 'stdev':
      case 'variance':
      case 'wma':
      case 'zscore':
      case 'normalize':
        this.rolling = new RollingState(period);
        break;
      case 'median':
        this.median = new MedianState(period);
        break;
      case 'persistence':
        this.persistence = new PersistenceState(period);
        break;
      case 'ema':
        this.ema = new EMAState(period, false);
        break;
      case 'rma':
        this.ema = new EMAState(period, true);
        break;
      case 'change':
        this.change = new ChangeState(false);
        break;
      case 'pctchange':
        this.change = new ChangeState(true);
        break;
    }
  }

  update(value: number, absoluteIndex: number): number {
    if (this.change) return this.change.update(value);
    if (this.ema) return this.ema.update(value);
    if (this.median) return this.median.update(value);
    if (this.persistence) return this.persistence.update(value);

    const rolling = this.rolling!;
    rolling.push(value, absoluteIndex);
    if (!rolling.ready()) return Number.NaN;

    switch (this.op.name) {
      case 'sum':
        return rolling.sum;
      case 'mean':
      case 'sma':
        return rolling.mean();
      case 'highest':
        return rolling.max();
      case 'lowest':
        return rolling.min();
      case 'variance':
        return rolling.variance();
      case 'stdev':
        return Math.sqrt(rolling.variance());
      case 'wma':
        return rolling.weighted();
      case 'zscore': {
        const deviation = Math.sqrt(rolling.variance());
        return deviation === 0 ? 0 : (value - rolling.mean()) / deviation;
      }
      case 'normalize': {
        const minimum = rolling.min();
        const maximum = rolling.max();
        return maximum === minimum ? 0 : (value - minimum) / (maximum - minimum);
      }
      default:
        return Number.NaN;
    }
  }
}

export class CoreSpiritFusedSeriesCursor {
  readonly outputs: Float64Array;
  private readonly stages: FusedSeriesStage[];

  constructor(operations: readonly CoreSpiritSeriesOperation[]) {
    this.stages = operations.map((operation) => new FusedSeriesStage(operation));
    this.outputs = new Float64Array(this.stages.length);
    this.outputs.fill(Number.NaN);
  }

  update(sourceValue: number, absoluteIndex: number): Float64Array {
    let value = sourceValue;
    for (let i = 0; i < this.stages.length; i += 1) {
      value = this.stages[i]!.update(value, absoluteIndex);
      this.outputs[i] = value;
    }
    return this.outputs;
  }
}

/**
 * Execute a linear CoreSpirit series chain in ONE chronological traversal.
 *
 * Production allocation model:
 *   source Float64Array (borrowed when already typed)
 *   final output Float64Array (one)
 *   bounded state per operation (ring/deque/ordered window)
 *
 * There is no operation-sized history array and no operation-to-operation full-series copy.
 */
export function executeCoreSpiritFusedSeriesPipeline(
  input: ArrayLike<number>,
  operations: readonly CoreSpiritSeriesOperation[],
): CoreSpiritSeriesExecutionResult {
  const source = asCoreSpiritNumericSeries(input);
  if (operations.length === 0) {
    return Object.freeze({
      output: source,
      stats: Object.freeze({
        bars: source.length,
        operations: 0,
        fusedPasses: 0,
        intermediateAllocations: 0,
      }),
    });
  }

  const cursor = new CoreSpiritFusedSeriesCursor(operations);
  const output = new Float64Array(source.length);
  output.fill(Number.NaN);

  for (let i = 0; i < source.length; i += 1) {
    const values = cursor.update(source[i]!, i);
    output[i] = values[values.length - 1]!;
  }

  return Object.freeze({
    output,
    stats: Object.freeze({
      bars: source.length,
      operations: operations.length,
      fusedPasses: 1,
      intermediateAllocations: 0,
    }),
  });
}

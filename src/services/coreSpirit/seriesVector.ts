import {
  ChangeState,
  EMAState,
  RollingMean,
  RollingMinMax,
  RollingPersistenceState,
  RollingMedian,
  RollingSum,
  RollingVariance,
  WMAState,
  WilderState,
} from './statefulIndicatorKernel';

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

class FusedSeriesStage {
  private readonly op: CoreSpiritSeriesOperation;
  private readonly sum?: RollingSum;
  private readonly mean?: RollingMean;
  private readonly variance?: RollingVariance;
  private readonly minmax?: RollingMinMax;
  private readonly wma?: WMAState;
  private readonly median?: RollingMedian;
  private readonly persistence?: RollingPersistenceState;
  private readonly ema?: EMAState;
  private readonly rma?: WilderState;
  private readonly change?: ChangeState;

  constructor(op: CoreSpiritSeriesOperation) {
    this.op = op;
    const period = len(op);
    switch (op.name) {
      case 'sum':
        this.sum = new RollingSum(period);
        break;
      case 'sma':
      case 'mean':
        this.mean = new RollingMean(period);
        break;
      case 'highest':
      case 'lowest':
      case 'normalize':
        this.minmax = new RollingMinMax(period);
        break;
      case 'stdev':
      case 'variance':
      case 'zscore':
        this.variance = new RollingVariance(period);
        break;
      case 'wma':
        this.wma = new WMAState(period);
        break;
      case 'median':
        this.median = new RollingMedian(period);
        break;
      case 'persistence':
        this.persistence = new RollingPersistenceState(period);
        break;
      case 'ema':
        this.ema = new EMAState(period);
        break;
      case 'rma':
        this.rma = new WilderState(period);
        break;
      case 'change':
        this.change = new ChangeState(false);
        break;
      case 'pctchange':
        this.change = new ChangeState(true);
        break;
    }
  }

  update(value: number, _absoluteIndex: number): number {
    switch (this.op.name) {
      case 'sum':
        return this.sum!.update(value).value ?? Number.NaN;
      case 'sma':
      case 'mean':
        return this.mean!.update(value).value ?? Number.NaN;
      case 'highest': {
        const snapshot = this.minmax!.update(value);
        return snapshot.max ?? Number.NaN;
      }
      case 'lowest': {
        const snapshot = this.minmax!.update(value);
        return snapshot.min ?? Number.NaN;
      }
      case 'normalize': {
        const snapshot = this.minmax!.update(value);
        if (snapshot.min == null || snapshot.max == null) return Number.NaN;
        if (snapshot.max === snapshot.min) return 0;
        return (value - snapshot.min) / (snapshot.max - snapshot.min);
      }
      case 'variance':
        this.variance!.update(value);
        return this.variance!.variance() ?? Number.NaN;
      case 'stdev':
        return this.variance!.update(value).value ?? Number.NaN;
      case 'zscore': {
        this.variance!.update(value);
        const mean = this.variance!.mean();
        const deviation = this.variance!.value();
        return mean == null || deviation == null ? Number.NaN : deviation === 0 ? 0 : (value - mean) / deviation;
      }
      case 'wma':
        return this.wma!.update(value) ?? Number.NaN;
      case 'median':
        return this.median!.update(value).value ?? Number.NaN;
      case 'persistence':
        return this.persistence!.update(value) ?? Number.NaN;
      case 'ema':
        return this.ema!.update(value) ?? Number.NaN;
      case 'rma':
        return this.rma!.updateWilder(value) ?? Number.NaN;
      case 'change':
      case 'pctchange':
        return this.change!.update(value);
      default:
        return Number.NaN;
    }
  }

  getOperation(): CoreSpiritSeriesOperation {
    return this.op;
  }

  copyFrom(source: FusedSeriesStage): void {
    if (source.op.name !== this.op.name || len(source.op) !== len(this.op)) {
      throw new Error('incompatible fused stage state');
    }
    if (this.sum && source.sum) this.sum.copyFrom(source.sum);
    if (this.mean && source.mean) this.mean.copyFrom(source.mean);
    if (this.variance && source.variance) this.variance.copyFrom(source.variance);
    if (this.minmax && source.minmax) this.minmax.copyFrom(source.minmax);
    if (this.wma && source.wma) this.wma.copyFrom(source.wma);
    if (this.median && source.median) this.median.copyFrom(source.median);
    if (this.persistence && source.persistence) this.persistence.copyFrom(source.persistence);
    if (this.ema && source.ema) this.ema.copyFrom(source.ema);
    if (this.rma && source.rma) this.rma.copyFrom(source.rma);
    if (this.change && source.change) this.change.copyFrom(source.change);
  }

  clone(): FusedSeriesStage {
    const next = new FusedSeriesStage(this.op);
    next.copyFrom(this);
    return next;
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

  clone(): CoreSpiritFusedSeriesCursor {
    const next = new CoreSpiritFusedSeriesCursor(this.stages.map((stage) => stage.getOperation()));
    next.copyFrom(this);
    return next;
  }

  copyFrom(source: CoreSpiritFusedSeriesCursor): void {
    if (source.stages.length !== this.stages.length) throw new Error('incompatible fused cursor stage count');
    for (let i = 0; i < this.stages.length; i += 1) this.stages[i]!.copyFrom(source.stages[i]!);
    this.outputs.set(source.outputs);
  }

  updateInto(sourceValue: number, absoluteIndex: number, output: Float64Array, outputIndex: number): number {
    const values = this.update(sourceValue, absoluteIndex);
    const value = values[values.length - 1]!;
    output[outputIndex] = value;
    return value;
  }
}

export function executeCoreSpiritFusedSeriesPipelineInto(
  input: ArrayLike<number>,
  operations: readonly CoreSpiritSeriesOperation[],
  output: Float64Array,
): CoreSpiritSeriesExecutionResult {
  const source = asCoreSpiritNumericSeries(input);
  if (operations.length === 0) {
    return Object.freeze({
      output: source,
      stats: Object.freeze({ bars: source.length, operations: 0, fusedPasses: 0, intermediateAllocations: 0 }),
    });
  }
  if (output.length !== source.length) {
    throw new Error(`fused output length mismatch: expected ${source.length}, got ${output.length}`);
  }
  const cursor = new CoreSpiritFusedSeriesCursor(operations);
  output.fill(Number.NaN);
  for (let i = 0; i < source.length; i += 1) cursor.updateInto(source[i]!, i, output, i);
  return Object.freeze({
    output,
    stats: Object.freeze({ bars: source.length, operations: operations.length, fusedPasses: 1, intermediateAllocations: 0 }),
  });
}

export function executeCoreSpiritFusedSeriesPipeline(
  input: ArrayLike<number>,
  operations: readonly CoreSpiritSeriesOperation[],
): CoreSpiritSeriesExecutionResult {
  const source = asCoreSpiritNumericSeries(input);
  const output = new Float64Array(source.length);
  return executeCoreSpiritFusedSeriesPipelineInto(source, operations, output);
}

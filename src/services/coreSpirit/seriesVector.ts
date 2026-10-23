import { RollingMean, RollingVariance, RollingMinMax, RollingSum, RollingMedian, WMAState, EMAState, WilderState, ChangeState, PersistenceState } from './statefulIndicatorKernel';

export type CoreSpiritNumericSeries = Float64Array;

export type CoreSpiritSeriesOperationName =
  | 'change' | 'pctchange'
  | 'sma' | 'mean' | 'sum' | 'highest' | 'lowest' | 'stdev' | 'variance'
  | 'wma' | 'median' | 'zscore' | 'normalize' | 'persistence'
  | 'ema' | 'rma';

/**
 * Describes the temporal dependency of a series operation, not how its
 * implementation happens to store state while processing a batch.
 *
 * - stateless: output depends only on the current value and its fixed lag(s)
 * - rolling-state: bounded window state; each output is independently defined
 *   by a finite window (e.g. SMA, extrema, persistence)
 * - recursive: output depends on a prior output/state (e.g. EMA/RMA)
 */
export type CoreSpiritSeriesExecutionClass = 'stateless' | 'rolling-state' | 'recursive';

const STATELESS_SERIES_OPERATIONS: ReadonlySet<string> = new Set(['change', 'pctchange']);
const RECURSIVE_SERIES_OPERATIONS: ReadonlySet<string> = new Set(['ema', 'rma', 'wilder', 'rsi', 'atr', 'vwap']);

export function coreSpiritSeriesExecutionClass(name: string): CoreSpiritSeriesExecutionClass | undefined {
  if (STATELESS_SERIES_OPERATIONS.has(name)) return 'stateless';
  if (RECURSIVE_SERIES_OPERATIONS.has(name)) return 'recursive';
  if (isCoreSpiritSeriesOperationFusible(name)) return 'rolling-state';
  return undefined;
}

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
class FusedSeriesStage {
  private readonly op: CoreSpiritSeriesOperation;
  private readonly rollingMean?: RollingMean;
  private readonly rollingVariance?: RollingVariance;
  private readonly rollingMinMax?: RollingMinMax;
  private readonly rollingSum?: RollingSum;
  private readonly rollingMedian?: RollingMedian;
  private readonly wma?: WMAState;
  private readonly ema?: EMAState;
  private readonly wilder?: WilderState;
  private readonly change?: ChangeState;
  private readonly persistence?: PersistenceState;

  constructor(op: CoreSpiritSeriesOperation) {
    this.op = op;
    const period = len(op);
    switch (op.name) {
      case 'sma': case 'mean': this.rollingMean = new RollingMean(period); break;
      case 'sum': this.rollingSum = new RollingSum(period); break;
      case 'highest': case 'lowest': case 'normalize': this.rollingMinMax = new RollingMinMax(period); break;
      case 'stdev': case 'variance': case 'zscore': this.rollingVariance = new RollingVariance(period); if (op.name === 'zscore') this.rollingMean = new RollingMean(period); break;
      case 'wma': this.wma = new WMAState(period); break;
      case 'median': this.rollingMedian = new RollingMedian(period); break;
      case 'persistence': this.persistence = new PersistenceState(period); break;
      case 'ema': this.ema = new EMAState(period); break;
      case 'rma': this.wilder = new WilderState(period); break;
      case 'change': this.change = new ChangeState(false); break;
      case 'pctchange': this.change = new ChangeState(true); break;
    }
  }

  update(value:number, absoluteIndex:number):number {
    void absoluteIndex;
    if (this.change) return this.change.update(value) ?? Number.NaN;
    if (this.ema) return this.ema.update(value) ?? Number.NaN;
    if (this.wilder) return this.wilder.updateWilder(value) ?? Number.NaN;
    if (this.rollingMedian) return this.rollingMedian.update(value).value ?? Number.NaN;
    if (this.persistence) return this.persistence.update(value).value ?? Number.NaN;
    if (this.rollingMean) {
      const snapshot=this.rollingMean.update(value);
      if (this.op.name==='sma'||this.op.name==='mean') return snapshot.value ?? Number.NaN;
      if (this.op.name==='zscore') {
        const variance=this.rollingVariance!.update(value).value;
        const mean=snapshot.value;
        return mean==null||variance==null||variance===0?0:(value-mean)/variance;
      }
    }
    if (this.rollingSum) return this.rollingSum.update(value).value ?? Number.NaN;
    if (this.rollingVariance) {
      const variance=this.rollingVariance.update(value).value;
      if (variance==null) return Number.NaN;
      return this.op.name==='variance'?(this.rollingVariance.variance() ?? Number.NaN):variance;
    }
    if (this.rollingMinMax) {
      const state=this.rollingMinMax.update(value);
      if (state.min==null||state.max==null) return Number.NaN;
      if (this.op.name==='highest') return state.max;
      if (this.op.name==='lowest') return state.min;
      return state.max===state.min?0:(value-state.min)/(state.max-state.min);
    }
    if (this.wma) return this.wma.update(value) ?? Number.NaN;
    return Number.NaN;
  }

  getOperation():CoreSpiritSeriesOperation{return this.op;}
  copyFrom(source:FusedSeriesStage):void {
    if(source.op.name!==this.op.name||len(source.op)!==len(this.op))throw new Error('incompatible fused stage state');
    if(this.rollingMean&&source.rollingMean)this.rollingMean.copyFrom(source.rollingMean);
    if(this.rollingVariance&&source.rollingVariance)this.rollingVariance.copyFrom(source.rollingVariance);
    if(this.rollingMinMax&&source.rollingMinMax)this.rollingMinMax.copyFrom(source.rollingMinMax);
    if(this.rollingSum&&source.rollingSum)this.rollingSum.copyFrom(source.rollingSum);
    if(this.rollingMedian&&source.rollingMedian)this.rollingMedian.copyFrom(source.rollingMedian);
    if(this.wma&&source.wma)this.wma.copyFrom(source.wma);
    if(this.ema&&source.ema)this.ema.copyFrom(source.ema);
    if(this.wilder&&source.wilder)this.wilder.copyFrom(source.wilder);
    if(this.change&&source.change)this.change.copyFrom(source.change);
    if(this.persistence&&source.persistence)this.persistence.copyFrom(source.persistence);
  }
  clone():FusedSeriesStage{const next=new FusedSeriesStage(this.op);next.copyFrom(this);return next;}
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
export function executeCoreSpiritFusedSeriesPipelineInto(
  input: ArrayLike<number>,
  operations: readonly CoreSpiritSeriesOperation[],
  output: Float64Array,
): CoreSpiritSeriesExecutionResult {
  const source = asCoreSpiritNumericSeries(input);
  if (operations.length === 0) return Object.freeze({ output: source, stats: Object.freeze({ bars: source.length, operations: 0, fusedPasses: 0, intermediateAllocations: 0 }) });
  if (output.length !== source.length) throw new Error(`fused output length mismatch: expected ${source.length}, got ${output.length}`);
  const cursor = new CoreSpiritFusedSeriesCursor(operations);
  output.fill(Number.NaN);
  for (let i = 0; i < source.length; i += 1) cursor.updateInto(source[i]!, i, output, i);
  return Object.freeze({ output, stats: Object.freeze({ bars: source.length, operations: operations.length, fusedPasses: 1, intermediateAllocations: 0 }) });
}

/** Convenience historical materialization: allocates the final output once. */
export function executeCoreSpiritFusedSeriesPipeline(
  input: ArrayLike<number>,
  operations: readonly CoreSpiritSeriesOperation[],
): CoreSpiritSeriesExecutionResult {
  const source = asCoreSpiritNumericSeries(input);
  const output = new Float64Array(source.length);
  return executeCoreSpiritFusedSeriesPipelineInto(source, operations, output);
}

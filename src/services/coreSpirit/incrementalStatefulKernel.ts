import { ema, rma } from './numericalKernels';

/**
 * Stateful single-series smoother with explicit bar identity.
 * A forming bar is recalculated from the state immediately before that bar;
 * repeated updates to the same bar never become extra observations.
 */
export type CoreSpiritSmootherKind = 'ema' | 'rma';
export type CoreSpiritSmootherSnapshot = Readonly<{
  version: 1;
  kind: CoreSpiritSmootherKind;
  period: number;
  nextBarIndex: number;
  previous: number | null;
  seedCount: number;
  seedSum: number;
  currentBarIndex: number | null;
  currentValue: number | null;
  stateBeforeCurrent: Readonly<{ previous: number | null; seedCount: number; seedSum: number }> | null;
}>;

type SmootherState = { previous: number | null; seedCount: number; seedSum: number };

export class CoreSpiritIncrementalSmoother {
  readonly kind: CoreSpiritSmootherKind;
  readonly period: number;
  private nextBarIndex = 0;
  private state: SmootherState = { previous: null, seedCount: 0, seedSum: 0 };
  private currentBarIndex: number | null = null;
  private currentValue: number | null = null;
  private stateBeforeCurrent: SmootherState | null = null;

  constructor(kind: CoreSpiritSmootherKind, period: number) {
    if (!Number.isInteger(period) || period < 1) throw new Error('period must be a positive integer');
    this.kind = kind;
    this.period = period;
  }

  update(barIndex: number, value: number, confirmed = false): number {
    if (!Number.isSafeInteger(barIndex) || barIndex < 0) throw new Error('barIndex must be a non-negative safe integer');
    if (barIndex === this.currentBarIndex) {
      // Replace the current observation by restoring the exact pre-bar state.
      this.state = this.cloneState(this.stateBeforeCurrent!);
    } else if (barIndex === this.nextBarIndex) {
      this.stateBeforeCurrent = this.cloneState(this.state);
      this.currentBarIndex = barIndex;
      this.nextBarIndex = barIndex + 1;
    } else {
      throw new Error(`non-sequential bar update: expected ${this.currentBarIndex === null ? 0 : this.currentBarIndex} (replace) or ${this.nextBarIndex} (append), received ${barIndex}`);
    }

    this.currentValue = Number.isFinite(value) ? value : Number.NaN;
    const result = this.process(this.currentValue);
    if (confirmed) {
      this.currentBarIndex = null;
      this.currentValue = null;
      this.stateBeforeCurrent = null;
    }
    return result;
  }

  /** Rebuild after a historical correction. The supplied values are the complete corrected history. */
  replay(values: ArrayLike<number>): Float64Array {
    this.reset();
    const result = new Float64Array(values.length);
    result.fill(Number.NaN);
    for (let i = 0; i < values.length; i++) result[i] = this.update(i, Number(values[i]), true);
    return result;
  }

  snapshot(): CoreSpiritSmootherSnapshot {
    return Object.freeze({
      version: 1,
      kind: this.kind,
      period: this.period,
      nextBarIndex: this.nextBarIndex,
      previous: this.state.previous,
      seedCount: this.state.seedCount,
      seedSum: this.state.seedSum,
      currentBarIndex: this.currentBarIndex,
      currentValue: this.currentValue,
      stateBeforeCurrent: this.stateBeforeCurrent ? Object.freeze({ ...this.stateBeforeCurrent }) : null,
    });
  }

  restore(snapshot: CoreSpiritSmootherSnapshot): void {
    if (snapshot.version !== 1 || snapshot.kind !== this.kind || snapshot.period !== this.period ||
        !Number.isSafeInteger(snapshot.nextBarIndex) || snapshot.nextBarIndex < 0 ||
        !Number.isInteger(snapshot.seedCount) || snapshot.seedCount < 0 || snapshot.seedCount >= this.period ||
        !Number.isFinite(snapshot.seedSum) ||
        (snapshot.previous !== null && !Number.isFinite(snapshot.previous)) ||
        (snapshot.currentBarIndex !== null && (!Number.isSafeInteger(snapshot.currentBarIndex) || snapshot.currentBarIndex < 0)) ||
        (snapshot.currentValue !== null && !Number.isFinite(snapshot.currentValue) && !Number.isNaN(snapshot.currentValue)) ||
        ((snapshot.currentBarIndex === null) !== (snapshot.stateBeforeCurrent === null)) ||
        ((snapshot.currentBarIndex === null) !== (snapshot.currentValue === null)) ||
        (snapshot.currentBarIndex !== null && snapshot.nextBarIndex !== snapshot.currentBarIndex + 1) ||
        (snapshot.stateBeforeCurrent !== null && (
          !Number.isInteger(snapshot.stateBeforeCurrent.seedCount) ||
          snapshot.stateBeforeCurrent.seedCount < 0 ||
          snapshot.stateBeforeCurrent.seedCount >= this.period ||
          !Number.isFinite(snapshot.stateBeforeCurrent.seedSum) ||
          (snapshot.stateBeforeCurrent.previous !== null && !Number.isFinite(snapshot.stateBeforeCurrent.previous))
        ))) {
      throw new Error('incompatible or invalid smoother checkpoint');
    }
    this.nextBarIndex = snapshot.nextBarIndex;
    this.state = { previous: snapshot.previous, seedCount: snapshot.seedCount, seedSum: snapshot.seedSum };
    this.currentBarIndex = snapshot.currentBarIndex;
    this.currentValue = snapshot.currentValue;
    this.stateBeforeCurrent = snapshot.stateBeforeCurrent ? { ...snapshot.stateBeforeCurrent } : null;
  }

  reset(): void {
    this.nextBarIndex = 0;
    this.state = { previous: null, seedCount: 0, seedSum: 0 };
    this.currentBarIndex = null;
    this.currentValue = null;
    this.stateBeforeCurrent = null;
  }

  private cloneState(state: SmootherState): SmootherState { return { ...state }; }

  private process(value: number): number {
    if (!Number.isFinite(value)) {
      this.state = { previous: null, seedCount: 0, seedSum: 0 };
      return Number.NaN;
    }
    if (this.kind === 'ema') {
      const previous = this.state.previous === null ? value : (2 / (this.period + 1)) * value + (1 - 2 / (this.period + 1)) * this.state.previous;
      this.state = { previous, seedCount: 0, seedSum: 0 };
      return previous;
    }
    if (this.state.previous === null) {
      const seedCount = this.state.seedCount + 1;
      const seedSum = this.state.seedSum + value;
      if (seedCount < this.period) {
        this.state = { previous: null, seedCount, seedSum };
        return Number.NaN;
      }
      const previous = seedSum / this.period;
      this.state = { previous, seedCount: 0, seedSum: 0 };
      return previous;
    }
    const previous = ((this.period - 1) * this.state.previous + value) / this.period;
    this.state = { previous, seedCount: 0, seedSum: 0 };
    return previous;
  }
}

/** Small parity helper used by contract tests and runtime diagnostics. */
export function compareCoreSpiritSmootherToBatch(kind: CoreSpiritSmootherKind, period: number, values: ArrayLike<number>, tolerance = 1e-10): Readonly<{ equal: boolean; maxAbsError: number; mismatches: number }> {
  const expected = kind === 'ema' ? ema(values, period) : rma(values, period);
  const actual = new CoreSpiritIncrementalSmoother(kind, period).replay(values);
  let maxAbsError = 0, mismatches = 0;
  for (let i = 0; i < expected.length; i++) {
    const a = actual[i]!, b = expected[i]!;
    if (Number.isNaN(a) && Number.isNaN(b)) continue;
    const error = Math.abs(a - b);
    if (!Number.isFinite(error) || error > tolerance * Math.max(1, Math.abs(a), Math.abs(b))) mismatches++;
    if (Number.isFinite(error)) maxAbsError = Math.max(maxAbsError, error);
  }
  return Object.freeze({ equal: mismatches === 0, maxAbsError, mismatches });
}

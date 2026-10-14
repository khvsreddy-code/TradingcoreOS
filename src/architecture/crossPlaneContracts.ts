/**
 * Explicit coordinate and revision contracts between TradingCoreOS planes.
 * Brands are compile-time only; runtime values remain compatible with Vela APIs.
 */
declare const canonicalBarIndexRangeBrand: unique symbol;
declare const velaTimeRangeBrand: unique symbol;

export interface MarketDataRevision {
  readonly timelineKey: string;
  readonly revision: number;
}

/** Half-open canonical bar-index interval: [from, to). */
export type CanonicalBarIndexRange = Readonly<{
  from: number;
  to: number;
  readonly [canonicalBarIndexRangeBrand]: true;
}>;

export type CanonicalDirtyRange = MarketDataRevision & CanonicalBarIndexRange;

/** Inclusive epoch-millisecond bounds used by Vela scene/viewport contracts. */
export type VelaTimeRange = Readonly<{
  from: number;
  to: number;
  readonly [velaTimeRangeBrand]: true;
}>;

export type VisibleRange = VelaTimeRange;
export type VelaTimeDirtyRange = VelaTimeRange;

/** Revision-tagged metadata accompanying a borrowed canonical column view. */
export interface MarketDataSnapshot extends MarketDataRevision {
  readonly sourceFrom: number;
  readonly length: number;
  readonly timeUnit: 'epoch-seconds';
  /** Absolute canonical bar-index coordinates changed by this revision. */
  readonly dirtyRange: CanonicalDirtyRange;
}

function validIndex(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function canonicalBarIndexRange(from: number, to: number): CanonicalBarIndexRange {
  if (!validIndex(from) || !validIndex(to) || to < from) {
    throw new RangeError('Canonical bar-index range must use non-negative integer half-open bounds.');
  }
  return Object.freeze({ from, to }) as CanonicalBarIndexRange;
}

export function canonicalDirtyRange(
  timelineKey: string,
  revision: number,
  from: number,
  to: number,
): CanonicalDirtyRange {
  const key = String(timelineKey).trim();
  if (!key) throw new TypeError('Canonical dirty range requires a timeline key.');
  if (!validIndex(revision)) throw new RangeError('Market-data revision must be a non-negative safe integer.');
  return Object.freeze({
    timelineKey: key,
    revision,
    ...canonicalBarIndexRange(from, to),
  }) as CanonicalDirtyRange;
}

export function velaTimeRange(from: number, to: number): VelaTimeRange {
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
    throw new RangeError('Vela time range requires finite, ordered epoch-millisecond bounds.');
  }
  return Object.freeze({ from, to }) as VelaTimeRange;
}

/** Strip compile-time coordinates at the Vela public { from, to } ABI. */
export function toVelaSceneDirtyRange(range: VelaTimeRange): Readonly<{ from: number; to: number }> {
  return Object.freeze({ from: range.from, to: range.to });
}

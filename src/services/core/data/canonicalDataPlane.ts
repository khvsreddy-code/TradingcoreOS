import { canonicalDirtyRange, type MarketDataSnapshot } from '../../../architecture/crossPlaneContracts';
import {
  MarketDataStore,
  type MarketDataPoint,
  type MarketDataViews,
} from './marketDataStore';
import {
  IndicatorStore,
  LiquidityStore,
  ModelStore,
  OrderFlowStore,
  StructureStore,
} from './derivedDataStores';

export type CanonicalConsumerKind = 'indicator' | 'model' | 'chart' | 'structure' | 'liquidity' | 'orderflow' | 'replay' | 'scanner' | 'graph';

export type CanonicalConsumer = Readonly<{
  id: string;
  kind: CanonicalConsumerKind;
  attachedRevision: number;
}>;

export type CanonicalMarketView = MarketDataViews & MarketDataSnapshot & Readonly<{
  /** Dirty bounds clipped to this view and expressed relative to its first bar. */
  dirtyFrom: number;
  dirtyTo: number;
}>;

/**
 * One ownership point for a symbol/timeframe dataset.
 * Consumers borrow typed views and own only their derived outputs/state.
 */
export class CanonicalDataPlane {
  readonly market: MarketDataStore;
  readonly indicators: IndicatorStore;
  readonly models: ModelStore;
  readonly structure: StructureStore;
  readonly liquidity: LiquidityStore;
  readonly orderFlow: OrderFlowStore;

  private readonly consumers = new Map<string, CanonicalConsumer>();

  constructor(readonly timelineKey: string) {
    this.market = new MarketDataStore(timelineKey);
    this.indicators = new IndicatorStore(this.market);
    this.models = new ModelStore(this.market);
    this.structure = new StructureStore(this.market);
    this.liquidity = new LiquidityStore(this.market);
    this.orderFlow = new OrderFlowStore(this.market);
  }

  get revision(): number { return this.market.revision; }
  get length(): number { return this.market.length; }
  get consumerCount(): number { return this.consumers.size; }
  get estimatedBytes(): number {
    return this.market.allocatedBytes
      + this.indicators.allocatedBytes + this.models.allocatedBytes
      + this.structure.allocatedBytes + this.liquidity.allocatedBytes
      + this.orderFlow.allocatedBytes;
  }
  dispose(): boolean {
    if (this.consumers.size > 0) return false;
    this.market.releaseMemory();
    this.indicators.releaseMemory();
    this.models.releaseMemory();
    this.structure.releaseMemory();
    this.liquidity.releaseMemory();
    this.orderFlow.releaseMemory();
    return true;
  }

  replace(rows: readonly MarketDataPoint[]): void { this.market.replace(rows); }
  /** Direct typed-column ingress used by the Vela native history fast path. */
  replaceColumns(columns: {
    time: ArrayLike<number>;
    open: ArrayLike<number>;
    high: ArrayLike<number>;
    low: ArrayLike<number>;
    close: ArrayLike<number>;
    volume: ArrayLike<number>;
    timeUnit?: 'milliseconds' | 'seconds';
  }, from = 0, to = columns.time.length): void { this.market.replaceColumns(columns, from, to); }

  /** Direct OHLCV compatibility ingress; avoids a second row-object allocation pass. */
  replaceHistoricalCandleRows(rows: readonly { timestamp: string; open: number; high: number; low: number; close: number; volume: number }[], from = 0, to = rows.length): void { this.market.replaceHistoricalCandleRows(rows, from, to); }
  /** Patch broker corrections into the canonical timeline and publish one dirty span. */
  reconcileHistoricalCandleRows(rows: readonly { timestamp: string; open: number; high: number; low: number; close: number; volume: number }[]): void {
    this.market.reconcileHistoricalCandleRows(rows);
  }
  append(row: MarketDataPoint): void { this.market.append(row); }
  updateLast(row: MarketDataPoint): void { this.market.updateLast(row); }
  clear(): void { this.market.clear(); }

  /** Borrow the canonical backing arrays; no candle objects are produced. */
  read(from = 0, to = this.market.length): CanonicalMarketView {
    const start = Math.max(0, Math.min(this.market.length, Math.floor(from)));
    const end = Math.max(start, Math.min(this.market.length, Math.ceil(to)));
    const all = this.market.views();
    const length = end - start;
    const dirty = this.market.dirtyRange;
    const clipOffset = (value: number) => Math.max(0, Math.min(length, value - start));
    const dirtyFrom = clipOffset(dirty.from);
    const dirtyTo = Math.max(dirtyFrom, clipOffset(dirty.to));
    const revision = this.market.revision;
    return Object.freeze({
      time: all.time.subarray(start, end),
      open: all.open.subarray(start, end),
      high: all.high.subarray(start, end),
      low: all.low.subarray(start, end),
      close: all.close.subarray(start, end),
      volume: all.volume.subarray(start, end),
      oi: all.oi.subarray(start, end),
      bid: all.bid.subarray(start, end),
      ask: all.ask.subarray(start, end),
      bidVolume: all.bidVolume.subarray(start, end),
      askVolume: all.askVolume.subarray(start, end),
      trades: all.trades.subarray(start, end),
      session: all.session.subarray(start, end),
      timelineKey: this.timelineKey,
      revision,
      sourceFrom: start,
      length,
      timeUnit: 'epoch-seconds' as const,
      dirtyRange: canonicalDirtyRange(this.timelineKey, revision, dirty.from, dirty.to),
      dirtyFrom,
      dirtyTo,
    });
  }

  attachConsumer(id: string, kind: CanonicalConsumerKind): CanonicalConsumer {
    const key = String(id).trim();
    if (!key) throw new Error('canonical consumer id cannot be empty');
    const value: CanonicalConsumer = Object.freeze({ id: key, kind, attachedRevision: this.revision });
    const previous = this.consumers.get(key);
    if (previous && previous.kind !== kind) throw new Error(`canonical consumer '${key}' already attached as ${previous.kind}`);
    this.consumers.set(key, value);
    return value;
  }

  detachConsumer(id: string): void { this.consumers.delete(String(id)); }
  listConsumers(): readonly CanonicalConsumer[] { return Object.freeze([...this.consumers.values()]); }

  /** Returns the canonical series backing buffer. Consumers must not replace it. */
  series(field: keyof MarketDataViews): Float64Array {
    return this.market[field];
  }
}

const registry = new Map<string, CanonicalDataPlane>();
const lastAccessAt = new Map<string, number>();
export const MAX_UNOWNED_CANONICAL_DATASETS = 128;
export const MAX_CANONICAL_DATASET_BYTES = 256 * 1024 * 1024;

export type CanonicalDataPlaneRegistryStats = Readonly<{
  entries: number; pinned: number; unowned: number; estimatedBytes: number; maxUnowned: number; maxBytes: number;
}>;

export function releaseCanonicalDataPlane(timelineKey: string, expected?: CanonicalDataPlane): boolean {
  const key = String(timelineKey).trim();
  const plane = registry.get(key);
  if (!plane || (expected && plane !== expected) || !plane.dispose()) return false;
  registry.delete(key);
  lastAccessAt.delete(key);
  return true;
}

export function trimCanonicalDataPlaneRegistry(options: {
  maxUnowned?: number; maxBytes?: number; now?: number; protectKeys?: readonly string[];
} = {}): number {
  const maxUnowned = Math.max(0, Math.floor(options.maxUnowned ?? MAX_UNOWNED_CANONICAL_DATASETS));
  const maxBytes = Math.max(0, options.maxBytes ?? MAX_CANONICAL_DATASET_BYTES);
  const protectedKeys = new Set(options.protectKeys ?? []);
  const candidates = [...registry.entries()]
    .filter(([key, plane]) => plane.consumerCount === 0 && !protectedKeys.has(key))
    .sort((a, b) => (lastAccessAt.get(a[0]) ?? 0) - (lastAccessAt.get(b[0]) ?? 0));
  let totalBytes = [...registry.values()].reduce((sum, plane) => sum + plane.estimatedBytes, 0);
  let excess = Math.max(0, candidates.length - maxUnowned);
  let removed = 0;
  for (const [key, plane] of candidates) {
    if (excess <= 0 && totalBytes <= maxBytes) break;
    const bytes = plane.estimatedBytes;
    if (releaseCanonicalDataPlane(key, plane)) {
      removed += 1;
      if (excess > 0) excess -= 1;
      totalBytes = Math.max(0, totalBytes - bytes);
    }
  }
  return removed;
}

export function canonicalDataPlaneRegistryStats(): CanonicalDataPlaneRegistryStats {
  let pinned = 0, estimatedBytes = 0;
  for (const plane of registry.values()) {
    if (plane.consumerCount > 0) pinned += 1;
    estimatedBytes += plane.estimatedBytes;
  }
  return Object.freeze({
    entries: registry.size, pinned, unowned: registry.size - pinned, estimatedBytes,
    maxUnowned: MAX_UNOWNED_CANONICAL_DATASETS, maxBytes: MAX_CANONICAL_DATASET_BYTES,
  });
}

/** Shared host registry. A symbol/timeframe dataset should resolve here once. */
export function getCanonicalDataPlane(timelineKey: string): CanonicalDataPlane {
  const key = String(timelineKey).trim();
  if (!key) throw new Error('canonical timeline key cannot be empty');
  let plane = registry.get(key);
  if (!plane) {
    plane = new CanonicalDataPlane(key);
    registry.set(key, plane);
  } else {
    registry.delete(key);
    registry.set(key, plane);
  }
  lastAccessAt.set(key, Date.now());
  trimCanonicalDataPlaneRegistry({ protectKeys: [key] });
  return plane;
}

/** Clear unowned entries only; live consumers retain their canonical dataset. */
export function clearCanonicalDataPlaneRegistry(): void {
  for (const [key, plane] of [...registry.entries()]) releaseCanonicalDataPlane(key, plane);
}

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

export type CanonicalConsumerKind = 'indicator' | 'model' | 'chart' | 'structure' | 'liquidity' | 'orderflow' | 'replay' | 'scanner';

export type CanonicalConsumer = Readonly<{
  id: string;
  kind: CanonicalConsumerKind;
  attachedRevision: number;
}>;

export type CanonicalMarketView = MarketDataViews & Readonly<{
  timelineKey: string;
  revision: number;
  length: number;
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

  replace(rows: readonly MarketDataPoint[]): void { this.market.replace(rows); }
  /** Direct OHLCV compatibility ingress; avoids a second row-object allocation pass. */
  replaceHistoricalCandleRows(rows: readonly { timestamp: string; open: number; high: number; low: number; close: number; volume: number }[], from = 0, to = rows.length): void { this.market.replaceHistoricalCandleRows(rows, from, to); }
  append(row: MarketDataPoint): void { this.market.append(row); }
  updateLast(row: MarketDataPoint): void { this.market.updateLast(row); }
  clear(): void { this.market.clear(); }

  /** Borrow the canonical backing arrays; no candle objects are produced. */
  read(from = 0, to = this.market.length): CanonicalMarketView {
    const start = Math.max(0, Math.min(this.market.length, Math.floor(from)));
    const end = Math.max(start, Math.min(this.market.length, Math.ceil(to)));
    const all = this.market.views();
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
      revision: this.market.revision,
      length: end - start,
      dirtyFrom: Math.max(0, this.market.dirtyRange.from - start),
      dirtyTo: Math.max(0, Math.min(end - start, this.market.dirtyRange.to - start)),
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

/** Shared host registry. A symbol/timeframe dataset should resolve here once. */
export function getCanonicalDataPlane(timelineKey: string): CanonicalDataPlane {
  const key = String(timelineKey).trim();
  if (!key) throw new Error('canonical timeline key cannot be empty');
  let plane = registry.get(key);
  if (!plane) {
    plane = new CanonicalDataPlane(key);
    registry.set(key, plane);
  }
  return plane;
}

export function clearCanonicalDataPlaneRegistry(): void { registry.clear(); }

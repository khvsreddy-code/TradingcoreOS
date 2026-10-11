/**
 * Versioned domain vocabulary shared by live market data, paper execution,
 * replay and backtest adapters. Wire transports may keep compatibility wrappers,
 * but consumers normalize to this discriminated union at the boundary.
 */
export type DomainEventSource = 'fyers' | 'paper' | 'replay' | 'backtest' | 'simulator';

export interface DomainEventMetadata {
  sequence: number;
  /** Event time in epoch milliseconds (not the receive time). */
  timestamp: number;
  receivedAt: number;
  brokerTimestamp?: number;
  symbol: string;
  source: DomainEventSource;
  /** Monotonic revision for replacement/correction of an event at the same key. */
  revision: number;
}

export interface MarketTick extends DomainEventMetadata {
  type: 'MarketTick';
  ltp: number;
  open?: number;
  high?: number;
  low?: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  oi?: number;
  bidPrice?: number;
  bidQuantity?: number;
  askPrice?: number;
  askQuantity?: number;
}

export interface Quote extends DomainEventMetadata {
  type: 'Quote';
  ltp: number;
  previousClose?: number;
  change?: number;
  changePercent?: number;
  volume?: number;
  bidPrice?: number;
  bidQuantity?: number;
  askPrice?: number;
  askQuantity?: number;
}

export interface DepthSnapshot extends DomainEventMetadata {
  type: 'DepthSnapshot';
  bids: ReadonlyArray<{ price: number; quantity: number; orders?: number }>;
  asks: ReadonlyArray<{ price: number; quantity: number; orders?: number }>;
}

export interface DepthDelta extends DomainEventMetadata {
  type: 'DepthDelta';
  side: 'bid' | 'ask';
  action: 'upsert' | 'delete';
  price: number;
  quantity: number;
  orders?: number;
}

export interface Trade extends DomainEventMetadata {
  type: 'Trade';
  tradeId: string;
  orderId?: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell' | 'unknown';
}

export interface OrderUpdate extends DomainEventMetadata {
  type: 'OrderUpdate';
  /** Legacy alias retained for existing UI/client contracts. */
  orderId: string;
  /** Canonical FYERS broker id; null only for pre-ack intents. */
  brokerOrderId?: string | null;
  /** Stable TradingCore-generated client tag propagated to FYERS orderTag. */
  clientOrderId?: string | null;
  /** Canonical lifecycle state (INTENT/SUBMITTED/ACKNOWLEDGED/OPEN/PARTIAL/...). */
  status: string;
  side?: 'buy' | 'sell' | 'unknown';
  quantity?: number;
  filledQuantity?: number;
  averagePrice?: number;
  orderType?: string;
  product?: string;
  message?: string;
}

export interface Fill extends DomainEventMetadata {
  type: 'Fill';
  tradeId: string;
  orderId: string;
  brokerOrderId?: string | null;
  clientOrderId?: string | null;
  price: number;
  quantity: number;
  side: 'buy' | 'sell' | 'unknown';
}

export interface PositionUpdate extends DomainEventMetadata {
  type: 'PositionUpdate';
  positionId?: string;
  quantity: number;
  averagePrice?: number;
  ltp?: number;
  pnl?: number;
  product?: string;
}

export interface FundsUpdate extends DomainEventMetadata {
  type: 'FundsUpdate';
  available?: number;
  used?: number;
  total?: number;
  currency?: string;
}

export type DomainMarketEvent =
  | MarketTick
  | Quote
  | DepthSnapshot
  | DepthDelta
  | Trade
  | OrderUpdate
  | Fill
  | PositionUpdate
  | FundsUpdate;

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

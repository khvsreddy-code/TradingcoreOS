import type {
  AccountFunds,
  Holding,
  Position,
  OrderResult,
  TradeRecord,
  HistoricalCandle,
} from '../brokers/BrokerAdapter';
import type { OptionChain } from '../../types/market';

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

export function requireSuccessData(payload: unknown, fallbackError = 'Remote API request failed'): unknown {
  if (!isRecord(payload) || payload.success !== true) {
    const message = isRecord(payload) && typeof payload.error === 'string' ? payload.error : fallbackError;
    throw new Error(message);
  }
  return payload.data;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const stringValue = (v: unknown): v is string => typeof v === 'string';

export function isAccountFunds(value: unknown): value is AccountFunds {
  return isRecord(value) && finite(value.totalCapital) && finite(value.availableMargin) && finite(value.usedMargin) && finite(value.collateralMargin);
}
export function isHolding(value: unknown): value is Holding {
  return isRecord(value) && stringValue(value.id) && stringValue(value.symbol) && finite(value.quantity) && finite(value.avgPrice) && finite(value.ltp) && finite(value.pnl) && finite(value.dayChange);
}
export function isPosition(value: unknown): value is Position {
  return isRecord(value) && stringValue(value.id) && stringValue(value.symbol) && finite(value.quantity) && finite(value.avgPrice) && finite(value.ltp) && finite(value.pnl) && stringValue(value.product);
}
export function isOrderResult(value: unknown): value is OrderResult {
  return isRecord(value) && stringValue(value.orderId) && (value.status === 'COMPLETE' || value.status === 'REJECTED' || value.status === 'PENDING') && stringValue(value.timestamp);
}
export function isTradeRecord(value: unknown): value is TradeRecord {
  return isRecord(value) && stringValue(value.tradeId) && stringValue(value.orderId) && stringValue(value.symbol) && (value.side === 'Buy' || value.side === 'Sell') && finite(value.quantity) && finite(value.price) && stringValue(value.timestamp) && stringValue(value.product);
}
export function isHistoricalCandle(value: unknown): value is HistoricalCandle {
  return isRecord(value) && stringValue(value.timestamp) && finite(value.open) && finite(value.high) && finite(value.low) && finite(value.close) && finite(value.volume);
}
export function requireArray<T>(value: unknown, predicate: (item: unknown) => item is T, label: string): T[] {
  if (!Array.isArray(value) || !value.every(predicate)) throw new Error(`Invalid ${label} payload from server`);
  return value;
}

export function isOptionChain(value: unknown): value is OptionChain {
  if (!isRecord(value) || !stringValue(value.underlyingKey) || !stringValue(value.expiry) || !Array.isArray(value.contracts)) return false;
  return value.contracts.every((row) => isRecord(row) && finite(row.strike));
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function getErrorStatus(error: unknown): number {
  if (!isRecord(error)) return 0;
  return typeof error.status === 'number' && Number.isFinite(error.status) ? error.status : 0;
}

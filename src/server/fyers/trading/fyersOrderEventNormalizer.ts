import type { DomainEventMetadata, Fill, FundsUpdate, OrderUpdate, PositionUpdate, Trade } from '../../../types/market-events.js';

type Row = Record<string, unknown>;
export type FyersNormalizedOrderEvent =
  | { type: 'order'; data: OrderUpdate }
  | { type: 'trade'; data: Fill }
  | { type: 'position'; data: PositionUpdate }
  | { type: 'funds'; data: FundsUpdate };

function asRow(value: unknown): Row | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : undefined;
}
function first(row: Row, keys: readonly string[]): unknown {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  return undefined;
}
function text(row: Row, keys: readonly string[]): string | undefined {
  const value = first(row, keys);
  return value === undefined ? undefined : String(value);
}
function number(row: Row, keys: readonly string[]): number | undefined {
  const value = first(row, keys);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}
function side(row: Row): 'buy' | 'sell' | 'unknown' {
  const value = String(first(row, ['side', 'transactionType', 'tranType', 'orderSide']) ?? '').trim().toLowerCase();
  if (value === 'buy' || value === '1' || value === 'b') return 'buy';
  if (value === 'sell' || value === '-1' || value === 's' || value === '2') return 'sell';
  return 'unknown';
}
function epoch(value: unknown, fallback: number): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value > 0 ? value * 1000 : undefined;
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? numeric : numeric * 1000;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}
function metadata(row: Row, sequence: number, receivedAt: number): DomainEventMetadata {
  const rawBrokerTime = first(row, ['timestamp', 'orderDateTime', 'tradeDateTime', 'exchOrdDateTime', 'fyTokenTimestamp']);
  const brokerTimestamp = rawBrokerTime === undefined ? undefined : epoch(rawBrokerTime, receivedAt);
  return {
    sequence,
    timestamp: brokerTimestamp ?? receivedAt,
    receivedAt,
    ...(brokerTimestamp !== undefined ? { brokerTimestamp } : {}),
    symbol: text(row, ['symbol', 'tradingSymbol', 'tradingsymbol', 'scrip']) || 'UNKNOWN',
    source: 'fyers',
    revision: sequence,
  };
}
function rowsFor(value: unknown): Row[] {
  if (Array.isArray(value)) return value.map(asRow).filter((row): row is Row => Boolean(row));
  const row = asRow(value);
  return row ? [row] : [];
}
function looksLikeFunds(row: Row): boolean {
  return ['availableBalance', 'available_amount', 'availableAmount', 'available', 'fund_limit', 'totalCapital']
    .some(key => row[key] !== undefined);
}
function normalizeOne(kind: 'order' | 'trade' | 'position' | 'funds', row: Row, sequence: number, receivedAt: number): FyersNormalizedOrderEvent | undefined {
  const meta = metadata(row, sequence, receivedAt);
  if (kind === 'order') {
    const orderId = text(row, ['orderId', 'id', 'orderNumber', 'order_id']);
    if (!orderId) return undefined;
    const state = text(row, ['status', 'orderStatus', 'order_status', 'messageString']) || 'unknown';
    const event: OrderUpdate = {
      ...meta, type: 'OrderUpdate', orderId, status: state, side: side(row),
      ...(number(row, ['qty', 'quantity', 'orderQty', 'orderQuantity']) !== undefined ? { quantity: number(row, ['qty', 'quantity', 'orderQty', 'orderQuantity']) } : {}),
      ...(number(row, ['filledQty', 'filledQuantity', 'tradedQty', 'executedQty']) !== undefined ? { filledQuantity: number(row, ['filledQty', 'filledQuantity', 'tradedQty', 'executedQty']) } : {}),
      ...(number(row, ['avgPrice', 'averagePrice', 'tradedPrice', 'tradePrice']) !== undefined ? { averagePrice: number(row, ['avgPrice', 'averagePrice', 'tradedPrice', 'tradePrice']) } : {}),
      ...(text(row, ['type', 'orderType', 'order_type']) ? { orderType: text(row, ['type', 'orderType', 'order_type']) } : {}),
      ...(text(row, ['productType', 'product', 'product_type']) ? { product: text(row, ['productType', 'product', 'product_type']) } : {}),
      ...(text(row, ['message', 'messageString', 'remarks']) ? { message: text(row, ['message', 'messageString', 'remarks']) } : {}),
    };
    return { type: 'order', data: event };
  }
  if (kind === 'trade') {
    const tradeId = text(row, ['tradeId', 'trade_id', 'id', 'tradedId']);
    const orderId = text(row, ['orderId', 'orderNumber', 'order_id']);
    const price = number(row, ['tradePrice', 'tradedPrice', 'price', 'avgPrice']);
    const quantity = number(row, ['tradedQty', 'qty', 'quantity', 'tradeQty']);
    if (!tradeId || price === undefined || quantity === undefined) return undefined;
    const fill: Fill = { ...meta, type: 'Fill', tradeId, orderId: orderId || 'UNKNOWN', price, quantity, side: side(row) };
    return { type: 'trade', data: fill };
  }
  if (kind === 'position') {
    const quantity = number(row, ['netQty', 'qty', 'netQuantity', 'quantity']);
    if (quantity === undefined) return undefined;
    const event: PositionUpdate = {
      ...meta, type: 'PositionUpdate',
      ...(text(row, ['id', 'positionId']) ? { positionId: text(row, ['id', 'positionId']) } : {}),
      quantity,
      ...(number(row, ['buyAvg', 'avgPrice', 'averagePrice']) !== undefined ? { averagePrice: number(row, ['buyAvg', 'avgPrice', 'averagePrice']) } : {}),
      ...(number(row, ['ltp', 'lastTradedPrice']) !== undefined ? { ltp: number(row, ['ltp', 'lastTradedPrice']) } : {}),
      ...(number(row, ['pl', 'pnl', 'unrealizedProfit']) !== undefined ? { pnl: number(row, ['pl', 'pnl', 'unrealizedProfit']) } : {}),
      ...(text(row, ['productType', 'product']) ? { product: text(row, ['productType', 'product']) } : {}),
    };
    return { type: 'position', data: event };
  }
  if (!looksLikeFunds(row)) return undefined;
  const event: FundsUpdate = {
    ...meta, type: 'FundsUpdate',
    ...(number(row, ['availableBalance', 'available_amount', 'availableAmount', 'available']) !== undefined ? { available: number(row, ['availableBalance', 'available_amount', 'availableAmount', 'available']) } : {}),
    ...(number(row, ['usedMargin', 'used', 'utilizedAmount']) !== undefined ? { used: number(row, ['usedMargin', 'used', 'utilizedAmount']) } : {}),
    ...(number(row, ['totalCapital', 'total', 'equityAmount']) !== undefined ? { total: number(row, ['totalCapital', 'total', 'equityAmount']) } : {}),
    ...(text(row, ['currency']) ? { currency: text(row, ['currency']) } : {}),
  };
  return { type: 'funds', data: event };
}

/** Convert untrusted FYERS socket payloads into strict, replay-safe domain events. Unknown
 * payloads are deliberately dropped rather than broadcasting raw broker objects to consumers.
 */
export function normalizeFyersOrderPayload(payload: unknown, sequence: number, receivedAt = Date.now()): FyersNormalizedOrderEvent[] {
  const root = asRow(payload);
  if (!root) return [];
  const kindText = String(first(root, ['type', 'T', 'event', 'channel']) ?? '').toLowerCase();
  const output: FyersNormalizedOrderEvent[] = [];
  const categories: Array<{ kind: 'order' | 'trade' | 'position' | 'funds'; keys: readonly string[]; keyword: string }> = [
    { kind: 'order', keys: ['orders', 'order'], keyword: 'order' },
    { kind: 'trade', keys: ['trades', 'trade'], keyword: 'trade' },
    { kind: 'position', keys: ['positions', 'position'], keyword: 'position' },
    { kind: 'funds', keys: ['funds', 'fund_limit', 'fundsUpdate'], keyword: 'fund' },
  ];
  for (const category of categories) {
    const explicit = category.keys.some(key => root[key] !== undefined);
    const named = kindText.includes(category.keyword);
    if (!explicit && !named && !(category.kind === 'funds' && looksLikeFunds(root))) continue;
    const source = explicit ? category.keys.map(key => root[key]).find(value => value !== undefined) : root;
    for (const row of rowsFor(source)) {
      const event = normalizeOne(category.kind, row, sequence, receivedAt);
      if (event) output.push(event);
    }
  }
  return output;
}

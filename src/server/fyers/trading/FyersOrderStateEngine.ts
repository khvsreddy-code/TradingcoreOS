import { createClient } from '@supabase/supabase-js';
import type { DomainMarketEvent, Fill, FundsUpdate, OrderUpdate, PositionUpdate } from '../../../types/market-events.js';
import { FyersApiClient } from '../core/FyersApiClient.js';
import { resolveFyersCapabilities } from '../core/FyersCapabilities.js';
import { canonicalSha256 } from '../../utils/canonicalJson.js';
import { marketEventBus } from '../../marketData/MarketEventBus.js';
import { normalizeFyersOrderPayload, type FyersNormalizedOrderEvent } from './fyersOrderEventNormalizer.js';

export type FyersOrderStateStatus =
  | 'INTENT' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'OPEN' | 'PARTIAL' | 'FILLED'
  | 'CANCEL_PENDING' | 'CANCELLED' | 'REJECTED' | 'EXPIRED' | 'UNKNOWN';
export type FyersOrderIngestSource = 'websocket' | 'reconciliation' | 'tradingcore';

export interface FyersOrderApplyResult {
  duplicate: boolean;
  applied: boolean;
  sequence?: number;
  events: DomainMarketEvent[];
}

export interface FyersReconciliationSummary {
  cancelled: boolean;
  orders: number;
  trades: number;
  positions: number;
  applied: number;
  duplicates: number;
}

type RpcResult = {
  duplicate?: boolean;
  applied?: boolean;
  sequence?: number | string;
  event_payload?: unknown;
  state_payload?: unknown;
};

type RecordValue = Record<string, unknown>;
const EVENT_KEY_VERSION = 1;
const MAX_RECONCILIATION_SNAPSHOT_ROWS = 25_000;

function asRecord(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined;
}

function withSequence<T extends DomainMarketEvent>(event: T, sequence: number): T {
  return { ...event, sequence, revision: sequence } as T;
}

function domainEvent(value: unknown): DomainMarketEvent | undefined {
  const row = asRecord(value);
  if (!row || typeof row.type !== 'string') return undefined;
  if (!['MarketTick','Quote','DepthSnapshot','DepthDelta','Trade','OrderUpdate','Fill','PositionUpdate','FundsUpdate'].includes(row.type)) return undefined;
  return row as unknown as DomainMarketEvent;
}

function eventIdentity(event: DomainMarketEvent): unknown {
  switch (event.type) {
    case 'OrderUpdate':
      return {
        v: EVENT_KEY_VERSION, type: event.type, brokerOrderId: event.brokerOrderId || event.orderId || null,
        clientOrderId: event.clientOrderId || null, status: event.status,
        quantity: event.quantity ?? null, filledQuantity: event.filledQuantity ?? null,
        averagePrice: event.averagePrice ?? null, side: event.side ?? null,
        orderType: event.orderType ?? null, product: event.product ?? null, message: event.message ?? null,
      };
    case 'Fill':
      return { v: EVENT_KEY_VERSION, type: event.type, tradeId: event.tradeId };
    case 'PositionUpdate':
      return {
        v: EVENT_KEY_VERSION, type: event.type, symbol: event.symbol, positionId: event.positionId ?? null,
        quantity: event.quantity, averagePrice: event.averagePrice ?? null, ltp: event.ltp ?? null,
        pnl: event.pnl ?? null, product: event.product ?? null,
      };
    case 'FundsUpdate':
      return {
        v: EVENT_KEY_VERSION, type: event.type, available: event.available ?? null,
        used: event.used ?? null, total: event.total ?? null, currency: event.currency ?? null,
      };
    default:
      return { v: EVENT_KEY_VERSION, type: event.type, sequence: event.sequence, timestamp: event.timestamp, symbol: event.symbol };
  }
}

export function fyersOrderEventKey(event: DomainMarketEvent): string {
  return canonicalSha256(eventIdentity(event));
}

const TERMINAL = new Set<FyersOrderStateStatus>(['FILLED','CANCELLED','REJECTED','EXPIRED']);
const KNOWN_STATUSES = new Set<FyersOrderStateStatus>([
  'INTENT','SUBMITTED','ACKNOWLEDGED','OPEN','PARTIAL','FILLED','CANCEL_PENDING','CANCELLED','REJECTED','EXPIRED','UNKNOWN',
]);

export function canTransitionFyersOrderStatus(
  currentValue: string | undefined,
  nextValue: string,
  source: FyersOrderIngestSource = 'websocket',
): boolean {
  const next = (KNOWN_STATUSES.has(nextValue as FyersOrderStateStatus) ? nextValue : 'UNKNOWN') as FyersOrderStateStatus;
  const current = currentValue && KNOWN_STATUSES.has(currentValue as FyersOrderStateStatus)
    ? currentValue as FyersOrderStateStatus
    : undefined;
  if (!current) return true;
  if (current === next) return true;
  if (next === 'UNKNOWN') return false;
  if (TERMINAL.has(current)) {
    return source === 'reconciliation' && TERMINAL.has(next);
  }
  if (source === 'reconciliation') return true;
  if (current === 'INTENT') return ['SUBMITTED','ACKNOWLEDGED','OPEN','PARTIAL','FILLED','CANCEL_PENDING','CANCELLED','REJECTED','EXPIRED'].includes(next);
  if (current === 'SUBMITTED') return ['ACKNOWLEDGED','OPEN','PARTIAL','FILLED','CANCEL_PENDING','CANCELLED','REJECTED','EXPIRED'].includes(next);
  if (current === 'ACKNOWLEDGED') return ['OPEN','PARTIAL','FILLED','CANCEL_PENDING','CANCELLED','REJECTED','EXPIRED'].includes(next);
  if (current === 'OPEN') return ['PARTIAL','FILLED','CANCEL_PENDING','CANCELLED','REJECTED','EXPIRED'].includes(next);
  if (current === 'PARTIAL') return ['PARTIAL','FILLED','CANCEL_PENDING','CANCELLED','REJECTED','EXPIRED'].includes(next);
  if (current === 'CANCEL_PENDING') return ['OPEN','PARTIAL','FILLED','CANCELLED','REJECTED','EXPIRED'].includes(next);
  if (current === 'UNKNOWN') return next !== 'UNKNOWN';
  return false;
}

function rowsFrom(payload: unknown, keys: readonly string[]): RecordValue[] {
  const root = asRecord(payload);
  const nested = asRecord(root?.data) || root;
  if (Array.isArray(payload)) return payload.map(asRecord).filter((row): row is RecordValue => Boolean(row));
  for (const key of keys) {
    const candidate = nested?.[key];
    if (Array.isArray(candidate)) return candidate.map(asRecord).filter((row): row is RecordValue => Boolean(row));
  }
  throw new Error(`FYERS reconciliation snapshot is missing ${keys.join('/')} array.`);
}

function asNormalizedRows(
  rows: readonly RecordValue[],
  kind: 'orders' | 'trades' | 'positions',
  nextSequence: () => number,
  receivedAt: number,
): FyersNormalizedOrderEvent[] {
  if (rows.length > MAX_RECONCILIATION_SNAPSHOT_ROWS) {
    throw new Error(`FYERS ${kind} snapshot exceeded the safety cap of ${MAX_RECONCILIATION_SNAPSHOT_ROWS} rows.`);
  }
  const key = kind === 'orders' ? 'orders' : kind === 'trades' ? 'trades' : 'positions';
  const output: FyersNormalizedOrderEvent[] = [];
  for (const row of rows) {
    output.push(...normalizeFyersOrderPayload({ type: kind, [key]: row }, nextSequence(), receivedAt));
  }
  return output;
}

/**
 * Shared, idempotent order state boundary. PostgreSQL performs the event-key
 * claim and state transition in one transaction. Development may use an
 * in-memory reducer; production deliberately fails closed without durable DB
 * configuration so an order cannot be placed against an unpersisted intent.
 */
export class FyersOrderStateEngine {
  private static readonly supabase = FyersOrderStateEngine.createClient();
  private static readonly memoryEvents = new Set<string>();
  private static readonly memoryStates = new Map<string, OrderUpdate>();
  private static memorySequence = 0;

  private static createClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }

  private static requireStore(): void {
    if (!this.supabase && process.env.NODE_ENV === 'production') {
      throw new Error('Durable FYERS order state storage is required in production. Apply the FYERS order reconciliation migration and configure Supabase service credentials.');
    }
  }

  static async recordLifecycle(
    userId: string,
    clientOrderId: string,
    status: FyersOrderStateStatus,
    detail: {
      brokerOrderId?: string | null;
      symbol?: string;
      quantity?: number;
      filledQuantity?: number;
      averagePrice?: number;
      side?: 'buy' | 'sell' | 'unknown';
      message?: string;
    } = {},
  ): Promise<void> {
    const now = Date.now();
    const brokerOrderId = detail.brokerOrderId || null;
    const event: OrderUpdate = {
      type: 'OrderUpdate',
      orderId: brokerOrderId || '',
      brokerOrderId,
      clientOrderId: clientOrderId || null,
      status,
      sequence: 0,
      timestamp: now,
      receivedAt: now,
      symbol: detail.symbol || 'UNKNOWN',
      source: 'fyers',
      revision: 0,
      ...(detail.quantity !== undefined ? { quantity: detail.quantity } : {}),
      ...(detail.filledQuantity !== undefined ? { filledQuantity: detail.filledQuantity } : {}),
      ...(detail.averagePrice !== undefined ? { averagePrice: detail.averagePrice } : {}),
      ...(detail.side ? { side: detail.side } : {}),
      ...(detail.message ? { message: detail.message } : {}),
    };
    const result = await this.applyEvent(userId, event, 'tradingcore');
    for (const item of result.events) marketEventBus.publish(item);
  }

  static async applyNormalized(
    userId: string,
    normalized: FyersNormalizedOrderEvent,
    source: Exclude<FyersOrderIngestSource, 'tradingcore'>,
  ): Promise<FyersOrderApplyResult> {
    return this.applyEvent(userId, normalized.data, source);
  }

  static async reconcile(
    userId: string,
    accessToken: string,
    nextSequence: () => number,
    isCurrent: () => boolean,
    publish: (event: DomainMarketEvent) => void,
  ): Promise<FyersReconciliationSummary> {
    this.requireStore();
    const client = new FyersApiClient(accessToken, undefined, resolveFyersCapabilities(userId), userId);
    // Fetch all three before applying any of them. A partial REST failure is not
    // a valid snapshot and must not leave the local state half-reconciled.
    const [ordersPayload, tradesPayload, positionsPayload] = await Promise.all([
      client.apiGet<unknown>('/orders'),
      client.apiGet<unknown>('/tradebook'),
      client.apiGet<unknown>('/positions'),
    ]);
    if (!isCurrent()) return { cancelled: true, orders: 0, trades: 0, positions: 0, applied: 0, duplicates: 0 };

    const orders = rowsFrom(ordersPayload, ['orderBook']);
    const trades = rowsFrom(tradesPayload, ['tradeBook']);
    const positions = rowsFrom(positionsPayload, ['netPositions']);
    const receivedAt = Date.now();
    const snapshotEvents: Array<{ normalized: FyersNormalizedOrderEvent; group: 'orders'|'trades'|'positions' }> = [
      ...asNormalizedRows(orders, 'orders', nextSequence, receivedAt).map(normalized => ({ normalized, group: 'orders' as const })),
      ...asNormalizedRows(trades, 'trades', nextSequence, receivedAt).map(normalized => ({ normalized, group: 'trades' as const })),
      ...asNormalizedRows(positions, 'positions', nextSequence, receivedAt).map(normalized => ({ normalized, group: 'positions' as const })),
    ];
    let applied = 0;
    let duplicates = 0;
    for (const item of snapshotEvents) {
      if (!isCurrent()) return { cancelled: true, orders: orders.length, trades: trades.length, positions: positions.length, applied, duplicates };
      const result = await this.applyNormalized(userId, item.normalized, 'reconciliation');
      if (result.duplicate) duplicates += 1;
      if (result.applied) applied += 1;
      result.events.forEach(publish);
    }
    return { cancelled: false, orders: orders.length, trades: trades.length, positions: positions.length, applied, duplicates };
  }

  private static async applyEvent(
    userId: string,
    input: DomainMarketEvent,
    source: FyersOrderIngestSource,
  ): Promise<FyersOrderApplyResult> {
    this.requireStore();
    if (!userId) throw new Error('Authenticated TradingCore user is required for order state.');
    const event = input.type === 'OrderUpdate'
      ? { ...input, brokerOrderId: input.brokerOrderId || input.orderId, status: normalizeOrderStatus(input.status) }
      : input;
    const eventKey = fyersOrderEventKey(event);

    if (!this.supabase) return this.applyInMemory(userId, event, eventKey, source);

    const { data, error } = await this.supabase.rpc('apply_broker_order_event', {
      p_user_id: userId,
      p_broker_id: 'fyers',
      p_event_key: eventKey,
      p_event: event,
      p_source: source,
    });
    if (error) throw new Error(`Unable to persist FYERS order event/state: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as RpcResult | null;
    if (!row || typeof row !== 'object') throw new Error('FYERS order-state RPC returned an invalid result.');
    const duplicate = row.duplicate === true;
    const applied = row.applied === true;
    const sequenceValue = Number(row.sequence);
    const sequence = Number.isFinite(sequenceValue) ? sequenceValue : event.sequence;
    const storedEvent = domainEvent(row.event_payload);
    const storedState = domainEvent(row.state_payload);
    let events: DomainMarketEvent[] = [];

    if (event.type === 'OrderUpdate') {
      if (source === 'reconciliation' && storedState?.type === 'OrderUpdate') {
        // Publish the current durable state even when the snapshot row is a
        // duplicate, so a reconnecting consumer that missed a fill can catch up.
        events = [storedState];
      } else if (!duplicate && applied) {
        events = [storedState?.type === 'OrderUpdate' ? storedState : (storedEvent || withSequence(event, sequence))];
      }
    } else if (!duplicate && applied) {
      const canonical = storedEvent || withSequence(event, sequence);
      events = [canonical];
      // A live trade can advance cumulative order fill state exactly once.
      if (event.type === 'Fill' && storedState?.type === 'OrderUpdate') events.push(storedState);
    }
    return { duplicate, applied, sequence, events };
  }

  private static applyInMemory(
    userId: string,
    event: DomainMarketEvent,
    eventKey: string,
    source: FyersOrderIngestSource,
  ): FyersOrderApplyResult {
    const eventScope = `${userId}:fyers:${eventKey}`;
    const duplicate = this.memoryEvents.has(eventScope);
    const brokerOrderId = event.type === 'OrderUpdate'
      ? String(event.brokerOrderId || event.orderId || '')
      : event.type === 'Fill' ? String(event.brokerOrderId || event.orderId || '') : '';
    const stateKey = brokerOrderId ? `${userId}:fyers:${brokerOrderId}` : '';
    const current = stateKey ? this.memoryStates.get(stateKey) : undefined;
    if (duplicate) {
      return {
        duplicate: true, applied: false,
        events: source === 'reconciliation' && event.type === 'OrderUpdate' && current ? [current] : [],
      };
    }
    this.memoryEvents.add(eventScope);
    const sequence = ++this.memorySequence;
    const canonical = withSequence(event, sequence);
    if (event.type === 'OrderUpdate') {
      if (!brokerOrderId || canTransitionFyersOrderStatus(current?.status, event.status, source)) {
        if (brokerOrderId) {
          const incomingFilled = Number(canonical.filledQuantity || 0);
          const currentFilled = Number(current?.filledQuantity || 0);
          const merged = {
            ...(current || {}),
            ...canonical,
            quantity: canonical.quantity ?? current?.quantity,
            filledQuantity: Math.max(currentFilled, incomingFilled),
          } as OrderUpdate;
          if (merged.quantity && merged.quantity > 0 && (merged.filledQuantity || 0) >= merged.quantity) {
            merged.status = 'FILLED';
          } else if ((merged.filledQuantity || 0) > 0 && ['OPEN','ACKNOWLEDGED','SUBMITTED'].includes(merged.status)) {
            merged.status = 'PARTIAL';
          }
          this.memoryStates.set(stateKey, merged);
          return { duplicate: false, applied: true, sequence, events: [merged] };
        }
        // Pre-ack INTENT/SUBMITTED events have no broker id yet, but they are
        // still canonical lifecycle events and must be visible to audit/consumers.
        return { duplicate: false, applied: true, sequence, events: [canonical] };
      }
      return { duplicate: false, applied: false, sequence, events: source === 'reconciliation' && current ? [current] : [] };
    }
    if (event.type === 'Fill' && source === 'websocket' && stateKey && current) {
      const increment = Number(event.quantity) || 0;
      const filled = (current.filledQuantity || 0) + increment;
      const status: FyersOrderStateStatus = current.quantity && current.quantity > 0 && filled >= current.quantity
        ? 'FILLED'
        : TERMINAL.has(current.status as FyersOrderStateStatus)
          ? current.status as FyersOrderStateStatus
          : filled > 0 ? 'PARTIAL' : current.status as FyersOrderStateStatus;
      const next: OrderUpdate = { ...current, filledQuantity: Math.max(Number(current.filledQuantity || 0), filled), status, sequence, revision: sequence, timestamp: event.timestamp, receivedAt: event.receivedAt };
      this.memoryStates.set(stateKey, next);
      return { duplicate: false, applied: true, sequence, events: [canonical, next] };
    }
    return { duplicate: false, applied: true, sequence, events: [canonical] };
  }
}

function normalizeOrderStatus(value: string): FyersOrderStateStatus {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return (KNOWN_STATUSES.has(normalized as FyersOrderStateStatus) ? normalized : 'UNKNOWN') as FyersOrderStateStatus;
}

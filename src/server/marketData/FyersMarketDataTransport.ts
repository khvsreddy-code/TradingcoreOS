import WebSocket from 'ws';
import type { DomainMarketEvent } from '../../types/market-events.js';
import type { MarketFeedEvent, NormalizedMarketTick } from '../../types/market.js';
import { DEFAULT_FYERS_CAPABILITIES } from '../fyers/core/FyersCapabilities.js';
import { marketEventBus } from './MarketEventBus.js';

export type FyersDataFeedClass = 'lite' | 'full' | 'depth';
type Listener = (event: MarketFeedEvent) => void;

interface Session {
  userId: string;
  quotaIdentity: string;
  feedClass: FyersDataFeedClass;
  socket?: WebSocket;
  instruments: Set<string>;
  listeners: Set<Listener>;
  subscriptions: Map<Listener, Set<string>>;
  accessToken: string;
  closing: boolean;
  reconnectAttempt: number;
  connectGeneration: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  pingTimer?: ReturnType<typeof setInterval>;
  lastTickAt: number;
  sequence: number;
}

/**
 * A user may own three isolated broker data sockets: LTP-only, full symbol
 * updates, and depth. Keeping them separate prevents depth frames from sharing
 * the chart/quote hot path. The account-level symbol union is still capped
 * centrally, so opening additional classes cannot bypass FYERS entitlements.
 */
export class FyersMarketDataTransport {
  private static sessions = new Map<string, Session>();

  private static sessionKey(userId: string, feedClass: FyersDataFeedClass): string {
    return userId + '::' + feedClass;
  }

  static checkSubscriptionCapacity(
    userId: string,
    instrumentKeys: readonly string[],
    maxSymbols: number,
    depthSymbols: readonly string[] = [],
    quotaIdentity = userId,
  ): { allowed: boolean; activeSymbols: number; projectedSymbols: number; limit: number } {
    const active = new Set<string>();
    for (const session of this.sessions.values()) {
      if (session.quotaIdentity === quotaIdentity) session.instruments.forEach(symbol => active.add(symbol));
    }
    const projected = new Set<string>([...active, ...instrumentKeys, ...depthSymbols]);
    return { allowed: projected.size <= maxSymbols, activeSymbols: active.size, projectedSymbols: projected.size, limit: maxSymbols };
  }

  static subscribe(
    userId: string,
    accessToken: string,
    instrumentKeys: string[],
    listener: Listener,
    includeDepth = false,
    depthSymbols: string[] = instrumentKeys,
    maxSymbols = DEFAULT_FYERS_CAPABILITIES.maxStreamSymbols,
    feedClass: FyersDataFeedClass = 'full',
    quotaIdentity = userId,
  ): () => void {
    // Backward compatibility: a legacy combined request is fulfilled by two
    // physically distinct sockets rather than subscribing to depth on the chart socket.
    if (feedClass === 'full' && includeDepth) {
      const stopFull = this.subscribeSingle(userId, accessToken, instrumentKeys, listener, maxSymbols, 'full', quotaIdentity);
      try {
        const stopDepth = this.subscribeSingle(userId, accessToken, depthSymbols, listener, maxSymbols, 'depth', quotaIdentity);
        let stopped = false;
        return () => {
          if (stopped) return;
          stopped = true;
          stopDepth();
          stopFull();
        };
      } catch (error) {
        stopFull();
        throw error;
      }
    }
    return this.subscribeSingle(userId, accessToken, instrumentKeys, listener, maxSymbols, feedClass, quotaIdentity);
  }

  static disconnect(userId: string): void {
    for (const [key, session] of this.sessions) {
      if (session.userId !== userId) continue;
      session.closing = true;
      clearTimeout(session.reconnectTimer);
      if (session.pingTimer) clearInterval(session.pingTimer);
      session.pingTimer = undefined;
      try { session.socket?.close(); } catch {}
      this.sessions.delete(key);
    }
  }

  private static subscribeSingle(
    userId: string,
    accessToken: string,
    instrumentKeys: string[],
    listener: Listener,
    maxSymbols: number,
    feedClass: FyersDataFeedClass,
    quotaIdentity = userId,
  ): () => void {
    // A broker account switch invalidates every socket owned by this TradingCore
    // user; never carry the previous account's subscriptions into the new quota pool.
    if ([...this.sessions.values()].some(session => session.userId === userId && session.quotaIdentity !== quotaIdentity)) {
      this.disconnect(userId);
    }
    const symbols = [...new Set(instrumentKeys.map(value => String(value || '').trim()).filter(Boolean))];
    if (!symbols.length) throw Object.assign(new Error('At least one valid FYERS symbol is required.'), { status: 400, code: 'FYERS_EMPTY_SUBSCRIPTION' });
    const capacity = this.checkSubscriptionCapacity(userId, symbols, maxSymbols, [], quotaIdentity);
    if (!capacity.allowed) {
      throw Object.assign(
        new Error(`FYERS stream symbol limit exceeded: ${capacity.projectedSymbols} unique symbols requested; ${capacity.limit} allowed for this account's plan.`),
        { status: 400, code: 'FYERS_STREAM_SYMBOL_LIMIT', limit: capacity.limit, requested: capacity.projectedSymbols },
      );
    }

    const key = this.sessionKey(userId, feedClass);
    let session = this.sessions.get(key);
    if (!session) {
      session = {
        userId, quotaIdentity, feedClass, instruments: new Set(), listeners: new Set(), subscriptions: new Map(),
        accessToken, closing: false, reconnectAttempt: 0, connectGeneration: 0, lastTickAt: 0, sequence: 0,
      };
      this.sessions.set(key, session);
    }
    const tokenChanged = session.accessToken !== accessToken;
    session.accessToken = accessToken;
    session.closing = false;
    session.listeners.add(listener);
    session.subscriptions.set(listener, new Set(symbols));
    const newSymbols = symbols.filter(symbol => !session!.instruments.has(symbol));
    newSymbols.forEach(symbol => session!.instruments.add(symbol));

    const stale = session.socket?.readyState === WebSocket.OPEN && session.lastTickAt > 0 && Date.now() - session.lastTickAt > 5_000;
    // Never keep a socket authenticated with a rotated/expired token. Restart
    // the shared feed once; the latest token is used for reconnect and resubscribe.
    if (tokenChanged && session.socket) this.restartSocket(key, session);
    else if (stale) this.restartSocket(key, session);
    else if (!session.socket || session.socket.readyState === WebSocket.CLOSED || session.socket.readyState === WebSocket.CLOSING) {
      void this.connect(key, session);
    } else if (newSymbols.length && session.socket.readyState === WebSocket.OPEN) {
      this.sendSubscribe(session, newSymbols);
    }

    listener({ type: 'status', status: session.socket?.readyState === WebSocket.OPEN ? 'connected' : 'connecting' });
    return () => this.unsubscribe(key, listener);
  }

  private static unsubscribe(key: string, listener: Listener): void {
    const session = this.sessions.get(key);
    if (!session) return;
    session.listeners.delete(listener);
    session.subscriptions.delete(listener);
    if (!session.listeners.size) {
      session.closing = true;
      clearTimeout(session.reconnectTimer);
      if (session.pingTimer) clearInterval(session.pingTimer);
      try { session.socket?.close(); } catch {}
      this.sessions.delete(key);
      return;
    }
    const next = new Set<string>();
    session.subscriptions.forEach(symbols => symbols.forEach(symbol => next.add(symbol)));
    const removed = [...session.instruments].filter(symbol => !next.has(symbol));
    session.instruments = next;
    if (removed.length && session.socket?.readyState === WebSocket.OPEN) {
      try { session.socket.send(JSON.stringify({ symbol: removed, type: 'unsubscribe' })); } catch { /* reconnect will restore remaining symbols */ }
    }
  }

  private static async connect(key: string, session: Session): Promise<void> {
    if (session.closing || !session.instruments.size) return;
    const appId = process.env.FYERS_CLIENT_ID;
    if (!appId) {
      this.emit(session, { type: 'error', error: 'FYERS_CLIENT_ID is not configured for live market data' });
      return;
    }

    const generation = ++session.connectGeneration;
    const socket = new WebSocket('wss://api.fyers.in/socket/v2/data/', {
      headers: { authorization: `${appId}:${session.accessToken}` },
      handshakeTimeout: 10_000,
    });
    session.socket = socket;
    socket.on('open', () => {
      if (generation !== session.connectGeneration || session.closing) {
        try { socket.close(); } catch {}
        return;
      }
      session.reconnectAttempt = 0;
      this.emit(session, { type: 'status', status: 'connected' });
      this.sendSubscribe(session, [...session.instruments]);
      if (session.pingTimer) clearInterval(session.pingTimer);
      session.pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) { try { socket.send('ping'); } catch {} }
      }, 10_000);
    });

    socket.on('message', message => {
      if (generation !== session.connectGeneration || session.closing) return;
      try {
        const text = Buffer.isBuffer(message) ? message.toString('utf8') : String(message);
        if (text === 'ping' || text === 'pong') return;
        const payload: unknown = JSON.parse(text);
        const sequence = ++session.sequence;
        const tick = normalizeFyersTick(payload, session.feedClass, sequence);
        if (!tick) return;
        session.lastTickAt = Date.now();
        const domainEvent = buildDomainEvent(tick, session.feedClass);
        // Publish only normalized domain data to internal chart/indicator/orderbook/CoreSpirit/ML consumers.
        // Depth stays on its own socket and is routed only to subscribers requesting depth-oriented consumers.
        marketEventBus.publish(domainEvent);
        this.emit(session, { type: 'tick', tick, domainEvent });
      } catch {
        // Non-market informational frames and malformed provider frames are ignored.
      }
    });

    socket.on('error', error => {
      if (generation !== session.connectGeneration || session.closing) return;
      this.emit(session, { type: 'error', error: error instanceof Error ? error.message : 'FYERS market socket error' });
    });

    socket.on('close', (code, reason) => {
      if (generation !== session.connectGeneration) return;
      session.socket = undefined;
      if (session.pingTimer) clearInterval(session.pingTimer);
      session.pingTimer = undefined;
      if (session.closing) return;
      const detail = reason?.toString?.() || '';
      if (code === 1008 || code === 4001) {
        this.emit(session, { type: 'error', error: detail || `FYERS market socket rejected the session (code ${code}). Reconnect the broker.` });
        this.emit(session, { type: 'status', status: 'authentication_failed' });
        return;
      }
      this.scheduleReconnect(key, session);
    });
  }

  private static restartSocket(key: string, session: Session): void {
    if (session.closing) return;
    clearTimeout(session.reconnectTimer);
    if (session.pingTimer) clearInterval(session.pingTimer);
    session.pingTimer = undefined;
    const socket = session.socket;
    session.socket = undefined;
    session.connectGeneration += 1;
    try { socket?.close(); } catch {}
    session.reconnectAttempt = 0;
    this.emit(session, { type: 'status', status: 'reconnecting' });
    void this.connect(key, session);
  }

  private static scheduleReconnect(key: string, session: Session): void {
    if (session.closing) return;
    session.reconnectAttempt += 1;
    const delay = Math.min(15_000, 500 * 2 ** Math.min(session.reconnectAttempt, 5));
    this.emit(session, { type: 'status', status: 'reconnecting' });
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = setTimeout(() => void this.connect(key, session), delay);
  }

  private static sendSubscribe(session: Session, symbols: string[]): void {
    if (!symbols.length || session.socket?.readyState !== WebSocket.OPEN) return;
    const type = session.feedClass === 'lite' ? 'lite' : session.feedClass === 'depth' ? 'DepthUpdate' : 'symbolUpdate';
    session.socket.send(JSON.stringify({ symbol: symbols, type }));
  }

  private static emit(session: Session, event: MarketFeedEvent): void {
    session.listeners.forEach(listener => {
      if (event.type === 'tick') {
        const symbols = session.subscriptions.get(listener);
        if (!symbols?.has(event.tick.instrumentKey)) return;
      }
      try { listener(event); } catch { /* one consumer must not break shared fanout */ }
    });
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function finite(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}
function eventTime(value: unknown, fallback: number): number {
  const raw = finite(value);
  if (raw !== undefined && raw > 0) return raw > 1e12 ? raw : raw * 1000;
  return fallback;
}

/**
 * FYERS can send a stale last_traded_time alongside a newer exch_feed_time.
 * Prefer the newest valid exchange-provided timestamp, never packet receive time,
 * so the chart's forming candle does not remain stuck in an old bucket.
 */
function latestFyersTimestamp(payload: Record<string, unknown>): number | undefined {
  const candidates = [payload.last_traded_time, payload.exch_feed_time]
    .map(finite)
    .filter((value): value is number => value !== undefined && value > 0)
    .map(value => value > 1e12 ? value : value * 1000)
    .filter(value => Number.isFinite(value) && value > 0 && value <= Date.now() + 60_000);
  return candidates.length ? Math.max(...candidates) : undefined;
}

function normalizeFyersTick(value: unknown, feedClass: FyersDataFeedClass, sequence: number): NormalizedMarketTick | null {
  const payload = asRecord(value);
  if (!payload || typeof payload.symbol !== 'string' || !payload.symbol.trim()) return null;
  const now = Date.now();
  const receivedAt = now;
  const ltp = finite(payload.ltp);
  const depthBids = [1, 2, 3, 4, 5].map(i => ({
    price: finite(payload[`bid_price${i}`]),
    quantity: finite(payload[`bid_size${i}`]),
    orders: finite(payload[`bid_order${i}`]),
  })).filter((level): level is { price: number; quantity: number; orders: number | undefined } => level.price !== undefined && level.quantity !== undefined)
    .map(level => ({ price: level.price, quantity: level.quantity, ...(level.orders !== undefined ? { orders: level.orders } : {}) }));
  const depthAsks = [1, 2, 3, 4, 5].map(i => ({
    price: finite(payload[`ask_price${i}`]),
    quantity: finite(payload[`ask_size${i}`]),
    orders: finite(payload[`ask_order${i}`]),
  })).filter((level): level is { price: number; quantity: number; orders: number | undefined } => level.price !== undefined && level.quantity !== undefined)
    .map(level => ({ price: level.price, quantity: level.quantity, ...(level.orders !== undefined ? { orders: level.orders } : {}) }));
  const isDepth = feedClass === 'depth' || String(payload.type || '').toLowerCase() === 'dp' || String(payload.type || '').toLowerCase() === 'depthupdate';

  // Keep each socket class strict. An informational/depth frame must not leak
  // into a full-tick stream as an empty quote, and an LTP-only frame is not a
  // valid depth snapshot.
  if (feedClass === 'depth' && !depthBids.length && !depthAsks.length) return null;
  if (feedClass === 'full' && ltp === undefined) return null;

  if (feedClass === 'lite') {
    if (ltp === undefined) return null;
    const brokerTimestamp = latestFyersTimestamp(payload);
    return {
      instrumentKey: payload.symbol, ltp,
      receivedAt: new Date(receivedAt).toISOString(),
      sequence, timestamp: eventTime(brokerTimestamp, receivedAt), receivedAtEpoch: receivedAt,
      brokerTimestamp: brokerTimestamp !== undefined ? eventTime(brokerTimestamp, receivedAt) : undefined,
      source: 'fyers', revision: sequence, feedClass,
    };
  }
  if (ltp === undefined && !isDepth && !depthBids.length && !depthAsks.length) return null;
  const prevClose = finite(payload.prev_close_price);
  const brokerTimestamp = latestFyersTimestamp(payload);
  const tick: NormalizedMarketTick = {
    instrumentKey: payload.symbol,
    ...(ltp !== undefined ? { ltp } : {}),
    ...(finite(payload.open_price) !== undefined ? { open: finite(payload.open_price) } : {}),
    ...(finite(payload.high_price) !== undefined ? { high: finite(payload.high_price) } : {}),
    ...(finite(payload.low_price) !== undefined ? { low: finite(payload.low_price) } : {}),
    ...(prevClose !== undefined ? { close: prevClose } : {}),
    ...(finite(payload.ch) !== undefined ? { change: finite(payload.ch) } : (ltp !== undefined && prevClose !== undefined ? { change: ltp - prevClose } : {})),
    ...(finite(payload.chp) !== undefined ? { changePercent: finite(payload.chp) } : {}),
    ...(finite(payload.vol_traded_today) !== undefined ? { volume: finite(payload.vol_traded_today) } : {}),
    ...(brokerTimestamp !== undefined && brokerTimestamp > 0 ? { lastTradeTimestamp: new Date(eventTime(brokerTimestamp, receivedAt)).toISOString() } : {}),
    ...(depthBids.length ? { bid: depthBids } : (finite(payload.bid_price) !== undefined ? { bid: [{ price: finite(payload.bid_price)!, quantity: finite(payload.bid_size) ?? 0 }] } : {})),
    ...(depthAsks.length ? { ask: depthAsks } : (finite(payload.ask_price) !== undefined ? { ask: [{ price: finite(payload.ask_price)!, quantity: finite(payload.ask_size) ?? 0 }] } : {})),
    ...(finite(payload.oi) !== undefined ? { oi: finite(payload.oi) } : {}),
    ...(finite(payload.tot_buy_qty) !== undefined ? { totalBuyQuantity: finite(payload.tot_buy_qty) } : {}),
    ...(finite(payload.tot_sell_qty) !== undefined ? { totalSellQuantity: finite(payload.tot_sell_qty) } : {}),
    receivedAt: new Date(receivedAt).toISOString(),
    sequence, timestamp: eventTime(brokerTimestamp, receivedAt), receivedAtEpoch: receivedAt,
    ...(brokerTimestamp !== undefined ? { brokerTimestamp: eventTime(brokerTimestamp, receivedAt) } : {}),
    source: 'fyers', revision: sequence, feedClass,
  };
  return tick;
}

function buildDomainEvent(tick: NormalizedMarketTick, feedClass: FyersDataFeedClass): DomainMarketEvent {
  const sequence = tick.sequence ?? 0;
  const receivedAt = tick.receivedAtEpoch ?? Date.now();
  const symbol = tick.instrumentKey;
  const timestamp = tick.timestamp ?? receivedAt;
  const base = {
    sequence, timestamp, receivedAt,
    ...(tick.brokerTimestamp !== undefined ? { brokerTimestamp: tick.brokerTimestamp } : {}),
    symbol, source: 'fyers' as const, revision: tick.revision ?? sequence,
  };
  if (feedClass === 'depth') {
    return {
      ...base, type: 'DepthSnapshot',
      bids: (tick.bid || []).map(level => ({ price: level.price, quantity: level.quantity, ...(level.orders !== undefined ? { orders: level.orders } : {}) })),
      asks: (tick.ask || []).map(level => ({ price: level.price, quantity: level.quantity, ...(level.orders !== undefined ? { orders: level.orders } : {}) })),
    };
  }
  if (feedClass === 'lite') {
    return {
      ...base, type: 'Quote', ltp: tick.ltp,
      ...(tick.close !== undefined ? { previousClose: tick.close } : {}),
      ...(tick.change !== undefined ? { change: tick.change } : {}),
      ...(tick.changePercent !== undefined ? { changePercent: tick.changePercent } : {}),
      ...(tick.volume !== undefined ? { volume: tick.volume } : {}),
    };
  }
  return {
    ...base, type: 'MarketTick', ltp: tick.ltp,
    ...(tick.open !== undefined ? { open: tick.open } : {}),
    ...(tick.high !== undefined ? { high: tick.high } : {}),
    ...(tick.low !== undefined ? { low: tick.low } : {}),
    ...(tick.close !== undefined ? { previousClose: tick.close } : {}),
    ...(tick.change !== undefined ? { change: tick.change } : {}),
    ...(tick.changePercent !== undefined ? { changePercent: tick.changePercent } : {}),
    ...(tick.volume !== undefined ? { volume: tick.volume } : {}),
    ...(tick.oi !== undefined ? { oi: tick.oi } : {}),
    ...(tick.bid?.[0] ? { bidPrice: tick.bid[0].price, bidQuantity: tick.bid[0].quantity } : {}),
    ...(tick.ask?.[0] ? { askPrice: tick.ask[0].price, askQuantity: tick.ask[0].quantity } : {}),
  };
}

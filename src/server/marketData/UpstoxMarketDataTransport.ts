import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { NormalizedMarketTick, MarketFeedEvent, MarketFeedStatus } from '../../types/market.js';

type Listener = (event: MarketFeedEvent) => void;

interface FeedSession {
  mode: 'full' | 'full_d30';
  socket?: WebSocket;
  instruments: Set<string>;
  listeners: Set<Listener>;
  status: MarketFeedStatus;
  reconnectAttempt: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  accessToken: string;
  closing: boolean;
}
/** 

/** One shared upstream Upstox V3 connection per authenticated TradingCore user. */
export class UpstoxMarketDataTransport {
  private static sessions = new Map<string, FeedSession>();

  static subscribe(userId: string, accessToken: string, instrumentKeys: string[], listener: Listener, mode: 'full' | 'full_d30' = 'full'): () => void {
    let session = this.sessions.get(userId);
    if (!session) {
      session = { instruments: new Set(), listeners: new Set(), status: 'disconnected', reconnectAttempt: 0, accessToken, closing: false, mode }; 
      this.sessions.set(userId, session);
    }
    session.accessToken = accessToken;
    session.mode = mode;
    session.closing = false;
    session.listeners.add(listener);
    const newKeys = instrumentKeys.filter((key) => !session!.instruments.has(key));
    newKeys.forEach((key) => session!.instruments.add(key));
    if (!session.socket || session.socket.readyState !== WebSocket.OPEN) void this.connect(userId, session);
    else if (newKeys.length) this.sendSubscription(session, 'sub', newKeys);
    listener({ type: 'status', status: session.status });
    return () => this.unsubscribe(userId, instrumentKeys, listener);
  }

  private static unsubscribe(userId: string, keys: string[], listener: Listener): void {
    const session = this.sessions.get(userId);
    if (!session) return;
    session.listeners.delete(listener);
    const noOtherListeners = session.listeners.size === 0;
    if (noOtherListeners) {
      session.closing = true;
      clearTimeout(session.reconnectTimer);
      session.socket?.close();
      this.sessions.delete(userId);
      return;
    }
    const removable = keys.filter((key) => session!.instruments.delete(key));
    if (removable.length && session.socket?.readyState === WebSocket.OPEN) this.sendSubscription(session, 'unsub', removable);
  }

  static disconnect(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;
    session.closing = true;
    clearTimeout(session.reconnectTimer);
    session.socket?.close();
    this.sessions.delete(userId);
  }

  private static async connect(userId: string, session: FeedSession): Promise<void> {
    if (session.closing || !session.instruments.size) return;
    this.setStatus(session, session.reconnectAttempt ? 'reconnecting' : 'connecting');
    try {
      const response = await fetch('https://api.upstox.com/v3/feed/market-data-feed/authorize', { headers: { Accept: 'application/json', Authorization: `Bearer ${session.accessToken}` } });
      const payload = await response.json();
      const endpoint = payload?.data?.authorized_redirect_uri;
      if (!response.ok || !endpoint) throw new Error(payload?.errors?.[0]?.message || 'Upstox market-feed authorization failed');
      const socket = new WebSocket(endpoint);
      session.socket = socket;
      socket.on('open', () => {
        session.reconnectAttempt = 0;
        this.setStatus(session, 'connected');
        this.sendSubscription(session, 'sub', [...session.instruments]);
      });
      socket.on('message', (message) => {
        try { this.handleMessage(session, Buffer.isBuffer(message) ? message : Buffer.from(message as ArrayBuffer)); }
        catch { this.emit(session, { type: 'error', error: 'Malformed Upstox feed message was ignored' }); }
      });

      socket.on('error', () => undefined);
      socket.on('close', (code) => {
        session.socket = undefined;
        if (session.closing) return;
        if (code === 1008 || code === 4001) { this.setStatus(session, 'authentication_failed'); return; }
        this.scheduleReconnect(userId, session);
      });
    } catch (error: any) {
      this.emit(session, { type: 'error', error: 'Unable to connect to Upstox market feed' });
      this.scheduleReconnect(userId, session);
    }
  }

  private static scheduleReconnect(userId: string, session: FeedSession): void {
    if (session.closing) return;
    session.reconnectAttempt += 1;
    this.setStatus(session, 'reconnecting');
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(session.reconnectAttempt, 5));
    session.reconnectTimer = setTimeout(() => void this.connect(userId, session), delay);
  }

  private static sendSubscription(session: FeedSession, method: 'sub' | 'unsub', instrumentKeys: string[]): void {
    if (!instrumentKeys.length || session.socket?.readyState !== WebSocket.OPEN) return;
    session.socket.send(Buffer.from(JSON.stringify({ guid: randomUUID(), method, data: { mode: session.mode, instrumentKeys } })), { binary: true });
  }

  private static handleMessage(session: FeedSession, bytes: Buffer): void {
    const feed = decodeFeedResponse(bytes);
    if (feed.marketStatus) this.emit(session, { type: 'market_status', marketStatus: feed.marketStatus });
    for (const tick of feed.ticks) this.emit(session, { type: 'tick', tick });
  }

  private static emit(session: FeedSession, event: MarketFeedEvent): void { session.listeners.forEach((listener) => listener(event)); }
  private static setStatus(session: FeedSession, status: MarketFeedStatus): void { session.status = status; this.emit(session, { type: 'status', status }); }
}

function decodeFeedResponse(bytes: Buffer): { ticks: NormalizedMarketTick[]; marketStatus?: Record<string, string> } {
  const fields = decodeMessage(bytes);
  const result: { ticks: NormalizedMarketTick[]; marketStatus?: Record<string, string> } = { ticks: [] };
  for (const entry of fields[2] || []) {
    const map = decodeMessage(entry as Buffer); const key = String(map[1]?.[0] || ''); const feed = decodeMessage(map[2]?.[0] as Buffer);
    if (key) result.ticks.push(normalizeFeed(key, feed));
  }
  if (fields[4]?.[0]) result.marketStatus = decodeStatusMap(decodeMessage(fields[4][0] as Buffer));
  return result;
}

function normalizeFeed(instrumentKey: string, feed: Record<number, unknown[]>): NormalizedMarketTick {
  const detail = feed[2]?.[0] ? decodeMessage(feed[2][0] as Buffer) : feed[3]?.[0] ? decodeMessage(feed[3][0] as Buffer) : {};
  const full = detail[1]?.[0] ? decodeMessage(detail[1][0] as Buffer) : detail[2]?.[0] ? decodeMessage(detail[2][0] as Buffer) : detail;
  const ltpc = full[1]?.[0] ? decodeMessage(full[1][0] as Buffer) : feed[1]?.[0] ? decodeMessage(feed[1][0] as Buffer) : {};
  const ltp = number(ltpc[1]?.[0]); const close = number(ltpc[4]?.[0]);
  const depthRoot = full[2]?.[0] ? decodeMessage(full[2][0] as Buffer) : undefined;
  const levels = depthRoot?.[1]?.map((value) => decodeMessage(value as Buffer)) || [];
  const bid = levels.map((level) => ({ price: number(level[2]?.[0]), quantity: number(level[1]?.[0]) }));
  const ask = levels.map((level) => ({ price: number(level[4]?.[0]), quantity: number(level[3]?.[0]) }));
  const ohlcRoot = full[4]?.[0] ? decodeMessage(full[4][0] as Buffer) : undefined;
  const ohlc = ohlcRoot?.[1]?.map((value) => { const c = decodeMessage(value as Buffer); return { interval: String(c[1]?.[0] || ''), open: number(c[2]?.[0]), high: number(c[3]?.[0]), low: number(c[4]?.[0]), close: number(c[5]?.[0]), volume: number(c[6]?.[0]), timestamp: new Date(number(c[7]?.[0])).toISOString() }; });
  return { instrumentKey, ltp, close, change: ltp === undefined || close === undefined ? undefined : ltp - close, changePercent: ltp === undefined || !close ? undefined : ((ltp - close) / close) * 100, lastTradeTimestamp: ltpc[2]?.[0] ? new Date(number(ltpc[2][0])).toISOString() : undefined, volume: number(full[6]?.[0]), oi: number(full[7]?.[0]), iv: number(full[8]?.[0]), totalBuyQuantity: number(full[9]?.[0]), totalSellQuantity: number(full[10]?.[0]), bid: bid.length ? bid : undefined, ask: ask.length ? ask : undefined, ohlc, receivedAt: new Date().toISOString() };
}

function decodeStatusMap(message: Record<number, unknown[]>): Record<string, string> {
  const values: Record<string, string> = {}; for (const entry of message[1] || []) { const m = decodeMessage(entry as Buffer); values[String(m[1]?.[0])] = ['PRE_OPEN_START', 'PRE_OPEN_END', 'NORMAL_OPEN', 'NORMAL_CLOSE', 'CLOSING_START', 'CLOSING_END'][number(m[2]?.[0])] || 'UNKNOWN'; } return values;
}
function decodeMessage(bytes: Buffer): Record<number, unknown[]> { const out: Record<number, unknown[]> = {}; let i = 0; while (i < bytes.length) { const tag = readVarint(bytes, i); i = tag.next; const field = tag.value >> 3; const wire = tag.value & 7; let value: unknown; if (wire === 0) { const v = readVarint(bytes, i); i = v.next; value = v.value; } else if (wire === 1) { value = bytes.readDoubleLE(i); i += 8; } else if (wire === 2) { const len = readVarint(bytes, i); i = len.next; const raw = bytes.subarray(i, i + len.value); i += len.value; value = field === 1 && raw.every((b) => b >= 32 && b < 127) ? raw.toString('utf8') : raw; } else if (wire === 5) { value = bytes.readFloatLE(i); i += 4; } else break; (out[field] ||= []).push(value); } return out; }
function readVarint(bytes: Buffer, start: number): { value: number; next: number } { let value = 0; let shift = 0; let i = start; while (i < bytes.length) { const byte = bytes[i++]; value += (byte & 127) * 2 ** shift; if (!(byte & 128)) break; shift += 7; } return { value, next: i }; }
function number(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }

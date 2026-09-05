import WebSocket from 'ws';
import { MarketFeedEvent, NormalizedMarketTick } from '../../types/market.js';

type Listener = (event: MarketFeedEvent) => void;

interface Session {
  socket?: WebSocket;
  instruments: Set<string>;
  listeners: Set<Listener>;
  accessToken: string;
  closing: boolean;
  reconnectAttempt: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
}

/**
 * One shared FYERS data socket per TradingCore user. FYERS v3 authenticates the
 * socket with the same appId:accessToken credential used by REST calls.
 */
export class FyersMarketDataTransport {
  private static sessions = new Map<string, Session>();

  static subscribe(userId: string, accessToken: string, instrumentKeys: string[], listener: Listener): () => void {
    let session = this.sessions.get(userId);
    if (!session) {
      session = {
        instruments: new Set(),
        listeners: new Set(),
        accessToken,
        closing: false,
        reconnectAttempt: 0,
      };
      this.sessions.set(userId, session);
    }

    session.accessToken = accessToken;
    session.closing = false;
    session.listeners.add(listener);
    const newSymbols = instrumentKeys.filter((key) => !session!.instruments.has(key));
    newSymbols.forEach((key) => session!.instruments.add(key));

    if (!session.socket || session.socket.readyState !== WebSocket.OPEN) {
      void this.connect(userId, session);
    } else if (newSymbols.length) {
      this.sendSubscribe(session, newSymbols);
    }

    listener({ type: 'status', status: session.socket?.readyState === WebSocket.OPEN ? 'connected' : 'connecting' });
    return () => this.unsubscribe(userId, instrumentKeys, listener);
  }

  static disconnect(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;
    session.closing = true;
    clearTimeout(session.reconnectTimer);
    session.socket?.close();
    this.sessions.delete(userId);
  }

  private static unsubscribe(userId: string, symbols: string[], listener: Listener): void {
    const session = this.sessions.get(userId);
    if (!session) return;
    session.listeners.delete(listener);
    if (!session.listeners.size) {
      this.disconnect(userId);
      return;
    }
    const removable = symbols.filter((symbol) => session.instruments.delete(symbol));
    if (removable.length && session.socket?.readyState === WebSocket.OPEN) {
      try { session.socket.send(JSON.stringify({ symbol: removable, type: 'symbolUpdate', channel: 15, action: 'unsubscribe' })); } catch { /* reconnect path */ }
    }
  }

  private static async connect(userId: string, session: Session): Promise<void> {
    if (session.closing || !session.instruments.size) return;
    const appId = process.env.FYERS_CLIENT_ID;
    if (!appId) {
      this.emit(session, { type: 'error', error: 'FYERS_CLIENT_ID is not configured for live market data' });
      return;
    }

    const authorization = `${appId}:${session.accessToken}`;
    const socket = new WebSocket('wss://api.fyers.in/socket/v2/data/', {
      headers: { authorization },
      handshakeTimeout: 10_000,
    });
    session.socket = socket;

    socket.on('open', () => {
      session.reconnectAttempt = 0;
      this.emit(session, { type: 'status', status: 'connected' });
      this.sendSubscribe(session, [...session.instruments]);
    });

    socket.on('message', (message) => {
      try {
        const payload = JSON.parse(Buffer.isBuffer(message) ? message.toString('utf8') : String(message));
        const tick = normalizeFyersTick(payload);
        if (tick) this.emit(session, { type: 'tick', tick });
      } catch {
        // FYERS may emit non-market informational frames. Ignore malformed/non-JSON frames.
      }
    });

    socket.on('error', (error) => {
      this.emit(session, { type: 'error', error: error instanceof Error ? error.message : 'FYERS market socket error' });
    });

    socket.on('close', () => {
      session.socket = undefined;
      if (!session.closing) this.scheduleReconnect(userId, session);
    });
  }

  private static scheduleReconnect(userId: string, session: Session): void {
    if (session.closing) return;
    session.reconnectAttempt += 1;
    const delay = Math.min(15_000, 500 * 2 ** Math.min(session.reconnectAttempt, 5));
    this.emit(session, { type: 'status', status: 'reconnecting' });
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = setTimeout(() => void this.connect(userId, session), delay);
  }

  private static sendSubscribe(session: Session, symbols: string[]): void {
    if (!symbols.length || session.socket?.readyState !== WebSocket.OPEN) return;
    session.socket.send(JSON.stringify({ symbol: symbols, type: 'symbolUpdate', channel: 15 }));
  }

  private static emit(session: Session, event: MarketFeedEvent): void {
    session.listeners.forEach((listener) => listener(event));
  }
}

function normalizeFyersTick(payload: any): NormalizedMarketTick | null {
  if (!payload || typeof payload !== 'object' || !payload.symbol) return null;
  const ltp = Number(payload.ltp);
  if (!Number.isFinite(ltp)) return null;
  const prevClose = Number(payload.prev_close_price);
  const timestamp = Number(payload.last_traded_time || payload.exch_feed_time);
  return {
    instrumentKey: String(payload.symbol),
    ltp,
    close: Number.isFinite(prevClose) ? prevClose : undefined,
    change: Number.isFinite(Number(payload.ch)) ? Number(payload.ch) : (Number.isFinite(prevClose) ? ltp - prevClose : undefined),
    changePercent: Number.isFinite(Number(payload.chp)) ? Number(payload.chp) : undefined,
    lastTradeTimestamp: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : undefined,
    volume: Number(payload.vol_traded_today || 0),
    bid: Number.isFinite(Number(payload.bid_price)) ? [{ price: Number(payload.bid_price), quantity: Number(payload.bid_size || 0) }] : undefined,
    ask: Number.isFinite(Number(payload.ask_price)) ? [{ price: Number(payload.ask_price), quantity: Number(payload.ask_size || 0) }] : undefined,
    oi: Number.isFinite(Number(payload.oi)) ? Number(payload.oi) : undefined,
    totalBuyQuantity: Number.isFinite(Number(payload.tot_buy_qty)) ? Number(payload.tot_buy_qty) : undefined,
    totalSellQuantity: Number.isFinite(Number(payload.tot_sell_qty)) ? Number(payload.tot_sell_qty) : undefined,
    receivedAt: new Date().toISOString(),
  };
}

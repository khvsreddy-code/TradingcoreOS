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
  includeDepth: boolean;
  depthSymbols: Set<string>;
  reconnectTimer?: ReturnType<typeof setTimeout>;
}

/**
 * One shared FYERS data socket per TradingCore user. FYERS v3 authenticates the
 * socket with the same appId:accessToken credential used by REST calls.
 */
export class FyersMarketDataTransport {
  private static sessions = new Map<string, Session>();

  static subscribe(userId: string, accessToken: string, instrumentKeys: string[], listener: Listener, includeDepth = false, depthSymbols: string[] = instrumentKeys): () => void {
    let session = this.sessions.get(userId);
    if (!session) {
      session = {
        instruments: new Set(),
        listeners: new Set(),
        accessToken,
        closing: false,
        reconnectAttempt: 0,
        includeDepth: false,
        depthSymbols: new Set(),
      };
      this.sessions.set(userId, session);
    }

    session.accessToken = accessToken;
    session.closing = false;
    session.includeDepth = session.includeDepth || includeDepth;
    if (includeDepth) depthSymbols.forEach(symbol => session!.depthSymbols.add(symbol));
    session.listeners.add(listener);
    const newSymbols = instrumentKeys.filter((key) => !session!.instruments.has(key));
    newSymbols.forEach((key) => session!.instruments.add(key));

    if (!session.socket || session.socket.readyState !== WebSocket.OPEN) {
      void this.connect(userId, session, session.includeDepth, [...session.depthSymbols]);
    } else if (newSymbols.length) {
      this.sendSubscribe(session, newSymbols, session.includeDepth, [...session.depthSymbols]);
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
      try { session.socket.send(JSON.stringify({ symbol: removable, type: 'unsubscribe' })); } catch { /* reconnect path */ }
    }
  }

  private static async connect(userId: string, session: Session, includeDepth = false, depthSymbols: string[] = [...session.depthSymbols]): Promise<void> {
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
      this.sendSubscribe(session, [...session.instruments], session.includeDepth, depthSymbols);
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
      if (!session.closing) this.scheduleReconnect(userId, session, session.includeDepth);
    });
  }

  private static scheduleReconnect(userId: string, session: Session, includeDepth = false): void {
    if (session.closing) return;
    session.reconnectAttempt += 1;
    const delay = Math.min(15_000, 500 * 2 ** Math.min(session.reconnectAttempt, 5));
    this.emit(session, { type: 'status', status: 'reconnecting' });
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = setTimeout(() => void this.connect(userId, session, session.includeDepth, [...session.depthSymbols]), delay);
  }

  private static sendSubscribe(session: Session, symbols: string[], includeDepth = false, depthSymbols: string[] = symbols): void {
    if (!symbols.length || session.socket?.readyState !== WebSocket.OPEN) return;
    session.socket.send(JSON.stringify({ symbol: symbols, type: 'symbolUpdate' }));
    if (includeDepth && depthSymbols.length) session.socket.send(JSON.stringify({ symbol: depthSymbols, type: 'DepthUpdate' }));
  }

  private static emit(session: Session, event: MarketFeedEvent): void {
    session.listeners.forEach((listener) => listener(event));
  }
}

function normalizeFyersTick(payload: any): NormalizedMarketTick | null {
  if (!payload || typeof payload !== 'object' || !payload.symbol) return null;
  const depthBids = [1,2,3,4,5].map(i => ({price:Number(payload[`bid_price${i}`]), quantity:Number(payload[`bid_size${i}`]), orders:Number(payload[`bid_order${i}`])})).filter(x => Number.isFinite(x.price) && Number.isFinite(x.quantity));
  const depthAsks = [1,2,3,4,5].map(i => ({price:Number(payload[`ask_price${i}`]), quantity:Number(payload[`ask_size${i}`]), orders:Number(payload[`ask_order${i}`])})).filter(x => Number.isFinite(x.price) && Number.isFinite(x.quantity));
  const ltp = Number(payload.ltp);
  const isDepth = payload.type === 'dp' || payload.type === 'DepthUpdate';
  if (!Number.isFinite(ltp) && !isDepth && !depthBids.length && !depthAsks.length) return null;
  const prevClose = Number(payload.prev_close_price);
  const timestamp = Number(payload.last_traded_time || payload.exch_feed_time);
  return {
    instrumentKey: String(payload.symbol),
    ltp: Number.isFinite(ltp) ? ltp : undefined,
    close: Number.isFinite(prevClose) ? prevClose : undefined,
    change: Number.isFinite(Number(payload.ch)) ? Number(payload.ch) : (Number.isFinite(ltp) && Number.isFinite(prevClose) ? ltp - prevClose : undefined),
    changePercent: Number.isFinite(Number(payload.chp)) ? Number(payload.chp) : undefined,
    lastTradeTimestamp: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : undefined,
    volume: Number(payload.vol_traded_today || 0),
    bid: depthBids.length ? depthBids : (Number.isFinite(Number(payload.bid_price)) ? [{ price: Number(payload.bid_price), quantity: Number(payload.bid_size || 0) }] : undefined),
    ask: depthAsks.length ? depthAsks : (Number.isFinite(Number(payload.ask_price)) ? [{ price: Number(payload.ask_price), quantity: Number(payload.ask_size || 0) }] : undefined),
    oi: Number.isFinite(Number(payload.oi)) ? Number(payload.oi) : undefined,
    totalBuyQuantity: Number.isFinite(Number(payload.tot_buy_qty)) ? Number(payload.tot_buy_qty) : undefined,
    totalSellQuantity: Number.isFinite(Number(payload.tot_sell_qty)) ? Number(payload.tot_sell_qty) : undefined,
    receivedAt: new Date().toISOString(),
  };
}

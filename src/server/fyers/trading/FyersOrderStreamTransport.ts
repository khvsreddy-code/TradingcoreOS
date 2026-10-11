import WebSocket from 'ws';
import type { Fill, FundsUpdate, OrderUpdate, PositionUpdate } from '../../../types/market-events.js';
import { normalizeFyersOrderPayload, type FyersNormalizedOrderEvent } from './fyersOrderEventNormalizer.js';

type Listener = (event: FyersOrderStreamEvent) => void;
export type FyersOrderStreamEvent =
  | { type: 'status'; status: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'authentication_failed' }
  | { type: 'order'; data: OrderUpdate }
  | { type: 'trade'; data: Fill }
  | { type: 'position'; data: PositionUpdate }
  | { type: 'funds'; data: FundsUpdate }
  | { type: 'error'; error: string };

interface Session {
  socket?: WebSocket;
  listeners: Set<Listener>;
  accessToken: string;
  closing: boolean;
  reconnectAttempt: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  pingTimer?: ReturnType<typeof setInterval>;
  generation: number;
  sequence: number;
}

export class FyersOrderStreamTransport {
  private static sessions = new Map<string, Session>();

  static subscribe(userId: string, accessToken: string, listener: Listener): () => void {
    let session = this.sessions.get(userId);
    if (!session) {
      session = { listeners: new Set(), accessToken, closing: false, reconnectAttempt: 0, generation: 0, sequence: 0 };
      this.sessions.set(userId, session);
    }
    const tokenChanged = session.accessToken !== accessToken;
    session.accessToken = accessToken;
    session.closing = false;
    session.listeners.add(listener);
    if (tokenChanged && session.socket) {
      this.restartSocket(userId, session);
    } else if (!session.socket || session.socket.readyState !== WebSocket.OPEN) {
      this.connect(userId, session);
    }
    listener({ type: 'status', status: session.socket?.readyState === WebSocket.OPEN ? 'connected' : 'connecting' });
    return () => this.unsubscribe(userId, listener);
  }

  static disconnect(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;
    session.closing = true;
    session.generation += 1;
    clearTimeout(session.reconnectTimer);
    if (session.pingTimer) clearInterval(session.pingTimer);
    session.pingTimer = undefined;
    try { session.socket?.close(); } catch {}
    this.sessions.delete(userId);
  }

  private static unsubscribe(userId: string, listener: Listener): void {
    const session = this.sessions.get(userId);
    if (!session) return;
    session.listeners.delete(listener);
    if (!session.listeners.size) this.disconnect(userId);
  }

  private static connect(userId: string, session: Session): void {
    if (session.closing) return;
    const appId = process.env.FYERS_CLIENT_ID;
    if (!appId) {
      this.emit(session, { type: 'error', error: 'FYERS_CLIENT_ID is not configured for order streaming' });
      return;
    }
    const generation = ++session.generation;
    const socket = new WebSocket('wss://socket.fyers.in/trade/v3', {
      headers: { authorization: `${appId}:${session.accessToken}` },
      handshakeTimeout: 10_000,
    });
    session.socket = socket;

    socket.on('open', () => {
      if (generation !== session.generation || session.closing) {
        try { socket.close(); } catch {}
        return;
      }
      session.reconnectAttempt = 0;
      this.emit(session, { type: 'status', status: 'connected' });
      socket.send(JSON.stringify({ T: 'SUB_ORD', SLIST: ['orders', 'trades', 'positions'], SUB_T: 1 }));
      if (session.pingTimer) clearInterval(session.pingTimer);
      session.pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) { try { socket.send('ping'); } catch {} }
      }, 10_000);
    });

    socket.on('message', raw => {
      if (generation !== session.generation || session.closing) return;
      const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
      if (text === 'pong' || text === 'ping') return;
      let payload: unknown;
      try { payload = JSON.parse(text); } catch { return; }

      // Each domain event gets its own monotonic sequence even when FYERS sends
      // multiple order/trade/position rows in a single broker frame.
      const receivedAt = Date.now();
      const normalized = normalizeFyersOrderPayload(payload, session.sequence + 1, receivedAt);
      for (const item of normalized) {
        const sequence = ++session.sequence;
        this.emit(session, resequence(item, sequence));
      }
    });

    socket.on('error', error => {
      if (generation !== session.generation || session.closing) return;
      this.emit(session, { type: 'error', error: error instanceof Error ? error.message : 'FYERS order socket error' });
    });

    socket.on('close', (code, reason) => {
      if (generation !== session.generation) return;
      session.socket = undefined;
      if (session.pingTimer) clearInterval(session.pingTimer);
      session.pingTimer = undefined;
      if (session.closing) return;
      const detail = reason?.toString?.() || '';
      if (code === 403 || code === 1008 || code === 4001) {
        this.emit(session, { type: 'error', error: detail || `FYERS order socket rejected the session (code ${code}). Reconnect the broker.` });
        this.emit(session, { type: 'status', status: 'authentication_failed' });
        return;
      }
      this.scheduleReconnect(userId, session);
    });
  }

  private static restartSocket(userId: string, session: Session): void {
    if (session.closing) return;
    clearTimeout(session.reconnectTimer);
    if (session.pingTimer) clearInterval(session.pingTimer);
    session.pingTimer = undefined;
    const old = session.socket;
    session.socket = undefined;
    session.generation += 1;
    try { old?.close(); } catch {}
    session.reconnectAttempt = 0;
    this.emit(session, { type: 'status', status: 'reconnecting' });
    this.connect(userId, session);
  }

  private static scheduleReconnect(userId: string, session: Session): void {
    if (session.closing) return;
    session.reconnectAttempt += 1;
    const delay = Math.min(15_000, 500 * 2 ** Math.min(session.reconnectAttempt, 5));
    this.emit(session, { type: 'status', status: 'reconnecting' });
    clearTimeout(session.reconnectTimer);
    session.reconnectTimer = setTimeout(() => this.connect(userId, session), delay);
  }

  private static emit(session: Session, event: FyersOrderStreamEvent): void {
    session.listeners.forEach(listener => {
      try { listener(event); } catch { /* one client cannot break the shared order feed */ }
    });
  }
}

function resequence(event: FyersNormalizedOrderEvent, sequence: number): FyersOrderStreamEvent {
  const data = { ...event.data, sequence, revision: sequence };
  switch (event.type) {
    case 'order': return { type: 'order', data: data as OrderUpdate };
    case 'trade': return { type: 'trade', data: data as Fill };
    case 'position': return { type: 'position', data: data as PositionUpdate };
    case 'funds': return { type: 'funds', data: data as FundsUpdate };
  }
}

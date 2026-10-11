import WebSocket from 'ws';
import type { DomainMarketEvent, Fill, FundsUpdate, OrderUpdate, PositionUpdate } from '../../../types/market-events.js';
import { marketEventBus } from '../../marketData/MarketEventBus.js';
import { normalizeFyersOrderPayload, type FyersNormalizedOrderEvent } from './fyersOrderEventNormalizer.js';
import { FyersOrderStateEngine } from './FyersOrderStateEngine.js';

type Listener = (event: FyersOrderStreamEvent) => void;
export type FyersOrderStreamEvent =
  | { type: 'status'; status: 'connecting' | 'reconciling' | 'connected' | 'reconnecting' | 'disconnected' | 'authentication_failed'; reason?: string }
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
  reconciling: boolean;
  reconciliationBlocked: boolean;
  reconciliationOverflowed: boolean;
  reconciliationAttempt: number;
  pendingFrames: Array<{ payload: unknown; receivedAt: number }>;
  processingTail: Promise<void>;
  reconcileRetryTimer?: ReturnType<typeof setTimeout>;
}

const MAX_RECONCILIATION_QUEUE = 5_000;

export class FyersOrderStreamTransport {
  private static sessions = new Map<string, Session>();

  static subscribe(userId: string, accessToken: string, listener: Listener): () => void {
    let session = this.sessions.get(userId);
    if (!session) {
      session = {
        listeners: new Set(), accessToken, closing: false, reconnectAttempt: 0, generation: 0, sequence: 0,
        reconciling: false, reconciliationBlocked: true, reconciliationOverflowed: false,
        reconciliationAttempt: 0, pendingFrames: [], processingTail: Promise.resolve(),
      };
      this.sessions.set(userId, session);
    }
    const tokenChanged = session.accessToken !== accessToken;
    session.accessToken = accessToken;
    session.closing = false;
    session.listeners.add(listener);
    if (tokenChanged && session.socket) {
      this.restartSocket(userId, session);
    } else if (!session.socket || session.socket.readyState === WebSocket.CLOSED || session.socket.readyState === WebSocket.CLOSING) {
      this.connect(userId, session);
    }
    listener(this.getStatus(userId));
    return () => this.unsubscribe(userId, listener);
  }

  /** Current transport state for late subscribers and HTTP stream heartbeats. */
  static getStatus(userId: string): Extract<FyersOrderStreamEvent, { type: 'status' }> {
    const session = this.sessions.get(userId);
    if (!session) return { type: 'status', status: 'disconnected' };
    if (session.reconciling || (session.reconciliationBlocked && session.socket?.readyState === WebSocket.OPEN)) {
      return { type: 'status', status: 'reconciling' };
    }
    if (session.socket?.readyState === WebSocket.OPEN) return { type: 'status', status: 'connected' };
    return { type: 'status', status: session.reconnectTimer ? 'reconnecting' : 'connecting' };
  }

  static disconnect(userId: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;
    session.closing = true;
    session.generation += 1;
    clearTimeout(session.reconnectTimer);
    clearTimeout(session.reconcileRetryTimer);
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
      session.reconciliationBlocked = true;
      session.reconciling = false;
      this.emit(session, { type: 'status', status: 'reconciling' });
      try {
        socket.send(JSON.stringify({ T: 'SUB_ORD', SLIST: ['orders', 'trades', 'positions'], SUB_T: 1 }));
      } catch (error) {
        this.emit(session, { type: 'error', error: error instanceof Error ? error.message : 'Unable to subscribe to FYERS order updates' });
        try { socket.close(); } catch {}
        return;
      }
      if (session.pingTimer) clearInterval(session.pingTimer);
      session.pingTimer = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) { try { socket.send('ping'); } catch {} }
      }, 10_000);
      void this.reconcileAndDrain(userId, session, generation);
    });

    socket.on('message', raw => {
      if (generation !== session.generation || session.closing) return;
      const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
      if (text === 'pong' || text === 'ping') return;
      let payload: unknown;
      try { payload = JSON.parse(text); } catch { return; }
      const frame = { payload, receivedAt: Date.now() };
      if (session.reconciling || session.reconciliationBlocked) {
        this.enqueuePending(session, frame);
        return;
      }
      // Serialize live frames through the durable reducer. Parallel RPCs could
      // otherwise apply PARTIAL/OPEN updates in the wrong order under load.
      session.processingTail = session.processingTail.then(async () => {
        if (generation !== session.generation || session.closing) return;
        if (session.reconciling || session.reconciliationBlocked) {
          this.enqueuePending(session, frame);
          return;
        }
        await this.processFrame(userId, session, frame, generation);
      }).catch(error => {
        if (generation !== session.generation || session.closing) return;
        this.emit(session, { type: 'error', error: error instanceof Error ? error.message : 'FYERS order-state persistence failed' });
        this.enqueuePending(session, frame);
        session.reconciliationBlocked = true;
        if (!session.reconciling) void this.reconcileAndDrain(userId, session, generation);
      });
    });

    socket.on('error', error => {
      if (generation !== session.generation || session.closing) return;
      this.emit(session, { type: 'error', error: error instanceof Error ? error.message : 'FYERS order socket error' });
    });

    socket.on('close', (code, reason) => {
      if (generation !== session.generation) return;
      session.socket = undefined;
      session.reconciliationBlocked = true;
      clearTimeout(session.reconcileRetryTimer);
      session.reconcileRetryTimer = undefined;
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
    clearTimeout(session.reconcileRetryTimer);
    session.reconcileRetryTimer = undefined;
    session.reconciliationBlocked = true;
    session.reconciling = false;
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

  private static enqueuePending(session: Session, frame: { payload: unknown; receivedAt: number }): void {
    if (session.pendingFrames.length >= MAX_RECONCILIATION_QUEUE) {
      // A REST reconciliation is a state snapshot, so on queue overflow discard
      // the incomplete delta window and force another snapshot before unblocking.
      session.pendingFrames.length = 0;
      session.reconciliationOverflowed = true;
    }
    session.pendingFrames.push(frame);
  }

  private static isCurrent(session: Session, generation: number): boolean {
    return !session.closing && session.generation === generation && session.socket?.readyState === WebSocket.OPEN;
  }

  private static async reconcileAndDrain(userId: string, session: Session, generation: number): Promise<void> {
    if (session.reconciling || !this.isCurrent(session, generation)) return;
    session.reconciling = true;
    session.reconciliationBlocked = true;
    this.emit(session, { type: 'status', status: 'reconciling' });
    try {
      // Finish any frame already accepted by the serial reducer before taking
      // the snapshot. This gives the REST view a clean barrier against deltas.
      await session.processingTail;
      while (this.isCurrent(session, generation)) {
        session.reconciliationOverflowed = false;
        await FyersOrderStateEngine.reconcile(
          userId,
          session.accessToken,
          () => ++session.sequence,
          () => this.isCurrent(session, generation),
          event => this.publishDomainEvent(session, event),
        );
        if (!this.isCurrent(session, generation)) return;

        while (this.isCurrent(session, generation)) {
          const batch = session.pendingFrames.splice(0);
          for (const frame of batch) {
            if (!this.isCurrent(session, generation)) return;
            await this.processFrame(userId, session, frame, generation);
          }
          // No await between this empty check and unblocking, so a WS callback
          // cannot slip a frame between the final drain and connected status.
          if (session.pendingFrames.length) continue;
          if (session.reconciliationOverflowed) break;
          session.reconciling = false;
          session.reconciliationBlocked = false;
          session.reconciliationAttempt = 0;
          this.emit(session, { type: 'status', status: 'connected' });
          return;
        }
        // Queue overflow while fetching/draining means the deltas are no longer
        // a complete window. Take a fresh REST snapshot before declaring ready.
      }
    } catch (error) {
      if (!this.isCurrent(session, generation)) return;
      session.reconciling = false;
      session.reconciliationBlocked = true;
      this.emit(session, {
        type: 'error',
        error: `FYERS order reconciliation failed; order updates remain gated until a complete snapshot succeeds. ${error instanceof Error ? error.message : 'Unknown reconciliation error'}`,
      });
      this.emit(session, { type: 'status', status: 'reconnecting', reason: 'order_reconciliation_failed' });
      this.scheduleReconciliationRetry(userId, session, generation);
    }
  }

  private static scheduleReconciliationRetry(userId: string, session: Session, generation: number): void {
    if (!this.isCurrent(session, generation) || session.reconcileRetryTimer) return;
    session.reconciliationAttempt += 1;
    const delay = Math.min(60_000, 1_000 * 2 ** Math.min(session.reconciliationAttempt, 6));
    session.reconcileRetryTimer = setTimeout(() => {
      session.reconcileRetryTimer = undefined;
      void this.reconcileAndDrain(userId, session, generation);
    }, delay);
  }

  private static async processFrame(
    userId: string,
    session: Session,
    frame: { payload: unknown; receivedAt: number },
    generation: number,
  ): Promise<void> {
    if (!this.isCurrent(session, generation)) return;
    const normalized = normalizeFyersOrderPayload(frame.payload, session.sequence + 1, frame.receivedAt);
    for (const item of normalized) {
      if (!this.isCurrent(session, generation)) return;
      const sequence = ++session.sequence;
      const data = { ...item.data, sequence, revision: sequence, receivedAt: frame.receivedAt } as FyersNormalizedOrderEvent['data'];
      const result = await FyersOrderStateEngine.applyNormalized(userId, { ...item, data } as FyersNormalizedOrderEvent, 'websocket');
      if (!this.isCurrent(session, generation)) return;
      result.events.forEach(event => this.publishDomainEvent(session, event));
    }
  }

  private static publishDomainEvent(session: Session, event: DomainMarketEvent): void {
    marketEventBus.publish(event);
    switch (event.type) {
      case 'OrderUpdate': this.emit(session, { type: 'order', data: event }); break;
      case 'Fill': this.emit(session, { type: 'trade', data: event }); break;
      case 'PositionUpdate': this.emit(session, { type: 'position', data: event }); break;
      case 'FundsUpdate': this.emit(session, { type: 'funds', data: event }); break;
      default: break;
    }
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

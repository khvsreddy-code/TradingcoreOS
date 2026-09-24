import { tradingApi, readTradingApiJson } from '../http/tradingApi';
import { MarketFeedEvent, MarketFeedStatus, NormalizedMarketTick } from '../../types/market';

type Listener = (event: MarketFeedEvent) => void;

/** Central browser transport. It consumes the authenticated normalized server stream; React never opens Upstox sockets. */
export class UpstoxMarketDataClient {
  private instruments = new Map<string, number>();
  private listeners = new Set<Listener>();
  private controller?: AbortController;
  private reconnectTimer?: number;
  private watchdogTimer?: number;
  private lastEventAt = 0;
  private hasSeenTick = false;
  private reconnectAttempt = 0;
  private connectGeneration = 0;
  private brokerId = 'upstox';

  subscribe(instrumentKeys: string[], listener: Listener, mode: 'full' | 'full_d30' = 'full'): () => void {
    this.listeners.add(listener);
    instrumentKeys.forEach((key) => this.instruments.set(key, (this.instruments.get(key) || 0) + 1));
    this.restart(mode);
    return () => {
      this.listeners.delete(listener);
      instrumentKeys.forEach((key) => { const count = (this.instruments.get(key) || 1) - 1; if (count <= 0) this.instruments.delete(key); else this.instruments.set(key, count); });
      if (!this.instruments.size) this.stop(); else this.restart(mode);
    };
  }

  disconnect(): void { this.stop(); this.instruments.clear(); }

  private restart(mode: 'full' | 'full_d30' = 'full'): void {
    this.stop();
    if (this.instruments.size) {
      this.startWatchdog();
      void this.connect(mode);
    }
  }

  private stop(): void {
    this.connectGeneration += 1;
    this.controller?.abort();
    this.controller = undefined;
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    if (this.watchdogTimer) window.clearInterval(this.watchdogTimer);
    this.watchdogTimer = undefined;
  }

  private async connect(mode: 'full' | 'full_d30' = 'full'): Promise<void> {
    const generation = ++this.connectGeneration;
    const controller = new AbortController();
    this.controller = controller;
    this.emit({ type: 'status', status: this.reconnectAttempt ? 'reconnecting' : 'connecting' });
    try {
      const response = await tradingApi(`/api/trading/${this.brokerId}/market-stream?instrument_keys=${encodeURIComponent([...this.instruments.keys()].join(','))}&depth_mode=${encodeURIComponent(mode)}`, { signal: controller.signal });
      if (!response.ok || !response.body) {
        let message = `Upstox market stream failed (${response.status})`;
        try { const payload = await readTradingApiJson<any>(response.clone()); message = payload?.error || message; } catch (parseError: any) { message = parseError?.message || message; }
        throw new Error(message);
      }
      if (generation !== this.connectGeneration || controller.signal.aborted) return;
      this.reconnectAttempt = 0;
      this.lastEventAt = Date.now();
      this.hasSeenTick = false;
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let remainder = '';
      while (!controller.signal.aborted) {
        const chunk = await reader.read(); if (chunk.done) throw new Error('Market stream ended');
        const lines = (remainder + decoder.decode(chunk.value, { stream: true })).split('\n'); remainder = lines.pop() || '';
        lines.filter(Boolean).forEach((line) => {
          try {
            const event = JSON.parse(line) as MarketFeedEvent;
            this.lastEventAt = Date.now();
            if (event.type === 'tick' && event.tick) this.hasSeenTick = true;
            this.emit(event);
          } catch {
            this.lastEventAt = Date.now();
            this.emit({ type: 'error', error: 'Malformed market event was ignored' });
          }
        });
      }
    } catch (error: any) {
      if (controller.signal.aborted || generation !== this.connectGeneration || !this.instruments.size) return;
      this.emit({ type: 'error', error: error?.message || 'Unable to connect to Upstox market feed' });
      this.scheduleReconnect();
    }
  }

  private startWatchdog(): void {
    if (this.watchdogTimer) window.clearInterval(this.watchdogTimer);
    this.watchdogTimer = window.setInterval(() => {
      if (!this.instruments.size || !this.controller || this.controller.signal.aborted || !this.hasSeenTick) return;
      if (Date.now() - this.lastEventAt <= 15_000) return;

      // The socket can remain connected while the upstream stream stops
      // delivering data. Only recover after the stream has previously proved
      // alive, so an illiquid symbol with no trades does not cause reconnect churn.
      this.controller.abort();
      this.controller = undefined;
      this.reconnectAttempt = 0;
      this.scheduleReconnect();
    }, 2_000);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.instruments.size) return;
    this.reconnectAttempt += 1;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.reconnectAttempt - 1, 5));
    this.emit({ type: 'status', status: 'reconnecting' });
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.instruments.size) void this.connect();
    }, delay);
  }
  private emit(event: MarketFeedEvent): void { this.listeners.forEach((listener) => listener(event)); }
}

export const upstoxMarketDataClient = new UpstoxMarketDataClient();

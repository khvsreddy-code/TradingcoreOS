import { tradingApi } from '../http/tradingApi';
import { MarketFeedEvent, MarketFeedStatus, NormalizedMarketTick } from '../../types/market';

type Listener = (event: MarketFeedEvent) => void;

/** Central browser transport. It consumes the authenticated normalized server stream; React never opens Upstox sockets. */
export class UpstoxMarketDataClient {
  private instruments = new Map<string, number>();
  private listeners = new Set<Listener>();
  private controller?: AbortController;
  private reconnectTimer?: number;
  private reconnectAttempt = 0;
  private brokerId = 'upstox';

  subscribe(instrumentKeys: string[], listener: Listener): () => void {
    this.listeners.add(listener);
    instrumentKeys.forEach((key) => this.instruments.set(key, (this.instruments.get(key) || 0) + 1));
    this.restart();
    return () => {
      this.listeners.delete(listener);
      instrumentKeys.forEach((key) => { const count = (this.instruments.get(key) || 1) - 1; if (count <= 0) this.instruments.delete(key); else this.instruments.set(key, count); });
      if (!this.instruments.size) this.stop(); else this.restart();
    };
  }

  disconnect(): void { this.stop(); this.instruments.clear(); }

  private restart(): void { this.stop(false); if (this.instruments.size) void this.connect(); }
  private stop(clearReconnect = true): void { this.controller?.abort(); this.controller = undefined; if (clearReconnect && this.reconnectTimer) window.clearTimeout(this.reconnectTimer); }

  private async connect(): Promise<void> {
    const controller = new AbortController(); this.controller = controller;
    this.emit({ type: 'status', status: this.reconnectAttempt ? 'reconnecting' : 'connecting' });
    try {
      const response = await tradingApi(`/api/trading/${this.brokerId}/market-stream?instrument_keys=${encodeURIComponent([...this.instruments.keys()].join(','))}`, { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error('Market stream request failed');
      this.reconnectAttempt = 0;
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let remainder = '';
      while (!controller.signal.aborted) {
        const chunk = await reader.read(); if (chunk.done) throw new Error('Market stream ended');
        const lines = (remainder + decoder.decode(chunk.value, { stream: true })).split('\n'); remainder = lines.pop() || '';
        lines.filter(Boolean).forEach((line) => { try { this.emit(JSON.parse(line) as MarketFeedEvent); } catch { this.emit({ type: 'error', error: 'Malformed market event was ignored' }); } });
      }
    } catch (error) {
      if (!controller.signal.aborted && this.instruments.size) this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void { this.reconnectAttempt += 1; const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.reconnectAttempt, 5)); this.emit({ type: 'status', status: 'reconnecting' }); this.reconnectTimer = window.setTimeout(() => void this.connect(), delay); }
  private emit(event: MarketFeedEvent): void { this.listeners.forEach((listener) => listener(event)); }
}

export const upstoxMarketDataClient = new UpstoxMarketDataClient();

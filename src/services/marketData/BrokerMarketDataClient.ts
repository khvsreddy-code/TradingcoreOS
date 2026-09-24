import { tradingApi, readTradingApiJson } from '../http/tradingApi';
import { MarketFeedEvent } from '../../types/market';
import { upstoxMarketDataClient } from './UpstoxMarketDataClient';

type Listener = (event: MarketFeedEvent) => void;

type FyersStream = {
  streamKey: string;
  instrumentKeys: string[];
  depthInstrumentKey?: string;
  listeners: Set<Listener>;
  controller?: AbortController;
  reconnectTimer?: number;
  pollTimer?: number;
  pollInFlight: boolean;
  watchdogTimer?: number;
  reconnectCooldownAt?: number;
  attempt: number;
  generation: number;
  stopped: boolean;
  lastTickAt: Map<string, number>;
};

/**
 * Browser-side market-data multiplexer.
 *
 * One FYERS stream is shared by all charts/subscribers using the same symbol set.
 * A watchlist/chart switch therefore does not tear down and recreate the socket.
 * The broker feed remains the single source of live ticks.
 */
export class BrokerMarketDataClient {
  private streams = new Map<string, FyersStream>();

  private emit(stream: FyersStream, event: MarketFeedEvent): void {
    stream.listeners.forEach(listener => {
      try { listener(event); } catch { /* one chart must not break other subscribers */ }
    });
  }

  private async connectFyers(stream: FyersStream): Promise<void> {
    if (stream.stopped) return;
    stream.controller?.abort();
    const controller = new AbortController();
    stream.controller = controller;
    const generation = ++stream.generation;
    this.emit(stream, { type: 'status', status: stream.attempt ? 'reconnecting' : 'connecting' });

    try {
      const response = await tradingApi(`/api/trading/fyers/market-stream?instrument_keys=${encodeURIComponent(stream.instrumentKeys.join(','))}${stream.depthInstrumentKey ? `&depth_symbol=${encodeURIComponent(stream.depthInstrumentKey)}` : ''}`, { signal: controller.signal });
      if (!response.ok || !response.body) {
        let message = `FYERS market stream failed (${response.status})`;
        try { const payload = await readTradingApiJson<any>(response.clone()); message = payload?.error || message; } catch (parseError: any) { message = parseError?.message || message; }
        throw new Error(message);
      }
      if (stream.stopped || generation !== stream.generation || controller.signal.aborted) return;
      stream.attempt = 0;
      this.emit(stream, { type: 'status', status: 'connected' });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let remainder = '';
      while (!controller.signal.aborted && !stream.stopped) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('FYERS market stream ended');
        const lines = (remainder + decoder.decode(chunk.value, { stream: true })).split('\n');
        remainder = lines.pop() || '';
        for (const line of lines.filter(Boolean)) {
          try {
            const event = JSON.parse(line) as MarketFeedEvent;
            if (event.type === 'tick' && event.tick) stream.lastTickAt.set(String(event.tick.instrumentKey), Date.now());
            this.emit(stream, event);
          } catch { /* ignore malformed keep-alive frames */ }
        }
      }
    } catch (error: any) {
      if (!stream.stopped && !controller.signal.aborted && generation === stream.generation) {
        stream.attempt += 1;
        this.emit(stream, { type: 'status', status: 'reconnecting' });
        this.emit(stream, { type: 'error', error: error?.message || 'Unable to connect to FYERS market feed' });
        const delay = Math.min(10_000, 500 * 2 ** Math.min(stream.attempt, 5));
        stream.reconnectTimer = window.setTimeout(() => void this.connectFyers(stream), delay);
      }
    }
  }

  private startWatchdog(stream: FyersStream): void {
    if (stream.watchdogTimer) window.clearInterval(stream.watchdogTimer);
    stream.watchdogTimer = window.setInterval(() => {
      if (stream.stopped) return;
      const now = Date.now();
      const stale = stream.instrumentKeys.some(key => now - (stream.lastTickAt.get(String(key)) || 0) > 4500);
      if (!stale || !stream.controller || stream.controller.signal.aborted) return;
      if (now - (stream.reconnectCooldownAt || 0) < 5000) return;

      // A WebSocket can remain "connected" while no market frames arrive.
      // Force a fresh HTTP stream instead of waiting for the TCP connection to
      // fail by itself. The REST quote fallback below remains the fast safety net.
      stream.reconnectCooldownAt = now;
      stream.attempt = 0;
      stream.controller.abort();
      void this.connectFyers(stream);
    }, 1000);
  }

  private async pollQuotes(stream: FyersStream): Promise<void> {
    if (stream.stopped) return;
    const keys = stream.instrumentKeys;
    const now = Date.now();
    // REST is only a safety net. Keep it dormant while the stream is healthy,
    // but recover quickly when the socket is connected yet no ticks arrive.
    const stale = keys.some(key => now - (stream.lastTickAt.get(String(key)) || 0) > 900);
    if (stale && !stream.pollInFlight) {
      stream.pollInFlight = true;
      try {
        const response = await tradingApi(`/api/trading/fyers/market-data?instrument_keys=${encodeURIComponent(keys.join(','))}`, { cache: 'no-store' });
        if (response.ok) {
          const payload = await readTradingApiJson<any>(response);
          const rows = payload?.data || {};
          for (const [key, quote] of Object.entries(rows)) {
            const q: any = quote || {};
            const ltp = Number(q.ltp);
            if (!Number.isFinite(ltp)) continue;
            const tick: any = {
              instrumentKey: String(key),
              ltp,
              close: Number(q.close ?? q.prevClose ?? 0) || undefined,
              change: Number(q.change ?? 0) || undefined,
              changePercent: Number(q.changePercent ?? q.chg ?? 0) || undefined,
              volume: Number(q.volume ?? 0) || 0,
              bid: Number.isFinite(Number(q.bid)) ? [{ price: Number(q.bid), quantity: 0 }] : undefined,
              ask: Number.isFinite(Number(q.ask)) ? [{ price: Number(q.ask), quantity: 0 }] : undefined,
              receivedAt: new Date().toISOString(),
              lastTradeTimestamp: (() => {
                const raw = q.timestamp;
                const numeric = typeof raw === 'number' ? raw : Number(raw);
                if (Number.isFinite(numeric)) return new Date((numeric > 1e12 ? numeric : numeric * 1000)).toISOString();
                const parsed = Date.parse(String(raw || ''));
                return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
              })(),
            };
            stream.lastTickAt.set(String(key), Date.now());
            this.emit(stream, { type: 'tick', tick });
          }
        }
      } catch { /* websocket remains primary; retry on the next stale interval */ }
      finally { stream.pollInFlight = false; }
    }
    if (!stream.stopped) stream.pollTimer = window.setTimeout(() => void this.pollQuotes(stream), 500);
  }

  subscribe(brokerId: string, instrumentKeys: string[], listener: Listener, depthInstrumentKey?: string): () => void {
    const id = brokerId.toLowerCase();
    if (id === 'upstox') return upstoxMarketDataClient.subscribe(instrumentKeys, listener, 'full');
    if (id !== 'fyers') {
      listener({ type: 'error', error: `Live market data is not implemented for ${brokerId}` });
      return () => {};
    }

    const normalizedKeys = [...new Set(instrumentKeys.map(String).filter(Boolean))].sort();
    // A broker stream is persistent at terminal scope. Its instrument set is
    // expanded when another chart/watchlist needs a symbol; normal chart switches
    // therefore reuse the same transport instead of opening a new socket.
    const streamKey = `${id}:terminal`;
    let stream = this.streams.get(streamKey);
    if (!stream) {
      stream = {
        streamKey,
        instrumentKeys: normalizedKeys,
        depthInstrumentKey,
        listeners: new Set(),
        attempt: 0,
        generation: 0,
        stopped: false,
        lastTickAt: new Map(),
        pollInFlight: false,
      };
      this.streams.set(streamKey, stream);
      void this.connectFyers(stream);
      void this.pollQuotes(stream);
      this.startWatchdog(stream);
    } else {
      const union = [...new Set([...stream.instrumentKeys, ...normalizedKeys])].sort();
      const changed = union.join(',') !== stream.instrumentKeys.join(',');
      if (changed) { stream.instrumentKeys = union; void this.connectFyers(stream); }
      if (depthInstrumentKey && stream.depthInstrumentKey !== depthInstrumentKey) {
      // Depth is tied to the same transport in our server route. Reconnect only
      // when the actual depth symbol changes; normal chart switching stays hot.
      stream.depthInstrumentKey = depthInstrumentKey;
        void this.connectFyers(stream);
      }
    }

    stream.listeners.add(listener);
    listener({ type: 'status', status: stream.controller && !stream.controller.signal.aborted ? 'connected' : 'connecting' });
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      stream!.listeners.delete(listener);
      if (stream!.listeners.size > 0) return;
      stream!.stopped = true;
      stream!.generation += 1;
      stream!.controller?.abort();
      if (stream!.pollTimer) window.clearTimeout(stream!.pollTimer);
      if (stream!.reconnectTimer) window.clearTimeout(stream!.reconnectTimer);
      if (stream!.watchdogTimer) window.clearInterval(stream!.watchdogTimer);
      this.streams.delete(streamKey);
    };
  }

  disconnect(brokerId: string): void {
    const id = brokerId.toLowerCase();
    if (id === 'upstox') {
      upstoxMarketDataClient.disconnect();
      return;
    }
    for (const [key, stream] of this.streams) {
      if (!key.startsWith(`${id}:`)) continue;
      stream.stopped = true;
      stream.generation += 1;
      stream.controller?.abort();
      if (stream.pollTimer) window.clearTimeout(stream.pollTimer);
      if (stream.reconnectTimer) window.clearTimeout(stream.reconnectTimer);
      if (stream.watchdogTimer) window.clearInterval(stream.watchdogTimer);
      this.streams.delete(key);
    }
  }
}

export const brokerMarketDataClient = new BrokerMarketDataClient();

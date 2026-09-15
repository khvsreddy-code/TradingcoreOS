import { tradingApi, readTradingApiJson } from '../http/tradingApi';
import { MarketFeedEvent } from '../../types/market';
import { upstoxMarketDataClient } from './UpstoxMarketDataClient';

type Listener = (event: MarketFeedEvent) => void;

/**
 * Browser-side transport selector. The connected broker is the sole source of
 * live ticks; no Upstox fallback is allowed when FYERS is the primary broker.
 */
class BrokerMarketDataClient {
  private controllers = new Map<string, AbortController>();
  private reconnectTimers = new Map<string, number>();
  private refCounts = new Map<string, number>();
  private generations = new Map<string, number>();
  private pollTimers = new Map<string, number>();
  private lastTickAt = new Map<string, number>();

  subscribe(brokerId: string, instrumentKeys: string[], listener: Listener, depthInstrumentKey?: string): () => void {
    const id = brokerId.toLowerCase();
    if (id === 'upstox') return upstoxMarketDataClient.subscribe(instrumentKeys, listener, 'full');
    if (id !== 'fyers') {
      listener({ type: 'error', error: `Live market data is not implemented for ${brokerId}` });
      return () => {};
    }

    const streamKey = `${id}:${[...instrumentKeys].sort().join(',')}`;
    this.refCounts.set(streamKey, (this.refCounts.get(streamKey) || 0) + 1);
    let stopped = false;
    let attempt = 0;
    const generation = (this.generations.get(streamKey) || 0) + 1;
    this.generations.set(streamKey, generation);

    const pollQuotes = async () => {
      if (stopped) return;
      const last = this.lastTickAt.get(streamKey) || 0;
      // WebSocket is primary. REST quotes are only a stale-feed safety net,
      // so a healthy stream does not generate extra broker requests.
      if (Date.now() - last > 4500) {
        try {
          const response = await tradingApi(`/api/trading/${encodeURIComponent(id)}/market-data?instrument_keys=${encodeURIComponent(instrumentKeys.join(','))}`);
          if (response.ok) {
            const payload = await readTradingApiJson<any>(response);
            const rows = payload?.data || {};
            for (const [key, quote] of Object.entries(rows)) {
              const q: any = quote || {};
              const ltp = Number(q.ltp);
              if (!Number.isFinite(ltp)) continue;
              const tick: any = { instrumentKey: String(key), ltp, close: Number(q.close ?? q.prevClose ?? 0) || undefined, change: Number(q.change ?? 0) || undefined, changePercent: Number(q.changePercent ?? q.chg ?? 0) || undefined, volume: Number(q.volume ?? 0) || 0, bid: Number.isFinite(Number(q.bid)) ? [{price:Number(q.bid),quantity:0}] : undefined, ask: Number.isFinite(Number(q.ask)) ? [{price:Number(q.ask),quantity:0}] : undefined, receivedAt:new Date().toISOString(), lastTradeTimestamp:q.timestamp || new Date().toISOString() };
              this.lastTickAt.set(String(key), Date.now());
              listener({ type: 'tick', tick });
            }
          }
        } catch { /* websocket remains primary; retry on next stale interval */ }
      }
      if (!stopped) {
        const timer = window.setTimeout(() => void pollQuotes(), 3000);
        this.pollTimers.set(streamKey, timer);
      }
    };

    const connect = async () => {
      if (stopped) return;
      this.controllers.get(streamKey)?.abort();
      const controller = new AbortController();
      this.controllers.set(streamKey, controller);
      listener({ type: 'status', status: attempt ? 'reconnecting' : 'connecting' });

      try {
        const response = await tradingApi(`/api/trading/fyers/market-stream?instrument_keys=${encodeURIComponent(instrumentKeys.join(','))}${depthInstrumentKey ? `&depth_symbol=${encodeURIComponent(depthInstrumentKey)}` : ''}`, { signal: controller.signal });
        if (!response.ok || !response.body) {
          let message = `FYERS market stream failed (${response.status})`;
          try { const payload = await readTradingApiJson<any>(response.clone()); message = payload?.error || message; } catch (parseError: any) { message = parseError?.message || message; }
          throw new Error(message);
        }
        if (generation !== (this.generations.get(streamKey) || 0) || controller.signal.aborted) return;
        attempt = 0;
        listener({ type: 'status', status: 'connected' });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let remainder = '';
        while (!controller.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) throw new Error('FYERS market stream ended');
          const lines = (remainder + decoder.decode(chunk.value, { stream: true })).split('\n');
          remainder = lines.pop() || '';
          for (const line of lines.filter(Boolean)) {
            try {
              const event = JSON.parse(line) as MarketFeedEvent;
              if (event.type === 'tick' && event.tick) this.lastTickAt.set(String(event.tick.instrumentKey), Date.now());
              listener(event);
            } catch { /* ignore malformed keep-alive */ }
          }
        }
      } catch (error: any) {
        if (!stopped && !controller.signal.aborted && generation === (this.generations.get(streamKey) || 0)) {
          attempt += 1;
          listener({ type: 'status', status: 'reconnecting' });
          listener({ type: 'error', error: error?.message || 'Unable to connect to FYERS market feed' });
          const delay = Math.min(10_000, 500 * 2 ** Math.min(attempt, 5));
          const timer = window.setTimeout(() => void connect(), delay);
          this.reconnectTimers.set(streamKey, timer);
        }
      }
    };

    void connect();
    void pollQuotes();
    return () => {
      stopped = true;
      const remaining = Math.max(0, (this.refCounts.get(streamKey) || 1) - 1);
      this.refCounts.set(streamKey, remaining);
      if (remaining === 0) {
        this.controllers.get(streamKey)?.abort();
        this.controllers.delete(streamKey);
        const pollTimer = this.pollTimers.get(streamKey);
        if (pollTimer) window.clearTimeout(pollTimer);
        this.pollTimers.delete(streamKey);
        this.lastTickAt.delete(streamKey);
        const timer = this.reconnectTimers.get(streamKey);
        if (timer) window.clearTimeout(timer);
        this.reconnectTimers.delete(streamKey);
        this.refCounts.delete(streamKey);
        this.generations.delete(streamKey);
      }
    };
  }

  disconnect(brokerId: string): void {
    const id = brokerId.toLowerCase();
    if (id === 'upstox') {
      upstoxMarketDataClient.disconnect();
      return;
    }
    for (const [key, controller] of this.controllers) {
      if (key.startsWith(`${id}:`)) controller.abort();
    }
  }
}

export const brokerMarketDataClient = new BrokerMarketDataClient();

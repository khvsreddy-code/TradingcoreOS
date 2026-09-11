import { tradingApi } from '../http/tradingApi';
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

  subscribe(brokerId: string, instrumentKeys: string[], listener: Listener): () => void {
    const id = brokerId.toLowerCase();
    if (id === 'upstox') return upstoxMarketDataClient.subscribe(instrumentKeys, listener);
    if (id !== 'fyers') {
      listener({ type: 'error', error: `Live market data is not implemented for ${brokerId}` });
      return () => {};
    }

    const streamKey = `${id}:${[...instrumentKeys].sort().join(',')}`;
    this.refCounts.set(streamKey, (this.refCounts.get(streamKey) || 0) + 1);
    let stopped = false;
    let attempt = 0;

    const connect = async () => {
      if (stopped) return;
      this.controllers.get(streamKey)?.abort();
      const controller = new AbortController();
      this.controllers.set(streamKey, controller);
      listener({ type: 'status', status: attempt ? 'reconnecting' : 'connecting' });

      try {
        const response = await tradingApi(`/api/trading/fyers/market-stream?instrument_keys=${encodeURIComponent(instrumentKeys.join(','))}`, { signal: controller.signal });
        if (!response.ok || !response.body) throw new Error(`FYERS market stream failed (${response.status})`);
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
            try { listener(JSON.parse(line) as MarketFeedEvent); } catch { /* ignore malformed keep-alive */ }
          }
        }
      } catch (error: any) {
        if (!stopped && !controller.signal.aborted) {
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
    return () => {
      stopped = true;
      const remaining = Math.max(0, (this.refCounts.get(streamKey) || 1) - 1);
      this.refCounts.set(streamKey, remaining);
      if (remaining === 0) {
        this.controllers.get(streamKey)?.abort();
        this.controllers.delete(streamKey);
        const timer = this.reconnectTimers.get(streamKey);
        if (timer) window.clearTimeout(timer);
        this.reconnectTimers.delete(streamKey);
        this.refCounts.delete(streamKey);
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

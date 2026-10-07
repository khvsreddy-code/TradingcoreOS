import { BrokerMarketDataClient } from './BrokerMarketDataClient';

export type MarketSubscriptionClient = Pick<BrokerMarketDataClient, 'subscribe'>;

type MarketListener = Parameters<BrokerMarketDataClient['subscribe']>[2];

type SharedSymbolEntry = {
  brokerId: string;
  symbol: string;
  listeners: Set<MarketListener>;
  unsubscribe?: () => void;
  depthInstrumentKey?: string;
  idleTimer?: ReturnType<typeof setTimeout>;
  lastReleasedAt?: number;
};

/**
 * Terminal-wide subscription registry.
 *
 * `subscribe` preserves the legacy consumer-oriented API. `subscribeSharedSymbol`
 * is the chart/data-plane path: all consumers interested in the same broker/symbol
 * share exactly one underlying subscription and only fan-out the normalized event.
 */
export class PersistentMarketSubscriptionManager {
  private consumers = new Map<string, { brokerId: string; symbols: Set<string>; listener: MarketListener; unsubscribe?: () => void }>();
  private sharedSymbols = new Map<string, SharedSymbolEntry>();
  private readonly sharedIdleMs = 15_000;
  private readonly sharedMaxWarmSymbols = 12;

  constructor(private readonly client: MarketSubscriptionClient) {}

  subscribe(id: string, brokerId: string, symbols: string[], listener: MarketListener) {
    const key = `${brokerId}:${id}`;
    const consumer: { brokerId: string; symbols: Set<string>; listener: MarketListener; unsubscribe?: () => void } = { brokerId, symbols: new Set(symbols.filter(Boolean)), listener };
    consumer.unsubscribe = this.client.subscribe(brokerId, [...consumer.symbols], listener);
    this.consumers.set(key, consumer);
    return () => {
      const current = this.consumers.get(key);
      if (!current) return;
      current.unsubscribe?.();
      this.consumers.delete(key);
    };
  }

  /** Shared by all chart timeframes/views for one broker+symbol. */
  subscribeSharedSymbol(
    brokerId: string,
    symbol: string,
    listener: MarketListener,
    depthInstrumentKey?: string,
  ) {
    const normalizedBroker = String(brokerId || 'unknown').toLowerCase();
    const normalizedSymbol = String(symbol || '').trim();
    const key = `${normalizedBroker}:${normalizedSymbol}`;
    let entry = this.sharedSymbols.get(key);
    if (!entry) {
      entry = {
        brokerId: normalizedBroker,
        symbol: normalizedSymbol,
        listeners: new Set(),
        depthInstrumentKey,
      };
      entry.unsubscribe = this.client.subscribe(
        normalizedBroker,
        [normalizedSymbol],
        event => {
          const current = this.sharedSymbols.get(key);
          if (!current) return;
          current.listeners.forEach(nextListener => {
            try { nextListener(event); } catch { /* one consumer must not affect the shared feed */ }
          });
        },
        depthInstrumentKey,
      );
      this.sharedSymbols.set(key, entry);
    } else if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = undefined;
    }
    entry.listeners.add(listener);
    entry.lastReleasedAt = undefined;

    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      const current = this.sharedSymbols.get(key);
      if (!current) return;
      current.listeners.delete(listener);
      if (current.listeners.size > 0) return;
      current.lastReleasedAt = Date.now();
      if (current.idleTimer) clearTimeout(current.idleTimer);
      current.idleTimer = setTimeout(() => {
        const latest = this.sharedSymbols.get(key);
        if (!latest || latest.listeners.size > 0 || latest.lastReleasedAt !== current.lastReleasedAt) return;
        latest.unsubscribe?.();
        latest.idleTimer = undefined;
        this.sharedSymbols.delete(key);
      }, this.sharedIdleMs);
      this.trimWarmSharedSymbols();
    };
  }

  private trimWarmSharedSymbols(): void {
    const idle = [...this.sharedSymbols.entries()]
      .filter(([, entry]) => entry.listeners.size === 0)
      .sort((a, b) => Number(a[1].lastReleasedAt || 0) - Number(b[1].lastReleasedAt || 0));
    while (this.sharedSymbols.size > this.sharedMaxWarmSymbols && idle.length) {
      const [key, entry] = idle.shift()!;
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      entry.unsubscribe?.();
      this.sharedSymbols.delete(key);
    }
  }

  update(id: string, brokerId: string, symbols: string[]) {
    const key = `${brokerId}:${id}`;
    const current = this.consumers.get(key);
    if (!current) return;
    const next = new Set(symbols.filter(Boolean));
    if ([...next].sort().join(',') === [...current.symbols].sort().join(',')) return;
    current.unsubscribe?.();
    current.symbols = next;
    current.unsubscribe = this.client.subscribe(brokerId, [...next], current.listener);
  }

  clear() {
    for (const c of this.consumers.values()) c.unsubscribe?.();
    for (const entry of this.sharedSymbols.values()) {
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      entry.unsubscribe?.();
    }
    this.consumers.clear();
    this.sharedSymbols.clear();
  }
}

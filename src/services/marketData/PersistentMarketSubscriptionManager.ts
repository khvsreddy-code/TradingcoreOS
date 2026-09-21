import { BrokerMarketDataClient } from './BrokerMarketDataClient';

/** Terminal-wide subscription registry. Multiple charts/watchlists share one
 * logical broker stream; symbol changes alter consumers rather than creating a
 * new socket per chart. */
export class PersistentMarketSubscriptionManager {
  private consumers = new Map<string, { brokerId: string; symbols: Set<string>; listener: Parameters<BrokerMarketDataClient['subscribe']>[2]; unsubscribe?: () => void }>();
  constructor(private readonly client: BrokerMarketDataClient) {}

  subscribe(id: string, brokerId: string, symbols: string[], listener: Parameters<BrokerMarketDataClient['subscribe']>[2]) {
    const key = `${brokerId}:${id}`;
    const consumer = { brokerId, symbols: new Set(symbols.filter(Boolean)), listener } as any;
    consumer.unsubscribe = this.client.subscribe(brokerId, [...consumer.symbols], listener);
    this.consumers.set(key, consumer);
    return () => {
      const current = this.consumers.get(key);
      if (!current) return;
      current.unsubscribe?.();
      this.consumers.delete(key);
    };
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
    this.consumers.clear();
  }
}

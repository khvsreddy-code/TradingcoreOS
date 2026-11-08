import type { DomainMarketEvent } from '../../types/market-events.js';

export type MarketConsumer =
  | 'quote'
  | 'chart'
  | 'indicators'
  | 'execution'
  | 'orderbook'
  | 'corespirit'
  | 'ml'
  | 'replay'
  | 'audit';

export type MarketEventListener = (event: DomainMarketEvent) => void;

export interface MarketEventSubscription {
  consumers?: readonly MarketConsumer[];
  types?: readonly DomainMarketEvent['type'][];
  symbols?: readonly string[];
}

/**
 * In-process normalized event bus. It is intentionally synchronous and
 * non-buffering: a slow consumer must not add latency to the broker socket.
 * Consumers needing durable/replay semantics must persist to their own queue.
 * Raw broker payloads never enter this bus. Depth is privileged/high-volume:
 * subscriptions must explicitly opt in via an orderbook/ML/CoreSpirit/audit
 * consumer filter; an unfiltered listener receives no depth frames by default.
 */
export class MarketEventBus {
  private readonly listeners = new Set<{
    listener: MarketEventListener;
    consumers: ReadonlySet<MarketConsumer> | null;
    types: ReadonlySet<DomainMarketEvent['type']> | null;
    symbols: ReadonlySet<string> | null;
  }>();

  subscribe(listener: MarketEventListener, filter: MarketEventSubscription = {}): () => void {
    const entry = {
      listener,
      consumers: filter.consumers?.length ? new Set(filter.consumers) : null,
      types: filter.types?.length ? new Set(filter.types) : null,
      symbols: filter.symbols?.length ? new Set(filter.symbols) : null,
    };
    this.listeners.add(entry);
    let closed = false;
    return () => {
      if (closed) return;
      closed = true;
      this.listeners.delete(entry);
    };
  }

  publish(event: DomainMarketEvent): void {
    for (const entry of this.listeners) {
      if (entry.types && !entry.types.has(event.type)) continue;
      if (entry.symbols && !entry.symbols.has(event.symbol)) continue;
      if (isDepthEvent(event)) {
        // Fail closed: a generic listener must never inherit order-book bandwidth
        // just because it subscribed to the shared normalized event bus.
        if (!entry.consumers || !routesToConsumer(event, entry.consumers)) continue;
      } else if (entry.consumers && !routesToConsumer(event, entry.consumers)) continue;
      try { entry.listener(event); } catch {
        // Isolate consumers; market-data ingress must never be blocked by UI/ML work.
      }
    }
  }

  get subscriberCount(): number { return this.listeners.size; }
}

function isDepthEvent(event: DomainMarketEvent): boolean {
  return event.type === 'DepthSnapshot' || event.type === 'DepthDelta';
}

function routesToConsumer(event: DomainMarketEvent, consumers: ReadonlySet<MarketConsumer>): boolean {
  switch (event.type) {
    case 'Quote':
      return consumers.has('quote');
    case 'MarketTick':
      return ['chart', 'indicators', 'execution', 'corespirit', 'ml', 'replay', 'audit']
        .some(consumer => consumers.has(consumer as MarketConsumer));
    case 'DepthSnapshot':
    case 'DepthDelta':
      return ['orderbook', 'ml', 'corespirit', 'audit']
        .some(consumer => consumers.has(consumer as MarketConsumer));
    case 'Trade':
    case 'Fill':
      return ['execution', 'corespirit', 'ml', 'replay', 'audit']
        .some(consumer => consumers.has(consumer as MarketConsumer));
    case 'OrderUpdate':
      return ['execution', 'corespirit', 'replay', 'audit']
        .some(consumer => consumers.has(consumer as MarketConsumer));
    case 'PositionUpdate':
    case 'FundsUpdate':
      return ['execution', 'corespirit', 'replay', 'audit']
        .some(consumer => consumers.has(consumer as MarketConsumer));
  }
}

export const marketEventBus = new MarketEventBus();

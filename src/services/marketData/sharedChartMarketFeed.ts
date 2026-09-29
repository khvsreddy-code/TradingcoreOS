import type { MarketFeedEvent } from '../../types/market';
import { tradingCoreRuntime } from '../runtime/TradingCoreRuntime';
import { chartMarketKey, chartMarketStore } from './chartMarketStore';
import { PersistentMarketSubscriptionManager } from './PersistentMarketSubscriptionManager';

const runtimeSubscriptionClient = {
  subscribe(
    brokerId: string,
    symbols: string[],
    listener: (event: MarketFeedEvent) => void,
    depthInstrumentKey?: string,
  ) {
    return tradingCoreRuntime.subscribeMarketData(symbols, event => {
      const activeBroker = tradingCoreRuntime.getPrimaryBrokerInfo()?.brokerId?.toLowerCase();
      if (activeBroker && activeBroker !== brokerId.toLowerCase()) return;
      listener(event);
    }, depthInstrumentKey);
  },
};

/**
 * One runtime market subscription per broker+symbol. All chart timeframes consume
 * the same normalized tick stream through chartMarketStore.
 */
export const sharedChartMarketFeed = new PersistentMarketSubscriptionManager(runtimeSubscriptionClient);

export function acquireSharedChartMarketFeed(brokerId: string, instrumentKey: string): () => void {
  const key = chartMarketKey(brokerId, instrumentKey);
  return sharedChartMarketFeed.subscribeSharedSymbol(brokerId, instrumentKey, event => {
    if (event.type !== 'tick' || !event.tick) return;
    if (String(event.tick.instrumentKey || '') !== String(instrumentKey)) return;
    chartMarketStore.publish(key, event.tick);
  });
}

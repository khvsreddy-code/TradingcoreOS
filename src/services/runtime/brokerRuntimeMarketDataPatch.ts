import { tradingCoreRuntime } from './TradingCoreRuntime';
import { brokerMarketDataClient } from '../marketData/BrokerMarketDataClient';

/**
 * Compatibility shim kept isolated so the existing runtime/UI contracts do not
 * change. The previous runtime hard-coded Upstox for every live chart stream.
 * This replaces only that provider selection with the primary connected broker.
 */
const runtime = tradingCoreRuntime as any;

runtime.subscribeMarketData = function (instrumentKeys: string[], listener: (event: any) => void) {
  const info = this.getPrimaryBrokerInfo?.();
  if (!info || info.status !== 'Connected') {
    listener({ type: 'error', error: 'Connect a broker before starting live market data.' });
    return () => {};
  }
  return brokerMarketDataClient.subscribe(info.brokerId, instrumentKeys, listener);
};

const originalDisconnectBroker = runtime.disconnectBroker.bind(runtime);
runtime.disconnectBroker = async function (brokerId: string) {
  brokerMarketDataClient.disconnect(brokerId);
  return originalDisconnectBroker(brokerId);
};

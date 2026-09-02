import { tradingCoreRuntime } from './TradingCoreRuntime';
import { brokerMarketDataClient } from '../marketData/BrokerMarketDataClient';

/**
 * Compatibility shim kept isolated so the existing runtime/UI contracts do not
 * change. The previous runtime hard-coded Upstox for every live chart stream.
 * This replaces only that provider selection with the primary connected broker
 * and normalizes intraday history to the current India trading session.
 */
const runtime = tradingCoreRuntime as any;

runtime.subscribeMarketData = function (instrumentKeys: string[], listener: (event: any) => void) {
  const info = this.getPrimaryBrokerInfo?.();
  if (!info || info.status !== 'Connected') {
    listener({ type: 'error', error: 'Connect a broker before starting live market data.' });
    return () => {};
  }
  const relay = (event: any) => {
    if (event.type === 'tick' && event.tick) {
      this.market.set(event.tick.instrumentKey, event.tick);
      this.emit('TICK_UPDATE', event.tick);
    }
    listener(event);
    this.marketListeners?.forEach((subscriber: any) => subscriber(event));
  };
  return brokerMarketDataClient.subscribe(info.brokerId, instrumentKeys, relay);
};

const originalGetHistoricalData = runtime.getHistoricalData.bind(runtime);
runtime.getHistoricalData = async function (symbol: string, timeframe: string) {
  const rows = await originalGetHistoricalData(symbol, timeframe);
  if (!Array.isArray(rows) || rows.length < 2 || timeframe === 'day') return rows;

  const indiaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const currentSession = rows.filter((row: any) => {
    const ts = new Date(row.timestamp);
    return Number.isFinite(ts.getTime()) && new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(ts) === indiaDate;
  });

  // For intraday charts, never render older-session candles as if they were
  // today's history. If the broker has not published today's history yet,
  // return the original data so the UI can surface a genuine feed problem.
  return currentSession.length >= 2 ? currentSession : rows;
};

const originalConnectBrokerOAuth = runtime.connectBrokerOAuth.bind(runtime);
runtime.connectBrokerOAuth = async function (brokerId: string, authCode?: string) {
  const result = await originalConnectBrokerOAuth(brokerId, authCode);
  if (result?.success) this.switchActiveBroker(brokerId);
  return result;
};

const originalConnectBrokerApiKeys = runtime.connectBrokerApiKeys.bind(runtime);
runtime.connectBrokerApiKeys = async function (brokerId: string, credentials: any) {
  const result = await originalConnectBrokerApiKeys(brokerId, credentials);
  if (result?.success) this.switchActiveBroker(brokerId);
  return result;
};

const originalDisconnectBroker = runtime.disconnectBroker.bind(runtime);
runtime.disconnectBroker = async function (brokerId: string) {
  brokerMarketDataClient.disconnect(brokerId);
  return originalDisconnectBroker(brokerId);
};

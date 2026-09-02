import { tradingCoreRuntime } from './TradingCoreRuntime';
import { brokerMarketDataClient } from '../marketData/BrokerMarketDataClient';

/**
 * Compatibility shim: keep the existing workspace UI while routing market data
 * and intraday history through the broker that is currently marked ACTIVE.
 */
const runtime = tradingCoreRuntime as any;

runtime.subscribeMarketData = function (instrumentKeys: string[], listener: (event: any) => void) {
  const initial = this.getPrimaryBrokerInfo?.();
  if (!initial || initial.status !== 'Connected') {
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

  let currentBrokerId = initial.brokerId;
  let stopFeed = brokerMarketDataClient.subscribe(currentBrokerId, instrumentKeys, relay);
  const stopBrokerSwitch = this.on('STATUS_CHANGED', (event: any) => {
    if (event?.status !== 'Primary Switched') return;
    const next = this.getPrimaryBrokerInfo?.();
    if (!next || next.brokerId === currentBrokerId || next.status !== 'Connected') return;
    stopFeed();
    currentBrokerId = next.brokerId;
    listener({ type: 'status', status: 'reconnecting' });
    stopFeed = brokerMarketDataClient.subscribe(currentBrokerId, instrumentKeys, relay);
  });

  return () => { stopBrokerSwitch(); stopFeed(); };
};

const originalGetHistoricalData = runtime.getHistoricalData.bind(runtime);
runtime.getHistoricalData = async function (symbol: string, timeframe: string) {
  const rows = await originalGetHistoricalData(symbol, timeframe);
  if (!Array.isArray(rows) || timeframe === 'day') return rows;

  const indiaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
  const today = indiaDay.format(new Date());
  const currentSession = rows.filter((row: any) => {
    const ts = new Date(row.timestamp);
    return Number.isFinite(ts.getTime()) && indiaDay.format(ts) === today;
  });

  // Never silently paint yesterday/older candles on an intraday chart. A genuine
  // empty result is safer than presenting stale candles as today's market history.
  return currentSession;
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

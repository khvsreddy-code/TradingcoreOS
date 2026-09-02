import { tradingCoreRuntime } from './TradingCoreRuntime';
import { brokerMarketDataClient } from '../marketData/BrokerMarketDataClient';

/**
 * Compatibility layer: keep the existing workspace UI while routing market
 * data and intraday history through the active broker. It also prevents stale
 * broker responses from crossing an account switch.
 */
const runtime = tradingCoreRuntime as any;
type HistoryCacheEntry = { expiresAt: number; data: any[] };
const historyCache = new Map<string, HistoryCacheEntry>();
const HISTORY_TTL_MS = 1200;
let routeGeneration = 0;

const clearHistoryCache = () => historyCache.clear();

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
  const brokerId = this.getPrimaryBrokerInfo?.()?.brokerId?.toLowerCase();
  if (!brokerId) return [];
  const generationAtStart = routeGeneration;
  const key = `${brokerId}:${symbol}:${timeframe}`;
  const cached = historyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const rows = await originalGetHistoricalData(symbol, timeframe);
  if (generationAtStart !== routeGeneration || this.getPrimaryBrokerInfo?.()?.brokerId?.toLowerCase() !== brokerId) return [];
  if (!Array.isArray(rows) || timeframe === 'day') {
    if (Array.isArray(rows) && rows.length) historyCache.set(key, { data: rows, expiresAt: Date.now() + HISTORY_TTL_MS });
    return rows;
  }

  const indiaDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' });
  const today = indiaDay.format(new Date());
  const currentSession = rows.filter((row: any) => {
    const ts = new Date(row.timestamp);
    return Number.isFinite(ts.getTime()) && indiaDay.format(ts) === today;
  });

  // Do not paint an older session as today's intraday chart. An empty result is
  // safer than stale market history. The live WebSocket supplies the updating
  // candle once the market feed is connected.
  historyCache.set(key, { data: currentSession, expiresAt: Date.now() + HISTORY_TTL_MS });
  return currentSession;
};

const originalConnectBrokerOAuth = runtime.connectBrokerOAuth.bind(runtime);
runtime.connectBrokerOAuth = async function (brokerId: string, authCode?: string) {
  const result = await originalConnectBrokerOAuth(brokerId, authCode);
  if (result?.success) {
    routeGeneration += 1;
    clearHistoryCache();
    this.switchActiveBroker(brokerId);
  }
  return result;
};

const originalConnectBrokerApiKeys = runtime.connectBrokerApiKeys.bind(runtime);
runtime.connectBrokerApiKeys = async function (brokerId: string, credentials: any) {
  const result = await originalConnectBrokerApiKeys(brokerId, credentials);
  if (result?.success) {
    routeGeneration += 1;
    clearHistoryCache();
    this.switchActiveBroker(brokerId);
  }
  return result;
};

const originalSwitchActiveBroker = runtime.switchActiveBroker.bind(runtime);
runtime.switchActiveBroker = function (brokerId: string) {
  const previous = this.getPrimaryBrokerInfo?.()?.brokerId?.toLowerCase();
  const success = originalSwitchActiveBroker(brokerId);
  if (success && previous !== brokerId.toLowerCase()) {
    routeGeneration += 1;
    clearHistoryCache();
    if (previous) brokerMarketDataClient.disconnect(previous);
  }
  return success;
};

const originalDisconnectBroker = runtime.disconnectBroker.bind(runtime);
runtime.disconnectBroker = async function (brokerId: string) {
  routeGeneration += 1;
  clearHistoryCache();
  brokerMarketDataClient.disconnect(brokerId);
  return originalDisconnectBroker(brokerId);
};

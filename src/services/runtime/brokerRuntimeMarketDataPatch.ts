import { tradingCoreRuntime } from './TradingCoreRuntime';
import { brokerMarketDataClient } from '../marketData/BrokerMarketDataClient';

/**
 * Compatibility layer: keep the existing workspace UI while routing market
 * data and history through the currently active broker. Responses are guarded
 * so a stale request can never cross an account switch.
 */
const runtime = tradingCoreRuntime as any;
type HistoryCacheEntry = { expiresAt: number; data: any[] };
const historyCache = new Map<string, HistoryCacheEntry>();
const lastTickTime = new Map<string, number>();
const HISTORY_TTL_MS = 30_000;
let routeGeneration = 0;

const clearHistoryCache = () => historyCache.clear();
const tickTime = (value: any) => {
  const n = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(n)) return 0;
  return n > 1e12 ? n : n * 1000;
};

const dedupeAndSortHistory = (rows: any[]) => {
  const byTime = new Map<number, any>();
  for (const row of rows || []) {
    const time = tickTime(row?.timestamp);
    if (!time || !Number.isFinite(Number(row?.open)) || !Number.isFinite(Number(row?.high)) || !Number.isFinite(Number(row?.low)) || !Number.isFinite(Number(row?.close))) continue;
    byTime.set(time, row);
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
};

runtime.subscribeMarketData = function (instrumentKeys: string[], listener: (event: any) => void) {
  const initial = this.getPrimaryBrokerInfo?.();
  if (!initial || initial.status !== 'Connected') {
    listener({ type: 'error', error: 'Connect a broker before starting live market data.' });
    return () => {};
  }

  const relay = (event: any) => {
    if (event.type === 'tick' && event.tick) {
      const key = String(event.tick.instrumentKey || '');
      const timestamp = tickTime(event.tick.timestamp) || Date.now();
      const previous = lastTickTime.get(key) || 0;
      if (key && timestamp < previous) return;
      if (key) lastTickTime.set(key, timestamp);
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
  const key = `${brokerId}:${symbol}:${timeframe}:25000`;
  const cached = historyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const rows = await originalGetHistoricalData(symbol, timeframe);
  if (generationAtStart !== routeGeneration || this.getPrimaryBrokerInfo?.()?.brokerId?.toLowerCase() !== brokerId) return [];
  if (!Array.isArray(rows)) return [];

  // Never collapse intraday history to the current session. That was the
  // direct cause of charts showing only the candle formed after login.
  const history = dedupeAndSortHistory(rows).slice(-25_000);
  if (history.length) historyCache.set(key, { data: history, expiresAt: Date.now() + HISTORY_TTL_MS });
  return history;
};

const originalConnectBrokerOAuth = runtime.connectBrokerOAuth.bind(runtime);
runtime.connectBrokerOAuth = async function (brokerId: string, authCode?: string) {
  const result = await originalConnectBrokerOAuth(brokerId, authCode);
  if (result?.success) {
    routeGeneration += 1;
    clearHistoryCache();
    lastTickTime.clear();
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
    lastTickTime.clear();
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
    lastTickTime.clear();
    if (previous) brokerMarketDataClient.disconnect(previous);
  }
  return success;
};

const originalDisconnectBroker = runtime.disconnectBroker.bind(runtime);
runtime.disconnectBroker = async function (brokerId: string) {
  routeGeneration += 1;
  clearHistoryCache();
  lastTickTime.clear();
  brokerMarketDataClient.disconnect(brokerId);
  return originalDisconnectBroker(brokerId);
};

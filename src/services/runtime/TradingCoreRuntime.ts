import { brokerManager, BrokerManager, BrokerConnectionInfo } from '../brokers/BrokerManager';
import { tradingEngine, TradingEngine } from '../engine/TradingEngine';
import { BrokerAdapter, OrderRequest, OrderResult, Position, Holding, AccountFunds, HistoricalCandle, HistoricalCandleColumns, TradeRecord } from '../brokers/BrokerAdapter';
import { brokerMarketDataClient } from '../marketData/BrokerMarketDataClient';
import { MarketFeedEvent, NormalizedMarketTick } from '../../types/market';
import { coreEventBus } from '../core/event/eventBus';
import { historyStore } from '../marketData/HistoryStore';

export type RuntimeEvent = 'BROKER_CONNECTED' | 'BROKER_DISCONNECTED' | 'ORDER_EXECUTED' | 'TICK_UPDATE' | 'PORTFOLIO_SYNCED' | 'SESSION_REFRESHED' | 'STATUS_CHANGED';
export type EventListener = (payload: any) => void;
export type MarketDataProviderType = 'CONNECTED_BROKER';

export type HistoricalProviderErrorCode =
  | 'authentication'
  | 'rate_limited'
  | 'timeout'
  | 'no_data'
  | 'unsupported'
  | 'partial'
  | 'invalid_dataset'
  | 'provider_error';

export type HistoricalProviderDiagnostic = Readonly<{
  symbol: string;
  timeframe: string;
  brokerId?: string;
  code: HistoricalProviderErrorCode;
  message: string;
  occurredAt: number;
  fallbackAttempted: boolean;
}>;

function classifyHistoricalProviderError(error: unknown): HistoricalProviderErrorCode {
  const value = error as { status?: number; statusCode?: number; code?: string; message?: string; name?: string } | null;
  const status = Number(value?.status ?? value?.statusCode);
  const message = String(value?.message ?? error ?? '').toLowerCase();
  const code = String(value?.code ?? '').toLowerCase();
  if (status === 401 || status === 403 || /unauthori[sz]ed|invalid token|authentication|session expired/.test(message)) return 'authentication';
  if (status === 429 || /rate.?limit|too many requests|request limit/.test(message)) return 'rate_limited';
  if (value?.name === 'TimeoutError' || /timeout|timed out|etimedout/.test(message) || code === 'etimedout') return 'timeout';
  if (/unsupported symbol|unsupported timeframe|invalid symbol|not supported/.test(message)) return 'unsupported';
  if (/invalid (?:ohlc|candle|dataset|history)|malformed candle/.test(message)) return 'invalid_dataset';
  if (/no data|empty history|no candles/.test(message)) return 'no_data';
  return 'provider_error';
}

function epochMs(value: unknown): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export class TradingCoreRuntime {
  private static instance: TradingCoreRuntime;
  private brokerMgr: BrokerManager = brokerManager;
  private engine: TradingEngine = tradingEngine;
  private currentMarketDataProviderType: MarketDataProviderType = 'CONNECTED_BROKER';
  private listeners: Map<RuntimeEvent, Set<EventListener>> = new Map();
  private market = new Map<string, NormalizedMarketTick>();
  private marketListeners = new Set<(event: MarketFeedEvent) => void>();
  private brokerRestorePromise?: Promise<void>;
  private portfolioSyncPromises = new Map<string, Promise<any>>();
  private portfolioPollTimer?: ReturnType<typeof setInterval>;
  private portfolioPollRefs = 0;
  private optionChainCache = new Map<string, { expiresAt: number; data: any }>();
  private optionChainPromises = new Map<string, Promise<any>>();
  private historyCache = new Map<string, { expiresAt: number; data: HistoricalCandle[] }>();
  private olderHistoryCache = new Map<string, { expiresAt: number; data: HistoricalCandle[] }>();
  private olderHistoryInflight = new Map<string, Promise<HistoricalCandle[]>>();
  private routeGeneration = 0;
  private lastTickTime = new Map<string, number>();

  private constructor() {}
  public static getInstance(): TradingCoreRuntime { if (!TradingCoreRuntime.instance) TradingCoreRuntime.instance = new TradingCoreRuntime(); return TradingCoreRuntime.instance; }
  public hasConnectedBroker(): boolean { return this.brokerMgr.getAllConnections().length > 0; }
  public getPrimaryBroker(): BrokerAdapter | null { return this.brokerMgr.getPrimaryBroker(); }
  public getPrimaryBrokerInfo(): BrokerConnectionInfo | null { return this.brokerMgr.getPrimaryBrokerInfo(); }
  /** Canonical broker identity for every market-data consumer. Never let a chart/provider invent a broker key. */
  public getPrimaryBrokerId(): string | null { return this.brokerMgr.getPrimaryBrokerInfo()?.brokerId?.toLowerCase() ?? null; }
  public getAllConnections(): BrokerConnectionInfo[] { return this.brokerMgr.getAllConnections(); }

  public restoreBrokerConnections(): Promise<void> {
    if (this.brokerRestorePromise) return this.brokerRestorePromise;
    this.brokerRestorePromise = (async () => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await this.brokerMgr.restoreServerConnections();
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          }
        }
      }
      if (lastError) throw lastError;

      for (const connection of this.brokerMgr.getAllConnections()) this.engine.registerRestoredBroker(connection.adapter);
      const primary = this.brokerMgr.getPrimaryBrokerInfo();
      if (primary) {
        this.engine.switchActiveBroker(primary.brokerId);
        this.emit('STATUS_CHANGED', { brokerId: primary.brokerId, status: 'Restored' });
      }
    })().finally(() => { this.brokerRestorePromise = undefined; });
    return this.brokerRestorePromise;
  }

  public async connectBrokerOAuth(brokerId: string, authCode?: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.brokerMgr.connectOAuth(brokerId, authCode);
    if (res.success) { this.routeGeneration += 1; this.historyCache.clear(); this.olderHistoryCache.clear(); this.olderHistoryInflight.clear(); historyStore.clear(); this.optionChainCache.clear(); this.optionChainPromises.clear(); this.lastTickTime.clear(); this.switchActiveBroker(brokerId); this.emit('BROKER_CONNECTED', { brokerId, method: 'OAuth' }); void this.syncPortfolio(brokerId); }
    return res;
  }
  public async connectBrokerApiKeys(brokerId: string, credentials: any): Promise<{ success: boolean; error?: string }> {
    const res = await this.brokerMgr.connectApiKeys(brokerId, credentials);
    if (res.success) { this.routeGeneration += 1; this.historyCache.clear(); historyStore.clear(); this.optionChainCache.clear(); this.optionChainPromises.clear(); this.lastTickTime.clear(); this.switchActiveBroker(brokerId); this.emit('BROKER_CONNECTED', { brokerId, method: 'ApiKeys' }); void this.syncPortfolio(brokerId); }
    return res;
  }
  public async disconnectBroker(brokerId: string): Promise<void> {
    this.routeGeneration += 1;
    this.historyCache.clear(); historyStore.clear();
    this.optionChainCache.clear();
    this.optionChainPromises.clear();
    this.lastTickTime.clear();
    this.market.clear();
    brokerMarketDataClient.disconnect(brokerId);
    await this.brokerMgr.disconnect(brokerId);
    const primary = this.brokerMgr.getPrimaryBrokerInfo();
    if (primary) this.engine.switchActiveBroker(primary.brokerId);
    this.emit('BROKER_DISCONNECTED', { brokerId, activeBrokerId: primary?.brokerId });
  }
  public switchActiveBroker(brokerId: string): boolean {
    const target = brokerId.toLowerCase();
    const previous = this.brokerMgr.getPrimaryBrokerInfo()?.brokerId?.toLowerCase();
    const success = this.brokerMgr.setPrimaryBroker(target);
    if (success) {
      this.engine.switchActiveBroker(brokerId);
      if (previous !== target) {
        this.routeGeneration += 1;
        this.historyCache.clear(); historyStore.clear();
        this.optionChainCache.clear();
        this.optionChainPromises.clear();
        this.lastTickTime.clear();
        // A broker switch is a hard data-boundary. Never allow a tick, chart
        // cache entry, or portfolio snapshot from the previous broker to
        // survive into the newly selected broker.
        this.market.clear();
        if (previous) brokerMarketDataClient.disconnect(previous);
      }
      this.emit('STATUS_CHANGED', { brokerId: target, previousBrokerId: previous, status: 'Primary Switched' });
      void this.syncPortfolio(target);
    }
    return success;
  }
  public renameConnection(brokerId: string, nickname: string): void { this.brokerMgr.renameConnection(brokerId, nickname); }
  public async refreshSession(brokerId: string): Promise<{ success: boolean; error?: string }> { const res = await this.brokerMgr.refreshSession(brokerId); if (res.success) { this.emit('SESSION_REFRESHED', { brokerId }); void this.syncPortfolio(brokerId); } return res; }
  public async testLatency(brokerId: string): Promise<number> { return this.brokerMgr.testLatency(brokerId); }
  public async testConnectivity(brokerId: string): Promise<{ success: boolean; latencyMs: number; message: string }> { return this.brokerMgr.testConnectivity(brokerId); }

  public syncPortfolio(brokerId?: string): Promise<any> {
    const targetId = (brokerId || this.brokerMgr.getPrimaryBrokerInfo()?.brokerId)?.toLowerCase();
    if (!targetId) return Promise.resolve({ funds: null, holdings: [], positions: [], orders: [], trades: [] });
    const existing = this.portfolioSyncPromises.get(targetId);
    if (existing) return existing;
    const promise = this.brokerMgr.syncPortfolio(targetId)
      .then((data) => { if (this.brokerMgr.getPrimaryBrokerInfo()?.brokerId.toLowerCase() === targetId) this.emit('PORTFOLIO_SYNCED', { ...data, brokerId: targetId }); return data; })
      .finally(() => this.portfolioSyncPromises.delete(targetId));
    this.portfolioSyncPromises.set(targetId, promise);
    return promise;
  }
  public startPortfolioPolling(intervalMs = 15000): () => void {
    this.portfolioPollRefs += 1;
    if (!this.portfolioPollTimer) { void this.syncPortfolio(); this.portfolioPollTimer = setInterval(() => { if (this.brokerMgr.getPrimaryBrokerInfo()?.status === 'Connected') void this.syncPortfolio(); }, Math.max(5000, intervalMs)); }
    return () => { this.portfolioPollRefs = Math.max(0, this.portfolioPollRefs - 1); if (this.portfolioPollRefs === 0 && this.portfolioPollTimer) { clearInterval(this.portfolioPollTimer); this.portfolioPollTimer = undefined; } };
  }
  public async placeOrder(order: OrderRequest): Promise<OrderResult> { const result = await this.engine.placeOrder(order); this.emit('ORDER_EXECUTED', result); return result; }
  public async modifyOrder(orderId: string, updates: Partial<OrderRequest>): Promise<OrderResult> { return this.engine.modifyOrder(orderId, updates); }
  public async cancelOrder(orderId: string): Promise<{ success: boolean; message?: string }> { return this.engine.cancelOrder(orderId); }
  public async squareOff(positionId: string): Promise<{ success: boolean; message?: string }> { return this.engine.squareOff(positionId); }
  public async exitAll(): Promise<{ success: boolean; closedCount: number }> { return this.engine.exitAll(); }
  public async getPositions(): Promise<Position[]> { return this.engine.getPositions(); }
  public async getHoldings(): Promise<Holding[]> { return this.engine.getHoldings(); }
  public async getFunds(): Promise<AccountFunds | null> { return this.engine.getFunds(); }
  public async getOrders(): Promise<OrderResult[]> { return this.engine.getOrders(); }
  public async getTradeHistory(): Promise<TradeRecord[]> { return this.engine.getTradeHistory(); }
  public setMarketDataProvider(type: MarketDataProviderType): void { this.currentMarketDataProviderType = type; }
  public getMarketDataProviderType(): MarketDataProviderType { return this.currentMarketDataProviderType; }
  /** Broker-routed quote snapshot used by Vela only as a last-resort seed. */
  public async getMarketQuotes(symbols: string[]): Promise<Record<string, { ltp: number; chg: string; volume: number }>> {
    let brokerInfo = this.getPrimaryBrokerInfo();
    if ((!brokerInfo || !this.getPrimaryBroker()) && this.currentMarketDataProviderType === 'CONNECTED_BROKER') {
      try { await this.restoreBrokerConnections(); } catch {}
      brokerInfo = this.getPrimaryBrokerInfo();
    }
    const broker = this.getPrimaryBroker();
    if (!broker || !brokerInfo || this.currentMarketDataProviderType !== 'CONNECTED_BROKER') return {};
    const unique = [...new Set(symbols.map(String).map((value) => value.trim()).filter(Boolean))].slice(0, 100);
    if (!unique.length) return {};
    return broker.getMarketData(unique);
  }

  public async getOptionChain(instrumentKey: string, expiryDate = 'current_week') {
    const brokerInfo = this.getPrimaryBrokerInfo();
    const broker = this.brokerMgr.getPrimaryBroker();
    if (!broker || !brokerInfo) throw new Error('Connect a broker before loading option-chain data.');
    const key = `${brokerInfo.brokerId.toLowerCase()}:${instrumentKey}:${expiryDate}`;
    const cached = this.optionChainCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    const existing = this.optionChainPromises.get(key);
    if (existing) return existing;
    const promise = broker.getOptionChain(instrumentKey, expiryDate)
      .then((data) => { this.optionChainCache.set(key, { data, expiresAt: Date.now() + 3_000 }); return data; })
      .finally(() => this.optionChainPromises.delete(key));
    this.optionChainPromises.set(key, promise);
    return promise;
  }
  public async getHistoricalData(symbol: string, timeframe: string, signal?: AbortSignal, limit = 5000): Promise<HistoricalCandle[]> {
    if (signal?.aborted) throw Object.assign(new Error('Historical request aborted'), { name: 'AbortError' });
    // A chart can mount while the authenticated broker session is still being
    // rehydrated. The old implementation returned [] in that race, which made
    // the chart permanently initialize without candles. Wait for restoration
    // before deciding that historical data is unavailable.
    let brokerInfo = this.getPrimaryBrokerInfo();
    if ((!brokerInfo || !this.getPrimaryBroker()) && this.currentMarketDataProviderType === 'CONNECTED_BROKER') {
      try { await this.restoreBrokerConnections(); } catch {}
      brokerInfo = this.getPrimaryBrokerInfo();
    }

    let broker = this.getPrimaryBroker();
    let brokerId = brokerInfo?.brokerId?.toLowerCase();
    if (!broker || !brokerId || this.currentMarketDataProviderType !== 'CONNECTED_BROKER') return [];

    const requestedLimit = Math.max(2, Math.min(5000, Math.floor(Number(limit) || 5000)));
    const key = `${brokerId}:${symbol}:${timeframe}:initial-progressive-v15:${requestedLimit}`;
    const storeCached = historyStore.get(brokerId, symbol, timeframe);
    if (storeCached?.length) return storeCached.slice(-requestedLimit);
    const cached = this.historyCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return historyStore.set(brokerId, symbol, timeframe, cached.data).slice(-requestedLimit);

    // Do not silently convert a broker switch into an empty history result.
    // If the active broker changed while the request was in flight, retry once
    // against the new primary broker.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const generationAtStart = this.routeGeneration;
      const requestBrokerId = brokerId;
      const requestBroker = broker;
      try {
        if (signal?.aborted) throw Object.assign(new Error('Historical request aborted'), { name: 'AbortError' });
        const rows = await requestBroker.getHistoricalData(symbol, timeframe, signal, requestedLimit);
        if (signal?.aborted) throw Object.assign(new Error('Historical request aborted'), { name: 'AbortError' });
        const activeBrokerId = this.getPrimaryBrokerInfo()?.brokerId?.toLowerCase();
        if (generationAtStart !== this.routeGeneration || activeBrokerId !== requestBrokerId) {
          brokerInfo = this.getPrimaryBrokerInfo();
          broker = this.getPrimaryBroker();
          brokerId = brokerInfo?.brokerId?.toLowerCase();
          if (attempt === 0 && broker && brokerId) continue;
          return [];
        }

        const byTime = new Map<number, HistoricalCandle>();
        const epochMs = (raw: unknown): number => {
          const numeric = typeof raw === 'number' ? raw : Number(raw);
          if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
          const parsed = Date.parse(String(raw ?? ''));
          return Number.isFinite(parsed) ? parsed : 0;
        };
        for (const row of rows || []) {
          const time = epochMs((row as any)?.timestamp);
          if (!time || ![row.open, row.high, row.low, row.close].every((v) => Number.isFinite(Number(v)))) continue;
          byTime.set(time, row);
        }
        const history = [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row).slice(-requestedLimit);
        if (history.length) { historyStore.set(brokerId, symbol, timeframe, history); this.historyCache.set(key, { data: history, expiresAt: Date.now() + 120_000 }); }
        coreEventBus.emit('market.history.loaded', { symbol, timeframe, count: history.length, timestamp: Date.now() });
        return history;
      } catch (error) {
        if (attempt === 1) throw error;
      }
    }
    return [];
  }

  public async prefetchHistoricalData(symbols: string[], timeframe: string): Promise<void> {
    const brokerInfo = this.getPrimaryBrokerInfo();
    const brokerId = brokerInfo?.brokerId?.toLowerCase();
    if (!brokerId || this.currentMarketDataProviderType !== 'CONNECTED_BROKER') return;
    const unique = [...new Set(symbols.map(String).filter(Boolean))].slice(0, 8);
    await Promise.all(unique.map(async symbol => { if (historyStore.get(brokerId, symbol, timeframe)?.length) return; try { await this.getHistoricalData(symbol, timeframe); } catch {} }));
  }

  /**
   * Compact history path for native Vela loads. No candle objects are created in the
   * browser before the chart receives its OHLCV columns.
   */
  public async getHistoricalDataColumns(symbol: string, timeframe: string, signal?: AbortSignal, limit = 5000, beforeTimestamp?: number | string): Promise<HistoricalCandleColumns | null> {
    if (signal?.aborted) throw Object.assign(new Error('Historical request aborted'), { name: 'AbortError' });
    let brokerInfo = this.getPrimaryBrokerInfo();
    if ((!brokerInfo || !this.getPrimaryBroker()) && this.currentMarketDataProviderType === 'CONNECTED_BROKER') {
      try { await this.restoreBrokerConnections(); } catch {}
      brokerInfo = this.getPrimaryBrokerInfo();
    }
    const broker = this.getPrimaryBroker();
    const brokerId = brokerInfo?.brokerId?.toLowerCase();
    if (!broker || !brokerId || this.currentMarketDataProviderType !== 'CONNECTED_BROKER') return null;
    const requestedLimit = Math.max(100, Math.min(5000, Math.floor(Number(limit) || 5000)));

    // Prefer the compact broker-native path, but never let an empty/unsupported
    // column response strand Vela with a blank chart when the ordinary history API
    // can return usable candles. The conversion happens once at this boundary.
    if (broker.getHistoricalDataColumns) {
      try {
        const columns = await broker.getHistoricalDataColumns(symbol, timeframe, signal, requestedLimit, beforeTimestamp);
        if (columns && columns.time.length > 0) return columns;
      } catch (error) {
        if ((error as { name?: string })?.name === 'AbortError' || signal?.aborted) throw error;
        coreEventBus.emit('market.history.error', {
          symbol, timeframe, brokerId,
          diagnostic: {
            code: classifyHistoricalProviderError(error),
            message: String((error as { message?: string })?.message ?? error),
            occurredAt: Date.now(),
            fallbackAttempted: true,
          } satisfies Omit<HistoricalProviderDiagnostic, 'symbol' | 'timeframe' | 'brokerId'>,
          timestamp: Date.now(),
        });
        // Keep the object-history compatibility fallback, but preserve the
        // provider failure so the UI can explain degraded loads.
      }
    }

    try {
      const rows = await broker.getHistoricalData(symbol, timeframe, signal, requestedLimit);
      if (!rows.length) {
        coreEventBus.emit('market.history.error', {
          symbol, timeframe, brokerId,
          diagnostic: {
            code: 'no_data' satisfies HistoricalProviderErrorCode,
            message: 'The provider returned no historical candles for this symbol and timeframe.',
            occurredAt: Date.now(),
            fallbackAttempted: false,
          } satisfies Omit<HistoricalProviderDiagnostic, 'symbol' | 'timeframe' | 'brokerId'>,
          timestamp: Date.now(),
        });
        return null;
      }
      const beforeMs = beforeTimestamp == null
        ? Number.POSITIVE_INFINITY
        : (() => {
            const numeric = Number(beforeTimestamp);
            if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
            const parsed = Date.parse(String(beforeTimestamp));
            return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
          })();
      const ordered = [...rows]
        .sort((a, b) => Date.parse(String(a.timestamp)) - Date.parse(String(b.timestamp)))
        .filter((row) => Date.parse(String(row.timestamp)) < beforeMs)
        .slice(-requestedLimit);
      if (!ordered.length) {
        coreEventBus.emit('market.history.error', {
          symbol, timeframe, brokerId,
          diagnostic: {
            code: 'no_data' satisfies HistoricalProviderErrorCode,
            message: 'The provider returned candles, but none matched the requested time boundary after normalization.',
            occurredAt: Date.now(),
            fallbackAttempted: Boolean(broker.getHistoricalDataColumns),
          } satisfies Omit<HistoricalProviderDiagnostic, 'symbol' | 'timeframe' | 'brokerId'>,
          timestamp: Date.now(),
        });
        return null;
      }
      return {
        time: ordered.map(row => epochMs((row as any)?.timestamp)),
        open: ordered.map(row => Number(row.open)),
        high: ordered.map(row => Number(row.high)),
        low: ordered.map(row => Number(row.low)),
        close: ordered.map(row => Number(row.close)),
        volume: ordered.map(row => Number(row.volume) || 0),
        timeUnit: 'milliseconds',
        source: ordered.map(row => row.source === 'fyers' || row.source === 'tvdatafeed' ? row.source : 'unknown'),
        phase: ordered.map(row => row.phase === 'historical' || row.phase === 'confirmed' || row.phase === 'developing' || row.phase === 'realtime' || row.phase === 'forecast' ? row.phase : 'historical'),
        confirmed: ordered.map(row => row.confirmed === true),
        availableAt: ordered.map(row => {
          const raw = row.availableAt;
          const numeric = typeof raw === 'number' ? raw : Number(raw);
          if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? numeric : numeric * 1000;
          const parsed = Date.parse(String(raw ?? ''));
          return Number.isFinite(parsed) ? parsed : Number.NaN;
        }),
        revision: ordered.map(row => typeof row.revision === 'number' && Number.isSafeInteger(row.revision) && row.revision >= 0 ? row.revision : Number.NaN),
      };
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError' || signal?.aborted) throw error;
      coreEventBus.emit('market.history.error', {
        symbol, timeframe, brokerId,
        diagnostic: {
          code: classifyHistoricalProviderError(error),
          message: String((error as { message?: string })?.message ?? error),
          occurredAt: Date.now(),
          fallbackAttempted: false,
        } satisfies Omit<HistoricalProviderDiagnostic, 'symbol' | 'timeframe' | 'brokerId'>,
        timestamp: Date.now(),
      });
      return null;
    }
  }

  public async getHistoricalDataBefore(symbol: string, timeframe: string, beforeTimestamp: string, limit = 5000): Promise<HistoricalCandle[]> {
    const brokerInfo = this.getPrimaryBrokerInfo();
    const broker = this.getPrimaryBroker();
    const brokerId = brokerInfo?.brokerId?.toLowerCase();
    if (!broker || !brokerId || this.currentMarketDataProviderType !== 'CONNECTED_BROKER') return [];
    const requestedLimit = Math.max(2, Math.min(5000, Math.floor(Number(limit) || 5000)));
    const key = brokerId + ':' + symbol + ':' + timeframe + ':' + beforeTimestamp + ':' + requestedLimit;
    const cached = this.olderHistoryCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    const existing = this.olderHistoryInflight.get(key);
    if (existing) return existing;
    const storeBefore = historyStore.getBefore(brokerId, symbol, timeframe, beforeTimestamp, requestedLimit);
    if (storeBefore.length >= Math.min(50, requestedLimit)) {
      this.olderHistoryCache.set(key, { data: storeBefore, expiresAt: Date.now() + 30_000 });
      return storeBefore;
    }
    if (!broker.getHistoricalDataBefore) return [];
    const generationAtStart = this.routeGeneration;
    const task = broker.getHistoricalDataBefore(symbol, timeframe, beforeTimestamp, requestedLimit)
      .then(rows => {
        if (generationAtStart !== this.routeGeneration || this.getPrimaryBrokerInfo()?.brokerId?.toLowerCase() !== brokerId) return [];
        const byTime = new Map<number, HistoricalCandle>();
        for (const row of rows || []) {
          const raw = (row as any)?.timestamp;
          const parsed = typeof raw === 'number' ? raw : Date.parse(String(raw));
          const time = Number.isFinite(parsed) ? (parsed > 1e12 ? parsed : parsed * 1000) : 0;
          if (!time || ![row.open, row.high, row.low, row.close].every((v) => Number.isFinite(Number(v)))) continue;
          byTime.set(time, row);
        }
        const normalized = [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
        if (normalized.length) {
          historyStore.mergeInto(brokerId, symbol, timeframe, normalized, 50_000);
          this.olderHistoryCache.set(key, { data: normalized, expiresAt: Date.now() + 30_000 });
        }
        return normalized;
      })
      .finally(() => this.olderHistoryInflight.delete(key));
    this.olderHistoryInflight.set(key, task);
    return task;
  }

  public subscribeTicks(symbols: string[], callback: (tick: any) => void): () => void { return this.subscribeMarketData(symbols, (event) => { if (event.type === 'tick' && event.tick) callback(event.tick); }); }
  public subscribeMarketData(instrumentKeys: string[], listener: (event: MarketFeedEvent) => void, depthInstrumentKey?: string): () => void {
    let initial = this.getPrimaryBrokerInfo();
    let stopped = false;
    let stopFeed: (() => void) | undefined;
    let stopBrokerSwitch: (() => void) | undefined;
    const start = async () => {
      if (!initial || initial.status !== 'Connected') {
        listener({ type: 'status', status: 'connecting' });
        coreEventBus.emit('market.status', { brokerId: initial?.brokerId, status: 'connecting', timestamp: Date.now() });
        try { await this.restoreBrokerConnections(); } catch { /* surfaced below */ }
        if (stopped) return;
        initial = this.getPrimaryBrokerInfo();
      }
      if (!initial || initial.status !== 'Connected') {
        listener({ type: 'error', error: 'Broker session is not ready for live market data. Open Broker Settings and Sync All.' });
        coreEventBus.emit('market.error', { brokerId: initial?.brokerId, message: 'Broker session is not ready for live market data. Open Broker Settings and Sync All.', timestamp: Date.now() });
        listener({ type: 'status', status: 'disconnected' });
        coreEventBus.emit('market.status', { brokerId: initial?.brokerId, status: 'disconnected', timestamp: Date.now() });
        return;
      }
      const relay = (event: MarketFeedEvent) => {
        // Ignore late frames from a broker socket that was already replaced.
        const activeNow = this.getPrimaryBrokerInfo()?.brokerId?.toLowerCase();
        if (activeNow !== currentBrokerId.toLowerCase()) return;
        if (event.type === 'status') {
          coreEventBus.emit('market.status', { brokerId: currentBrokerId, status: event.status, timestamp: Date.now() });
        }
        if (event.type === 'error') {
          coreEventBus.emit('market.error', { brokerId: currentBrokerId, message: event.error, timestamp: Date.now() });
        }
        if (event.type === 'tick' && event.tick) {
          const key = String(event.tick.instrumentKey || '');
          const raw = (event.tick as any).lastTradeTimestamp ?? (event.tick as any).receivedAt ?? (event.tick as any).timestamp;
          const numericRaw = typeof raw === 'number' ? raw : Number(raw);
          const parsed = Number.isFinite(numericRaw) ? (numericRaw > 1e12 ? numericRaw : numericRaw * 1000) : Date.parse(String(raw));
          const timestamp = Number.isFinite(parsed) ? (parsed > 1e12 ? parsed : parsed * 1000) : Date.now();
          // Never drop a live price solely because the broker's exchange
          // timestamp is older than the previous packet. FYERS can emit
          // snapshots/updates with a non-monotonic last-trade timestamp while
          // the packet itself is fresh. Dropping that packet makes the chart
          // appear frozen even though the transport is alive. Transport order
          // is the authoritative order for live UI updates.
          if (key) this.lastTickTime.set(key, Date.now());
          this.market.set(event.tick.instrumentKey, event.tick);
          this.emit('TICK_UPDATE', event.tick);
          coreEventBus.emit('market.tick', { symbol: String(event.tick.instrumentKey || ''), tick: event.tick as unknown as Record<string, unknown>, brokerId: currentBrokerId, receivedAt: Date.now() });
        }
        listener(event);
        this.marketListeners.forEach((subscriber) => subscriber(event));
      };
      let currentBrokerId = initial.brokerId;
      stopFeed = brokerMarketDataClient.subscribe(currentBrokerId, instrumentKeys, relay, depthInstrumentKey);
      stopBrokerSwitch = this.on('STATUS_CHANGED', (event: any) => {
        if (event?.status !== 'Primary Switched') return;
        const next = this.getPrimaryBrokerInfo();
        if (!next || next.brokerId === currentBrokerId || next.status !== 'Connected') return;
        stopFeed?.();
        currentBrokerId = next.brokerId;
        listener({ type: 'status', status: 'reconnecting' });
        stopFeed = brokerMarketDataClient.subscribe(currentBrokerId, instrumentKeys, relay, depthInstrumentKey);
      });
    };
    void start();
    return () => { stopped = true; stopBrokerSwitch?.(); stopFeed?.(); };
  }
  public getMarketSnapshot(instrumentKey: string): NormalizedMarketTick | undefined { return this.market.get(instrumentKey); }
  public on(event: RuntimeEvent, listener: EventListener): () => void { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event)!.add(listener); return () => this.listeners.get(event)?.delete(listener); }
  private emit(event: RuntimeEvent, payload: any): void { this.listeners.get(event)?.forEach((fn) => fn(payload)); }
}

export const tradingCoreRuntime = TradingCoreRuntime.getInstance();

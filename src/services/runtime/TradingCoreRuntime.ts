import { brokerManager, BrokerManager, BrokerConnectionInfo } from '../brokers/BrokerManager';
import { tradingEngine, TradingEngine } from '../engine/TradingEngine';
import { BrokerAdapter, OrderRequest, OrderResult, Position, Holding, AccountFunds, HistoricalCandle, TradeRecord } from '../brokers/BrokerAdapter';
import { brokerMarketDataClient } from '../marketData/BrokerMarketDataClient';
import { MarketFeedEvent, NormalizedMarketTick } from '../../types/market';

export type RuntimeEvent = 'BROKER_CONNECTED' | 'BROKER_DISCONNECTED' | 'ORDER_EXECUTED' | 'TICK_UPDATE' | 'PORTFOLIO_SYNCED' | 'SESSION_REFRESHED' | 'STATUS_CHANGED';
export type EventListener = (payload: any) => void;
export type MarketDataProviderType = 'CONNECTED_BROKER';

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
  private historyCache = new Map<string, { expiresAt: number; data: HistoricalCandle[] }>();
  private routeGeneration = 0;
  private lastTickTime = new Map<string, number>();

  private constructor() {}
  public static getInstance(): TradingCoreRuntime { if (!TradingCoreRuntime.instance) TradingCoreRuntime.instance = new TradingCoreRuntime(); return TradingCoreRuntime.instance; }
  public hasConnectedBroker(): boolean { return this.brokerMgr.getAllConnections().length > 0; }
  public getPrimaryBroker(): BrokerAdapter | null { return this.brokerMgr.getPrimaryBroker(); }
  public getPrimaryBrokerInfo(): BrokerConnectionInfo | null { return this.brokerMgr.getPrimaryBrokerInfo(); }
  public getAllConnections(): BrokerConnectionInfo[] { return this.brokerMgr.getAllConnections(); }

  public restoreBrokerConnections(): Promise<void> {
    if (this.brokerRestorePromise) return this.brokerRestorePromise;
    this.brokerRestorePromise = (async () => {
      await this.brokerMgr.restoreServerConnections();
      for (const connection of this.brokerMgr.getAllConnections()) this.engine.registerRestoredBroker(connection.adapter);
      const primary = this.brokerMgr.getPrimaryBrokerInfo();
      if (primary) { this.engine.switchActiveBroker(primary.brokerId); this.emit('STATUS_CHANGED', { brokerId: primary.brokerId, status: 'Restored' }); }
    })().finally(() => { this.brokerRestorePromise = undefined; });
    return this.brokerRestorePromise;
  }

  public async connectBrokerOAuth(brokerId: string, authCode?: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.brokerMgr.connectOAuth(brokerId, authCode);
    if (res.success) { this.routeGeneration += 1; this.historyCache.clear(); this.lastTickTime.clear(); this.switchActiveBroker(brokerId); this.emit('BROKER_CONNECTED', { brokerId, method: 'OAuth' }); void this.syncPortfolio(brokerId); }
    return res;
  }
  public async connectBrokerApiKeys(brokerId: string, credentials: any): Promise<{ success: boolean; error?: string }> {
    const res = await this.brokerMgr.connectApiKeys(brokerId, credentials);
    if (res.success) { this.routeGeneration += 1; this.historyCache.clear(); this.lastTickTime.clear(); this.switchActiveBroker(brokerId); this.emit('BROKER_CONNECTED', { brokerId, method: 'ApiKeys' }); void this.syncPortfolio(brokerId); }
    return res;
  }
  public async disconnectBroker(brokerId: string): Promise<void> {
    this.routeGeneration += 1;
    this.historyCache.clear();
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
        this.historyCache.clear();
        this.lastTickTime.clear();
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
  public startPortfolioPolling(intervalMs = 5000): () => void {
    this.portfolioPollRefs += 1;
    if (!this.portfolioPollTimer) { void this.syncPortfolio(); this.portfolioPollTimer = setInterval(() => { if (this.brokerMgr.getPrimaryBrokerInfo()?.status === 'Connected') void this.syncPortfolio(); }, Math.max(2500, intervalMs)); }
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
  public async getOptionChain(instrumentKey: string, expiryDate = 'current_week') { const broker = this.brokerMgr.getPrimaryBroker(); if (!broker) throw new Error('Connect a broker before loading option-chain data.'); return broker.getOptionChain(instrumentKey, expiryDate); }
  public async getHistoricalData(symbol: string, timeframe: string): Promise<HistoricalCandle[]> {
    const brokerInfo = this.getPrimaryBrokerInfo();
    const broker = this.getPrimaryBroker();
    const brokerId = brokerInfo?.brokerId?.toLowerCase();
    if (!broker || !brokerId || this.currentMarketDataProviderType !== 'CONNECTED_BROKER') return [];
    const key = `${brokerId}:${symbol}:${timeframe}:25000`;
    const cached = this.historyCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    const generationAtStart = this.routeGeneration;
    const rows = await broker.getHistoricalData(symbol, timeframe);
    if (generationAtStart !== this.routeGeneration || this.getPrimaryBrokerInfo()?.brokerId?.toLowerCase() !== brokerId) return [];
    const byTime = new Map<number, HistoricalCandle>();
    for (const row of rows || []) {
      const raw = (row as any)?.timestamp;
      const parsed = typeof raw === 'number' ? raw : Date.parse(String(raw));
      const time = Number.isFinite(parsed) ? (parsed > 1e12 ? parsed : parsed * 1000) : 0;
      if (!time || ![row.open, row.high, row.low, row.close].every((v) => Number.isFinite(Number(v)))) continue;
      byTime.set(time, row);
    }
    const history = [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row).slice(-25_000);
    if (history.length) this.historyCache.set(key, { data: history, expiresAt: Date.now() + 30_000 });
    return history;
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
        try { await this.restoreBrokerConnections(); } catch { /* surfaced below */ }
        if (stopped) return;
        initial = this.getPrimaryBrokerInfo();
      }
      if (!initial || initial.status !== 'Connected') {
        listener({ type: 'error', error: 'Broker session is not ready for live market data. Open Broker Settings and Sync All.' });
        listener({ type: 'status', status: 'disconnected' });
        return;
      }
      const relay = (event: MarketFeedEvent) => {
        const activeNow = this.getPrimaryBrokerInfo()?.brokerId?.toLowerCase();
        if (activeNow !== currentBrokerId.toLowerCase()) return;
        if (event.type === 'tick' && event.tick) {
          const key = String(event.tick.instrumentKey || '');
          const raw = (event.tick as any).timestamp;
          const parsed = typeof raw === 'number' ? raw : Date.parse(String(raw));
          const timestamp = Number.isFinite(parsed) ? (parsed > 1e12 ? parsed : parsed * 1000) : Date.now();
          const previous = this.lastTickTime.get(key) || 0;
          if (key && timestamp < previous) return;
          if (key) this.lastTickTime.set(key, timestamp);
          this.market.set(event.tick.instrumentKey, event.tick);
          this.emit('TICK_UPDATE', event.tick);
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

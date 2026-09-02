import { brokerManager, BrokerManager, BrokerConnectionInfo } from '../brokers/BrokerManager';
import { tradingEngine, TradingEngine } from '../engine/TradingEngine';
import {
  BrokerAdapter,
  OrderRequest,
  OrderResult,
  Position,
  Holding,
  AccountFunds,
  HistoricalCandle,
  TradeRecord,
} from '../brokers/BrokerAdapter';
import { upstoxMarketDataClient } from '../marketData/UpstoxMarketDataClient';
import { MarketFeedEvent, MarketFeedStatus, NormalizedMarketTick } from '../../types/market';

export type RuntimeEvent =
  | 'BROKER_CONNECTED'
  | 'BROKER_DISCONNECTED'
  | 'ORDER_EXECUTED'
  | 'TICK_UPDATE'
  | 'PORTFOLIO_SYNCED'
  | 'SESSION_REFRESHED'
  | 'STATUS_CHANGED';

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
  private portfolioSyncPromise?: Promise<any>;
  private portfolioPollTimer?: ReturnType<typeof setInterval>;
  private portfolioPollRefs = 0;

  private constructor() {}

  public static getInstance(): TradingCoreRuntime {
    if (!TradingCoreRuntime.instance) {
      TradingCoreRuntime.instance = new TradingCoreRuntime();
    }
    return TradingCoreRuntime.instance;
  }

  public hasConnectedBroker(): boolean {
    return this.brokerMgr.getAllConnections().length > 0;
  }

  // --- Broker Manager Delegations ---
  public getPrimaryBroker(): BrokerAdapter | null {
    return this.brokerMgr.getPrimaryBroker();
  }

  public getPrimaryBrokerInfo(): BrokerConnectionInfo | null {
    return this.brokerMgr.getPrimaryBrokerInfo();
  }

  public getAllConnections(): BrokerConnectionInfo[] {
    return this.brokerMgr.getAllConnections();
  }

  public restoreBrokerConnections(): Promise<void> {
    if (this.brokerRestorePromise) return this.brokerRestorePromise;
    this.brokerRestorePromise = (async () => {
      await this.brokerMgr.restoreServerConnections();
      for (const connection of this.brokerMgr.getAllConnections()) {
        this.engine.registerRestoredBroker(connection.adapter);
      }
      const primary = this.brokerMgr.getPrimaryBrokerInfo();
      if (primary) {
        this.engine.switchActiveBroker(primary.brokerId);
        this.emit('STATUS_CHANGED', { brokerId: primary.brokerId, status: 'Restored' });
      }
    })().finally(() => {
      this.brokerRestorePromise = undefined;
    });
    return this.brokerRestorePromise;
  }

  public async connectBrokerOAuth(brokerId: string, authCode?: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.brokerMgr.connectOAuth(brokerId, authCode);
    if (res.success) {
      this.emit('BROKER_CONNECTED', { brokerId, method: 'OAuth' });
      // The OAuth callback already proved and persisted the broker session.
      // Do not block the connect UX on five portfolio REST calls. Warm it in the background.
      void this.syncPortfolio(brokerId);
    }
    return res;
  }

  public async connectBrokerApiKeys(brokerId: string, credentials: any): Promise<{ success: boolean; error?: string }> {
    const res = await this.brokerMgr.connectApiKeys(brokerId, credentials);
    if (res.success) {
      this.emit('BROKER_CONNECTED', { brokerId, method: 'ApiKeys' });
      void this.syncPortfolio(brokerId);
    }
    return res;
  }

  public async disconnectBroker(brokerId: string): Promise<void> {
    if (brokerId.toLowerCase() === 'upstox') upstoxMarketDataClient.disconnect();
    await this.brokerMgr.disconnect(brokerId);
    this.emit('BROKER_DISCONNECTED', { brokerId });
  }

  public switchActiveBroker(brokerId: string): boolean {
    const success = this.brokerMgr.setPrimaryBroker(brokerId);
    if (success) {
      this.engine.switchActiveBroker(brokerId);
      this.emit('STATUS_CHANGED', { brokerId, status: 'Primary Switched' });
    }
    return success;
  }

  public renameConnection(brokerId: string, nickname: string): void {
    this.brokerMgr.renameConnection(brokerId, nickname);
  }

  public async refreshSession(brokerId: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.brokerMgr.refreshSession(brokerId);
    if (res.success) {
      this.emit('SESSION_REFRESHED', { brokerId });
      await this.syncPortfolio(brokerId);
    }
    return res;
  }

  public async testLatency(brokerId: string): Promise<number> {
    return this.brokerMgr.testLatency(brokerId);
  }

  public async testConnectivity(brokerId: string): Promise<{ success: boolean; latencyMs: number; message: string }> {
    return this.brokerMgr.testConnectivity(brokerId);
  }

  public syncPortfolio(brokerId?: string): Promise<any> {
    if (this.portfolioSyncPromise) return this.portfolioSyncPromise;
    this.portfolioSyncPromise = this.brokerMgr.syncPortfolio(brokerId)
      .then((data) => {
        this.emit('PORTFOLIO_SYNCED', data);
        return data;
      })
      .finally(() => {
        this.portfolioSyncPromise = undefined;
      });
    return this.portfolioSyncPromise;
  }

  /** Keep account data fresh without forcing the user to click Sync. */
  public startPortfolioPolling(intervalMs = 5000): () => void {
    this.portfolioPollRefs += 1;
    if (!this.portfolioPollTimer) {
      void this.syncPortfolio();
      this.portfolioPollTimer = setInterval(() => {
        if (this.brokerMgr.getPrimaryBrokerInfo()?.status === 'Connected') {
          void this.syncPortfolio();
        }
      }, Math.max(2500, intervalMs));
    }
    return () => {
      this.portfolioPollRefs = Math.max(0, this.portfolioPollRefs - 1);
      if (this.portfolioPollRefs === 0 && this.portfolioPollTimer) {
        clearInterval(this.portfolioPollTimer);
        this.portfolioPollTimer = undefined;
      }
    };
  }

  // --- Universal Execution Engine Delegations ---
  public async placeOrder(order: OrderRequest): Promise<OrderResult> {
    const result = await this.engine.placeOrder(order);
    this.emit('ORDER_EXECUTED', result);
    return result;
  }

  public async modifyOrder(orderId: string, updates: Partial<OrderRequest>): Promise<OrderResult> {
    return this.engine.modifyOrder(orderId, updates);
  }

  public async cancelOrder(orderId: string): Promise<{ success: boolean; message?: string }> {
    return this.engine.cancelOrder(orderId);
  }

  public async squareOff(positionId: string): Promise<{ success: boolean; message?: string }> {
    return this.engine.squareOff(positionId);
  }

  public async exitAll(): Promise<{ success: boolean; closedCount: number }> {
    return this.engine.exitAll();
  }

  public async getPositions(): Promise<Position[]> {
    return this.engine.getPositions();
  }

  public async getHoldings(): Promise<Holding[]> {
    return this.engine.getHoldings();
  }

  public async getFunds(): Promise<AccountFunds | null> {
    return this.engine.getFunds();
  }

  public async getOrders(): Promise<OrderResult[]> {
    return this.engine.getOrders();
  }

  public async getTradeHistory(): Promise<TradeRecord[]> {
    return this.engine.getTradeHistory();
  }

  // --- Market Data Provider Management ---
  public setMarketDataProvider(type: MarketDataProviderType): void {
    this.currentMarketDataProviderType = type;
  }

  public getMarketDataProviderType(): MarketDataProviderType {
    return this.currentMarketDataProviderType;
  }

  public async getOptionChain(instrumentKey: string, expiryDate = 'current_week') {
    const broker = this.brokerMgr.getPrimaryBroker();
    if (!broker) throw new Error('Connect a broker before loading option-chain data.');
    return broker.getOptionChain(instrumentKey, expiryDate);
  }

  public async getHistoricalData(symbol: string, timeframe: string): Promise<HistoricalCandle[]> {
    const activeBroker = this.brokerMgr.getPrimaryBroker();
    if (activeBroker && this.currentMarketDataProviderType === 'CONNECTED_BROKER') {
      return activeBroker.getHistoricalData(symbol, timeframe);
    }
    return [];
  }

  public subscribeTicks(symbols: string[], callback: (tick: any) => void): () => void {
    return this.subscribeMarketData(symbols, (event) => { if (event.type === 'tick' && event.tick) callback(event.tick); });
  }

  public subscribeMarketData(instrumentKeys: string[], listener: (event: MarketFeedEvent) => void): () => void {
    const broker = this.getPrimaryBroker();
    if (!broker || broker.id !== 'upstox') { listener({ type: 'error', error: 'A connected Upstox session is required for live market data' }); return () => {}; }
    const relay = (event: MarketFeedEvent) => {
      if (event.type === 'tick' && event.tick) { this.market.set(event.tick.instrumentKey, event.tick); this.emit('TICK_UPDATE', event.tick); }
      listener(event); this.marketListeners.forEach((subscriber) => subscriber(event));
    };
    return upstoxMarketDataClient.subscribe(instrumentKeys, relay);
  }

  public getMarketSnapshot(instrumentKey: string): NormalizedMarketTick | undefined { return this.market.get(instrumentKey); }

  // --- Runtime Event Bus ---
  public on(event: RuntimeEvent, listener: EventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  private emit(event: RuntimeEvent, payload: any): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((fn) => fn(payload));
    }
  }
}

export const tradingCoreRuntime = TradingCoreRuntime.getInstance();

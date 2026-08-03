import { brokerManager, BrokerManager, BrokerConnectionInfo } from '../brokers/BrokerManager';
import { tradingEngine, TradingEngine } from '../engine/TradingEngine';
import { BrokerAdapter, OrderRequest, OrderResult, Position, Holding, AccountFunds, HistoricalCandle } from '../brokers/BrokerAdapter';
import { PublicDelayedMarketDataProvider } from '../marketData/PublicDelayedMarketDataProvider';

export type RuntimeEvent = 'BROKER_CONNECTED' | 'BROKER_DISCONNECTED' | 'ORDER_EXECUTED' | 'TICK_UPDATE';

export type EventListener = (payload: any) => void;

export class TradingCoreRuntime {
  private static instance: TradingCoreRuntime;
  private brokerMgr: BrokerManager = brokerManager;
  private engine: TradingEngine = tradingEngine;
  private marketDataProvider = new PublicDelayedMarketDataProvider();
  private listeners: Map<RuntimeEvent, Set<EventListener>> = new Map();

  private constructor() {}

  public static getInstance(): TradingCoreRuntime {
    if (!TradingCoreRuntime.instance) {
      TradingCoreRuntime.instance = new TradingCoreRuntime();
    }
    return TradingCoreRuntime.instance;
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

  public async connectBrokerOAuth(brokerId: string, authCode?: string): Promise<{ success: boolean; error?: string }> {
    const res = await this.brokerMgr.connectOAuth(brokerId, authCode);
    if (res.success) {
      this.emit('BROKER_CONNECTED', { brokerId, method: 'OAuth' });
    }
    return res;
  }

  public async connectBrokerApiKeys(brokerId: string, credentials: any): Promise<{ success: boolean; error?: string }> {
    const res = await this.brokerMgr.connectApiKeys(brokerId, credentials);
    if (res.success) {
      this.emit('BROKER_CONNECTED', { brokerId, method: 'ApiKeys' });
    }
    return res;
  }

  public disconnectBroker(brokerId: string): void {
    this.brokerMgr.disconnect(brokerId);
    this.emit('BROKER_DISCONNECTED', { brokerId });
  }

  public switchActiveBroker(brokerId: string): boolean {
    return this.brokerMgr.setPrimaryBroker(brokerId);
  }

  // --- Execution Engine Delegations ---
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

  // --- Separated Market Data Stream ---
  public async getHistoricalData(symbol: string, timeframe: string): Promise<HistoricalCandle[]> {
    const activeBroker = this.brokerMgr.getPrimaryBroker();
    if (activeBroker) {
      return activeBroker.getHistoricalData(symbol, timeframe);
    }
    return [];
  }

  public subscribeTicks(symbols: string[], callback: (tick: any) => void): () => void {
    const activeBroker = this.brokerMgr.getPrimaryBroker();
    if (activeBroker) {
      return activeBroker.subscribeWebSocket(symbols, (tick) => {
        callback(tick);
        this.emit('TICK_UPDATE', tick);
      });
    }
    // Fallback in Explore Mode
    return this.marketDataProvider.subscribeTicks(symbols, (tick) => {
      callback(tick);
      this.emit('TICK_UPDATE', tick);
    });
  }

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

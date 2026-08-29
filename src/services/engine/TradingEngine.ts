import {
  BrokerAdapter,
  OrderRequest,
  OrderResult,
  Position,
  Holding,
  AccountFunds,
  HistoricalCandle,
  ApiCredentials,
  TradeRecord,
} from '../brokers/BrokerAdapter';
import { BrokerAdapterRegistry } from '../brokers/adapters';

export class TradingEngine {
  private static instance: TradingEngine;
  private activeBrokerAdapter: BrokerAdapter | null = null;
  private connectedAdapters: Map<string, BrokerAdapter> = new Map();

  private constructor() {}

  public static getInstance(): TradingEngine {
    if (!TradingEngine.instance) {
      TradingEngine.instance = new TradingEngine();
    }
    return TradingEngine.instance;
  }

  public getActiveBroker(): BrokerAdapter | null {
    return this.activeBrokerAdapter;
  }

  public getConnectedBrokers(): BrokerAdapter[] {
    return Array.from(this.connectedAdapters.values());
  }

  public async connectBrokerOAuth(brokerId: string, authCode?: string): Promise<{ success: boolean; error?: string }> {
    const adapter = BrokerAdapterRegistry.getAdapter(brokerId);
    if (!adapter) {
      return { success: false, error: `Broker adapter ${brokerId} not found.` };
    }

    const res = await adapter.authenticateOAuth(authCode);
    if (res.success) {
      this.connectedAdapters.set(adapter.id, adapter);
      if (!this.activeBrokerAdapter) {
        this.activeBrokerAdapter = adapter;
      }
      return { success: true };
    }
    return { success: false, error: res.error || 'Authentication failed' };
  }

  public async connectBrokerApiKeys(brokerId: string, credentials: ApiCredentials): Promise<{ success: boolean; error?: string }> {
    const adapter = BrokerAdapterRegistry.getAdapter(brokerId);
    if (!adapter) {
      return { success: false, error: `Broker adapter ${brokerId} not found.` };
    }

    const validation = await adapter.validateApiKeys(credentials);
    if (!validation.isValid) {
      return { success: false, error: validation.message || 'Invalid credentials' };
    }

    const saveRes = await adapter.saveApiKeys(credentials);
    if (saveRes.success) {
      this.connectedAdapters.set(adapter.id, adapter);
      if (!this.activeBrokerAdapter) {
        this.activeBrokerAdapter = adapter;
      }
      return { success: true };
    }
    return { success: false, error: saveRes.error || 'Failed to save credentials' };
  }

  public switchActiveBroker(brokerId: string): boolean {
    const adapter = this.connectedAdapters.get(brokerId.toLowerCase());
    if (adapter) {
      this.activeBrokerAdapter = adapter;
      return true;
    }
    return false;
  }

  public disconnectBroker(brokerId: string): void {
    const id = brokerId.toLowerCase();
    this.connectedAdapters.delete(id);
    if (this.activeBrokerAdapter?.id === id) {
      const remaining = Array.from(this.connectedAdapters.values());
      this.activeBrokerAdapter = remaining.length > 0 ? remaining[0] : null;
    }
  }

  // --- Universal Abstracted Execution API ---
  public async placeOrder(order: OrderRequest): Promise<OrderResult> {
    if (!this.activeBrokerAdapter) {
      return {
        orderId: '',
        status: 'REJECTED',
        message: 'No live broker connected. Connect a broker to execute trades.',
        timestamp: new Date().toISOString(),
      };
    }
    return this.activeBrokerAdapter.placeOrder(order);
  }

  public async modifyOrder(orderId: string, updates: Partial<OrderRequest>): Promise<OrderResult> {
    if (!this.activeBrokerAdapter) {
      return {
        orderId,
        status: 'REJECTED',
        message: 'No live broker connected.',
        timestamp: new Date().toISOString(),
      };
    }
    return this.activeBrokerAdapter.modifyOrder(orderId, updates);
  }

  public async cancelOrder(orderId: string): Promise<{ success: boolean; message?: string }> {
    if (!this.activeBrokerAdapter) {
      return { success: false, message: 'No live broker connected.' };
    }
    return this.activeBrokerAdapter.cancelOrder(orderId);
  }

  public async squareOff(positionId: string): Promise<{ success: boolean; message?: string }> {
    if (!this.activeBrokerAdapter) {
      return { success: false, message: 'No live broker connected.' };
    }
    return this.activeBrokerAdapter.squareOff(positionId);
  }

  public async exitAll(): Promise<{ success: boolean; closedCount: number }> {
    if (!this.activeBrokerAdapter) {
      return { success: false, closedCount: 0 };
    }
    return this.activeBrokerAdapter.exitAll();
  }

  public async getPositions(): Promise<Position[]> {
    if (!this.activeBrokerAdapter) {
      return [];
    }
    return this.activeBrokerAdapter.fetchPositions();
  }

  public async getHoldings(): Promise<Holding[]> {
    if (!this.activeBrokerAdapter) {
      return [];
    }
    return this.activeBrokerAdapter.fetchHoldings();
  }

  public async getFunds(): Promise<AccountFunds | null> {
    if (!this.activeBrokerAdapter) {
      return null;
    }
    return this.activeBrokerAdapter.fetchFunds();
  }

  public async getOrders(): Promise<OrderResult[]> {
    if (!this.activeBrokerAdapter) {
      return [];
    }
    return this.activeBrokerAdapter.fetchOrders();
  }

  public async getTradeHistory(): Promise<TradeRecord[]> {
    if (!this.activeBrokerAdapter) {
      return [];
    }
    return this.activeBrokerAdapter.fetchTradeHistory();
  }

  public async getHistoricalData(symbol: string, timeframe: string): Promise<HistoricalCandle[]> {
    if (this.activeBrokerAdapter) {
      return this.activeBrokerAdapter.getHistoricalData(symbol, timeframe);
    }
    // Fallback if no active broker
    return [];
  }

  public subscribeTicks(symbols: string[], callback: (tick: any) => void): () => void {
    if (this.activeBrokerAdapter) {
      return this.activeBrokerAdapter.subscribeWebSocket(symbols, callback);
    }
    return () => {};
  }
}

export const tradingEngine = TradingEngine.getInstance();

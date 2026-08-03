import {
  BrokerAdapter,
  OrderRequest,
  OrderResult,
  Position,
  Holding,
  AccountFunds,
  ApiCredentials,
  HistoricalCandle,
  BrokerCapabilities,
} from './BrokerAdapter';

export abstract class BaseBrokerAdapter implements BrokerAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  readonly supportsOAuth: boolean = true;
  readonly supportsAPIKeys: boolean = true;
  abstract readonly supportedSegments: string[];
  readonly developerPortalUrl?: string = 'https://developer.fyers.in';

  readonly capabilities: BrokerCapabilities = {
    supportsOptions: true,
    supportsCommodities: true,
    supportsGTT: true,
    supportsBracketOrders: true,
    supportsBasketOrders: true,
    supportsMarginTrading: true,
  };

  protected isAuthenticated: boolean = false;
  protected credentials: ApiCredentials | null = null;

  async authenticateOAuth(authCode?: string): Promise<{ success: boolean; sessionToken?: string; error?: string }> {
    this.isAuthenticated = true;
    return {
      success: true,
      sessionToken: `token_${this.id}_${Date.now()}`,
    };
  }

  async saveApiKeys(credentials: ApiCredentials): Promise<{ success: boolean; error?: string }> {
    if (!credentials.apiKey) {
      return { success: false, error: 'API Key is required.' };
    }
    this.credentials = credentials;
    this.isAuthenticated = true;
    return { success: true };
  }

  async validateApiKeys(credentials: ApiCredentials): Promise<{ isValid: boolean; message?: string }> {
    if (!credentials.apiKey) {
      return { isValid: false, message: 'API Key missing.' };
    }
    if (!credentials.apiSecret) {
      return { isValid: false, message: 'API Secret missing.' };
    }
    return { isValid: true, message: 'Credentials validated successfully.' };
  }

  async fetchProfile(): Promise<{ userId: string; name: string; email: string; broker: string }> {
    return {
      userId: `USR_${this.id.toUpperCase()}_892`,
      name: 'Trader Account',
      email: 'trader@tradingcore.io',
      broker: this.name,
    };
  }

  async fetchFunds(): Promise<AccountFunds> {
    return {
      totalCapital: 1000000,
      availableMargin: 750000,
      usedMargin: 250000,
      collateralMargin: 150000,
    };
  }

  async fetchHoldings(): Promise<Holding[]> {
    return [
      {
        id: 'h1',
        symbol: 'RELIANCE',
        quantity: 50,
        avgPrice: 2850.0,
        ltp: 2980.0,
        pnl: 6500.0,
        dayChange: 0.42,
      },
      {
        id: 'h2',
        symbol: 'INFY',
        quantity: 100,
        avgPrice: 1580.0,
        ltp: 1620.8,
        pnl: 4080.0,
        dayChange: 1.1,
      },
    ];
  }

  async fetchPositions(): Promise<Position[]> {
    return [
      {
        id: 'p1',
        symbol: 'BANKNIFTY',
        quantity: 15,
        avgPrice: 310.0,
        ltp: 315.0,
        pnl: 750.0,
        product: 'MIS',
      },
    ];
  }

  async fetchOrders(): Promise<OrderResult[]> {
    return [
      {
        orderId: `ORD_${this.id.toUpperCase()}_1001`,
        status: 'COMPLETE',
        message: 'Executed BUY 15 Qty BANKNIFTY',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
    ];
  }

  async getMarketData(symbols: string[]): Promise<Record<string, { ltp: number; chg: string; volume: number }>> {
    const mockData: Record<string, { ltp: number; chg: string; volume: number }> = {};
    symbols.forEach((sym) => {
      mockData[sym] = {
        ltp: Math.floor(Math.random() * 2000) + 100,
        chg: '+0.85%',
        volume: 1250000,
      };
    });
    return mockData;
  }

  async getHistoricalData(symbol: string, timeframe: string): Promise<HistoricalCandle[]> {
    const candles: HistoricalCandle[] = [];
    let basePrice = 48000;
    const now = Date.now();
    for (let i = 30; i >= 0; i--) {
      const time = new Date(now - i * 86400000).toISOString();
      const open = basePrice + (Math.random() - 0.5) * 200;
      const close = open + (Math.random() - 0.48) * 300;
      const high = Math.max(open, close) + Math.random() * 100;
      const low = Math.min(open, close) - Math.random() * 100;
      candles.push({
        timestamp: time,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume: Math.floor(Math.random() * 500000) + 100000,
      });
      basePrice = close;
    }
    return candles;
  }

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    if (!this.isAuthenticated) {
      return {
        orderId: '',
        status: 'REJECTED',
        message: 'Broker connection required to execute live trades.',
        timestamp: new Date().toISOString(),
      };
    }
    return {
      orderId: `ORD_${this.id.toUpperCase()}_${Date.now()}`,
      status: 'COMPLETE',
      message: `Executed ${order.side} ${order.quantity} Qty of ${order.symbol}`,
      timestamp: new Date().toISOString(),
    };
  }

  async modifyOrder(orderId: string, updates: Partial<OrderRequest>): Promise<OrderResult> {
    return {
      orderId,
      status: 'COMPLETE',
      message: 'Order modified successfully.',
      timestamp: new Date().toISOString(),
    };
  }

  async cancelOrder(orderId: string): Promise<{ success: boolean; message?: string }> {
    return {
      success: true,
      message: `Order ${orderId} cancelled.`,
    };
  }

  async getOptionChain(symbol: string): Promise<any> {
    return { symbol, strikes: [] };
  }

  subscribeWebSocket(symbols: string[], callback: (tick: any) => void): () => void {
    const interval = setInterval(() => {
      symbols.forEach((sym) => {
        callback({
          symbol: sym,
          ltp: Math.floor(Math.random() * 1000) + 500,
          timestamp: new Date().toISOString(),
        });
      });
    }, 1000);

    return () => clearInterval(interval);
  }

  async logout(): Promise<void> {
    this.isAuthenticated = false;
    this.credentials = null;
  }
}


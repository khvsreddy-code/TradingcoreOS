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
  TradeRecord,
} from './BrokerAdapter';

export abstract class BaseBrokerAdapter implements BrokerAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  readonly supportsOAuth: boolean = true;
  readonly supportsAPIKeys: boolean = true;
  abstract readonly supportedSegments: string[];
  readonly developerPortalUrl?: string = 'https://developer.tradingcore.io';

  readonly capabilities: BrokerCapabilities = {
    supportsEquity: true,
    supportsFO: true,
    supportsCommodity: true,
    supportsCurrency: true,
    supportsBasketOrders: true,
    supportsGTT: true,
    supportsWebSocket: true,
    supportsHistoricalData: true,
    supportsOrderModification: true,
    supportsOrderCancellation: true,
    supportsOptions: true,
    supportsBracketOrders: true,
    supportsMarginTrading: true,
  };

  protected isAuthenticated: boolean = false;
  protected credentials: ApiCredentials | null = null;

  async authenticateOAuth(_authCode?: string): Promise<{ success: boolean; sessionToken?: string; error?: string }> {
    this.isAuthenticated = true;
    return {
      success: true,
      sessionToken: `token_${this.id}_${Date.now()}`,
    };
  }

  async saveApiKeys(credentials: ApiCredentials): Promise<{ success: boolean; error?: string }> {
    this.credentials = credentials;
    this.isAuthenticated = true;
    return { success: true };
  }

  async validateApiKeys(credentials: ApiCredentials): Promise<{ isValid: boolean; message?: string }> {
    if (!credentials.apiKey || credentials.apiKey.length < 3) {
      return { isValid: false, message: 'Invalid API Key format.' };
    }
    return { isValid: true, message: 'Credentials validated successfully.' };
  }

  async fetchProfile(): Promise<{ userId: string; name: string; email: string; broker: string }> {
    return {
      userId: `USR_${this.id.toUpperCase()}_892`,
      name: 'Active Trader',
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
        symbol: 'BANKNIFTY 25 SEP CE',
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
        message: 'Executed BUY 15 Qty BANKNIFTY 25 SEP CE',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
    ];
  }

  async fetchTradeHistory(): Promise<TradeRecord[]> {
    return [
      {
        tradeId: `TRD_${this.id.toUpperCase()}_901`,
        orderId: `ORD_${this.id.toUpperCase()}_1001`,
        symbol: 'BANKNIFTY 25 SEP CE',
        side: 'Buy',
        quantity: 15,
        price: 310.0,
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        product: 'MIS',
        pnl: 750.0,
      },
    ];
  }

  async getMarketData(symbols: string[]): Promise<Record<string, { ltp: number; chg: string; volume: number }>> {
    const mockData: Record<string, { ltp: number; chg: string; volume: number }> = {};
    symbols.forEach((sym) => {
      let base = 1000;
      if (sym.includes('NIFTY')) base = 25200;
      if (sym.includes('BANKNIFTY')) base = 54100;
      if (sym.includes('RELIANCE')) base = 2980;
      mockData[sym] = {
        ltp: Number((base + (Math.random() - 0.5) * 20).toFixed(2)),
        chg: `${(Math.random() * 1.5).toFixed(2)}%`,
        volume: Math.floor(Math.random() * 100000) + 50000,
      };
    });
    return mockData;
  }

  async getHistoricalData(symbol: string, _timeframe: string): Promise<HistoricalCandle[]> {
    const candles: HistoricalCandle[] = [];
    let basePrice = symbol.includes('BANKNIFTY') ? 54100 : 25200;
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
        message: 'Broker authentication required. Connect broker in settings.',
        timestamp: new Date().toISOString(),
      };
    }

    const orderId = `ORD_${this.id.toUpperCase()}_${Math.floor(Math.random() * 89999 + 10000)}`;
    return {
      orderId,
      status: 'COMPLETE',
      message: `Executed ${order.side} ${order.quantity} Qty ${order.symbol} @ ${order.price || 'Market'} (${this.name})`,
      timestamp: new Date().toISOString(),
    };
  }

  async modifyOrder(orderId: string, updates: Partial<OrderRequest>): Promise<OrderResult> {
    return {
      orderId,
      status: 'COMPLETE',
      message: `Modified order ${orderId} (${JSON.stringify(updates)})`,
      timestamp: new Date().toISOString(),
    };
  }

  async cancelOrder(orderId: string): Promise<{ success: boolean; message?: string }> {
    return {
      success: true,
      message: `Order ${orderId} cancelled successfully on ${this.name}`,
    };
  }

  async squareOff(positionId: string): Promise<{ success: boolean; message?: string }> {
    return {
      success: true,
      message: `Position ${positionId} squared off on ${this.name}`,
    };
  }

  async exitAll(): Promise<{ success: boolean; closedCount: number }> {
    return {
      success: true,
      closedCount: 1,
    };
  }

  async getOptionChain(symbol: string): Promise<any> {
    return { symbol, strikes: [] };
  }

  subscribeWebSocket(symbols: string[], callback: (tick: any) => void): () => void {
    const interval = setInterval(() => {
      symbols.forEach((sym) => {
        let base = 1000;
        if (sym.includes('NIFTY')) base = 25200;
        if (sym.includes('BANKNIFTY')) base = 54100;
        callback({
          symbol: sym,
          ltp: Number((base + (Math.random() - 0.5) * 15).toFixed(2)),
          volume: Math.floor(Math.random() * 50000),
          chg: (Math.random() * 1.2).toFixed(2),
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

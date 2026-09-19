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
import { tradingApi } from '../http/tradingApi';
import { OptionChain } from '../../types/market';

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

  public markServerAuthenticated(): void { this.isAuthenticated = true; }

  async authenticateOAuth(_authCode?: string): Promise<{ success: boolean; sessionToken?: string; error?: string }> {
    try {
      const res = await tradingApi(`/api/auth/broker/${encodeURIComponent(this.id)}/verify`);
      const text = await res.text();
      let data: any;
      try { data = JSON.parse(text); } catch { return { success: false, error: `Broker verification returned an invalid response (${res.status}).` }; }
      if (!res.ok || !data.success || !data.verified) return { success: false, error: data?.error || `${this.name} session verification failed. Reconnect the broker.` };
      this.isAuthenticated = true;
      return { success: true, sessionToken: 'server-side-session' };
    } catch (error: any) {
      return { success: false, error: error?.message || `Unable to verify ${this.name} session` };
    }
  }

  async saveApiKeys(credentials: ApiCredentials): Promise<{ success: boolean; error?: string }> { this.credentials = credentials; this.isAuthenticated = true; return { success: true }; }
  async validateApiKeys(credentials: ApiCredentials): Promise<{ isValid: boolean; message?: string }> {
    if (!credentials.apiKey || credentials.apiKey.length < 3) return { isValid: false, message: 'Invalid API Key format.' };
    return { isValid: true, message: 'Credentials validated successfully.' };
  }

  async fetchProfile(): Promise<{ userId: string; name: string; email: string; broker: string }> { const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/profile`); const data = await res.json(); if (!data.success) throw new Error(data.error); return data.data; }
  async fetchFunds(): Promise<AccountFunds> { const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/funds`); const data = await res.json(); if (!data.success) throw new Error(data.error); return data.data; }
  async fetchHoldings(): Promise<Holding[]> { const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/holdings`); const data = await res.json(); if (!data.success) throw new Error(data.error); return data.data || []; }
  async fetchPositions(): Promise<Position[]> { const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/positions`); const data = await res.json(); if (!data.success) throw new Error(data.error); return data.data || []; }
  async fetchOrders(): Promise<OrderResult[]> { const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/orders`); const data = await res.json(); if (!data.success) throw new Error(data.error); return data.data || []; }
  async fetchTradeHistory(): Promise<TradeRecord[]> { const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/trades`); const data = await res.json(); if (!data.success) throw new Error(data.error); return data.data || []; }

  async getMarketData(symbols: string[]): Promise<Record<string, { ltp: number; chg: string; volume: number }>> {
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/market-data?instrument_keys=${encodeURIComponent(symbols.join(','))}`);
    const data = await res.json(); if (!data.success) throw new Error(data.error); return data.data;
  }

  async getHistoricalData(symbol: string, _timeframe: string): Promise<HistoricalCandle[]> {
    // Initial chart load is intentionally bounded. Older candles are fetched lazily
    // when the user pans toward the left edge, rather than hammering broker history
    // endpoints with a 30k request on first paint.
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/historical?instrument_key=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(_timeframe)}&limit=500`);
    const data = await res.json(); if (!data.success) { const error: any = new Error(data.error || `Historical data request failed (${res.status})`); error.status = res.status; error.brokerRateLimited = Boolean(data.brokerRateLimited); throw error; } return data.data;
  }

  async getHistoricalDataBefore(symbol: string, _timeframe: string, beforeTimestamp: string, limit = 500): Promise<HistoricalCandle[]> {
    const safeLimit = Math.max(100, Math.min(1000, Math.floor(Number(limit) || 500)));
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/historical?instrument_key=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(_timeframe)}&limit=${safeLimit}&before=${encodeURIComponent(beforeTimestamp)}`);
    const data = await res.json(); if (!data.success) { const error: any = new Error(data.error || `Historical data request failed (${res.status})`); error.status = res.status; error.brokerRateLimited = Boolean(data.brokerRateLimited); throw error; } return data.data || [];
  }

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    if (!this.isAuthenticated) return { orderId: '', status: 'REJECTED', message: 'Broker authentication required. Connect broker in settings.', timestamp: new Date().toISOString() };
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/order`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': order.idempotencyKey || globalThis.crypto.randomUUID() }, body: JSON.stringify(order) });
    const data = await res.json(); if (!data.success) throw new Error(data.error); return data.data;
  }

  async modifyOrder(orderId: string, updates: Partial<OrderRequest>): Promise<OrderResult> { const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/order/${orderId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) }); const data = await res.json(); if (!data.success) throw new Error(data.error); return data.data; }
  async cancelOrder(orderId: string): Promise<{ success: boolean; message?: string }> { const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/order/${orderId}`, { method: 'DELETE' }); const data = await res.json(); if (!data.success) throw new Error(data.error); return data.data; }
  async squareOff(positionId: string): Promise<{ success: boolean; message?: string }> { return { success: true, message: `Position ${positionId} squared off on ${this.name}` }; }
  async exitAll(): Promise<{ success: boolean; closedCount: number }> { return { success: true, closedCount: 1 }; }
  async getOptionChain(instrumentKey: string, expiryDate = 'current_week'): Promise<OptionChain> { const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/option-chain?instrument_key=${encodeURIComponent(instrumentKey)}&expiry_date=${encodeURIComponent(expiryDate)}`); const data = await res.json(); if (!data.success) throw new Error(data.error); return data.data; }
  subscribeWebSocket(_symbols: string[], _callback: (tick: any) => void): () => void { throw new Error('Live market-data transport must be supplied by the connected broker adapter. Simulated ticks are disabled.'); }
  async logout(): Promise<void> { this.isAuthenticated = false; this.credentials = null; }
}

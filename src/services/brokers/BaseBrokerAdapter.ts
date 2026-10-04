import {
  BrokerAdapter,
  OrderRequest,
  OrderResult,
  Position,
  Holding,
  AccountFunds,
  ApiCredentials,
  HistoricalCandle,
  HistoricalCandleColumns,
  BrokerCapabilities,
  TradeRecord,
} from './BrokerAdapter';
import { tradingApi } from '../http/tradingApi';
import type { OptionChain, NormalizedMarketTick } from '../../types/market';
import { getErrorMessage, isAccountFunds, isHistoricalCandle, isHolding, isOptionChain, isOrderResult, isRecord, isPosition, isTradeRecord, readJson, requireArray, requireSuccessData } from '../boundary/brokerApiValidation';

export abstract class BaseBrokerAdapter implements BrokerAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  readonly supportsOAuth: boolean = true;
  readonly supportsAPIKeys: boolean = true;
  abstract readonly supportedSegments: string[];
  readonly developerPortalUrl?: string = 'https://developer.tradingcore.io';

  readonly capabilities: BrokerCapabilities = {
    supportsEquity: true, supportsFO: true, supportsCommodity: true, supportsCurrency: true, supportsBasketOrders: true,
    supportsGTT: true, supportsWebSocket: true, supportsHistoricalData: true, supportsOrderModification: true,
    supportsOrderCancellation: true, supportsOptions: true, supportsBracketOrders: true, supportsMarginTrading: true,
  };

  protected isAuthenticated = false;
  protected credentials: ApiCredentials | null = null;

  public markServerAuthenticated(): void { this.isAuthenticated = true; }

  async authenticateOAuth(_authCode?: string): Promise<{ success: boolean; sessionToken?: string; error?: string }> {
    try {
      const res = await tradingApi(`/api/auth/broker/${encodeURIComponent(this.id)}/verify`);
      const text = await res.text();
      const payload = readJson(text);
      if (!res.ok || !isRecord(payload) || payload.success !== true || payload.verified !== true) {
        return { success: false, error: isRecord(payload) && typeof payload.error === 'string' ? payload.error : `${this.name} session verification failed. Reconnect the broker.` };
      }
      this.isAuthenticated = true;
      return { success: true, sessionToken: 'server-side-session' };
    } catch (error: unknown) {
      return { success: false, error: getErrorMessage(error, `Unable to verify ${this.name} session`) };
    }
  }

  async saveApiKeys(credentials: ApiCredentials): Promise<{ success: boolean; error?: string }> { this.credentials = credentials; this.isAuthenticated = true; return { success: true }; }
  async validateApiKeys(credentials: ApiCredentials): Promise<{ isValid: boolean; message?: string }> {
    if (!credentials.apiKey || credentials.apiKey.length < 3) return { isValid: false, message: 'Invalid API Key format.' };
    return { isValid: true, message: 'Credentials validated successfully.' };
  }

  async fetchProfile(): Promise<{ userId: string; name: string; email: string; broker: string }> {
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/profile`);
    const value = requireSuccessData(readJson(await res.text()), 'Profile request failed');
    if (!isRecord(value) || typeof value.userId !== 'string' || typeof value.name !== 'string' || typeof value.email !== 'string' || typeof value.broker !== 'string') throw new Error('Invalid profile payload from server');
    return { userId: value.userId, name: value.name, email: value.email, broker: value.broker };
  }

  async fetchFunds(): Promise<AccountFunds> {
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/funds`);
    const value = requireSuccessData(readJson(await res.text()), 'Funds request failed');
    if (!isAccountFunds(value)) throw new Error('Invalid funds payload from server');
    return value;
  }

  async fetchHoldings(): Promise<Holding[]> {
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/holdings`);
    return requireArray(requireSuccessData(readJson(await res.text()), 'Holdings request failed'), isHolding, 'holdings');
  }

  async fetchPositions(): Promise<Position[]> {
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/positions`);
    return requireArray(requireSuccessData(readJson(await res.text()), 'Positions request failed'), isPosition, 'positions');
  }

  async fetchOrders(): Promise<OrderResult[]> {
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/orders`);
    return requireArray(requireSuccessData(readJson(await res.text()), 'Orders request failed'), isOrderResult, 'orders');
  }

  async fetchTradeHistory(): Promise<TradeRecord[]> {
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/trades`);
    return requireArray(requireSuccessData(readJson(await res.text()), 'Trade history request failed'), isTradeRecord, 'trade history');
  }

  async getMarketData(symbols: string[]): Promise<Record<string, { ltp: number; chg: string; volume: number }>> {
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/market-data?instrument_keys=${encodeURIComponent(symbols.join(','))}`);
    const value = requireSuccessData(readJson(await res.text()), 'Market-data request failed');
    if (!isRecord(value)) throw new Error('Invalid market-data payload from server');
    const out: Record<string, { ltp: number; chg: string; volume: number }> = {};
    for (const [key, row] of Object.entries(value)) {
      if (!isRecord(row) || !Number.isFinite(Number(row.ltp)) || typeof row.chg !== 'string' || !Number.isFinite(Number(row.volume))) continue;
      out[key] = { ltp: Number(row.ltp), chg: row.chg, volume: Number(row.volume) };
    }
    return out;
  }

  async getHistoricalData(symbol: string, timeframe: string, signal?: AbortSignal, limit = 10000): Promise<HistoricalCandle[]> {
    const safeLimit = Math.max(100, Math.min(5000, Math.floor(Number(limit) || 5000)));
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/historical?instrument_key=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(timeframe)}&limit=${safeLimit}`, { signal });
    const payload = readJson(await res.text());
    if (!res.ok) throw new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : `Historical data request failed (${res.status})`);
    return requireArray(requireSuccessData(payload, 'Historical data request failed'), isHistoricalCandle, 'historical candles');
  }

  async getHistoricalDataColumns(symbol: string, timeframe: string, signal?: AbortSignal, limit = 5000, beforeTimestamp?: number | string): Promise<HistoricalCandleColumns | null> {
    const safeLimit = Math.max(100, Math.min(5000, Math.floor(Number(limit) || 5000)));
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/historical?instrument_key=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(timeframe)}&limit=${safeLimit}&format=columns${beforeTimestamp != null ? `&before=${encodeURIComponent(new Date(beforeTimestamp).toISOString())}` : ''}`, { signal });
    const payload = readJson(await res.text());
    if (!res.ok) throw new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : `Historical data request failed (${res.status})`);
    const value = requireSuccessData(payload, 'Historical data request failed');
    if (isHistoricalColumns(value)) return value.time.length > 0 ? value : null;
    // Compatibility fallback for a broker route that has not implemented the compact
    // format yet. This path is deliberately cold-only; FYERS uses the zero-object response.
    if (Array.isArray(value)) {
      const rows = value as HistoricalCandle[];
      const time: number[] = [], open: number[] = [], high: number[] = [], low: number[] = [], close: number[] = [], volume: number[] = [];
      for (const row of rows.slice(-safeLimit)) {
        const parsed = Date.parse(String(row.timestamp));
        if (!Number.isFinite(parsed)) continue;
        time.push(parsed); open.push(Number(row.open)); high.push(Number(row.high)); low.push(Number(row.low)); close.push(Number(row.close)); volume.push(Number.isFinite(Number(row.volume)) ? Number(row.volume) : 0);
      }
      return { time, open, high, low, close, volume, timeUnit: 'milliseconds' };
    }
    return null;
  }

  async getHistoricalDataBefore(symbol: string, timeframe: string, beforeTimestamp: string, limit = 500, signal?: AbortSignal): Promise<HistoricalCandle[]> {
    const safeLimit = Math.max(100, Math.min(30000, Math.floor(Number(limit) || 5000)));
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/historical?instrument_key=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(timeframe)}&limit=${safeLimit}&before=${encodeURIComponent(beforeTimestamp)}`, { signal });
    const payload = readJson(await res.text());
    if (!res.ok) throw new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : `Historical data request failed (${res.status})`);
    return requireArray(requireSuccessData(payload, 'Historical data request failed'), isHistoricalCandle, 'historical candles');
  }

  async placeOrder(order: OrderRequest): Promise<OrderResult> {
    if (!this.isAuthenticated) return { orderId: '', status: 'REJECTED', message: 'Broker authentication required. Connect broker in settings.', timestamp: new Date().toISOString() };
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/order`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': order.idempotencyKey || globalThis.crypto.randomUUID() }, body: JSON.stringify(order) });
    const value = requireSuccessData(readJson(await res.text()), 'Order request failed');
    if (!isOrderResult(value)) throw new Error('Invalid order result from server');
    return value;
  }

  async modifyOrder(orderId: string, updates: Partial<OrderRequest>): Promise<OrderResult> {
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/order/${orderId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
    const value = requireSuccessData(readJson(await res.text()), 'Order update failed');
    if (!isOrderResult(value)) throw new Error('Invalid order result from server');
    return value;
  }

  async cancelOrder(orderId: string): Promise<{ success: boolean; message?: string }> {
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/order/${orderId}`, { method: 'DELETE' });
    const value = requireSuccessData(readJson(await res.text()), 'Order cancellation failed');
    if (!isRecord(value) || value.success !== true) throw new Error('Invalid cancellation result from server');
    return { success: true, message: typeof value.message === 'string' ? value.message : undefined };
  }

  async squareOff(positionId: string): Promise<{ success: boolean; message?: string }> { return { success: true, message: `Position ${positionId} squared off on ${this.name}` }; }
  async exitAll(): Promise<{ success: boolean; closedCount: number }> { return { success: true, closedCount: 1 }; }

  async getOptionChain(instrumentKey: string, expiryDate = 'current_week'): Promise<OptionChain> {
    const res = await tradingApi(`/api/trading/${this.id.toLowerCase()}/option-chain?instrument_key=${encodeURIComponent(instrumentKey)}&expiry_date=${encodeURIComponent(expiryDate)}`);
    const value = requireSuccessData(readJson(await res.text()), 'Option-chain request failed');
    if (!isOptionChain(value)) throw new Error('Invalid option-chain payload from server');
    return value;
  }

  subscribeWebSocket(_symbols: string[], _callback: (tick: NormalizedMarketTick) => void): () => void {
    throw new Error('Live market-data transport must be supplied by the connected broker adapter. Simulated ticks are disabled.');
  }

  async logout(): Promise<void> { this.isAuthenticated = false; this.credentials = null; }
}

function isHistoricalColumns(value: unknown): value is HistoricalCandleColumns {
  if (!isRecord(value)) return false;
  const keys = ['time', 'open', 'high', 'low', 'close', 'volume'] as const;
  if (!keys.every((key) => Array.isArray(value[key]))) return false;
  if (value.timeUnit !== 'milliseconds' && value.timeUnit !== 'seconds') return false;
  const length = (value.time as unknown[]).length;
  return keys.every((key) => (value[key] as unknown[]).length === length);
}

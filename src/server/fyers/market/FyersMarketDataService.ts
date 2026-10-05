import { FyersApiClient } from '../core/FyersApiClient.js';
import { API_LATENCY_BUDGET_MS } from '../../latency/budgets.js';

export class FyersMarketDataService {
  constructor(private readonly client: FyersApiClient) {}

  history(symbol: string, resolution: string, rangeFrom: string, rangeTo: string, options: { oi?: boolean; continuous?: boolean; dateFormat?: '0' | '1'; signal?: AbortSignal } = {}) {
    return this.client.dataGet('/history', {
      symbol,
      resolution,
      date_format: options.dateFormat ?? '1',
      range_from: rangeFrom,
      range_to: rangeTo,
      oi_flag: options.oi ? 1 : undefined,
      cont_flag: options.continuous ? 1 : undefined,
    }, options.signal, API_LATENCY_BUDGET_MS.history);
  }

  quotes(symbols: string[], signal?: AbortSignal) {
    return this.client.dataGet('/quotes', { symbols: symbols.join(',') }, signal);
  }

  depth(symbol: string, signal?: AbortSignal) {
    return this.client.dataGet('/depth', { symbol }, signal);
  }

  optionChain(symbol: string, options: { strikeCount?: number; timestamp?: string | number; greeks?: boolean; signal?: AbortSignal } = {}) {
    return this.client.dataGet('/options-chain-v3', {
      symbol,
      strikecount: options.strikeCount ?? 50,
      timestamp: options.timestamp,
      greeks: options.greeks === false ? 0 : 1,
    }, options.signal);
  }

  marketStatus(signal?: AbortSignal) {
    return this.client.dataGet('/marketStatus', {}, signal);
  }

  futuresChain(symbol: string, signal?: AbortSignal) {
    return this.client.dataGet('/futures-chain', { symbol }, signal);
  }

  expiredExpiryDates(symbol: string, rangeFrom: string, rangeTo: string, dateFormat: '0' | '1' = '1', signal?: AbortSignal) {
    return this.client.dataGet('/history/fno/expired/expiry-dates', { symbol, range_from: rangeFrom, range_to: rangeTo, date_format: dateFormat }, signal);
  }

  expiredUnderlyingSymbols(symbol: string, expiryDate: string, signal?: AbortSignal) {
    return this.client.dataGet('/history/fno/expired/underlying-symbols', { symbol, expiry_date: expiryDate }, signal);
  }

  expiredHistoricalData(symbol: string, resolution: string, rangeFrom: string, rangeTo: string, options: { greeks?: boolean; oi?: boolean; signal?: AbortSignal } = {}) {
    return this.client.dataGet('/history/fno/expired/historical-data', {
      symbol, resolution, date_format: '1', range_from: rangeFrom, range_to: rangeTo,
      include_greeks: options.greeks ? 1 : undefined,
      include_oi: options.oi ? 1 : undefined,
    }, options.signal);
  }
}

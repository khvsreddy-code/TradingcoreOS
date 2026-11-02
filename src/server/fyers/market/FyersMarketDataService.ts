import { FyersApiClient } from '../core/FyersApiClient.js';
import { API_LATENCY_BUDGET_MS } from '../../latency/budgets.js';
import { assertFyersQuoteBatch, DEFAULT_FYERS_CAPABILITIES, type FyersCapabilities } from '../core/FyersCapabilities.js';

type QuoteCacheEntry = { expiresAt: number; value: unknown };
const QUOTE_CACHE_TTL_MS = 1_500;
const QUOTE_CACHE_MAX_ENTRIES = 256;
const QUOTE_IN_FLIGHT_MAX_ENTRIES = 512;
const quoteResponseCache = new Map<string, QuoteCacheEntry>();
const quoteRequestsInFlight = new Map<string, Promise<unknown>>();

function withCallerAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(Object.assign(new Error('FYERS request aborted'), { name: 'AbortError' }));
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => {
      cleanup();
      reject(Object.assign(new Error('FYERS request aborted'), { name: 'AbortError' }));
    };
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      value => { cleanup(); resolve(value); },
      error => { cleanup(); reject(error); },
    );
  });
}

function trimQuoteCache(now = Date.now()): void {
  for (const [key, entry] of quoteResponseCache) {
    if (entry.expiresAt <= now) quoteResponseCache.delete(key);
  }
  while (quoteResponseCache.size > QUOTE_CACHE_MAX_ENTRIES) {
    const oldest = quoteResponseCache.keys().next().value as string | undefined;
    if (!oldest) break;
    quoteResponseCache.delete(oldest);
  }
}

export class FyersMarketDataService {
  constructor(
    private readonly client: FyersApiClient,
    private readonly capabilities: FyersCapabilities = DEFAULT_FYERS_CAPABILITIES,
  ) {}

  history(symbol: string, resolution: string, rangeFrom: string, rangeTo: string, options: { oi?: boolean; continuous?: boolean; dateFormat?: '0' | '1'; signal?: AbortSignal } = {}) {
    return this.client.dataGet('/history', {
      symbol,
      resolution,
      date_format: options.dateFormat ?? '1',
      range_from: rangeFrom,
      range_to: rangeTo,
      oi_flag: options.oi ? 1 : undefined,
      cont_flag: options.continuous ? 1 : undefined,
    }, options.signal, API_LATENCY_BUDGET_MS.history, 'high');
  }

  quotes(symbols: string[], signal?: AbortSignal): Promise<unknown> {
    // The capability boundary is enforced here too, so another route/caller
    // cannot accidentally bypass the plan's provider batch limit.
    const uniqueSymbols = [...new Set(symbols.map(symbol => String(symbol || '').trim()).filter(Boolean))];
    assertFyersQuoteBatch(uniqueSymbols, this.capabilities);

    const key = `${this.client.quotaIdentity}|quotes|${uniqueSymbols.join(',')}`;
    const now = Date.now();
    trimQuoteCache(now);
    const cached = quoteResponseCache.get(key);
    if (cached && cached.expiresAt > now) {
      return withCallerAbort(Promise.resolve(cached.value), signal);
    }

    let sharedRequest = quoteRequestsInFlight.get(key);
    if (!sharedRequest) {
      // Shared work uses its own bounded client timeout. One disconnected HTTP
      // caller must not cancel the upstream request for all other consumers.
      sharedRequest = this.client.dataGet('/quotes', {
        symbols: uniqueSymbols.join(','),
      }, undefined, API_LATENCY_BUDGET_MS.quote, 'low');
      // Bound the in-flight registry under unusual multi-user bursts; every
      // untracked request still passes through the distributed FYERS quota gate.
      if (quoteRequestsInFlight.size < QUOTE_IN_FLIGHT_MAX_ENTRIES) {
        quoteRequestsInFlight.set(key, sharedRequest);
        void sharedRequest.then(
          value => {
            quoteResponseCache.set(key, { expiresAt: Date.now() + QUOTE_CACHE_TTL_MS, value });
            trimQuoteCache();
            if (quoteRequestsInFlight.get(key) === sharedRequest) quoteRequestsInFlight.delete(key);
          },
          () => {
            if (quoteRequestsInFlight.get(key) === sharedRequest) quoteRequestsInFlight.delete(key);
          },
        );
      }
    }
    return withCallerAbort(sharedRequest, signal);
  }

  depth(symbol: string, signal?: AbortSignal) {
    return this.client.dataGet('/depth', { symbol }, signal, API_LATENCY_BUDGET_MS.depth, 'high');
  }

  optionChain(symbol: string, options: { strikeCount?: number; timestamp?: string | number; greeks?: boolean; signal?: AbortSignal } = {}) {
    return this.client.dataGet('/options-chain-v3', {
      symbol,
      strikecount: options.strikeCount ?? 50,
      timestamp: options.timestamp,
      greeks: options.greeks === false ? 0 : 1,
    }, options.signal, API_LATENCY_BUDGET_MS.depth, 'high');
  }

  marketStatus(signal?: AbortSignal) {
    return this.client.dataGet('/marketStatus', {}, signal, API_LATENCY_BUDGET_MS.account, 'low');
  }

  futuresChain(symbol: string, signal?: AbortSignal) {
    return this.client.dataGet('/futures-chain', { symbol }, signal, API_LATENCY_BUDGET_MS.depth, 'medium');
  }

  expiredExpiryDates(symbol: string, rangeFrom: string, rangeTo: string, dateFormat: '0' | '1' = '1', signal?: AbortSignal) {
    return this.client.dataGet('/history/fno/expired/expiry-dates', { symbol, range_from: rangeFrom, range_to: rangeTo, date_format: dateFormat }, signal, API_LATENCY_BUDGET_MS.history, 'lowest');
  }

  expiredUnderlyingSymbols(symbol: string, expiryDate: string, signal?: AbortSignal) {
    return this.client.dataGet('/history/fno/expired/underlying-symbols', { symbol, expiry_date: expiryDate }, signal, API_LATENCY_BUDGET_MS.history, 'lowest');
  }

  expiredHistoricalData(symbol: string, resolution: string, rangeFrom: string, rangeTo: string, options: { greeks?: boolean; oi?: boolean; signal?: AbortSignal } = {}) {
    return this.client.dataGet('/history/fno/expired/historical-data', {
      symbol, resolution, date_format: '1', range_from: rangeFrom, range_to: rangeTo,
      include_greeks: options.greeks ? 1 : undefined,
      include_oi: options.oi ? 1 : undefined,
    }, options.signal, API_LATENCY_BUDGET_MS.history, 'lowest');
  }
}

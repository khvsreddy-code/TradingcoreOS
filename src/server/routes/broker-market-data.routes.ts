import { Router, Request, Response } from 'express';
import { BrokerRegistry } from '../brokers/BrokerRegistry.js';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { FyersMarketDataTransport } from '../marketData/FyersMarketDataTransport.js';
import type { MarketFeedEvent } from '../../types/market.js';
import { resolveFyersCapabilities } from '../fyers/core/FyersCapabilities.js';
import { resolveFyersQuotaIdentity } from '../fyers/core/FyersQuotaIdentity.js';
import { FyersAdapter } from '../brokers/adapters/BrokerAdapters.js';
import { FyersApiClient } from '../fyers/core/FyersApiClient.js';
import { API_LATENCY_BUDGET_MS } from '../latency/budgets.js';

export const brokerMarketDataRoutes = Router();
brokerMarketDataRoutes.use(requireUser);

async function getFyersSession(req: AuthenticatedRequest, res: Response) {
  const brokerId = String(req.params.brokerId || '').toLowerCase();
  if (brokerId !== 'fyers') return null;
  const userId = req.tradingCoreUserId!;
  const session = await BrokerRepository.getSession('fyers', userId);
  if (!session || session.status !== 'Connected') { res.status(401).json({ success: false, error: 'Fyers is not connected for this account.' }); return null; }
  try { return { userId, token: EncryptionService.decrypt(session.accessTokenEncrypted), quotaIdentity: resolveFyersQuotaIdentity(session.clientCode) }; }
  catch { res.status(500).json({ success: false, error: 'Unable to decrypt the Fyers session.' }); return null; }
}


function toFyersSymbol(symbol: string): string {
  let value = '';
  try { value = decodeURIComponent(String(symbol || '')).trim(); } catch { return ''; }
  const normalized = value.toLowerCase().replace(/\s+/g, '');
  const aliases: Record<string, string> = {
    'nse_index|nifty50': 'NSE:NIFTY50-INDEX', 'nse_index|nifty50index': 'NSE:NIFTY50-INDEX',
    'nse_index|niftybank': 'NSE:NIFTYBANK-INDEX', 'nse_index|niftybankindex': 'NSE:NIFTYBANK-INDEX',
    'nse_index|niftyfinancialservices': 'NSE:FINNIFTY-INDEX', 'nse_index|finnifty': 'NSE:FINNIFTY-INDEX',
    'nse_index|niftymidcapselect': 'NSE:MIDCPNIFTY-INDEX', 'bse_index|sensex': 'BSE:SENSEX-INDEX',
  };
  if (aliases[normalized]) return aliases[normalized];
  const pipe = value.match(/^(NSE|BSE|MCX)_(CM|FO|CD|COM)\|(.+)$/i);
  if (pipe) {
    const exchange = pipe[1].toUpperCase();
    const segment = pipe[2].toUpperCase();
    const ticker = pipe[3];
    if (segment === 'CM' && !/-(EQ|BE|SM|ST)$/i.test(ticker)) return `${exchange}:${ticker}-EQ`;
    return `${exchange}:${ticker}`;
  }
  if (!value.includes(':') && /^(?:NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY).*?(?:FUT|CE|PE)$/i.test(value)) return `NSE:${value}`;
  if (/^NSE:[A-Z0-9&._-]+$/i.test(value) && !/-[A-Z]+$/i.test(value)) return `${value}-EQ`;
  if (/^BSE:[A-Z0-9&._-]+$/i.test(value) && !/-[A-Z]+$/i.test(value)) return `${value}-EQ`;
  return value;
}

const fyersResolution: Record<string,string> = {
  '1minute':'1','3minute':'3','5minute':'5','10minute':'10','15minute':'15','30minute':'30','45minute':'45','60minute':'60','day':'D'
};
const intradayIntervals = new Set(['1minute','3minute','5minute','10minute','15minute','30minute','45minute','60minute']);

function indiaDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

function mapFyersCandles(rows: any[]): any[] {
  return (rows || []).map((c: any[]) => ({
    timestamp: new Date(Number(c[0]) * 1000).toISOString(),
    open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5] || 0),
  })).filter((c: any) => [c.open, c.high, c.low, c.close].every(Number.isFinite));
}

function normalizeCandles(rows: any[], limit: number): any[] {
  const unique = new Map<number, any>();
  for (const row of rows || []) {
    const time = new Date(row.timestamp).getTime();
    if (Number.isFinite(time)) unique.set(time, row);
  }
  return [...unique.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row).slice(-limit);
}

async function requestFyersHistory(
  accessToken: string,
  symbol: string,
  resolution: string,
  from: string,
  to: string,
  capabilities: ReturnType<typeof resolveFyersCapabilities>,
  rateLimitIdentity: string,
): Promise<any[]> {
  // Use the canonical FYERS client so every History request is admitted by the
  // same plan-specific Data API rate budget as quotes/options/depth.
  const client = new FyersApiClient(accessToken, undefined, capabilities, rateLimitIdentity);
  const payload = await client.dataGet<any>('/history', {
    symbol,
    resolution,
    date_format: '1',
    range_from: from,
    range_to: to,
  }, undefined, API_LATENCY_BUDGET_MS.history, 'high');
  return mapFyersCandles(payload?.candles || []);
}


/**
 * Build history backwards in broker-safe date windows. The previous
 * implementation deliberately requested only today, which made a full chart
 * impossible. FYERS history is date-range based, so requests are chunked and
 * merged until the target is reached or the broker has no older data.
 */
async function fetchFyersHistoryTarget(
  accessToken: string,
  symbol: string,
  interval: string,
  target: number,
  capabilities: ReturnType<typeof resolveFyersCapabilities>,
  rateLimitIdentity: string,
): Promise<any[]> {
  const secondsMatch = /^(\d+)\s*(?:s|sec|second|seconds)$/i.exec(interval) || /^(\d+)S$/i.exec(interval);
  const secondsInterval = Boolean(secondsMatch);
  if (secondsInterval && !capabilities.secondData) {
    const error: any = new Error('Seconds-level historical data requires a verified FYERS Prime entitlement.');
    error.status = 403;
    error.code = 'FYERS_SECONDS_DATA_REQUIRES_PRIME';
    throw error;
  }
  const resolution = secondsMatch ? `${Number(secondsMatch[1])}S` : (fyersResolution[interval] || interval);
  const intraday = intradayIntervals.has(interval) || secondsInterval;
  // Provider entitlement is the first boundary; a separate operational ceiling
  // prevents an unexpectedly large Prime request from spawning hundreds of calls.
  const allowedYears = intraday ? capabilities.historyDepth.intradayYears : capabilities.historyDepth.dailyYears;
  const operationalCeilingYears = secondsInterval ? 2 : intraday ? 15 : 30;
  const maxLookbackDays = Math.min(7, Math.min(operationalCeilingYears, allowedYears ?? operationalCeilingYears) * 365);
  const chunkDays = secondsInterval ? 1 : 7;
  const now = new Date();
  const earliest = new Date(now.getTime() - maxLookbackDays * 86_400_000);
  let end = new Date(now);
  let all: any[] = [];
  let emptyWindows = 0;

  for (let lookedBack = 0; end.getTime() > earliest.getTime() && all.length < target && emptyWindows < 2; lookedBack += chunkDays) {
    const start = new Date(Math.max(earliest.getTime(), end.getTime() - chunkDays * 86_400_000));
    try {
      const rows = await requestFyersHistory(accessToken, symbol, resolution, indiaDate(start), indiaDate(end), capabilities, rateLimitIdentity);
      if (rows.length) {
        all = normalizeCandles([...rows, ...all], target);
        emptyWindows = 0;
      } else {
        emptyWindows += 1;
      }
    } catch (error: any) {
      if (all.length === 0) throw error;
      emptyWindows += 1;
    }
    end = new Date(start.getTime() - 1000);
  }

  return normalizeCandles(all, target);
}



// FYERS publishes the authoritative, regularly updated symbol masters. Keep a
// short in-memory cache so search does not download the exchange universe for
// every keystroke. The API returns only matching rows to the browser.
type SymbolMasterRow = Record<string, any>;
const symbolMasterCache = new Map<string, { expiresAt: number; rows: SymbolMasterRow[] }>();
const symbolMasterPromises = new Map<string, Promise<SymbolMasterRow[]>>();
const SYMBOL_MASTER_TTL_MS = 6 * 60 * 60 * 1000;
const SYMBOL_MASTER_URLS: Record<string, string> = {
  nse_cm: 'https://public.fyers.in/sym_details/NSE_CM_sym_master.json',
  nse_com: 'https://public.fyers.in/sym_details/NSE_COM_sym_master.json',
  bse_cm: 'https://public.fyers.in/sym_details/BSE_CM_sym_master.json',
  nse_fo: 'https://public.fyers.in/sym_details/NSE_FO_sym_master.json',
  bse_fo: 'https://public.fyers.in/sym_details/BSE_FO_sym_master.json',
  mcx_com: 'https://public.fyers.in/sym_details/MCX_COM_sym_master.json',
  nse_cd: 'https://public.fyers.in/sym_details/NSE_CD_sym_master.json',
};

function firstValue(row: any, keys: string[]): string {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function normalizeSymbolMasterRows(payload: any): SymbolMasterRow[] {
  // FYERS' Symbol Master JSON is keyed by the API symbol ticker rather than
  // returned as a plain array. Supporting both shapes keeps search compatible
  // with current and legacy master files.
  const raw: Array<{ key?: string; row: any }> = Array.isArray(payload)
    ? payload.map((row: any) => ({ row }))
    : Array.isArray(payload?.data)
      ? payload.data.map((row: any) => ({ row }))
      : payload && typeof payload === 'object'
        ? Object.entries(payload).map(([key, row]) => ({ key, row }))
        : [];

  return raw.map(({ key, row }) => {
    const symbol = firstValue(row, ['symbol', 'symTicker', 'fyToken', 'fytoken', 'ticker']) || String(key || '');
    const description = firstValue(row, ['description', 'exSymName', 'symDetails', 'company_name', 'companyName', 'display_name', 'trading_symbol', 'name']);
    const exchange = firstValue(row, ['exchange', 'exSym', 'ex_sym', 'exchange_name']);
    const instrumentType = firstValue(row, ['instrument_type', 'instrumentType', 'segment', 'type']);
    const isin = firstValue(row, ['isin', 'ISIN']);
    const expiry = firstValue(row, ['expiry', 'expiryDate', 'expiry_date']);
    const strike = firstValue(row, ['strike', 'strikePrice', 'strike_price']);
    const optionType = firstValue(row, ['option_type', 'optType', 'optionType']);
    const lotSize = firstValue(row, ['lot_size', 'minLotSize', 'lotSize', 'min_lot_size']);
    const searchable = [symbol, description, exchange, instrumentType, isin, expiry, strike, optionType].join(' ').toLowerCase();
    return { symbol, description, exchange, instrumentType, isin, expiry, strike, optionType, lotSize, searchable };
  }).filter((row: any) => row.symbol);
}

async function loadSymbolMaster(master: string): Promise<SymbolMasterRow[]> {
  const cached = symbolMasterCache.get(master);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  const existing = symbolMasterPromises.get(master);
  if (existing) return existing;
  const url = SYMBOL_MASTER_URLS[master];
  if (!url) return [];
  const promise = fetch(url, { headers: { Accept: 'application/json' } })
    .then(async response => {
      if (!response.ok) throw new Error(`FYERS symbol master ${master} failed (${response.status})`);
      const payload = await response.json();
      const rows = normalizeSymbolMasterRows(payload);
      symbolMasterCache.set(master, { rows, expiresAt: Date.now() + SYMBOL_MASTER_TTL_MS });
      return rows;
    })
    .finally(() => symbolMasterPromises.delete(master));
  symbolMasterPromises.set(master, promise);
  return promise;
}

function mastersForSegment(segment: string): string[] {
  switch (segment) {
    case 'stocks': return ['nse_cm', 'bse_cm'];
    case 'futures': return ['nse_fo', 'bse_fo', 'mcx_com'];
    case 'options': return ['nse_fo', 'bse_fo'];
    case 'commodities': return ['nse_com', 'mcx_com'];
    case 'currency': return ['nse_cd'];
    default: return Object.keys(SYMBOL_MASTER_URLS);
  }
}


brokerMarketDataRoutes.get('/:brokerId/instruments/search', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const session = await getFyersSession(req, res); if (!session) return;
  const query = String(req.query.q || '').trim().toLowerCase();
  const segment = String(req.query.segment || 'all').toLowerCase();
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
  if (query.length < 2) return res.json({ success: true, data: [], total: 0, hint: 'Enter at least 2 characters.' });
  try {
    const masters = mastersForSegment(segment);
    const chunks = await Promise.all(masters.map(loadSymbolMaster));
    const rows = chunks.flat();
    const exact: SymbolMasterRow[] = [];
    const partial: SymbolMasterRow[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row.searchable.includes(query)) continue;
      const key = row.symbol;
      if (seen.has(key)) continue;
      seen.add(key);
      const symbolText = row.symbol.toLowerCase();
      if (symbolText === query || symbolText.endsWith(`:${query}-eq`) || symbolText.includes(`:${query}-eq`)) exact.push(row);
      else partial.push(row);
    }
    const data = [...exact, ...partial].slice(0, limit).map(row => ({
      key: row.symbol,
      label: row.description || row.symbol,
      symbol: row.symbol,
      description: row.description,
      exchange: row.exchange,
      type: row.instrumentType,
      isin: row.isin,
      expiry: row.expiry,
      strike: row.strike ? Number(row.strike) : undefined,
      optionType: row.optionType,
      lotSize: row.lotSize ? Number(row.lotSize) : undefined,
    }));
    return res.json({ success: true, data, total: data.length, source: 'fyers-symbol-master' });
  } catch (err: any) {
    return res.status(502).json({ success: false, error: err?.message || 'Unable to load FYERS symbol master' });
  }
});

brokerMarketDataRoutes.get('/:brokerId/historical', async (req: Request, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const session = await getFyersSession(req as AuthenticatedRequest, res); if (!session) return;
  const capabilities = resolveFyersCapabilities(session.userId);
  const symbol = toFyersSymbol(String(req.query.instrument_key || ''));
  const interval = String(req.query.interval || '').trim();
  const secondsRequest = /^\d+\s*(?:s|sec|second|seconds)$/i.test(interval) || /^\d+S$/i.test(interval);
  if (secondsRequest && !capabilities.secondData) {
    return res.status(403).json({ success:false, error:'Seconds-level historical data requires a verified FYERS Prime entitlement.', code:'FYERS_SECONDS_DATA_REQUIRES_PRIME', plan:capabilities.plan });
  }
  const requestedLimit = Number(req.query.limit || 2_000);
  const limit = Number.isFinite(requestedLimit) ? Math.max(2, Math.min(2_000, Math.floor(requestedLimit))) : 2_000;
  if (!symbol || !interval) return res.status(400).json({ success: false, error: 'instrument_key and interval are required' });

  try {
    const candles = await fetchFyersHistoryTarget(session.token, symbol, interval, limit, capabilities, session.quotaIdentity);
    if (candles.length < 2) return res.status(502).json({ success: false, error: `Fyers returned only ${candles.length} candle(s) for ${symbol}.` });
    res.setHeader('Cache-Control', 'private, max-age=15');
    return res.json({
      success: true,
      data: candles,
      requested: limit,
      returned: candles.length,
      // This endpoint returns one bounded request, not a complete historical dataset.
      historyExhausted: false,
      paginationSupported: false,
      historyCompleteness: {
        status: candles.length >= limit ? 'page-limit-reached' : 'bounded-range-partial',
        requestedBars: limit,
        returnedBars: candles.length,
        providerPageLimit: 2_000,
        datasetComplete: false,
        moreMayExist: candles.length >= limit,
        paginationSupported: false,
      },
    });
  } catch (err: any) {
    const status = Number(err?.status) === 429 ? 429 : Number(err?.status) === 403 ? 403 : Number(err?.status) === 504 ? 504 : 502;
    if (status === 429) res.setHeader('Retry-After','1');
    return res.status(status).json({
      success:false,
      error:err?.message || `Unable to load Fyers historical candles for ${symbol}`,
      code:err?.code,
      brokerCode:err?.brokerCode,
    });
  }
});

brokerMarketDataRoutes.get('/:brokerId/option-chain', async (req: Request, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const session = await getFyersSession(req as AuthenticatedRequest, res); if (!session) return;
  const symbol = toFyersSymbol(String(req.query.instrument_key || '')); const expiryDate = String(req.query.expiry_date || 'current_week');
  if (!symbol) return res.status(400).json({ success: false, error: 'instrument_key is required' });
  try {
    const capabilities = resolveFyersCapabilities(session.userId);
    const adapter = BrokerRegistry.getAdapter('fyers') as FyersAdapter;
    const data = await adapter.getOptionChain(session.token, symbol, expiryDate, capabilities, session.userId);
    res.setHeader('Cache-Control', 'private, max-age=5');
    return res.json({ success: true, data, capabilities: { plan:capabilities.plan, dataApiRateLimits:capabilities.dataApiRateLimits } });
  } catch (err: any) {
    const status = Number(err?.status) === 429 ? 429 : Number(err?.status) === 403 ? 403 : 502;
    if (status === 429) res.setHeader('Retry-After','1');
    return res.status(status).json({ success: false, error: err?.message || 'Unable to load Fyers option chain', code:err?.code, brokerCode:err?.brokerCode });
  }
});

async function handleFyersMarketStream(req: AuthenticatedRequest, res: Response, next: (error?: unknown) => void) {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const session = await getFyersSession(req, res); if (!session) return;
  const supplied = req.method === 'POST'
    ? (req.body?.instrument_keys ?? req.body?.symbols)
    : req.query.instrument_keys;
  let rawSymbols: string[];
  if (typeof supplied === 'string') rawSymbols = supplied.split(',');
  else if (Array.isArray(supplied) && supplied.every(value => typeof value === 'string')) rawSymbols = supplied as string[];
  else return res.status(400).json({ success: false, error: 'instrument_keys is required as a comma-separated string or string array.' });
  if (rawSymbols.length > 5_000) return res.status(413).json({ success: false, error: 'Too many symbol entries in one request.' });
  const symbols = [...new Set(rawSymbols.map(x => toFyersSymbol(x.trim())).map(x => x.trim()).filter(Boolean))];
  if (!symbols.length) return res.status(400).json({ success: false, error: 'instrument_keys must include at least one valid symbol.' });
  const capabilities = resolveFyersCapabilities(session.userId);
  if (symbols.length > capabilities.maxStreamSymbols) {
    return res.status(400).json({
      success: false,
      error: `FYERS ${capabilities.plan} Data WebSocket supports at most ${capabilities.maxStreamSymbols} unique symbols for this subscription.`,
      code: 'FYERS_STREAM_SYMBOL_LIMIT',
      limit: capabilities.maxStreamSymbols,
      requested: symbols.length,
      plan: capabilities.plan,
    });
  }
  const requestedFeedClass = req.method === 'POST' ? req.body?.feed_class : req.query.feed_class;
  const hasExplicitFeedClass = requestedFeedClass !== undefined && requestedFeedClass !== null && String(requestedFeedClass).trim() !== '';
  const normalizedFeedClass = String(requestedFeedClass || 'full').trim().toLowerCase();
  if (!['lite', 'full', 'depth'].includes(normalizedFeedClass)) {
    return res.status(400).json({ success: false, error: 'feed_class must be one of: lite, full, depth.', code: 'FYERS_INVALID_FEED_CLASS' });
  }
  const feedClass = normalizedFeedClass as 'lite' | 'full' | 'depth';
  const depthSymbol = toFyersSymbol(String(req.method === 'POST' ? (req.body?.depth_symbol ?? '') : (req.query.depth_symbol || '')));
  if (hasExplicitFeedClass && depthSymbol) {
    return res.status(400).json({ success: false, error: 'depth_symbol is only supported for legacy combined full + depth subscriptions; choose feed_class=depth and pass the depth symbols as instrument_keys instead.', code: 'FYERS_CONFLICTING_FEED_CLASS' });
  }
  const includeDepth = !hasExplicitFeedClass && Boolean(depthSymbol);
  const depthSymbols = includeDepth ? [depthSymbol] : (feedClass === 'depth' ? symbols : []);
  const capacity = FyersMarketDataTransport.checkSubscriptionCapacity(
    session.userId,
    symbols,
    capabilities.maxStreamSymbols,
    includeDepth ? depthSymbols : [],
    session.quotaIdentity,
  );
  if (!capacity.allowed) {
    return res.status(400).json({
      success: false,
      error: `FYERS ${capabilities.plan} Data WebSocket limit is ${capacity.limit} unique active symbols across this FYERS account's shared stream.`,
      code: 'FYERS_STREAM_SYMBOL_LIMIT',
      limit: capacity.limit,
      active: capacity.activeSymbols,
      requested: capacity.projectedSymbols,
      plan: capabilities.plan,
    });
  }

  res.status(200);
  // Low-latency streaming: never let an intermediary buffer live ticks.
  // POST is available for Prime symbol lists that would exceed practical URL lengths.
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.flushHeaders();
  const write = (event: MarketFeedEvent) => {
    try {
      res.write(`${JSON.stringify(event)}\n`);
      const flush = (res as any).flush;
      if (typeof flush === 'function') flush.call(res);
    } catch {}
  };
  let unsubscribe: (() => void);
  try {
    unsubscribe = FyersMarketDataTransport.subscribe(
      session.userId, session.token, symbols, write, includeDepth, depthSymbols, capabilities.maxStreamSymbols, feedClass, session.quotaIdentity,
    );
  } catch (error: any) {
    write({ type: 'error', error: error?.message || 'Unable to subscribe to FYERS market data' });
    res.end();
    return;
  }
  const heartbeat = setInterval(() => write({ type: 'status', status: 'connected' }), 10_000);
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(heartbeat);
    unsubscribe();
  };
  res.on('close', cleanup);
  req.on('close', cleanup);
}

brokerMarketDataRoutes.get('/:brokerId/market-stream', (req: AuthenticatedRequest, res: Response, next) => {
  void handleFyersMarketStream(req, res, next);
});
brokerMarketDataRoutes.post('/:brokerId/market-stream', (req: AuthenticatedRequest, res: Response, next) => {
  void handleFyersMarketStream(req, res, next);
});

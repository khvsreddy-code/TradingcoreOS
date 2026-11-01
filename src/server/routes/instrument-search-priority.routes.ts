import { Router } from 'express';
import { requireUser } from '../auth/requireUser.js';
import { FyersSymbolMasterService, type FyersMasterName } from '../fyers/symbols/FyersSymbolMasterService.js';

export type FyersInstrumentSearchRow = Record<string, any> & { master: string };
type Row = FyersInstrumentSearchRow;

export const instrumentSearchPriorityRoutes = Router();
instrumentSearchPriorityRoutes.use(requireUser);

// Include every relevant FYERS segment. In particular, MCX_COM was absent from the
// old search pool, so "crude oil futures" could never discover the actual MCX contracts.
let cache: { expiresAt: number; rows: Row[] } | null = null;
let lastMasterLoadStatus = { partial: false, failedMasters: 0 };
let inflight: Promise<Row[]> | null = null;

function first(row: Record<string, any>, keys: string[]): string {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function normalize(payload: any, master: FyersMasterName): Row[] {
  const source = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object' ? payload.data : payload;
  const raw: Array<{ key?: string; row: any }> = source instanceof Map
    ? [...source.entries()].map(([key, row]) => ({ key: String(key), row }))
    : Array.isArray(source)
      ? source.map((row: any) => ({ row }))
      : source && typeof source === 'object'
        ? Object.entries(source).map(([key, row]) => ({ key, row }))
        : [];

  return raw.map(({ key, row }) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const keyed = String(key || '');
    const explicitSymbol = first(row, ['symbol', 'symbol_ticker', 'symTicker', 'ticker']);
    const symbol = keyed.includes(':') ? keyed : (explicitSymbol || keyed);
    const description = first(row, ['description', 'exSymName', 'symDetails', 'company_name', 'companyName', 'name']);
    const exchange = first(row, ['exchange', 'exSym', 'ex_sym', 'exchange_name']) || master.split('_')[0];
    const rawType = first(row, ['instrument_type', 'instrumentType', 'segment', 'type', 'exInstType', 'series']);
    const expiry = normalizeExpiry(first(row, ['expiry', 'expiryDate', 'expiry_date', 'exExpiryDate', 'expDate']));
    const strike = first(row, ['strike', 'strikePrice', 'strike_price', 'exStrikePrice']);
    const optionType = first(row, ['option_type', 'optType', 'optionType', 'exOptType']);
    const lotSize = first(row, ['lot_size', 'minLotSize', 'lotSize', 'min_lot_size']);
    const searchable = [symbol, description, exchange, rawType, expiry, strike, optionType, master].join(' ').toLowerCase();
    return { ...row, master, symbol, description, exchange, type: rawType, expiry, strike, optionType, lotSize, searchable } as Row;
  }).filter((row): row is Row => Boolean(row && row.symbol));
}

async function loadMasters(): Promise<Row[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.rows;
  if (inflight) return inflight;
  // Reuse the platform's canonical FYERS symbol-master service: there is one
  // in-flight/cache owner per exchange master, shared with existing symbol lookup
  // routes. This coordinator only caches the smaller reconciled search index.
  inflight = Promise.allSettled(FyersSymbolMasterService.masterNames().map(async (master) => {
    const indexed = await FyersSymbolMasterService.load(master);
    return normalize(indexed, master);
  })).then((parts) => {
    const fulfilled = parts.filter((part): part is PromiseFulfilledResult<Row[]> => part.status === 'fulfilled');
    if (!fulfilled.length) {
      const failed = parts.find((part): part is PromiseRejectedResult => part.status === 'rejected');
      throw new Error(failed?.reason instanceof Error ? failed.reason.message : 'All FYERS instrument masters are unavailable');
    }
    lastMasterLoadStatus = { partial: fulfilled.length !== parts.length, failedMasters: parts.length - fulfilled.length };
    const rows = fulfilled.flatMap((part) => part.value);
    // Recheck partial results quickly; per-master data itself stays in its shared
    // service cache, so unavailable masters are retried without redownloading good ones.
    cache = { rows, expiresAt: Date.now() + (lastMasterLoadStatus.partial ? 30_000 : 6 * 60 * 60 * 1000) };
    return rows;
  }).finally(() => { inflight = null; });
  return inflight;
}

function cleanText(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[,\s_:/.-]+/g, ' ').replace(/[^a-z0-9. ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function compact(value: unknown): string {
  return String(value ?? '').split(':').pop()!.toUpperCase().replace(/[^A-Z0-9.]/g, '');
}

function expiryTime(value: unknown): number {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '0') return Number.POSITIVE_INFINITY;
  if (/^\d{8}$/.test(raw) && Number(raw.slice(0, 4)) >= 2000) {
    return Date.UTC(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8)));
  }
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    if (numeric > 1e12) return numeric;
    if (numeric > 1e9) return numeric * 1000;
    return Number.POSITIVE_INFINITY;
  }
  const dayFirst = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(raw);
  if (dayFirst) {
    const ms = Date.UTC(Number(dayFirst[3]), Number(dayFirst[2]) - 1, Number(dayFirst[1]));
    return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function normalizeExpiry(value: unknown): string {
  const raw = String(value ?? '').trim();
  const time = expiryTime(raw);
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
}

function family(row: Row): { future: boolean; option: boolean; commodity: boolean; currency: boolean; stock: boolean; index: boolean; side: 'PE' | 'CE' | '' } {
  const ticker = compact(row.symbol);
  const description = String(row.description || '').toUpperCase();
  const type = String(row.type || '').toUpperCase();
  const master = String(row.master || '').toUpperCase();
  const optionValue = String(row.optionType || '').toUpperCase();
  const side = /(?:PE|PUT)$/.test(optionValue) || /(?:PE|PUT)$/.test(ticker) ? 'PE'
    : /(?:CE|CALL)$/.test(optionValue) || /(?:CE|CALL)$/.test(ticker) ? 'CE' : '';
  const option = Boolean(side) || /OPT(?:IDX|STK|FUT)?|OPTION/.test(type + ' ' + description);
  const future = !option && (/(?:FUT|FUTURE)$/.test(ticker) || /FUT(?:IDX|STK|COM)|FUTURE/.test(type + ' ' + description));
  const commodity = master.endsWith('_COM') || /CRUDE OIL|NATURAL GAS|GOLD|SILVER|COPPER|ALUMINIUM|ZINC|LEAD|NICKEL/.test(description);
  const currency = master === 'NSE_CD' || /CURRENCY|USDINR|EURINR|GBPINR|JPYINR/.test(type + ' ' + ticker);
  const stock = (master === 'NSE_CM' || master === 'BSE_CM') && !future && !option;
  const index = /INDEX|IDX/.test(type + ' ' + description) || /(?:INDEX)$/.test(ticker);
  return { future, option, commodity, currency, stock, index, side };
}

function queryIntent(raw: string) {
  const normalized = cleanText(raw.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1'));
  const parts = normalized.split(' ').filter(Boolean);
  const sideToken = parts.find((token) => ['pe', 'put', 'ce', 'call'].includes(token));
  const side: 'PE' | 'CE' | '' = sideToken === 'pe' || sideToken === 'put' ? 'PE'
    : sideToken === 'ce' || sideToken === 'call' ? 'CE' : '';
  const asksFutures = parts.some((token) => ['future', 'futures', 'fut'].includes(token));
  const asksOptions = parts.some((token) => ['option', 'options'].includes(token)) || Boolean(side);
  const asksCommodity = parts.some((token) => ['commodity', 'commodities', 'mcx'].includes(token));
  const asksCurrency = parts.some((token) => ['currency', 'currencies', 'forex'].includes(token));
  const tokens = parts.filter((token) => !['future', 'futures', 'fut', 'option', 'options', 'commodity', 'commodities', 'mcx', 'currency', 'currencies', 'forex', 'nearest', 'expiry', 'expiries', 'contract', 'contracts', 'put', 'call', 'pe', 'ce'].includes(token));
  return { parts, tokens, side, asksFutures, asksOptions, asksCommodity, asksCurrency, rawCompact: compact(raw) };
}

function inSegment(row: Row, segment: string, kind: ReturnType<typeof family>): boolean {
  switch (segment) {
    case 'stocks': return kind.stock || (kind.index && (row.master === 'NSE_CM' || row.master === 'BSE_CM'));
    case 'futures': return kind.future;
    case 'options': return kind.option;
    case 'commodities': return kind.commodity;
    case 'currency': return kind.currency;
    default: return true;
  }
}

function score(row: Row, intent: ReturnType<typeof queryIntent>): number {
  const kind = family(row);
  const ticker = String(row.symbol || '').toUpperCase();
  const desc = String(row.description || '').toUpperCase();
  const searchable = cleanText([row.symbol, row.description, row.exchange, row.type, row.expiry, row.strike, row.optionType, row.lotSize, row.master].join(' '));
  const compactTicker = compact(ticker);
  const normalizedQuery = cleanText(intent.parts.join(' '));
  if (!intent.tokens.every((token) => searchable.includes(token) || compactTicker.toLowerCase().includes(token.replace(/[^a-z0-9.]/g, '')))) return -1;
  if (intent.side && (!kind.option || kind.side !== intent.side)) return -1;
  if (intent.asksFutures && !kind.future) return -1;
  if (intent.asksOptions && !kind.option) return -1;
  if (intent.asksCommodity && !kind.commodity) return -1;
  if (intent.asksCurrency && !kind.currency) return -1;
  // A numeric token in an option query is the requested strike. Treat it as an
  // exact constraint, not merely a relevance bonus; adjacent strikes must never be
  // presented as matches for a precise contract query.
  const strikeTokens = intent.tokens.filter((token) => /^\d+(?:\.\d+)?$/.test(token));
  if (strikeTokens.length && kind.option) {
    const strike = Number(String(row.strike || '').replace(/,/g, ''));
    if (!Number.isFinite(strike) || !strikeTokens.some((token) => Number(token) === strike)) return -1;
  }

  let value = 0;
  if (compactTicker === intent.rawCompact) value += 5000;
  if (intent.rawCompact && compactTicker.startsWith(intent.rawCompact)) value += 500;
  for (const token of intent.tokens) {
    if (cleanText(ticker).includes(token)) value += 180;
    else if (cleanText(desc).includes(token)) value += 90;
    else value += 35;
  }
  if (strikeTokens.length && kind.option) value += 1800;
  if (intent.side && kind.side === intent.side) value += 1200;
  if (intent.asksFutures && kind.future) value += 700;
  if (intent.asksOptions && kind.option) value += 500;
  if (/\bnifty\b/i.test(normalizedQuery) && !/finnifty/i.test(normalizedQuery)) {
    if (/^NIFTY(?!BANK|FIN)/.test(compactTicker)) value += 550;
    if (/^FINNIFTY/.test(compactTicker)) value -= 850;
  }
  if (kind.commodity && /crude|oil|natural gas|gold|silver/i.test(normalizedQuery)) value += 240;
  if (/^\d+(?:\.\d+)?$/.test(normalizedQuery) && String(row.strike || '') === normalizedQuery) value += 300;
  return value;
}

function mapRow(row: Row) {
  const kind = family(row);
  const type = kind.option ? 'Option' : kind.future ? 'Future' : kind.commodity ? 'Commodity' : kind.currency ? 'Currency' : kind.index ? 'Index' : kind.stock ? 'Stock' : (row.type || 'Instrument');
  return {
    key: row.symbol,
    label: row.description || row.symbol,
    symbol: row.symbol,
    description: row.description,
    exchange: row.exchange,
    type,
    expiry: row.expiry || undefined,
    strike: row.strike !== '' && row.strike != null && Number.isFinite(Number(row.strike)) ? Number(row.strike) : undefined,
    optionType: kind.side || (row.optionType ? String(row.optionType).toUpperCase() : undefined),
    lotSize: row.lotSize ? Number(row.lotSize) : undefined,
    master: row.master,
  };
}

export function rankFyersInstrumentRows(rows: readonly Row[], query: string, segment = 'all', requestedLimit = 30, nowMs = Date.now()) {
  const intent = queryIntent(query);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, Math.trunc(requestedLimit))) : 30;
  const normalizedSegment = segment.toLowerCase();
  const expiredCutoff = nowMs - 24 * 60 * 60 * 1000;
  const scored = rows.map((row) => {
    const kind = family(row);
    return { row, kind, score: inSegment(row, normalizedSegment, kind) ? score(row, intent) : -1 };
  }).filter((item) => {
    if (item.score < 0) return false;
    if (!item.kind.future && !item.kind.option) return true;
    const expiry = expiryTime(item.row.expiry);
    // FYERS can retain a just-expired contract in a stale master briefly; keep today's
    // expiry visible through the session, but never rank clearly expired futures as active.
    return !Number.isFinite(expiry) || expiry >= expiredCutoff;
  });

  // Expiry is the secondary ordering criterion for futures: all matching contracts
  // remain discoverable, with the closest dated contract first.
  const nearestDerivativeFirst = intent.asksFutures || intent.asksOptions || normalizedSegment === 'futures' || normalizedSegment === 'options' || normalizedSegment === 'commodities';
  scored.sort((a, b) => b.score - a.score
    || (nearestDerivativeFirst && (a.kind.future || a.kind.option) && (b.kind.future || b.kind.option) ? expiryTime(a.row.expiry) - expiryTime(b.row.expiry) : 0)
    || String(a.row.symbol).localeCompare(String(b.row.symbol)));

  const seen = new Set<string>();
  const data = scored.map(({ row }) => mapRow(row)).filter((row) => {
    const key = String(row.key).toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
  return {
    data,
    total: scored.length,
    queryIntent: { futures: intent.asksFutures, options: intent.asksOptions, side: intent.side || undefined },
  };
}

instrumentSearchPriorityRoutes.get('/:brokerId/instruments/search', async (req, res, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const q = String(req.query.q || '').trim();
  const segment = String(req.query.segment || 'all').toLowerCase();
  const limitValue = Number(req.query.limit || 30);
  const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(100, Math.trunc(limitValue))) : 30;
  if (q.length < 2) return res.json({ success: true, data: [], total: 0, source: 'fyers-symbol-master-prioritized-search' });

  try {
    const result = rankFyersInstrumentRows(await loadMasters(), q, segment, limit);
    return res.json({ success: true, ...result, ...lastMasterLoadStatus, source: 'fyers-symbol-master-prioritized-search' });
  } catch (error: any) {
    return res.status(502).json({ success: false, error: error?.message || 'Unable to search FYERS instruments' });
  }
});

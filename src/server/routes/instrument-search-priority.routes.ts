import { Router } from 'express';
import { requireUser } from '../auth/requireUser.js';

type Row = Record<string, any>;

export const instrumentSearchPriorityRoutes = Router();
instrumentSearchPriorityRoutes.use(requireUser);

const MASTERS = [
  'https://public.fyers.in/sym_details/NSE_CM_sym_master.json',
  'https://public.fyers.in/sym_details/NSE_FO_sym_master.json',
  'https://public.fyers.in/sym_details/BSE_CM_sym_master.json',
  'https://public.fyers.in/sym_details/BSE_FO_sym_master.json',
];

let cache: { expiresAt: number; rows: Row[] } | null = null;
let inflight: Promise<Row[]> | null = null;

function first(row: Row, keys: string[]): string {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function normalize(payload: any): Row[] {
  const raw: Array<{ key?: string; row: any }> = Array.isArray(payload)
    ? payload.map((row) => ({ row }))
    : payload && typeof payload === 'object'
      ? Object.entries(payload).map(([key, row]) => ({ key, row }))
      : [];

  return raw.map(({ key, row }) => {
    const symbol = first(row, ['symbol', 'symTicker', 'ticker']) || String(key || '');
    const description = first(row, ['description', 'exSymName', 'symDetails', 'company_name', 'companyName', 'name']);
    const exchange = first(row, ['exchange', 'exSym', 'ex_sym', 'exchange_name']);
    const type = first(row, ['instrument_type', 'instrumentType', 'segment', 'type']);
    const expiry = first(row, ['expiry', 'expiryDate', 'expiry_date']);
    const strike = first(row, ['strike', 'strikePrice', 'strike_price']);
    const optionType = first(row, ['option_type', 'optType', 'optionType']);
    const lotSize = first(row, ['lot_size', 'minLotSize', 'lotSize', 'min_lot_size']);
    const searchable = [symbol, description, exchange, type, expiry, strike, optionType].join(' ').toLowerCase();
    return { symbol, description, exchange, type, expiry, strike, optionType, lotSize, searchable };
  }).filter((row) => row.symbol);
}

async function loadMasters(): Promise<Row[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.rows;
  if (inflight) return inflight;
  inflight = Promise.all(MASTERS.map(async (url) => {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`FYERS symbol master failed (${response.status})`);
    return normalize(await response.json());
  })).then((parts) => {
    const rows = parts.flat();
    cache = { rows, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
    return rows;
  }).finally(() => { inflight = null; });
  return inflight;
}

function score(row: Row, tokens: string[], raw: string): number {
  const text = row.searchable;
  const symbol = row.symbol.toLowerCase();
  const description = String(row.description || '').toLowerCase();
  if (!tokens.every((token) => text.includes(token))) return -1;

  const isFinnifty = symbol.includes('finnifty') || description.includes('financial services');
  const isNifty50 = symbol.includes('nifty50') || /\bnifty\s*50\b/.test(description);
  const asksNifty = tokens.includes('nifty');
  let value = 0;

  if (symbol === raw) value += 5000;
  if (symbol.startsWith(raw)) value += 500;
  for (const token of tokens) value += symbol.includes(token) ? 140 : 30;
  if (row.optionType) value += 10;
  if (/^\d+(?:\.\d+)?$/.test(raw) && String(row.strike || '') === raw) value += 250;

  // Treat plain "nifty" as the NIFTY 50 family search, not FINNIFTY.
  // This keeps NIFTY 50/index/options ahead of FINNIFTY while still
  // allowing explicit searches such as "finnifty" to return FINNIFTY.
  if (asksNifty && !tokens.includes('finnifty')) {
    if (isNifty50) value += 5000;
    else if (isFinnifty) value -= 3000;
    else if (symbol.includes('nifty')) value += 350;
  }

  return value;
}

function mapRow(row: Row) {
  return {
    key: row.symbol,
    label: row.description || row.symbol,
    symbol: row.symbol,
    description: row.description,
    exchange: row.exchange,
    type: row.type,
    expiry: row.expiry,
    strike: row.strike ? Number(row.strike) : undefined,
    optionType: row.optionType,
    lotSize: row.lotSize ? Number(row.lotSize) : undefined,
  };
}

instrumentSearchPriorityRoutes.get('/:brokerId/instruments/search', async (req, res, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const q = String(req.query.q || '').trim().toLowerCase();
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30)));
  if (q.length < 2) return res.json({ success: true, data: [], total: 0 });

  try {
    const rows = await loadMasters();
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored = rows
      .map((row) => ({ row, score: score(row, tokens, q) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score || a.row.symbol.localeCompare(b.row.symbol));

    const seen = new Set<string>();
    const data = scored.map(({ row }) => mapRow(row)).filter((row) => {
      if (seen.has(row.key)) return false;
      seen.add(row.key);
      return true;
    }).slice(0, limit);

    return res.json({ success: true, data, total: data.length, source: 'fyers-symbol-master-prioritized-search' });
  } catch (error: any) {
    return res.status(502).json({ success: false, error: error?.message || 'Unable to search FYERS instruments' });
  }
});

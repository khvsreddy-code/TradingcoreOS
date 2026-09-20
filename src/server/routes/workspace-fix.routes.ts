import { Router, Response } from 'express';
import { BrokerRegistry } from '../brokers/BrokerRegistry.js';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';

type Row = Record<string, any>;

export const workspaceFixRoutes = Router();
workspaceFixRoutes.use(requireUser);

const FYERS_MASTERS: Record<string, string> = {
  nse_cm: 'https://public.fyers.in/sym_details/NSE_CM_sym_master.json',
  nse_com: 'https://public.fyers.in/sym_details/NSE_COM_sym_master.json',
  bse_cm: 'https://public.fyers.in/sym_details/BSE_CM_sym_master.json',
  nse_fo: 'https://public.fyers.in/sym_details/NSE_FO_sym_master.json',
  bse_fo: 'https://public.fyers.in/sym_details/BSE_FO_sym_master.json',
  mcx_com: 'https://public.fyers.in/sym_details/MCX_COM_sym_master.json',
  nse_cd: 'https://public.fyers.in/sym_details/NSE_CD_sym_master.json',
};
const masterCache = new Map<string, { expiresAt: number; rows: Row[] }>();
const masterInflight = new Map<string, Promise<Row[]>>();

function first(row: Row, keys: string[]): string {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function normalizeMaster(payload: any): Row[] {
  const raw: Array<{ key?: string; row: any }> = Array.isArray(payload)
    ? payload.map((row) => ({ row }))
    : Array.isArray(payload?.data)
      ? payload.data.map((row: any) => ({ row }))
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

async function loadMaster(name: string): Promise<Row[]> {
  const cached = masterCache.get(name);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  const pending = masterInflight.get(name);
  if (pending) return pending;
  const url = FYERS_MASTERS[name];
  if (!url) return [];
  const promise = fetch(url, { headers: { Accept: 'application/json' } })
    .then(async (r) => {
      if (!r.ok) throw new Error(`FYERS symbol master ${name} failed (${r.status})`);
      const rows = normalizeMaster(await r.json());
      masterCache.set(name, { rows, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
      return rows;
    })
    .finally(() => masterInflight.delete(name));
  masterInflight.set(name, promise);
  return promise;
}

function mastersFor(segment: string): string[] {
  switch (segment) {
    case 'stocks': return ['nse_cm', 'bse_cm'];
    case 'futures': return ['nse_fo', 'bse_fo', 'mcx_com'];
    case 'options': return ['nse_fo', 'bse_fo'];
    case 'commodities': return ['nse_com', 'mcx_com'];
    case 'currency': return ['nse_cd'];
    default: return Object.keys(FYERS_MASTERS);
  }
}

async function session(req: AuthenticatedRequest, res: Response, brokerId: string) {
  const userId = req.tradingCoreUserId!;
  const saved = await BrokerRepository.getSession(brokerId, userId);
  if (!saved || saved.status !== 'Connected') {
    res.status(401).json({ success: false, error: `${brokerId} is not connected for this account.` });
    return null;
  }
  try { return EncryptionService.decrypt(saved.accessTokenEncrypted); }
  catch { res.status(500).json({ success: false, error: `Unable to decrypt the ${brokerId} session.` }); return null; }
}

function scoreSearch(row: Row, tokens: string[], raw: string): number {
  const text = row.searchable;
  const symbol = row.symbol.toLowerCase();
  let score = 0;
  if (symbol === raw) score += 1000;
  if (symbol.startsWith(raw)) score += 400;
  for (const token of tokens) {
    if (!text.includes(token)) return -1;
    score += symbol.includes(token) ? 100 : 25;
  }
  if (row.optionType) score += 10;
  if (/^\d+(?:\.\d+)?$/.test(raw) && String(row.strike || '') === raw) score += 250;
  return score;
}

function mapSearch(row: Row) {
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

workspaceFixRoutes.get('/:brokerId/instruments/search', async (req: AuthenticatedRequest, res: Response, next) => {
  const brokerId = String(req.params.brokerId).toLowerCase();
  const q = String(req.query.q || '').trim().toLowerCase();
  const segment = String(req.query.segment || 'all').toLowerCase();
  const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30)));
  if (!q) return res.json({ success: true, data: [], total: 0 });

  if (brokerId === 'fyers') {
    if (q.length < 2) return res.json({ success: true, data: [], total: 0 });
    try {
      const masters = await Promise.all(mastersFor(segment).map(loadMaster));
      const tokens = q.split(/\s+/).filter(Boolean);
      const scored = masters.flat().map((row) => ({ row, score: scoreSearch(row, tokens, q) })).filter((x) => x.score >= 0);
      const seen = new Set<string>();
      const data = scored.sort((a, b) => b.score - a.score || a.row.symbol.localeCompare(b.row.symbol)).map((x) => mapSearch(x.row)).filter((row) => {
        if (seen.has(row.key)) return false;
        seen.add(row.key); return true;
      }).slice(0, limit);
      return res.json({ success: true, data, total: data.length, source: 'fyers-symbol-master-suggestions' });
    } catch (err: any) {
      return res.status(502).json({ success: false, error: err?.message || 'Unable to search FYERS instruments' });
    }
  }

  if (brokerId === 'upstox') {
    const token = await session(req, res, 'upstox');
    if (!token) return;
    try {
      const tokens = q.split(/\s+/).filter(Boolean);
      const params = new URLSearchParams({ query: q, page_number: '1', records: '30' });
      if (segment === 'options') {
        params.set('segments', 'FO');
        params.set('instrument_types', 'CE,PE');
        params.set('expiry', 'current_week');
      } else if (segment === 'futures') {
        params.set('segments', 'FO');
        params.set('instrument_types', 'FUT');
        params.set('expiry', 'current_month');
      } else if (segment === 'stocks') params.set('segments', 'EQ');
      else params.set('segments', 'ALL');
      const response = await fetch(`https://api.upstox.com/v2/instruments/search?${params.toString()}`, { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok || payload?.status !== 'success') throw new Error(payload?.errors?.[0]?.message || payload?.message || `Upstox instrument search failed (${response.status})`);
      const data = (Array.isArray(payload.data) ? payload.data : []).map((row: any) => ({
        key: row.instrument_key,
        label: row.trading_symbol || row.short_name || row.name || row.instrument_key,
        symbol: row.trading_symbol || row.instrument_key,
        description: row.name,
        exchange: row.exchange,
        type: row.instrument_type,
        expiry: row.expiry,
        strike: Number.isFinite(Number(row.strike_price)) ? Number(row.strike_price) : undefined,
        optionType: ['CE', 'PE'].includes(String(row.instrument_type)) ? String(row.instrument_type) : undefined,
        lotSize: Number.isFinite(Number(row.lot_size)) ? Number(row.lot_size) : undefined,
      })).filter((row: any) => tokens.every((t) => [row.symbol, row.description, row.expiry, row.strike, row.optionType].filter(Boolean).join(' ').toLowerCase().includes(t))).slice(0, limit);
      return res.json({ success: true, data, total: data.length, source: 'upstox-instrument-search-suggestions' });
    } catch (err: any) {
      return res.status(502).json({ success: false, error: err?.message || 'Unable to search Upstox instruments' });
    }
  }
  return next();
});

function normalizeFyersUnderlying(key: string): string {
  const value = decodeURIComponent(String(key || '')).trim();
  const upper = value.toUpperCase();
  if (upper === 'NSE_INDEX|NIFTY 50' || upper === 'NSE:NIFTY50-INDEX') return 'NSE:NIFTY50-INDEX';
  if (upper === 'NSE_INDEX|NIFTY BANK' || upper === 'NSE:NIFTYBANK-INDEX') return 'NSE:NIFTYBANK-INDEX';
  if (upper.includes('FINNIFTY')) return 'NSE:FINNIFTY-INDEX';
  if (upper.includes('MIDCPNIFTY')) return 'NSE:MIDCPNIFTY-INDEX';
  if (upper === 'BSE_INDEX|SENSEX' || upper === 'BSE:SENSEX-INDEX') return 'BSE:SENSEX-INDEX';
  // FYERS option-chain accepts the underlying cash symbol for stock F&O names.
  // Normalize common search/watchlist aliases so a stock selected as RELIANCE
  // still resolves to the broker's canonical NSE:RELIANCE-EQ symbol.
  if (!upper.includes(':') && /^[A-Z0-9&.-]+$/.test(upper)) return `NSE:${upper}-EQ`;
  if (/^NSE:[A-Z0-9&.-]+$/.test(upper) && !upper.endsWith('-EQ') && !upper.endsWith('-INDEX')) return `${upper}-EQ`;
  if (/^BSE:[A-Z0-9&.-]+$/.test(upper) && !upper.endsWith('-EQ') && !upper.endsWith('-INDEX')) return `${upper}-EQ`;
  return value;
}

async function resolveUpstoxExpiry(accessToken: string, instrumentKey: string, requested: string): Promise<string> {
  if (/^\d{4}-\d{2}-\d{2}$/.test(requested)) return requested;
  const response = await fetch(`https://api.upstox.com/v2/option/contract?instrument_key=${encodeURIComponent(instrumentKey)}&expiry_date=${encodeURIComponent(requested)}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();
  if (!response.ok || payload?.status !== 'success') {
    throw new Error(payload?.errors?.[0]?.message || payload?.message || `Unable to resolve Upstox expiry ${requested}`);
  }
  const expiries = [...new Set<string>((Array.isArray(payload.data) ? payload.data : []).map((row: any) => String(row.expiry || '')).filter((x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x)))].sort();
  if (!expiries.length) throw new Error(`No active Upstox option expiry found for ${requested}.`);
  return expiries[0];
}

function optionAnalytics(chain: any) {
  const contracts = Array.isArray(chain?.contracts) ? chain.contracts : [];
  let callOi = 0, putOi = 0, callChangeOi = 0, putChangeOi = 0;
  for (const c of contracts) {
    callOi += Number(c?.call?.oi || 0);
    putOi += Number(c?.put?.oi || 0);
    callChangeOi += Number(c?.call?.oi || 0) - Number(c?.call?.previousOi ?? c?.call?.oi ?? 0);
    putChangeOi += Number(c?.put?.oi || 0) - Number(c?.put?.previousOi ?? c?.put?.oi ?? 0);
  }
  let maxPain: number | undefined;
  let minPain = Number.POSITIVE_INFINITY;
  for (const candidate of contracts) {
    const strike = Number(candidate?.strike);
    if (!Number.isFinite(strike)) continue;
    let pain = 0;
    for (const x of contracts) {
      const s = Number(x?.strike);
      pain += Math.max(0, strike - s) * Number(x?.call?.oi || 0);
      pain += Math.max(0, s - strike) * Number(x?.put?.oi || 0);
    }
    if (pain < minPain) { minPain = pain; maxPain = strike; }
  }
  return {
    pcr: callOi > 0 ? putOi / callOi : undefined,
    maxPain,
    totalCallOi: callOi,
    totalPutOi: putOi,
    callChangeOi,
    putChangeOi,
    netChangeOi: putChangeOi - callChangeOi,
    oiFlow: contracts.map((c: any) => ({
      strike: Number(c.strike),
      callChangeOi: Number(c?.call?.oi || 0) - Number(c?.call?.previousOi ?? c?.call?.oi ?? 0),
      putChangeOi: Number(c?.put?.oi || 0) - Number(c?.put?.previousOi ?? c?.put?.oi ?? 0),
    })),
  };
}

workspaceFixRoutes.get('/:brokerId/option-chain', async (req: AuthenticatedRequest, res: Response, next) => {
  const brokerId = String(req.params.brokerId).toLowerCase();
  if (brokerId !== 'fyers' && brokerId !== 'upstox') return next();
  const token = await session(req, res, brokerId);
  if (!token) return;
  const rawKey = String(req.query.instrument_key || '');
  if (!rawKey) return res.status(400).json({ success: false, error: 'instrument_key is required' });
  try {
    const broker = BrokerRegistry.getAdapter(brokerId);
    const underlying = brokerId === 'fyers' ? normalizeFyersUnderlying(rawKey) : rawKey;
    let expiry = String(req.query.expiry_date || 'current_week');
    if (brokerId === 'upstox') expiry = await resolveUpstoxExpiry(token, underlying, expiry);
    const rawData = await broker.getOptionChain(token, underlying, expiry);
    if (!rawData || !Array.isArray(rawData.contracts) || !rawData.contracts.length) {
      throw new Error('Broker returned an empty option chain. Check that the selected symbol is F&O-enabled and the expiry is active.');
    }
    const contracts = rawData.contracts.map((contract: any) => ({
      ...contract,
      call: contract.call ? { ...contract.call, oiChange: Number(contract.call.oi || 0) - Number(contract.call.previousOi ?? contract.call.oi ?? 0) } : contract.call,
      put: contract.put ? { ...contract.put, oiChange: Number(contract.put.oi || 0) - Number(contract.put.previousOi ?? contract.put.oi ?? 0) } : contract.put,
    }));
    const data = { ...rawData, expiry, contracts };
    return res.json({ success: true, data: { ...data, analytics: optionAnalytics(data) } });
  } catch (err: any) {
    return res.status(502).json({ success: false, error: err?.message || `Unable to load ${brokerId} option chain` });
  }
});

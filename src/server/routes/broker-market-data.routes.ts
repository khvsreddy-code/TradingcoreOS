import { Router, Request, Response } from 'express';
import { BrokerRegistry } from '../brokers/BrokerRegistry.js';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { FyersMarketDataTransport } from '../marketData/FyersMarketDataTransport.js';

export const brokerMarketDataRoutes = Router();
brokerMarketDataRoutes.use(requireUser);

async function getFyersSession(req: AuthenticatedRequest, res: Response) {
  const brokerId = String(req.params.brokerId || '').toLowerCase();
  if (brokerId !== 'fyers') return null;
  const userId = req.tradingCoreUserId!;
  const session = await BrokerRepository.getSession('fyers', userId);
  if (!session || session.status !== 'Connected') { res.status(401).json({ success: false, error: 'Fyers is not connected for this account.' }); return null; }
  try { const token = EncryptionService.decrypt(session.accessTokenEncrypted); return { userId, token }; }
  catch { res.status(500).json({ success: false, error: 'Unable to decrypt the Fyers session.' }); return null; }
}

function toFyersSymbol(symbol: string): string {
  const value = decodeURIComponent(String(symbol || '')).trim();
  const normalized = value.toLowerCase().replace(/\s+/g, '');
  const aliases: Record<string, string> = {
    'nse_index|nifty50': 'NSE:NIFTY50-INDEX', 'nse_index|nifty50index': 'NSE:NIFTY50-INDEX',
    'nse_index|niftybank': 'NSE:NIFTYBANK-INDEX', 'nse_index|niftybankindex': 'NSE:NIFTYBANK-INDEX',
    'nse_index|niftyfinancialservices': 'NSE:FINNIFTY-INDEX', 'nse_index|finnifty': 'NSE:FINNIFTY-INDEX',
    'nse_index|niftymidcapselect': 'NSE:MIDCPNIFTY-INDEX', 'bse_index|sensex': 'BSE:SENSEX-INDEX',
  };
  if (aliases[normalized]) return aliases[normalized];
  if (/^(NSE|BSE|MCX):/i.test(value)) return value;
  return value;
}

const fyersResolution: Record<string,string> = {
  '1minute': '1', '3minute': '3', '5minute': '5', '15minute': '15',
  '30minute': '30', '60minute': '60', 'day': 'D'
};

const intervalSeconds: Record<string, number> = {
  '1minute': 60, '3minute': 180, '5minute': 300, '15minute': 900,
  '30minute': 1800, '60minute': 3600, 'day': 86400
};

function indiaDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

function mapFyersCandles(rows: any[]): any[] {
  return (rows || []).map((c: any[]) => ({
    timestamp: new Date(Number(c[0]) * 1000).toISOString(),
    open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5] || 0),
  })).filter((c: any) => [c.open, c.high, c.low, c.close].every(Number.isFinite))
    .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function normalizeCandles(rows: any[], limit: number): any[] {
  const unique = new Map<number, any>();
  for (const row of rows || []) {
    const timestamp = new Date(row.timestamp).getTime();
    if (Number.isFinite(timestamp)) unique.set(timestamp, row);
  }
  return [...unique.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row).slice(-limit);
}

async function requestFyersHistory(accessToken: string, symbol: string, resolution: string, query: URLSearchParams): Promise<any[]> {
  const url = `https://api-t1.fyers.in/data/history?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}&${query.toString()}`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', Authorization: `${process.env.FYERS_CLIENT_ID}:${accessToken}` },
  });
  const text = await response.text();
  let payload: any;
  try { payload = JSON.parse(text); } catch { throw new Error(`Fyers history returned a non-JSON response (${response.status})`); }
  if (!response.ok || payload?.s === 'error') throw new Error(payload?.message || `Fyers history failed (${response.status})`);
  return mapFyersCandles(payload?.candles || []);
}

function rangeForCandleTarget(interval: string, target: number, multiplier = 1) {
  const seconds = intervalSeconds[interval] || 300;
  // Intraday markets are not open 24/7. The factor below converts the desired
  // bar count into a generous calendar window while keeping requests bounded.
  const calendarSeconds = seconds * target * 1.75 * multiplier;
  const from = new Date(Date.now() - calendarSeconds * 1000);
  return { from: indiaDate(from), to: indiaDate() };
}

async function fetchFyersHistoryTarget(accessToken: string, symbol: string, interval: string, target: number): Promise<any[]> {
  const resolution = fyersResolution[interval] || interval;
  const attempts = [1, 1.8, 3.2];
  let best: any[] = [];
  const errors: string[] = [];

  for (const multiplier of attempts) {
    const range = rangeForCandleTarget(interval, target, multiplier);
    try {
      const query = new URLSearchParams({ date_format: '1', range_from: range.from, range_to: range.to, cont_flag: '1' });
      const rows = normalizeCandles(await requestFyersHistory(accessToken, symbol, resolution, query), target);
      if (rows.length > best.length) best = rows;
      if (best.length >= target) break;
    } catch (error: any) {
      errors.push(error?.message || 'history request failed');
    }
  }

  if (!best.length) throw new Error(errors.join(' · ') || `Fyers returned no historical candles for ${symbol}`);
  return best;
}

brokerMarketDataRoutes.get('/:brokerId/historical', async (req: Request, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const session = await getFyersSession(req as AuthenticatedRequest, res); if (!session) return;
  const symbol = toFyersSymbol(String(req.query.instrument_key || ''));
  const interval = String(req.query.interval || '');
  const requestedLimit = Number(req.query.limit || 25_000);
  const limit = Number.isFinite(requestedLimit) ? Math.max(2, Math.min(25_000, Math.floor(requestedLimit))) : 25_000;
  if (!symbol || !interval) return res.status(400).json({ success: false, error: 'instrument_key and interval are required' });

  try {
    const candles = await fetchFyersHistoryTarget(session.token, symbol, interval, limit);
    res.setHeader('Cache-Control', 'private, max-age=15');
    return res.json({ success: true, data: candles, requested: limit, returned: candles.length });
  } catch (err: any) {
    return res.status(502).json({ success: false, error: err?.message || `Unable to load Fyers historical candles for ${symbol}` });
  }
});

brokerMarketDataRoutes.get('/:brokerId/option-chain', async (req: Request, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const session = await getFyersSession(req as AuthenticatedRequest, res); if (!session) return;
  const symbol = toFyersSymbol(String(req.query.instrument_key || '')); const expiryDate = String(req.query.expiry_date || 'current_week');
  if (!symbol) return res.status(400).json({ success: false, error: 'instrument_key is required' });
  try {
    const adapter = BrokerRegistry.getAdapter('fyers');
    const data = await adapter.getOptionChain(session.token, symbol, expiryDate);
    res.setHeader('Cache-Control', 'private, max-age=5');
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(502).json({ success: false, error: err?.message || 'Unable to load Fyers option chain' });
  }
});

brokerMarketDataRoutes.get('/:brokerId/market-stream', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const session = await getFyersSession(req, res); if (!session) return;
  const rawSymbols = String(req.query.instrument_keys || '').split(',').map(x => x.trim()).filter(Boolean);
  const symbols = rawSymbols.map(toFyersSymbol).filter(Boolean);
  if (!symbols.length) return res.status(400).json({ success: false, error: 'instrument_keys is required' });
  if (symbols.length > 100) return res.status(400).json({ success: false, error: 'Too many market symbols requested' });
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const write = (event: any) => { try { res.write(`${JSON.stringify(event)}\n`); } catch {} };
  const unsubscribe = FyersMarketDataTransport.subscribe(session.userId, session.token, symbols, write);
  const heartbeat = setInterval(() => write({ type: 'status', status: 'connected' }), 12000);
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

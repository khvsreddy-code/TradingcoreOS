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

const fyersResolution: Record<string,string> = {'1minute':'1','3minute':'3','5minute':'5','15minute':'15','30minute':'30','60minute':'60','day':'D'};

function indiaDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function toIndiaDayEpochs(date: string) {
  const start = Math.floor(new Date(`${date}T00:00:00+05:30`).getTime() / 1000);
  const end = Math.floor(Date.now() / 1000);
  return { start, end };
}

function mapFyersCandles(rows: any[]): any[] {
  return (rows || []).map((c: any[]) => ({
    timestamp: new Date(Number(c[0]) * 1000).toISOString(),
    open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5] || 0),
  })).filter((c: any) => [c.open, c.high, c.low, c.close].every(Number.isFinite))
    .sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
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

async function fetchFyersCurrentSession(accessToken: string, symbol: string, interval: string): Promise<any[]> {
  const resolution = fyersResolution[interval] || interval;
  const date = indiaDate();
  const errors: string[] = [];

  // FYERS supports current-day intraday history with date_format=1. This is
  // deliberately attempted first so the chart can never silently fall back
  // to a 30-day dataset and display yesterday/older candles as today's chart.
  try {
    const query = new URLSearchParams({ date_format: '1', range_from: date, range_to: date, cont_flag: '1' });
    const rows = await requestFyersHistory(accessToken, symbol, resolution, query);
    if (rows.length >= 2) return rows;
  } catch (error: any) { errors.push(error?.message || 'date-format history failed'); }

  // Some FYERS deployments are stricter about date_format and accept epoch
  // ranges for the same current-session request. Keep the range bounded to
  // today's India session instead of requesting 30 days.
  try {
    const { start, end } = toIndiaDayEpochs(date);
    const query = new URLSearchParams({ date_format: '0', range_from: String(start), range_to: String(end), cont_flag: '1' });
    const rows = await requestFyersHistory(accessToken, symbol, resolution, query);
    const today = rows.filter((c: any) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(c.timestamp)) === date);
    if (today.length >= 2) return today;
    if (rows.length >= 2) return rows.filter((c: any) => new Date(c.timestamp).getTime() <= Date.now());
  } catch (error: any) { errors.push(error?.message || 'epoch history failed'); }

  throw new Error(errors.join(' · ') || `Fyers returned no current-session candles for ${symbol}`);
}

brokerMarketDataRoutes.get('/:brokerId/historical', async (req: Request, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const session = await getFyersSession(req as AuthenticatedRequest, res); if (!session) return;
  const symbol = toFyersSymbol(String(req.query.instrument_key || ''));
  const interval = String(req.query.interval || '');
  if (!symbol || !interval) return res.status(400).json({ success: false, error: 'instrument_key and interval are required' });

  try {
    if (interval === 'day') {
      const adapter = BrokerRegistry.getAdapter('fyers');
      const data = await adapter.getHistoricalData(session.token, symbol, interval);
      const candles = Array.isArray(data) ? data : [];
      if (candles.length < 2) return res.status(502).json({ success: false, error: `Fyers returned only ${candles.length} daily candle(s) for ${symbol}.` });
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ success: true, data: candles });
    }

    const candles = await fetchFyersCurrentSession(session.token, symbol, interval);
    if (candles.length < 2) return res.status(502).json({ success: false, error: `Fyers returned only ${candles.length} current-session candle(s) for ${symbol}.` });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data: candles });
  } catch (err: any) {
    return res.status(502).json({ success: false, error: err?.message || `Unable to load current-session Fyers candles for ${symbol}` });
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
    res.setHeader('Cache-Control', 'no-store');
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

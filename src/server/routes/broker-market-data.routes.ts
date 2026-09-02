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
  try { return { userId, token: EncryptionService.decrypt(session.accessTokenEncrypted) }; }
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
  return aliases[normalized] || (/^(NSE|BSE|MCX):/i.test(value) ? value : value);
}

const fyersResolution: Record<string,string> = {
  '1minute':'1','3minute':'3','5minute':'5','15minute':'15','30minute':'30','60minute':'60','day':'D'
};
const intradayIntervals = new Set(['1minute','3minute','5minute','15minute','30minute','60minute']);

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

async function requestFyersHistory(accessToken: string, symbol: string, resolution: string, from: string, to: string): Promise<any[]> {
  const query = new URLSearchParams({ date_format: '1', range_from: from, range_to: to, cont_flag: '1' });
  const url = `https://api-t1.fyers.in/data/history?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}&${query.toString()}`;
  const response = await fetch(url, { headers: { Accept: 'application/json', Authorization: `${process.env.FYERS_CLIENT_ID}:${accessToken}` } });
  const text = await response.text();
  let payload: any;
  try { payload = JSON.parse(text); } catch { throw new Error(`Fyers history returned a non-JSON response (${response.status})`); }
  if (!response.ok || payload?.s === 'error') throw new Error(payload?.message || `Fyers history failed (${response.status})`);
  return mapFyersCandles(payload?.candles || []);
}

/**
 * Build history backwards in broker-safe date windows. The previous
 * implementation deliberately requested only today, which made a full chart
 * impossible. FYERS history is date-range based, so requests are chunked and
 * merged until the target is reached or the broker has no older data.
 */
async function fetchFyersHistoryTarget(accessToken: string, symbol: string, interval: string, target: number): Promise<any[]> {
  const resolution = fyersResolution[interval] || interval;
  const chunkDays = intradayIntervals.has(interval) ? 90 : 3650;
  const maxLookbackDays = intradayIntervals.has(interval) ? 365 * 5 : 365 * 25;
  const now = new Date();
  let end = new Date(now);
  let all: any[] = [];
  let emptyWindows = 0;

  for (let lookedBack = 0; lookedBack < maxLookbackDays && all.length < target && emptyWindows < 2; lookedBack += chunkDays) {
    const start = new Date(end.getTime() - chunkDays * 86_400_000);
    try {
      const rows = await requestFyersHistory(accessToken, symbol, resolution, indiaDate(start), indiaDate(end));
      if (rows.length) {
        all = normalizeCandles([...rows, ...all], target);
        emptyWindows = 0;
      } else {
        emptyWindows += 1;
      }
    } catch (error: any) {
      // Keep trying older windows; a single date-range rejection should not
      // collapse the chart to one live candle.
      if (all.length === 0) throw error;
      emptyWindows += 1;
    }
    end = new Date(start.getTime() - 1000);
  }

  return normalizeCandles(all, target);
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
    if (candles.length < 2) return res.status(502).json({ success: false, error: `Fyers returned only ${candles.length} candle(s) for ${symbol}.` });
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
  const symbols = String(req.query.instrument_keys || '').split(',').map(x => toFyersSymbol(x.trim())).filter(Boolean);
  if (!symbols.length) return res.status(400).json({ success: false, error: 'instrument_keys is required' });
  if (symbols.length > 100) return res.status(400).json({ success: false, error: 'Too many market symbols requested' });
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const write = (event: any) => { try { res.write(`${JSON.stringify(event)}\n`); } catch {} };
  const unsubscribe = FyersMarketDataTransport.subscribe(session.userId, session.token, symbols, write);
  const heartbeat = setInterval(() => write({ type: 'status', status: 'connected' }), 12_000);
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

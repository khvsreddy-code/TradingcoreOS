import { Router } from 'express';
import { BrokerRegistry } from '../brokers/BrokerRegistry.js';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { requireUser } from '../auth/requireUser.js';
import { FyersMarketDataTransport } from '../marketData/FyersMarketDataTransport.js';
export const brokerMarketDataRoutes = Router();
brokerMarketDataRoutes.use(requireUser);
async function getFyersSession(req, res) {
    const brokerId = String(req.params.brokerId || '').toLowerCase();
    if (brokerId !== 'fyers')
        return null;
    const userId = req.tradingCoreUserId;
    const session = await BrokerRepository.getSession('fyers', userId);
    if (!session || session.status !== 'Connected') {
        res.status(401).json({ success: false, error: 'Fyers is not connected for this account.' });
        return null;
    }
    try {
        const token = EncryptionService.decrypt(session.accessTokenEncrypted);
        return { userId, token };
    }
    catch {
        res.status(500).json({ success: false, error: 'Unable to decrypt the Fyers session.' });
        return null;
    }
}
function toFyersSymbol(symbol) {
    const value = decodeURIComponent(String(symbol || '')).trim();
    const normalized = value.toLowerCase().replace(/\s+/g, '');
    const aliases = {
        'nse_index|nifty50': 'NSE:NIFTY50-INDEX', 'nse_index|nifty50index': 'NSE:NIFTY50-INDEX',
        'nse_index|niftybank': 'NSE:NIFTYBANK-INDEX', 'nse_index|niftybankindex': 'NSE:NIFTYBANK-INDEX',
        'nse_index|niftyfinancialservices': 'NSE:FINNIFTY-INDEX', 'nse_index|finnifty': 'NSE:FINNIFTY-INDEX',
        'nse_index|niftymidcapselect': 'NSE:MIDCPNIFTY-INDEX', 'bse_index|sensex': 'BSE:SENSEX-INDEX',
    };
    if (aliases[normalized])
        return aliases[normalized];
    if (/^(NSE|BSE|MCX):/i.test(value))
        return value;
    return value;
}
const fyersResolution = { '1minute': '1', '3minute': '3', '5minute': '5', '15minute': '15', '30minute': '30', '60minute': '60', 'day': 'D' };
function indiaDate() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
function toIndiaDayEpochs(date) {
    const start = Math.floor(new Date(`${date}T00:00:00+05:30`).getTime() / 1000);
    const end = Math.floor(Date.now() / 1000);
    return { start, end };
}
function mapFyersCandles(rows) {
    return (rows || []).map((c) => ({
        timestamp: new Date(Number(c[0]) * 1000).toISOString(),
        open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5] || 0),
    })).filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
async function requestFyersHistory(accessToken, symbol, resolution, query) {
    const url = `https://api-t1.fyers.in/data/history?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}&${query.toString()}`;
    const response = await fetch(url, {
        headers: { Accept: 'application/json', Authorization: `${process.env.FYERS_CLIENT_ID}:${accessToken}` },
    });
    const text = await response.text();
    let payload;
    try {
        payload = JSON.parse(text);
    }
    catch {
        throw new Error(`Fyers history returned a non-JSON response (${response.status})`);
    }
    if (!response.ok || payload?.s === 'error')
        throw new Error(payload?.message || `Fyers history failed (${response.status})`);
    return mapFyersCandles(payload?.candles || []);
}
const intervalMinutes = { '1minute': 1, '3minute': 3, '5minute': 5, '15minute': 15, '30minute': 30, '60minute': 60, 'day': 1440 };
const HISTORY_TARGET = 25000;
function formatIndiaDate(date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}
async function fetchFyersHistoryTarget(accessToken, symbol, interval, target = HISTORY_TARGET) {
    const resolution = fyersResolution[interval] || interval;
    const minuteSize = intervalMinutes[interval];
    if (!minuteSize)
        throw new Error(`Unsupported FYERS interval: ${interval}`);
    // Ask for the exact amount of calendar history required for the requested
    // candle count, plus a trading-session buffer. A single request is much faster
    // than loading only today and then forcing the chart to stitch synthetic data.
    const daysNeeded = Math.ceil((target * minuteSize / 1440) * 1.8) + 14;
    const rangeTo = new Date();
    const rangeFrom = new Date(Date.now() - daysNeeded * 86400000);
    const query = new URLSearchParams({
        date_format: '1',
        range_from: formatIndiaDate(rangeFrom),
        range_to: formatIndiaDate(rangeTo),
        cont_flag: '1',
    });
    let rows = await requestFyersHistory(accessToken, symbol, resolution, query);
    // Some FYERS instrument classes cap a response. Page backwards in bounded
    // windows until the target is reached, deduplicating timestamps.
    const seen = new Map(rows.map((c) => [c.timestamp, c]));
    let cursor = rangeFrom.getTime();
    let pages = 0;
    while (seen.size < target && pages < 12) {
        const pageTo = new Date(cursor - 1000);
        const pageFrom = new Date(pageTo.getTime() - Math.max(30, Math.ceil(daysNeeded / 3)) * 86400000);
        const pageQuery = new URLSearchParams({ date_format: '1', range_from: formatIndiaDate(pageFrom), range_to: formatIndiaDate(pageTo), cont_flag: '1' });
        const page = await requestFyersHistory(accessToken, symbol, resolution, pageQuery);
        if (!page.length)
            break;
        page.forEach((c) => seen.set(c.timestamp, c));
        cursor = pageFrom.getTime();
        pages += 1;
    }
    rows = [...seen.values()].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return rows.length > target ? rows.slice(-target) : rows;
}
brokerMarketDataRoutes.get('/:brokerId/historical', async (req, res, next) => {
    if (String(req.params.brokerId).toLowerCase() !== 'fyers')
        return next();
    const session = await getFyersSession(req, res);
    if (!session)
        return;
    const symbol = toFyersSymbol(String(req.query.instrument_key || ''));
    const interval = String(req.query.interval || '');
    if (!symbol || !interval)
        return res.status(400).json({ success: false, error: 'instrument_key and interval are required' });
    try {
        const requestedTarget = Math.min(25000, Math.max(500, Number(req.query.limit || HISTORY_TARGET) || HISTORY_TARGET));
        const candles = await fetchFyersHistoryTarget(session.token, symbol, interval, requestedTarget);
        if (candles.length < 2)
            return res.status(502).json({ success: false, error: `Fyers returned only ${candles.length} historical candle(s) for ${symbol}.` });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ success: true, data: candles, requested: requestedTarget, returned: candles.length });
    }
    catch (err) {
        return res.status(502).json({ success: false, error: err?.message || `Unable to load FYERS historical candles for ${symbol}` });
    }
});
brokerMarketDataRoutes.get('/:brokerId/option-chain', async (req, res, next) => {
    if (String(req.params.brokerId).toLowerCase() !== 'fyers')
        return next();
    const session = await getFyersSession(req, res);
    if (!session)
        return;
    const symbol = toFyersSymbol(String(req.query.instrument_key || ''));
    const expiryDate = String(req.query.expiry_date || 'current_week');
    if (!symbol)
        return res.status(400).json({ success: false, error: 'instrument_key is required' });
    try {
        const adapter = BrokerRegistry.getAdapter('fyers');
        const data = await adapter.getOptionChain(session.token, symbol, expiryDate);
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ success: true, data });
    }
    catch (err) {
        return res.status(502).json({ success: false, error: err?.message || 'Unable to load Fyers option chain' });
    }
});
brokerMarketDataRoutes.get('/:brokerId/market-stream', async (req, res, next) => {
    if (String(req.params.brokerId).toLowerCase() !== 'fyers')
        return next();
    const session = await getFyersSession(req, res);
    if (!session)
        return;
    const rawSymbols = String(req.query.instrument_keys || '').split(',').map(x => x.trim()).filter(Boolean);
    const symbols = rawSymbols.map(toFyersSymbol).filter(Boolean);
    if (!symbols.length)
        return res.status(400).json({ success: false, error: 'instrument_keys is required' });
    if (symbols.length > 100)
        return res.status(400).json({ success: false, error: 'Too many market symbols requested' });
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const write = (event) => { try {
        res.write(`${JSON.stringify(event)}\n`);
    }
    catch { } };
    const unsubscribe = FyersMarketDataTransport.subscribe(session.userId, session.token, symbols, write);
    const heartbeat = setInterval(() => write({ type: 'status', status: 'connected' }), 12000);
    req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

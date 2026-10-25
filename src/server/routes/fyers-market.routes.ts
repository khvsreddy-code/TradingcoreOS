import { Router, Response } from 'express';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { FyersApiClient } from '../fyers/core/FyersApiClient.js';
import { FyersMarketDataService } from '../fyers/market/FyersMarketDataService.js';
import { assertFyersQuoteBatch, FyersCapabilityError, resolveFyersCapabilities, toPublicFyersCapabilities } from '../fyers/core/FyersCapabilities.js';

export const fyersMarketRoutes = Router();
fyersMarketRoutes.use(requireUser);

async function clientFor(req: AuthenticatedRequest, res: Response): Promise<FyersApiClient | null> {
  const userId = req.tradingCoreUserId!;
  const session = await BrokerRepository.getSession('fyers', userId);
  if (!session || session.status !== 'Connected') {
    res.status(401).json({ success: false, error: 'Fyers is not connected for this account.' });
    return null;
  }
  try {
    const capabilities = resolveFyersCapabilities(userId);
    return new FyersApiClient(EncryptionService.decrypt(session.accessTokenEncrypted), undefined, capabilities, userId);
  } catch {
    res.status(500).json({ success: false, error: 'Unable to decrypt the Fyers session.' });
    return null;
  }
}

function fyersSymbol(value: string): string {
  let raw = '';
  try { raw = decodeURIComponent(String(value || '')).trim(); } catch { return ''; }
  const n = raw.toLowerCase().replace(/\s+/g, '');
  const aliases: Record<string, string> = {
    nifty: 'NSE:NIFTY50-INDEX', nifty50: 'NSE:NIFTY50-INDEX',
    banknifty: 'NSE:NIFTYBANK-INDEX', niftybank: 'NSE:NIFTYBANK-INDEX',
    finnifty: 'NSE:FINNIFTY-INDEX', niftyfinancialservices: 'NSE:FINNIFTY-INDEX',
    midcpnifty: 'NSE:MIDCPNIFTY-INDEX', sensex: 'BSE:SENSEX-INDEX',
  };
  if (aliases[n]) return aliases[n];
  return raw;
}

function rawQuoteSymbols(req: AuthenticatedRequest): { values: string[]; error?: string; status?: 400 | 413 } {
  const supplied = req.method === 'POST'
    ? (req.body?.symbols ?? req.body?.instrument_keys)
    : req.query.symbols;
  if (typeof supplied === 'string') {
    const values = supplied.split(',');
    if (values.length > 5_000) return { values: [], error: 'Too many symbol entries in one request.', status:413 };
    return { values };
  }
  if (Array.isArray(supplied)) {
    if (supplied.some(value => typeof value !== 'string')) return { values: [], error: 'symbols must contain only strings.', status: 400 };
    // Bound parsing cost separately from broker capabilities; this is an input
    // abuse guard, not an exchange/provider symbol limit.
    if (supplied.length > 5_000) return { values: [], error: 'Too many symbol entries in one request.', status: 413 };
    return { values: supplied as string[] };
  }
  return { values: [], error: 'symbols is required as a comma-separated string or string array.', status: 400 };
}

async function handleFyersQuotes(req: AuthenticatedRequest, res: Response, next: (error?: unknown) => void) {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const client = await clientFor(req, res); if (!client) return;
  const capabilities = resolveFyersCapabilities(req.tradingCoreUserId!);
  const parsed = rawQuoteSymbols(req);
  if (parsed.error) return res.status(parsed.status ?? 400).json({ success: false, error: parsed.error });
  const symbols = [...new Set(parsed.values.map(fyersSymbol).map(symbol => symbol.trim()).filter(Boolean))];
  const maxSymbolsPerRequest = capabilities.plan === 'prime' ? 5_000 : 200;
  if (symbols.length > maxSymbolsPerRequest) {
    return res.status(413).json({
      success: false,
      error: `This FYERS ${capabilities.plan} request can contain at most ${maxSymbolsPerRequest} unique symbols; use smaller batches for larger watchlists.`,
      code: 'FYERS_QUOTE_REQUEST_LIMIT',
      limit: maxSymbolsPerRequest,
      requested: symbols.length,
      plan: capabilities.plan,
    });
  }
  const batchCount = Math.ceil(symbols.length / capabilities.maxQuoteBatch);
  try {
    // Each provider request respects its plan's exact symbol ceiling. Serial
    // batching keeps a large watchlist from producing a burst of parallel REST
    // calls; the shared account/category gate still admits every actual attempt.
    const service = new FyersMarketDataService(client, capabilities);
    const payloads: any[] = [];
    for (let start = 0; start < symbols.length; start += capabilities.maxQuoteBatch) {
      const batch = symbols.slice(start, start + capabilities.maxQuoteBatch);
      assertFyersQuoteBatch(batch, capabilities);
      payloads.push(await service.quotes(batch));
    }
    const data = payloads.length === 1
      ? payloads[0]
      : {
          s: payloads.every(payload => String(payload?.s || '').toLowerCase() !== 'error') ? 'ok' : 'error',
          d: payloads.flatMap(payload => Array.isArray(payload?.d) ? payload.d : []),
        };
    res.setHeader('Cache-Control', 'private, max-age=2');
    return res.json({
      success: true,
      data,
      capabilities: {
        plan: capabilities.plan,
        maxQuoteBatch: capabilities.maxQuoteBatch,
        maxSymbolsPerRequest,
        requestedSymbols: symbols.length,
        quoteBatches: batchCount,
      },
    });
  } catch (error: any) {
    const status = Number(error?.status) === 429 ? 429 : Number(error?.status) === 400 ? 400 : 502;
    return res.status(status).json({
      success: false,
      error: error?.message || 'Unable to load FYERS quotes',
      brokerCode: error?.brokerCode,
      code: error?.code,
      limit: error?.limit,
      plan: error?.plan,
    });
  }
}

// POST keeps Prime's 1,000-symbol batch out of URL/query-string length limits.
// GET remains backward-compatible for existing watchlist clients.
fyersMarketRoutes.get('/:brokerId/quotes', (req: AuthenticatedRequest, res: Response, next) => {
  void handleFyersQuotes(req, res, next);
});
fyersMarketRoutes.post('/:brokerId/quotes', (req: AuthenticatedRequest, res: Response, next) => {
  void handleFyersQuotes(req, res, next);
});

fyersMarketRoutes.get('/:brokerId/capabilities', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const userId = req.tradingCoreUserId!;
  const session = await BrokerRepository.getSession('fyers', userId);
  if (!session || session.status !== 'Connected') {
    return res.status(401).json({ success: false, error: 'Fyers is not connected for this account.' });
  }
  return res.json({ success: true, data: toPublicFyersCapabilities(resolveFyersCapabilities(userId)) });
});

fyersMarketRoutes.get('/:brokerId/depth', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const client = await clientFor(req, res); if (!client) return;
  const symbol = fyersSymbol(String(req.query.symbol || req.query.instrument_key || ''));
  if (!symbol) return res.status(400).json({ success: false, error: 'symbol is required' });
  try {
    const data = await new FyersMarketDataService(client).depth(symbol);
    res.setHeader('Cache-Control', 'private, max-age=1');
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(Number(error?.status) === 429 ? 429 : 502).json({ success: false, error: error?.message || 'Unable to load FYERS market depth', brokerCode: error?.brokerCode });
  }
});

fyersMarketRoutes.get('/:brokerId/market-status', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const client = await clientFor(req, res); if (!client) return;
  try {
    const data = await new FyersMarketDataService(client).marketStatus();
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(Number(error?.status) === 429 ? 429 : 502).json({ success: false, error: error?.message || 'Unable to load FYERS market status', brokerCode: error?.brokerCode });
  }
});

fyersMarketRoutes.get('/:brokerId/futures-chain', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const client = await clientFor(req, res); if (!client) return;
  const symbol = fyersSymbol(String(req.query.symbol || req.query.instrument_key || ''));
  if (!symbol) return res.status(400).json({ success: false, error: 'symbol is required' });
  try { return res.json({ success: true, data: await new FyersMarketDataService(client).futuresChain(symbol) }); }
  catch (error: any) { return res.status(Number(error?.status) === 429 ? 429 : 502).json({ success: false, error: error?.message || 'Unable to load FYERS futures chain', brokerCode: error?.brokerCode }); }
});

fyersMarketRoutes.get('/:brokerId/expired-fno/expiry-dates', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const client = await clientFor(req, res); if (!client) return;
  const symbol = fyersSymbol(String(req.query.symbol || req.query.instrument_key || ''));
  const rangeFrom = String(req.query.range_from || ''); const rangeTo = String(req.query.range_to || '');
  if (!symbol || !rangeFrom || !rangeTo) return res.status(400).json({ success: false, error: 'symbol, range_from and range_to are required' });
  try { return res.json({ success: true, data: await new FyersMarketDataService(client).expiredExpiryDates(symbol, rangeFrom, rangeTo, String(req.query.date_format || '1') === '0' ? '0' : '1') }); }
  catch (error: any) { return res.status(Number(error?.status) === 429 ? 429 : 502).json({ success: false, error: error?.message || 'Unable to load FYERS expired-F&O expiry dates', brokerCode: error?.brokerCode }); }
});

fyersMarketRoutes.get('/:brokerId/expired-fno/contracts', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const client = await clientFor(req, res); if (!client) return;
  const symbol = fyersSymbol(String(req.query.symbol || req.query.instrument_key || '')); const expiryDate=String(req.query.expiry_date||'');
  if (!symbol || !expiryDate) return res.status(400).json({ success: false, error: 'symbol and expiry_date are required' });
  try { return res.json({ success: true, data: await new FyersMarketDataService(client).expiredUnderlyingSymbols(symbol, expiryDate) }); }
  catch (error: any) { return res.status(Number(error?.status) === 429 ? 429 : 502).json({ success: false, error: error?.message || 'Unable to load FYERS expired-F&O contracts', brokerCode: error?.brokerCode }); }
});

fyersMarketRoutes.get('/:brokerId/expired-fno/historical', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const client = await clientFor(req, res); if (!client) return;
  const symbol = fyersSymbol(String(req.query.symbol || req.query.instrument_key || '')); const resolution=String(req.query.resolution||''); const rangeFrom=String(req.query.range_from||''); const rangeTo=String(req.query.range_to||'');
  if(!symbol||!resolution||!rangeFrom||!rangeTo)return res.status(400).json({success:false,error:'symbol, resolution, range_from and range_to are required'});
  try{return res.json({success:true,data:await new FyersMarketDataService(client).expiredHistoricalData(symbol,resolution,rangeFrom,rangeTo,{greeks:String(req.query.greeks||'0')==='1',oi:String(req.query.oi||'0')==='1'})});}
  catch(error:any){return res.status(Number(error?.status)===429?429:502).json({success:false,error:error?.message||'Unable to load FYERS expired-F&O history',brokerCode:error?.brokerCode});}
});

fyersMarketRoutes.get('/:brokerId/option-chain-v3', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const client = await clientFor(req, res); if (!client) return;
  const symbol = fyersSymbol(String(req.query.symbol || req.query.instrument_key || ''));
  if (!symbol) return res.status(400).json({ success: false, error: 'symbol is required' });
  const strikeCount = Math.max(1, Math.min(50, Number(req.query.strikecount || 50)));
  const timestamp = String(req.query.timestamp || '').trim() || undefined;
  const greeks = String(req.query.greeks || '1') !== '0';
  try {
    const data = await new FyersMarketDataService(client).optionChain(symbol, { strikeCount, timestamp, greeks });
    // Preserve FYERS' complete option-chain payload. Do not collapse it to a
    // small UI-oriented strike subset: downstream analytics may need OI, IV,
    // Greeks, VIX, fyToken, expiry metadata and forward-price fields.
    res.setHeader('Cache-Control', 'private, max-age=3');
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(Number(error?.status) === 429 ? 429 : 502).json({ success: false, error: error?.message || 'Unable to load FYERS option chain', brokerCode: error?.brokerCode });
  }
});

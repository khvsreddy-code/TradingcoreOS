import { Router, Response } from 'express';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { FyersApiClient } from '../fyers/core/FyersApiClient.js';
import { FyersMarketDataService } from '../fyers/market/FyersMarketDataService.js';

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
    return new FyersApiClient(EncryptionService.decrypt(session.accessTokenEncrypted));
  } catch {
    res.status(500).json({ success: false, error: 'Unable to decrypt the Fyers session.' });
    return null;
  }
}

function fyersSymbol(value: string): string {
  const raw = decodeURIComponent(String(value || '')).trim();
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

fyersMarketRoutes.get('/:brokerId/quotes', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();
  const client = await clientFor(req, res); if (!client) return;
  const symbols = String(req.query.symbols || '').split(',').map(fyersSymbol).filter(Boolean);
  if (!symbols.length) return res.status(400).json({ success: false, error: 'symbols is required' });
  if (symbols.length > 50) return res.status(400).json({ success: false, error: 'FYERS quotes supports at most 50 symbols per request.' });
  try {
    const data = await new FyersMarketDataService(client).quotes(symbols);
    res.setHeader('Cache-Control', 'private, max-age=2');
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(Number(error?.status) === 429 ? 429 : 502).json({ success: false, error: error?.message || 'Unable to load FYERS quotes', brokerCode: error?.brokerCode });
  }
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

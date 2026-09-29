import { Router, Response } from 'express';
import { BrokerRegistry } from '../brokers/BrokerRegistry.js';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';

export const upstoxOptionChainFixRoutes = Router();
upstoxOptionChainFixRoutes.use(requireUser);

async function getSession(req: AuthenticatedRequest, res: Response): Promise<string | null> {
  const saved = await BrokerRepository.getSession('upstox', req.tradingCoreUserId!);
  if (!saved || saved.status !== 'Connected') {
    res.status(401).json({ success: false, error: 'Upstox is not connected for this account.' });
    return null;
  }
  try {
    return EncryptionService.decrypt(saved.accessTokenEncrypted);
  } catch {
    res.status(500).json({ success: false, error: 'Unable to decrypt the Upstox session.' });
    return null;
  }
}

function isWeekly(row: any): boolean {
  if (typeof row?.weekly === 'boolean') return row.weekly;
  const symbol = String(row?.trading_symbol || row?.tradingSymbol || '').toUpperCase();
  return symbol.includes('WEEK') || symbol.includes('W');
}

async function resolveExpiry(accessToken: string, instrumentKey: string, requested: string): Promise<string> {
  if (/^\d{4}-\d{2}-\d{2}$/.test(requested)) return requested;

  // Upstox documents relative expiry keywords, but resolving the keyword
  // directly can return an empty set around weekly rollover/non-trading days.
  // Fetch the active contract universe and resolve the actual date locally.
  const response = await fetch(`https://api.upstox.com/v2/option/contract?instrument_key=${encodeURIComponent(instrumentKey)}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json();
  if (!response.ok || payload?.status !== 'success') {
    throw new Error(payload?.errors?.[0]?.message || payload?.message || `Unable to resolve Upstox expiry ${requested}`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const all = Array.isArray(payload.data) ? payload.data : [];
  const uniqueDates = (rows: any[]) => [...new Set(rows
    .map((row: any) => String(row?.expiry || ''))
    .filter((date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today))].sort();

  const weekly = uniqueDates(all.filter(isWeekly));
  const monthly = uniqueDates(all.filter((row: any) => !isWeekly(row)));
  const key = requested.toLowerCase();

  if (key === 'current_week' || key === 'this_week' || key === 'near_week' || key === 'weekly') {
    if (weekly.length) return weekly[0];
    // If the broker does not expose a weekly flag, use the nearest active
    // expiry instead of failing the entire option-chain UI.
    const fallback = uniqueDates(all);
    if (fallback.length) return fallback[0];
  }
  if (key === 'next_week') return weekly[1] || weekly[0] || uniqueDates(all)[0] || '';
  if (key === 'far_week') return weekly[2] || weekly[weekly.length - 1] || uniqueDates(all)[0] || '';
  if (key === 'current_month' || key === 'this_month' || key === 'near_month' || key === 'monthly') return monthly[0] || uniqueDates(all)[0] || '';
  if (key === 'next_month') return monthly[1] || monthly[0] || uniqueDates(all)[0] || '';
  if (key === 'far_month') return monthly[2] || monthly[monthly.length - 1] || uniqueDates(all)[0] || '';

  return uniqueDates(all)[0] || '';
}

function analytics(contracts: any[]) {
  let callOi = 0;
  let putOi = 0;
  let callChangeOi = 0;
  let putChangeOi = 0;
  for (const row of contracts) {
    callOi += Number(row?.call?.oi || 0);
    putOi += Number(row?.put?.oi || 0);
    callChangeOi += Number(row?.call?.oi || 0) - Number(row?.call?.previousOi ?? row?.call?.oi ?? 0);
    putChangeOi += Number(row?.put?.oi || 0) - Number(row?.put?.previousOi ?? row?.put?.oi ?? 0);
  }
  return {
    pcr: callOi > 0 ? putOi / callOi : undefined,
    totalCallOi: callOi,
    totalPutOi: putOi,
    callChangeOi,
    putChangeOi,
    netChangeOi: putChangeOi - callChangeOi,
  };
}

upstoxOptionChainFixRoutes.get('/:brokerId/option-chain', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'upstox') return next();
  const token = await getSession(req, res);
  if (!token) return;
  const instrumentKey = String(req.query.instrument_key || '').trim();
  if (!instrumentKey) return res.status(400).json({ success: false, error: 'instrument_key is required' });

  try {
    const requested = String(req.query.expiry_date || 'current_week');
    const expiry = await resolveExpiry(token, instrumentKey, requested);
    if (!expiry) throw new Error(`No active Upstox option expiry found for ${requested}.`);

    const broker = BrokerRegistry.getAdapter('upstox');
    if (!broker) throw new Error('Upstox adapter is unavailable');
    const raw = await broker.getOptionChain(token, instrumentKey, expiry);
    if (!raw || !Array.isArray(raw.contracts) || !raw.contracts.length) {
      throw new Error(`Upstox returned no contracts for expiry ${expiry}.`);
    }

    const contracts = raw.contracts.map((contract: any) => ({
      ...contract,
      call: contract.call ? { ...contract.call, oiChange: Number(contract.call.oi || 0) - Number(contract.call.previousOi ?? contract.call.oi ?? 0) } : contract.call,
      put: contract.put ? { ...contract.put, oiChange: Number(contract.put.oi || 0) - Number(contract.put.previousOi ?? contract.put.oi ?? 0) } : contract.put,
    }));

    return res.json({
      success: true,
      data: { ...raw, expiry, contracts, analytics: analytics(contracts) },
      source: 'upstox-option-chain-expiry-fix',
    });
  } catch (err: any) {
    return res.status(502).json({ success: false, error: err?.message || 'Unable to load Upstox option chain' });
  }
});

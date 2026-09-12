import type { IncomingMessage, ServerResponse } from 'node:http';
import { BrokerRepository } from '../../../src/server/storage/BrokerRepository.js';
import { EncryptionService } from '../../../src/server/encryption/EncryptionService.js';
import { FyersMarketDataTransport } from '../../../src/server/marketData/FyersMarketDataTransport.js';
import { UpstoxMarketDataTransport } from '../../../src/server/marketData/UpstoxMarketDataTransport.js';

interface VercelRequest extends IncomingMessage {}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  if (res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

async function resolveTradingCoreUserId(req: VercelRequest): Promise<string | null> {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !supabaseKey) return null;
  const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey },
  });
  if (!response.ok) return null;
  const user = await response.json() as { id?: string };
  return user?.id || null;
}

function getQuery(req: VercelRequest): URLSearchParams {
  return new URL(req.url || '/', 'https://tradingcoreos.vercel.app').searchParams;
}

/**
 * Explicit Vercel Function for /api/trading/:brokerId/market-stream.
 *
 * The browser consumes an NDJSON response while the server maintains the
 * authenticated broker websocket. This explicit function is required on
 * Vercel because the nested route must not fall through to the SPA rewrite.
 */
export default async function handler(req: VercelRequest, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { success: false, error: 'Method not allowed' });
    return;
  }

  const pathMatch = String(req.url || '').match(/^\/api\/trading\/([^/?#]+)\/market-stream/);
  const brokerId = decodeURIComponent(pathMatch?.[1] || '').toLowerCase();
  if (brokerId !== 'fyers' && brokerId !== 'upstox') {
    sendJson(res, 400, { success: false, error: 'Live streaming is not implemented for this broker' });
    return;
  }

  try {
    const userId = await resolveTradingCoreUserId(req);
    if (!userId) {
      sendJson(res, 401, { success: false, error: 'TradingCore login session is missing or expired. Sign in again.' });
      return;
    }

    const session = await BrokerRepository.getSession(brokerId, userId);
    if (!session || session.status !== 'Connected') {
      sendJson(res, 401, { success: false, error: `${brokerId} is not connected for this account.` });
      return;
    }
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      sendJson(res, 401, { success: false, error: `${brokerId} broker session has expired. Reconnect the broker.` });
      return;
    }

    const query = getQuery(req);
    const instrumentKeys = String(query.get('instrument_keys') || '').split(',').map((key) => key.trim()).filter(Boolean);
    if (!instrumentKeys.length) {
      sendJson(res, 400, { success: false, error: 'instrument_keys is required' });
      return;
    }
    if (instrumentKeys.length > 100 || instrumentKeys.some((key) => key.length > 160)) {
      sendJson(res, 400, { success: false, error: 'Too many or invalid instrument keys' });
      return;
    }

    const accessToken = EncryptionService.decrypt(session.accessTokenEncrypted);
    const depthSymbol = String(query.get('depth_symbol') || '').trim();
    const depthMode = query.get('depth_mode') === 'full_d30' ? 'full_d30' : 'full';

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const writeEvent = (event: unknown) => {
      if (!res.writableEnded && !res.destroyed) {
        try { res.write(`${JSON.stringify(event)}\n`); } catch { /* client disconnected */ }
      }
    };

    writeEvent({ type: 'status', status: 'connecting' });

    const unsubscribe = brokerId === 'fyers'
      ? FyersMarketDataTransport.subscribe(userId, accessToken, instrumentKeys, writeEvent, Boolean(depthSymbol), depthSymbol ? [depthSymbol] : instrumentKeys)
      : UpstoxMarketDataTransport.subscribe(userId, accessToken, instrumentKeys, writeEvent, depthMode as 'full' | 'full_d30');

    const cleanup = () => {
      try { unsubscribe(); } catch { /* already closed */ }
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
  } catch (err: any) {
    console.error(`Market stream function error for ${brokerId}:`, err);
    if (!res.writableEnded) sendJson(res, 500, { success: false, error: err?.message || `Unable to start ${brokerId} market stream` });
  }
}

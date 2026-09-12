import type { IncomingMessage, ServerResponse } from 'node:http';
import { BrokerRepository } from '../../../src/server/storage/BrokerRepository.js';

interface VercelRequest extends IncomingMessage {}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
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

/**
 * Explicit Vercel Function for /api/auth/broker/sessions.
 *
 * The OAuth callback is an explicit Vercel function, so the follow-up session
 * restore must also have an explicit function. This avoids depending on the
 * Express catch-all for a nested path when the browser returns from a broker
 * popup.
 */
export default async function handler(req: VercelRequest, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { success: false, error: 'Method not allowed' });
    return;
  }

  try {
    const userId = await resolveTradingCoreUserId(req);
    if (!userId) {
      sendJson(res, 401, { success: false, error: 'TradingCore login session is missing or expired. Sign in again.' });
      return;
    }

    const sessions = await BrokerRepository.getUserSessions(userId);
    sendJson(res, 200, {
      success: true,
      sessions: sessions.map((session) => ({
        brokerId: session.brokerId,
        clientCode: session.clientCode,
        expiresAt: session.expiresAt,
        connectedAt: session.connectedAt,
        status: session.status,
      })),
    });
  } catch (err: any) {
    console.error('Broker sessions function error:', err);
    sendJson(res, 500, { success: false, error: err?.message || 'Unable to restore broker sessions' });
  }
}

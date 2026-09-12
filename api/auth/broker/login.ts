import type { IncomingMessage, ServerResponse } from 'node:http';
import { OAuthService } from '../../../src/server/auth/OAuthService.js';

interface VercelRequest extends IncomingMessage {
  query?: Record<string, unknown>;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function getBearerToken(req: VercelRequest): string | null {
  const authorization = String(req.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

/**
 * Explicit Vercel Function for /api/auth/broker/login.
 *
 * This handler intentionally does not pass Vercel's native Node request/response
 * objects into Express middleware. Vercel does not provide Express's req.get()
 * or res.json(), which caused the previous handler to fail with:
 * "TypeError: req.get is not a function".
 */
export default async function handler(req: VercelRequest, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { success: false, error: 'Method not allowed' });
    return;
  }

  const token = getBearerToken(req);
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!token) {
    sendJson(res, 401, { success: false, error: 'TradingCore login session is missing. Sign in again.' });
    return;
  }
  if (!supabaseUrl || !supabaseKey) {
    sendJson(res, 503, { success: false, error: 'TradingCore authentication backend is not configured.' });
    return;
  }

  try {
    // Validate the Supabase access token server-side. Never trust a browser-supplied user ID.
    const authResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseKey,
      },
    });
    const user = await authResponse.json() as { id?: string };

    if (!authResponse.ok || !user?.id) {
      sendJson(res, 401, { success: false, error: 'TradingCore session is invalid or expired' });
      return;
    }

    const url = new URL(req.url || '/api/auth/broker/login', 'https://tradingcoreos.vercel.app');
    const brokerId = String(url.searchParams.get('broker') || url.searchParams.get('brokerId') || 'upstox').toLowerCase();
    const redirectEnvKey = `${brokerId.toUpperCase()}_REDIRECT_URI`;
    const redirectUri = process.env[redirectEnvKey];

    if (!redirectUri) {
      sendJson(res, 400, { success: false, error: `${redirectEnvKey} is not configured on the server` });
      return;
    }

    const { authUrl, state } = await OAuthService.generateAuthUrl(brokerId, redirectUri, user.id);

    sendJson(res, 200, {
      success: true,
      broker: brokerId,
      authUrl,
      state,
      redirectUri,
    });
  } catch (err: any) {
    console.error('Broker OAuth login error:', err);
    sendJson(res, 400, {
      success: false,
      error: err?.message || 'Unable to begin broker authorization',
    });
  }
}

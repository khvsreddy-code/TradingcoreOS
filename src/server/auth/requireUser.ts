import type { NextFunction, Request, Response } from 'express';
import crypto from 'node:crypto';

export interface AuthenticatedRequest extends Request {
  tradingCoreUserId?: string;
}

const tokenCache = new Map<string, { userId: string; expiresAt: number }>();
const CACHE_MS = 30_000;

/** Validates the Supabase access token with Supabase; client-provided user IDs are never trusted. */
export async function requireUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authorization = req.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY;
  if (!token) {
    res.status(401).json({ success: false, error: 'TradingCore login session is missing. Sign in again.' });
    return;
  }
  if (!supabaseUrl || !supabaseKey) {
    res.status(503).json({ success: false, error: 'TradingCore authentication backend is not configured. Set SUPABASE_URL and a server-side Supabase key on the server.' });
    return;
  }
  const cacheKey = crypto.createHash('sha256').update(token).digest('hex');
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    req.tradingCoreUserId = cached.userId;
    next();
    return;
  }
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey },
    });
    const user = await response.json();
    if (!response.ok || !user?.id) {
      res.status(401).json({ success: false, error: 'TradingCore session is invalid or expired' });
      return;
    }
    req.tradingCoreUserId = user.id;
    tokenCache.set(cacheKey, { userId: user.id, expiresAt: Date.now() + CACHE_MS });
    if (tokenCache.size > 2048) {
      for (const [key, value] of tokenCache) {
        if (value.expiresAt <= Date.now()) tokenCache.delete(key);
        if (tokenCache.size <= 1024) break;
      }
    }
    next();
  } catch {
    res.status(503).json({ success: false, error: 'Unable to validate TradingCore session' });
  }
}

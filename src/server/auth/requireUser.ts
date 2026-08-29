import type { NextFunction, Request, Response } from 'express';

export interface AuthenticatedRequest extends Request {
  tradingCoreUserId?: string;
}

/** Validates the Supabase access token with Supabase; client-provided user IDs are never trusted. */
export async function requireUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authorization = req.get('authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!token || !supabaseUrl || !supabaseAnonKey) {
    res.status(401).json({ success: false, error: 'Authenticated TradingCore session required' });
    return;
  }
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: supabaseAnonKey },
    });
    const user = await response.json();
    if (!response.ok || !user?.id) {
      res.status(401).json({ success: false, error: 'TradingCore session is invalid or expired' });
      return;
    }
    req.tradingCoreUserId = user.id;
    next();
  } catch {
    res.status(503).json({ success: false, error: 'Unable to validate TradingCore session' });
  }
}

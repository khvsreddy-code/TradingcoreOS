import type { IncomingMessage, ServerResponse } from 'node:http';
import { OAuthController } from '../../../src/server/auth/OAuthController.js';

interface VercelRequest extends IncomingMessage {
  body?: any;
  query?: Record<string, unknown>;
  params?: Record<string, string>;
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

/**
 * Explicit Vercel Function for /api/auth/broker/callback.
 * The OAuth controller is shared with Express, so this function supplies the
 * small Response adapter it expects instead of passing Vercel's raw response
 * object (which does not implement res.status().json()).
 */
export default async function handler(req: VercelRequest, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { success: false, error: 'Method not allowed' });
    return;
  }

  const expressLikeResponse = {
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      sendJson(res, res.statusCode || 200, payload);
      return this;
    },
  };

  try {
    await OAuthController.handleCallback(req as any, expressLikeResponse as any);
  } catch (err: any) {
    console.error('Broker OAuth callback function error:', err);
    if (!res.writableEnded) {
      sendJson(res, 500, { success: false, error: err?.message || 'Server error during OAuth callback' });
    }
  }
}

import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface TradingCoreRequest extends Request {
  tradingCoreRequestId?: string;
  tradingCoreStartedAt?: number;
  tradingCoreRequestReason?: string;
  tradingCoreAbortController?: AbortController;
  tradingCoreAbortSignal?: AbortSignal;
}

export function requestContext(req: TradingCoreRequest, res: Response, next: NextFunction): void {
  const supplied = String(req.get('x-request-id') || '').trim();
  const id = /^[A-Za-z0-9._:-]{8,100}$/.test(supplied) ? supplied : crypto.randomUUID();
  const reason = String(req.get('x-request-reason') || `api:${req.method.toLowerCase()}:${req.path}`).trim().replace(/[^a-zA-Z0-9._:/ -]/g, '').slice(0, 80) || 'unspecified';
  req.tradingCoreRequestReason = reason;
  req.tradingCoreRequestId = id;
  req.tradingCoreStartedAt = Date.now();
  res.setHeader('X-Request-ID', id);
  res.setHeader('X-Request-Reason', reason);
  res.on('finish', () => {
    const duration = Date.now() - (req.tradingCoreStartedAt || Date.now());
    const route = `${req.method} ${req.path}`;
    if (process.env.TRADINGCORE_REQUEST_LOGS !== 'false') {
      console.info(`[TradingCore request] ${id} ${reason} ${route} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
}

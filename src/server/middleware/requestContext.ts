import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface TradingCoreRequest extends Request {
  tradingCoreRequestId?: string;
  tradingCoreStartedAt?: number;
  tradingCoreAbortController?: AbortController;
  tradingCoreAbortSignal?: AbortSignal;
}

export function requestContext(req: TradingCoreRequest, res: Response, next: NextFunction): void {
  const supplied = String(req.get('x-request-id') || '').trim();
  const id = /^[A-Za-z0-9._:-]{8,100}$/.test(supplied) ? supplied : crypto.randomUUID();
  req.tradingCoreRequestId = id;
  req.tradingCoreStartedAt = Date.now();
  res.setHeader('X-Request-ID', id);
  res.on('finish', () => {
    const duration = Date.now() - (req.tradingCoreStartedAt || Date.now());
    const route = `${req.method} ${req.path}`;
    if (process.env.TRADINGCORE_REQUEST_LOGS !== 'false') {
      console.info(`[TradingCore request] ${id} ${route} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
}

import type { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetAt: number };

/** Small process-local limiter. Deployments with multiple instances can replace
 * this with a shared edge/Redis limiter without changing route contracts. */
export function createRateLimiter(options: { windowMs: number; max: number; key?: (req: Request) => string; name?: string; maxKeys?: number }) {
  const buckets = new Map<string, Bucket>();
  const maxKeys = Math.max(100, options.maxKeys ?? 10_000);
  const sweepTarget = Math.max(80, Math.floor(maxKeys * 0.8));
  const name = options.name || 'default';
  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const key = `${name}:${options.key ? options.key(req) : req.ip || 'unknown'}`;
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + options.windowMs } : current;
    bucket.count += 1;
    buckets.set(key, bucket);

    if (buckets.size > maxKeys) {
      for (const [entryKey, entry] of buckets) {
        if (entry.resetAt <= now) buckets.delete(entryKey);
        if (buckets.size <= sweepTarget) break;
      }
    }

    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, options.max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ success: false, error: 'Too many TradingCore API requests. Retry after the indicated interval.' });
      return;
    }
    next();
  };
}

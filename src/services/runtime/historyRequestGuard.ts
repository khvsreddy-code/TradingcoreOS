import { tradingCoreRuntime } from './TradingCoreRuntime';

// The terminal can mount several charts at once. Keep historical requests deduplicated
// and serialized so a layout change cannot stampede the broker API. A broker 429 gets
// one delayed retry; ordinary errors keep the existing short retry behavior.
const runtime = tradingCoreRuntime as any;
const installedKey = '__tradingcoreHistoryGuardInstalled';

if (!(runtime as any)[installedKey]) {
  (runtime as any)[installedKey] = true;
  const original = runtime.getHistoricalData.bind(runtime);
  const cache = new Map<string, { expiresAt: number; staleUntil: number; data: any[] }>();
  const inFlight = new Map<string, Promise<any[]>>();
  const rateLimitedUntil = new Map<string, number>();
  let queue: Promise<unknown> = Promise.resolve();
  let lastStartedAt = 0;

  const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
  const schedule = <T,>(job: () => Promise<T>) => {
    const run = queue.then(async () => {
      const gap = Math.max(0, 350 - (Date.now() - lastStartedAt));
      if (gap) await wait(gap);
      lastStartedAt = Date.now();
      return job();
    });
    queue = run.catch(() => undefined);
    return run;
  };

  runtime.getHistoricalData = (symbol: string, timeframe: string) => {
    const broker = String(runtime.getPrimaryBrokerInfo?.()?.brokerId || 'unknown').toLowerCase();
    const key = `${broker}:${symbol}:${timeframe}`;
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) return Promise.resolve(cached.data);
    const limitedUntil = rateLimitedUntil.get(key) || 0;
    if (limitedUntil > now) {
      if (cached && cached.staleUntil > now) return Promise.resolve(cached.data);
      return Promise.reject(new Error('Historical data is temporarily rate-limited; please retry shortly.'));
    }

    const existing = inFlight.get(key);
    if (existing) return existing;

    const request = schedule(async () => {
      try {
        const data = await original(symbol, timeframe);
        if (data?.length) cache.set(key, { data, expiresAt: Date.now() + 20_000, staleUntil: Date.now() + 5 * 60_000 });
        return data || [];
      } catch (error: any) {
        const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
        const text = String(error?.message || error || '').toLowerCase();
        const limited = status === 429 || /(^|\s)(429|rate[- ]?limit|too many requests|request limit reached)(\s|$)/.test(text);
        if (limited) {
          // Do not retry the same history request after a broker 429. The server
          // route already serializes broker calls; another client-side retry would
          // simply extend the quota collision. Reuse stale data when available and
          // suppress duplicate mounts for a short cooldown.
          rateLimitedUntil.set(key, Date.now() + 15_000);
          const stale = cache.get(key);
          if (stale && stale.staleUntil > Date.now()) return stale.data;
        }
        throw error;
      }
    }).finally(() => inFlight.delete(key));

    inFlight.set(key, request);
    return request;
  };
}

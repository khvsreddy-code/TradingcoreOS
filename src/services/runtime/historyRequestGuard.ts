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

    const existing = inFlight.get(key);
    if (existing) return existing;

    const request = schedule(async () => {
      let lastError: any;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const data = await original(symbol, timeframe);
          if (data?.length) cache.set(key, { data, expiresAt: Date.now() + 20_000, staleUntil: Date.now() + 5 * 60_000 });
          return data || [];
        } catch (error: any) {
          lastError = error;
          const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
          const text = String(error?.message || error || '').toLowerCase();
          const limited = status === 429 || /(^|\s)(429|rate[- ]?limit|too many requests|request limit reached)(\s|$)/.test(text);

          if (limited) {
            // Never immediately hammer the broker after a 429. One delayed retry
            // is enough to recover transient quota collisions without multiplying
            // pressure when the broker is genuinely saturated.
            if (attempt === 0) {
              await wait(5_000);
              continue;
            }
            const stale = cache.get(key);
            if (stale && stale.staleUntil > Date.now()) return stale.data;
            throw error;
          }

          if (attempt === 2) throw error;
          await wait(400 * (attempt + 1));
        }
      }
      throw lastError || new Error('Historical candle request failed');
    }).finally(() => inFlight.delete(key));

    inFlight.set(key, request);
    return request;
  };
}

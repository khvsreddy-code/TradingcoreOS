import { tradingCoreRuntime } from './TradingCoreRuntime';

// The terminal can mount several charts at once. Keep historical requests deduplicated
// and gently serialized so a layout change cannot stampede the broker API.
const runtime = tradingCoreRuntime as any;
const installedKey = '__tradingcoreHistoryGuardInstalled';

if (!(runtime as any)[installedKey]) {
  (runtime as any)[installedKey] = true;
  const original = runtime.getHistoricalData.bind(runtime);
  const cache = new Map<string, { expiresAt: number; data: any[] }>();
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
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data);
    const existing = inFlight.get(key);
    if (existing) return existing;

    const request = schedule(async () => {
      let lastError: any;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const data = await original(symbol, timeframe);
          if (data?.length) cache.set(key, { data, expiresAt: Date.now() + 20_000 });
          return data || [];
        } catch (error: any) {
          lastError = error;
          // Server-side broker pacing owns rate limits. Retrying a broker 429
          // from the browser multiplies pressure and can blank the chart.
          const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
          const text = String(error?.message || error || '').toLowerCase();
          const limited = status === 429 || /(^|\s)(429|rate[- ]?limit|too many requests|request limit reached)(\s|$)/.test(text);
          if (limited || attempt === 2) throw error;
          await wait(400 * (attempt + 1));
        }
      }
      throw lastError || new Error('Historical candle request failed');
    }).finally(() => inFlight.delete(key));

    inFlight.set(key, request);
    return request;
  };
}

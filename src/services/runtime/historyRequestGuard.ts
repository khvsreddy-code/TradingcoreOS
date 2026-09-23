import { tradingCoreRuntime } from './TradingCoreRuntime';

/**
 * Chart-history transport guard.
 *
 * Important: deduplication is shared, but AbortSignal ownership is NOT shared.
 * A chart that switches symbols may cancel its own waiter without cancelling a
 * request another chart still needs. The underlying request is aborted only
 * when the last consumer leaves. This prevents the classic rapid-switch bug:
 * NIFTY request -> switch -> abort -> BANKNIFTY/NIFTY consumers inherit the
 * first caller's AbortError -> blank chart.
 */
const runtime = tradingCoreRuntime as any;
const installedKey = '__tradingcoreHistoryGuardInstalledV2';

type SharedRequest = {
  controller: AbortController;
  promise: Promise<any[]>;
  consumers: number;
  settled: boolean;
  abortTimer?: ReturnType<typeof setTimeout>;
};

if (!(runtime as any)[installedKey]) {
  (runtime as any)[installedKey] = true;
  const original = runtime.getHistoricalData.bind(runtime);
  const cache = new Map<string, { expiresAt: number; staleUntil: number; data: any[] }>();
  const inFlight = new Map<string, SharedRequest>();

  const abortError = () => Object.assign(new Error('Historical request aborted'), { name: 'AbortError' });
  const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(abortError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

  // Do not serialize unrelated symbols/timeframes in the browser.
  // The broker-side request gate already enforces the provider's rate limit.
  // Keeping requests independent lets a fresh chart become responsive without
  // waiting behind an unrelated history request from another chart.
  const schedule = <T,>(job: (signal: AbortSignal) => Promise<T>, signal: AbortSignal) => {
    if (signal.aborted) return Promise.reject(abortError());
    return job(signal);
  };

  const withConsumer = (shared: SharedRequest, callerSignal?: AbortSignal): Promise<any[]> => {
    shared.consumers += 1;
    if (shared.abortTimer) { clearTimeout(shared.abortTimer); shared.abortTimer = undefined; }
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      shared.consumers = Math.max(0, shared.consumers - 1);
      if (!shared.settled && shared.consumers === 0 && !shared.abortTimer) {
        // Keep the underlying history request alive briefly after the last
        // chart waiter leaves. Rapid symbol/timeframe switches commonly
        // return to the same dataset within a few hundred milliseconds;
        // aborting immediately throws away a nearly-complete broker response
        // and recreates the exact blank-chart behavior the legacy runtime did
        // not have.
        shared.abortTimer = setTimeout(() => {
          shared.abortTimer = undefined;
          if (!shared.settled && shared.consumers === 0) shared.controller.abort();
        }, 1800);
      }
    };
    if (callerSignal?.aborted) {
      release();
      return Promise.reject(abortError());
    }
    return new Promise<any[]>((resolve, reject) => {
      const onAbort = () => { callerSignal?.removeEventListener('abort', onAbort); release(); reject(abortError()); };
      callerSignal?.addEventListener('abort', onAbort, { once: true });
      shared.promise.then(
        value => { callerSignal?.removeEventListener('abort', onAbort); release(); resolve(value); },
        error => { callerSignal?.removeEventListener('abort', onAbort); release(); reject(error); },
      );
    });
  };

  runtime.getHistoricalData = (symbol: string, timeframe: string, signal?: AbortSignal) => {
    const broker = String(runtime.getPrimaryBrokerInfo?.()?.brokerId || 'unknown').toLowerCase();
    const key = `${broker}:${symbol}:${timeframe}`;
    const now = Date.now();
    const cached = cache.get(key);
    if (signal?.aborted) return Promise.reject(abortError());
    if (cached && cached.expiresAt > now) return Promise.resolve(cached.data);

    const existing = inFlight.get(key);
    if (cached && cached.staleUntil > now && !existing) {
      // Keep symbol switches instant while refreshing in the background.
      const backgroundController = new AbortController();
      const backgroundShared: SharedRequest = { controller: backgroundController, promise: Promise.resolve([]), consumers: 0, settled: false };
      const backgroundRequest = schedule(async (requestSignal) => {
        const data = await original(symbol, timeframe, requestSignal);
        if (requestSignal.aborted) throw abortError();
        if (data?.length) cache.set(key, { data, expiresAt: Date.now() + 120_000, staleUntil: Date.now() + 10 * 60_000 });
        return data || [];
      }, backgroundController.signal).finally(() => {
        backgroundShared.settled = true;
        if (inFlight.get(key) === backgroundShared) inFlight.delete(key);
      });
      backgroundShared.promise = backgroundRequest;
      inFlight.set(key, backgroundShared);
      void backgroundRequest.catch(() => undefined);
      return Promise.resolve(cached.data);
    }

    if (existing) return withConsumer(existing, signal);
    const controller = new AbortController();
    const shared: SharedRequest = { controller, promise: Promise.resolve([]), consumers: 0, settled: false };
    const request = schedule(async (requestSignal) => {
      let lastError: any;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const data = await original(symbol, timeframe, requestSignal);
          if (requestSignal.aborted) throw abortError();
          if (data?.length) cache.set(key, { data, expiresAt: Date.now() + 120_000, staleUntil: Date.now() + 10 * 60_000 });
          return data || [];
        } catch (error: any) {
          lastError = error;
          const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
          const text = String(error?.message || error || '').toLowerCase();
          const limited = status === 429 || /(^|\s)(429|rate[- ]?limit|too many requests|request limit reached)(\s|$)/.test(text);
          if (requestSignal.aborted || error?.name === 'AbortError') throw error;
          if (limited || attempt === 1) throw error;
          await wait(350, requestSignal);
        }
      }
      throw lastError || new Error('Historical candle request failed');
    }, controller.signal);

    shared.promise = request.finally(() => {
      shared.settled = true;
      if (shared.abortTimer) { clearTimeout(shared.abortTimer); shared.abortTimer = undefined; }
      if (inFlight.get(key) === shared) inFlight.delete(key);
    });
    inFlight.set(key, shared);
    return withConsumer(shared, signal);
  };
}

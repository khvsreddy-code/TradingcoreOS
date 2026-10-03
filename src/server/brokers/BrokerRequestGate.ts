type BrokerLimit = {
  minIntervalMs: number;
  maxPerMinute: number;
};

type QueueState = {
  nextAvailableAt: number;
  timestamps: number[];
  tail: Promise<void>;
};

const LIMITS: Record<string, BrokerLimit> = {
  fyers: { minIntervalMs: 300, maxPerMinute: 190 },
};

const queues = new Map<string, QueueState>();

function getState(key: string): QueueState {
  let state = queues.get(key);
  if (!state) {
    state = { nextAvailableAt: 0, timestamps: [], tail: Promise.resolve() };
    queues.set(key, state);
  }
  return state;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error('Broker request aborted'), { name: 'AbortError' }));
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(Object.assign(new Error('Broker request aborted'), { name: 'AbortError' })); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Serialize broker REST calls per authenticated token and keep a deliberate
 * margin below documented per-minute limits. This is especially important on
 * Vercel, where multiple React effects can otherwise fan out simultaneously.
 */
export async function withBrokerRequestGate<T>(broker: 'fyers', identity: string, task: (signal?: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  const key = `${broker}:${identity}`;
  const state = getState(key);
  const limit = LIMITS[broker];

  let release!: () => void;
  const turn = new Promise<void>(resolve => { release = resolve; });
  const previous = state.tail;
  state.tail = previous.then(() => turn);
  await previous;

  if (signal?.aborted) { release(); throw Object.assign(new Error('Broker request aborted'), { name: 'AbortError' }); }

  try {
    const now = Date.now();
    state.timestamps = state.timestamps.filter(ts => now - ts < 60_000);
    const oldest = state.timestamps[0];
    const minuteWait = state.timestamps.length >= limit.maxPerMinute && oldest ? 60_000 - (now - oldest) + 25 : 0;
    const spacingWait = Math.max(0, state.nextAvailableAt - now);
    await sleep(Math.max(minuteWait, spacingWait), signal);

    const startedAt = Date.now();
    state.timestamps.push(startedAt);
    state.nextAvailableAt = startedAt + limit.minIntervalMs;
    try {
      return await task(signal);
    } catch (error: any) {
      const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
      const message = String(error?.message || error || '').toLowerCase();
      const limited = status === 429 || Number(error?.brokerCode) === 429 || /(^|\s)(429|rate[- ]?limit|too many requests|request limit reached)(\s|$)/.test(message);
      if (limited) {
        // A broker 429 is a signal to slow the entire token queue, not just
        // the request that failed. This prevents the next queued chart/order
        // call from immediately repeating the same rejected request.
        const retryAfter = Number(error?.retryAfterMs || 0);
        state.nextAvailableAt = Math.max(state.nextAvailableAt, Date.now() + Math.max(1_500, Math.min(15_000, retryAfter || 2_500)));
      }
      throw error;
    }
  } finally {
    release();
  }
}


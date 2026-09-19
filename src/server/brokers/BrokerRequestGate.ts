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
  // FYERS currently documents 10 req/s and 200 req/min on Standard,
  // 10 req/s and 600 req/min on Prime. Use the Standard ceiling globally so
  // TradingCore remains safe regardless of the user's subscription.
  fyers: { minIntervalMs: 325, maxPerMinute: 180 },
  // Upstox documents 50 req/s and 500 req/min for standard APIs and
  // 10 req/s for the combined order APIs. The shared REST gate uses the
  // conservative 450/min standard-api budget; order endpoints have an
  // additional 100ms floor below.
  upstox: { minIntervalMs: 125, maxPerMinute: 450 },
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

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}

/**
 * Serialize broker REST calls per authenticated token and keep a deliberate
 * margin below documented per-minute limits. This is especially important on
 * Vercel, where multiple React effects can otherwise fan out simultaneously.
 */
export async function withBrokerRequestGate<T>(broker: 'fyers' | 'upstox', identity: string, task: () => Promise<T>): Promise<T> {
  const key = `${broker}:${identity}`;
  const state = getState(key);
  const limit = LIMITS[broker];

  let release!: () => void;
  const turn = new Promise<void>(resolve => { release = resolve; });
  const previous = state.tail;
  state.tail = previous.then(() => turn);
  await previous;

  try {
    const now = Date.now();
    state.timestamps = state.timestamps.filter(ts => now - ts < 60_000);
    const oldest = state.timestamps[0];
    const minuteWait = state.timestamps.length >= limit.maxPerMinute && oldest ? 60_000 - (now - oldest) + 25 : 0;
    const spacingWait = Math.max(0, state.nextAvailableAt - now);
    await sleep(Math.max(minuteWait, spacingWait));

    const startedAt = Date.now();
    state.timestamps.push(startedAt);
    state.nextAvailableAt = startedAt + limit.minIntervalMs;
    try {
      return await task();
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

/** Use for Upstox order placement where the broker documents a 10 req/s combined order limit. */
export async function withUpstoxOrderGate<T>(identity: string, task: () => Promise<T>): Promise<T> {
  const key = `upstox-order:${identity}`;
  const state = getState(key);
  const previous = state.tail;
  let release!: () => void;
  const turn = new Promise<void>(resolve => { release = resolve; });
  state.tail = previous.then(() => turn);
  await previous;
  try {
    await sleep(Math.max(0, state.nextAvailableAt - Date.now()));
    const now = Date.now();
    state.timestamps = state.timestamps.filter(ts => now - ts < 60_000);
    if (state.timestamps.length >= 500) {
      const oldest = state.timestamps[0];
      await sleep(Math.max(0, 60_000 - (Date.now() - oldest) + 25));
    }
    const startedAt = Date.now();
    state.timestamps.push(startedAt);
    state.nextAvailableAt = startedAt + 125;
    return await task();
  } finally {
    release();
  }
}

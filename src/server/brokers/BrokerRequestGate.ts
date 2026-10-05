import crypto from 'node:crypto';
import { getSharedRedis } from '../coordination/UpstashRedisRest.js';

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
  fyers: { minIntervalMs: 300, maxPerMinute: 190 },
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
async function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw Object.assign(new Error('Broker request aborted'), { name: 'AbortError' });
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('Broker request aborted'), { name: 'AbortError' }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function distributedEnabled(): boolean {
  return process.env.TRADINGCORE_DISTRIBUTED_COORDINATION !== 'false';
}

export async function withBrokerRequestGate<T>(
  broker: 'fyers' | 'upstox',
  identity: string,
  task: (signal?: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const key = broker + ':' + identity;
  const localState = getState(key);
  const limit = LIMITS[broker];

  let localRelease!: () => void;
  const previous = localState.tail;
  const localTurn = new Promise<void>((resolve) => { localRelease = resolve; });
  localState.tail = previous.then(() => localTurn);
  await previous;

  const distributed = getSharedRedis();
  const identityHash = crypto.createHash('sha256').update(identity).digest('hex');
  const lockKey = 'tco:broker:gate:' + broker + ':' + identityHash;
  const owner = crypto.randomUUID();
  const lockTtl = Math.max(15_000, limit.minIntervalMs + 12_000);
  let distributedRelease: (() => Promise<void>) | undefined;

  try {
    if (signal?.aborted) throw Object.assign(new Error('Broker request aborted'), { name: 'AbortError' });

    if (distributedEnabled() && distributed.configured) {
      while (!(await distributed.acquireLock(lockKey, owner, lockTtl, signal))) {
        await sleepWithSignal(Math.min(100, limit.minIntervalMs), signal);
      }

      distributedRelease = async () => {
        await distributed.releaseLock(lockKey, owner).catch(() => undefined);
      };

      const now = Date.now();
      const window = Math.floor(now / 60_000);
      const countKey = 'tco:broker:minute:' + broker + ':' + identityHash + ':' + window;
      const count = await distributed.incrementWindow(countKey, 61_000, signal);
      if (count > limit.maxPerMinute) {
        await distributedRelease();
        distributedRelease = undefined;
        throw Object.assign(new Error('Broker request rate budget exhausted'), { status: 429, brokerCode: 429 });
      }

      const lastKey = 'tco:broker:last:' + broker + ':' + identityHash;
      const last = Number(await distributed.get<string | number>(lastKey, signal) || 0);
      const spacing = Math.max(0, limit.minIntervalMs - (Date.now() - last));
      if (spacing) await sleepWithSignal(spacing, signal);
      await distributed.set(lastKey, String(Date.now()), { px: 61_000 }, signal);
    } else if (distributedEnabled() && process.env.NODE_ENV === 'production') {
      const marker = globalThis as typeof globalThis & { __tradingCoreRedisWarningLogged?: boolean };
      if (!marker.__tradingCoreRedisWarningLogged) {
        marker.__tradingCoreRedisWarningLogged = true;
        console.warn('[TradingCore] Shared Redis coordination is not configured; broker limits are only enforced per function instance.');
      }
    }

    const now = Date.now();
    localState.timestamps = localState.timestamps.filter((ts) => now - ts < 60_000);
    const oldest = localState.timestamps[0];
    const minuteWait = localState.timestamps.length >= limit.maxPerMinute && oldest
      ? 60_000 - (now - oldest) + 25
      : 0;
    const spacingWait = Math.max(0, localState.nextAvailableAt - now);
    await sleep(Math.max(minuteWait, spacingWait), signal);

    const startedAt = Date.now();
    localState.timestamps.push(startedAt);
    localState.nextAvailableAt = startedAt + limit.minIntervalMs;
    return await task(signal);
  } finally {
    try {
      await distributedRelease?.();
    } finally {
      localRelease();
    }
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

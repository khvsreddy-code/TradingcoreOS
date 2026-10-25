import crypto from 'node:crypto';
import { getSharedRedis } from '../coordination/UpstashRedisRest.js';

type BrokerLimit = {
  minIntervalMs: number;
  maxPerMinute: number;
};

export type BrokerRequestPriority = 'interactive' | 'normal' | 'background';

type QueueState = {
  nextAvailableAt: number;
  timestamps: number[];
  tail: Promise<void>;
  dayKey: string;
  dailyCount: number;
  priorityTimestamps: Record<BrokerRequestPriority, number[]>;
  priorityDailyCount: Record<BrokerRequestPriority, number>;
};

export type BrokerRequestGatePolicy = Readonly<{
  /** Separate documented API categories when their limits differ. */
  budgetKey?: string;
  minIntervalMs?: number;
  maxPerMinute?: number;
  maxPerDay?: number;
  priority?: BrokerRequestPriority;
}>;

function indiaDayKey(now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(now));
}

const LIMITS: Record<string, BrokerLimit> = {
  // General FYERS API fallback only. The Data API uses a separate budgetKey
  // and the authenticated user's server-resolved FyersCapabilities, including
  // its plan-specific per-second, per-minute and per-day limits.
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
    state = {
      nextAvailableAt: 0, timestamps: [], tail: Promise.resolve(), dayKey: indiaDayKey(), dailyCount: 0,
      priorityTimestamps: { interactive: [], normal: [], background: [] },
      priorityDailyCount: { interactive: 0, normal: 0, background: 0 },
    };
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(Object.assign(new Error('Broker request aborted'), { name: 'AbortError' }));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function waitForPromiseWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) throw Object.assign(new Error('Broker request aborted'), { name: 'AbortError' });

  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      reject(Object.assign(new Error('Broker request aborted'), { name: 'AbortError' }));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
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
  policy: BrokerRequestGatePolicy = {},
): Promise<T> {
  const effectiveSignal = signal || AbortSignal.timeout(15_000);
  const budgetName = policy.budgetKey ? `${broker}:${policy.budgetKey}` : broker;
  const key = budgetName + ':' + identity;
  const localState = getState(key);
  const priority = policy.priority || 'normal';
  const limit: BrokerLimit & { maxPerDay?: number } = {
    ...LIMITS[broker],
    ...(policy.minIntervalMs != null ? { minIntervalMs: Math.max(0, Math.floor(policy.minIntervalMs)) } : {}),
    ...(policy.maxPerMinute != null ? { maxPerMinute: Math.max(1, Math.floor(policy.maxPerMinute)) } : {}),
    ...(policy.maxPerDay != null ? { maxPerDay: Math.max(1, Math.floor(policy.maxPerDay)) } : {}),
  };

  let localRelease!: () => void;
  let localReleased = false;
  const previous = localState.tail;
  const localTurn = new Promise<void>((resolve) => { localRelease = resolve; });
  localState.tail = previous.then(() => localTurn);

  try {
    // The local queue is an admission queue only. It must never keep the next
    // request waiting for the previous network call to finish.
    await waitForPromiseWithSignal(previous, effectiveSignal);
    if (effectiveSignal.aborted) throw Object.assign(new Error('Broker request aborted'), { name: 'AbortError' });

    const distributed = getSharedRedis();
    const identityHash = crypto.createHash('sha256').update(identity).digest('hex');
    const coordinationRequired = process.env.NODE_ENV === 'production' || process.env.TRADINGCORE_DISTRIBUTED_COORDINATION_REQUIRED === 'true';
    if (coordinationRequired && (!distributedEnabled() || !distributed.configured)) {
      throw Object.assign(
        new Error('Shared Redis coordination is required before broker API calls can be admitted.'),
        { status:503, code:'BROKER_COORDINATION_REQUIRED' },
      );
    }

    if (distributedEnabled() && distributed.configured) {
      const lockKey = 'tco:broker:admit:' + budgetName + ':' + identityHash;
      const owner = crypto.randomUUID();
      let acquired = false;
      try {
        while (!(acquired = await distributed.acquireLock(lockKey, owner, 2_000, effectiveSignal))) {
          await sleepWithSignal(Math.min(50, limit.minIntervalMs), effectiveSignal);
        }

        const now = Date.now();
        const window = Math.floor(now / 60_000);
        const countKey = 'tco:broker:minute:' + budgetName + ':' + identityHash + ':' + window;
        const dayKey = indiaDayKey(now);
        const dayCountKey = 'tco:broker:day:' + budgetName + ':' + identityHash + ':' + dayKey;
        const nonInteractiveMinuteKey = `tco:broker:priority-minute:noninteractive:${budgetName}:${identityHash}:${window}`;
        const backgroundMinuteKey = `tco:broker:priority-minute:background:${budgetName}:${identityHash}:${window}`;
        const nonInteractiveDayKey = `tco:broker:priority-day:noninteractive:${budgetName}:${identityHash}:${dayKey}`;
        const backgroundDayKey = `tco:broker:priority-day:background:${budgetName}:${identityHash}:${dayKey}`;

        // The per-identity Redis lock serializes aggregate and priority checks.
        // Interactive calls can use the entire safe budget; speculative work is capped.
        if (limit.maxPerDay != null) {
          const currentDayCount = Number(await distributed.get<string | number>(dayCountKey, effectiveSignal) || 0);
          if (currentDayCount >= limit.maxPerDay) {
            throw Object.assign(new Error('Broker daily request budget exhausted'), { status:429, brokerCode:429, code:'BROKER_RATE_BUDGET_EXHAUSTED' });
          }
        }
        const currentMinuteCount = Number(await distributed.get<string | number>(countKey, effectiveSignal) || 0);
        if (currentMinuteCount >= limit.maxPerMinute) {
          throw Object.assign(new Error('Broker request rate budget exhausted'), { status:429, brokerCode:429, code:'BROKER_RATE_BUDGET_EXHAUSTED' });
        }
        if (priority !== 'interactive') {
          const nonInteractiveCount = Number(await distributed.get<string | number>(nonInteractiveMinuteKey, effectiveSignal) || 0);
          if (nonInteractiveCount >= Math.max(1, Math.floor(limit.maxPerMinute * 0.7))) {
            throw Object.assign(new Error('Broker non-interactive request reserve exhausted'), { status:429, brokerCode:429, code:'BROKER_PRIORITY_BUDGET_EXHAUSTED' });
          }
          if (priority === 'background') {
            const backgroundCount = Number(await distributed.get<string | number>(backgroundMinuteKey, effectiveSignal) || 0);
            if (backgroundCount >= Math.max(1, Math.floor(limit.maxPerMinute * 0.35))) {
              throw Object.assign(new Error('Broker background request budget exhausted'), { status:429, brokerCode:429, code:'BROKER_PRIORITY_BUDGET_EXHAUSTED' });
            }
          }
          if (limit.maxPerDay != null) {
            const nonInteractiveDay = Number(await distributed.get<string | number>(nonInteractiveDayKey, effectiveSignal) || 0);
            if (nonInteractiveDay >= Math.max(1, Math.floor(limit.maxPerDay * 0.7))) {
              throw Object.assign(new Error('Broker non-interactive daily reserve exhausted'), { status:429, brokerCode:429, code:'BROKER_PRIORITY_BUDGET_EXHAUSTED' });
            }
            if (priority === 'background') {
              const backgroundDay = Number(await distributed.get<string | number>(backgroundDayKey, effectiveSignal) || 0);
              if (backgroundDay >= Math.max(1, Math.floor(limit.maxPerDay * 0.35))) {
                throw Object.assign(new Error('Broker background daily budget exhausted'), { status:429, brokerCode:429, code:'BROKER_PRIORITY_BUDGET_EXHAUSTED' });
              }
            }
          }
        }

        if (limit.maxPerDay != null) {
          await distributed.incrementWindow(dayCountKey, 48 * 60 * 60 * 1000, effectiveSignal);
          if (priority !== 'interactive') {
            await distributed.incrementWindow(nonInteractiveDayKey, 48 * 60 * 60 * 1000, effectiveSignal);
            if (priority === 'background') await distributed.incrementWindow(backgroundDayKey, 48 * 60 * 60 * 1000, effectiveSignal);
          }
        }
        await distributed.incrementWindow(countKey, 61_000, effectiveSignal);
        if (priority !== 'interactive') {
          await distributed.incrementWindow(nonInteractiveMinuteKey, 61_000, effectiveSignal);
          if (priority === 'background') await distributed.incrementWindow(backgroundMinuteKey, 61_000, effectiveSignal);
        }

        const lastKey = 'tco:broker:last:' + budgetName + ':' + identityHash;
        const last = Number(await distributed.get<string | number>(lastKey, effectiveSignal) || 0);
        const spacing = Math.max(0, limit.minIntervalMs - (Date.now() - last));
        if (spacing) await sleepWithSignal(spacing, effectiveSignal);
        await distributed.set(lastKey, String(Date.now()), { px: 61_000 }, effectiveSignal);
      } finally {
        if (acquired) await distributed.releaseLock(lockKey, owner).catch(() => undefined);
      }
    }

    const now = Date.now();
    const currentDayKey = indiaDayKey(now);
    if (localState.dayKey !== currentDayKey) {
      localState.dayKey = currentDayKey;
      localState.dailyCount = 0;
      localState.priorityDailyCount = { interactive: 0, normal: 0, background: 0 };
    }
    if (limit.maxPerDay != null && localState.dailyCount >= limit.maxPerDay) {
      throw Object.assign(new Error('Broker daily request budget exhausted'), { status: 429, brokerCode: 429, code: 'BROKER_RATE_BUDGET_EXHAUSTED' });
    }
    localState.timestamps = localState.timestamps.filter((ts) => now - ts < 60_000);
    for (const p of ['interactive', 'normal', 'background'] as const) {
      localState.priorityTimestamps[p] = localState.priorityTimestamps[p].filter(ts => now - ts < 60_000);
    }
    if (priority !== 'interactive') {
      const nonInteractiveCount = localState.priorityTimestamps.normal.length + localState.priorityTimestamps.background.length;
      if (nonInteractiveCount >= Math.max(1, Math.floor(limit.maxPerMinute * 0.7))) {
        throw Object.assign(new Error('Broker non-interactive request reserve exhausted'), { status:429, brokerCode:429, code:'BROKER_PRIORITY_BUDGET_EXHAUSTED' });
      }
      if (priority === 'background' && localState.priorityTimestamps.background.length >= Math.max(1, Math.floor(limit.maxPerMinute * 0.35))) {
        throw Object.assign(new Error('Broker background request budget exhausted'), { status:429, brokerCode:429, code:'BROKER_PRIORITY_BUDGET_EXHAUSTED' });
      }
      if (limit.maxPerDay != null) {
        const nonInteractiveDay = localState.priorityDailyCount.normal + localState.priorityDailyCount.background;
        if (nonInteractiveDay >= Math.max(1, Math.floor(limit.maxPerDay * 0.7))) {
          throw Object.assign(new Error('Broker non-interactive daily reserve exhausted'), { status:429, brokerCode:429, code:'BROKER_PRIORITY_BUDGET_EXHAUSTED' });
        }
        if (priority === 'background' && localState.priorityDailyCount.background >= Math.max(1, Math.floor(limit.maxPerDay * 0.35))) {
          throw Object.assign(new Error('Broker background daily budget exhausted'), { status:429, brokerCode:429, code:'BROKER_PRIORITY_BUDGET_EXHAUSTED' });
        }
      }
    }
    const oldest = localState.timestamps[0];
    const minuteWait = localState.timestamps.length >= limit.maxPerMinute && oldest
      ? 60_000 - (now - oldest) + 25
      : 0;
    const spacingWait = Math.max(0, localState.nextAvailableAt - now);
    await sleep(Math.max(minuteWait, spacingWait), effectiveSignal);

    const startedAt = Date.now();
    const startedDayKey = indiaDayKey(startedAt);
    if (localState.dayKey !== startedDayKey) {
      localState.dayKey = startedDayKey;
      localState.dailyCount = 0;
    }
    if (limit.maxPerDay != null && localState.dailyCount >= limit.maxPerDay) {
      throw Object.assign(new Error('Broker daily request budget exhausted'), { status: 429, brokerCode: 429, code: 'BROKER_RATE_BUDGET_EXHAUSTED' });
    }
    if (limit.maxPerDay != null) localState.dailyCount += 1;
    localState.priorityTimestamps[priority].push(startedAt);
    localState.priorityDailyCount[priority] += 1;
    localState.timestamps.push(startedAt);
    localState.nextAvailableAt = startedAt + limit.minIntervalMs;

    // Release the local admission turn before the actual network request so
    // quotes/orders can overlap a slow history response while preserving the
    // broker's global start-rate limit.
    localRelease();
    localReleased = true;
    return await task(effectiveSignal);
  } finally {
    if (!localReleased) localRelease();
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

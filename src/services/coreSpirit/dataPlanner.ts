import type { CoreSpiritDataRequest, CoreSpiritDataSnapshot, CoreSpiritDataResolver } from './types';
import { CoreSpiritDataCache } from './dataCache';

export type CoreSpiritPlannedRequest = CoreSpiritDataRequest & { key: string };
export type CoreSpiritDataPlan = {
  requests: CoreSpiritPlannedRequest[];
  dedupedCount: number;
  batchable: boolean;
  groups: readonly string[];
};

export type CoreSpiritDataPlanResult = {
  values: Map<string, CoreSpiritDataSnapshot>;
  missing: CoreSpiritPlannedRequest[];
};

function normalizeText(value: unknown): string { return String(value ?? '').trim(); }
function keyOf(r: CoreSpiritDataRequest): string {
  return `${normalizeText(r.symbol).toUpperCase()}|${normalizeText(r.timeframe).toLowerCase()}|${normalizeText(r.field).toLowerCase()}|${Math.max(0, Math.floor(r.offset ?? 0))}`;
}

/** Plans host data access before execution. The VM stays network-free. */
export function planCoreSpiritDataRequests(requests: CoreSpiritDataRequest[]): CoreSpiritDataPlan {
  const unique = new Map<string, CoreSpiritPlannedRequest>();
  for (const request of requests) {
    const field = normalizeText(request.field).toLowerCase();
    if (!['open','high','low','close','volume','time'].includes(field)) continue;
    const normalized: CoreSpiritDataRequest = { ...request, symbol: normalizeText(request.symbol), timeframe: normalizeText(request.timeframe), field: field as CoreSpiritDataRequest['field'], offset: Math.max(0, Math.floor(request.offset ?? 0)) };
    const key = keyOf(normalized);
    if (!unique.has(key)) unique.set(key, { ...normalized, key });
  }
  const planned = [...unique.values()];
  const groups = [...new Set(planned.map(request => `${request.symbol}|${request.timeframe}`))];
  return { requests: planned, dedupedCount: Math.max(0, requests.length - planned.length), batchable: planned.length > 1, groups };
}

export async function resolveCoreSpiritDataPlan(plan: CoreSpiritDataPlan, resolver: CoreSpiritDataResolver): Promise<CoreSpiritDataPlanResult> {
  const values = new Map<string, CoreSpiritDataSnapshot>();
  const missing: CoreSpiritPlannedRequest[] = [];
  if (!plan.requests.length) return { values, missing };

  if (resolver.requestBatch) {
    try {
      const snapshots = await resolver.requestBatch(plan.requests.map(({ key: _key, ...request }) => request));
      for (let i = 0; i < plan.requests.length; i++) {
        const snapshot = snapshots[i];
        if (snapshot) values.set(plan.requests[i].key, snapshot);
        else missing.push(plan.requests[i]);
      }
      return { values, missing };
    } catch {
      return { values, missing: [...plan.requests] };
    }
  }

  if (!resolver.request) return { values, missing: [...plan.requests] };
  const results = await Promise.all(plan.requests.map(async planned => {
    const { key: _key, ...request } = planned;
    try { return { planned, snapshot: await resolver.request!(request) }; }
    catch { return { planned, snapshot: undefined }; }
  }));
  for (const { planned, snapshot } of results) {
    if (snapshot) values.set(planned.key, snapshot); else missing.push(planned);
  }
  return { values, missing };
}

/** Cache + in-flight deduplication. Multiple callers share one network promise. */
export async function resolveCoreSpiritDataPlanCached(
  plan: CoreSpiritDataPlan,
  resolver: CoreSpiritDataResolver,
  cache: CoreSpiritDataCache,
  ttlMs: number | undefined = undefined,
): Promise<CoreSpiritDataPlanResult> {
  const values = new Map<string, CoreSpiritDataSnapshot>();
  const missing: CoreSpiritPlannedRequest[] = [];
  const misses = plan.requests.filter(request => {
    const cached = cache.get(request);
    if (cached) { values.set(request.key, cached); return false; }
    return true;
  });
  if (!misses.length) return { values, missing };

  if (resolver.requestBatch) {
    try {
      const snapshots = await resolver.requestBatch(misses.map(({ key: _key, ...request }) => request));
      for (let i = 0; i < misses.length; i += 1) {
        const request = misses[i];
        const snapshot = snapshots[i];
        if (snapshot) { cache.set(request, snapshot, ttlMs); values.set(request.key, snapshot); }
        else missing.push(request);
      }
      return { values, missing };
    } catch {
      missing.push(...misses);
      return { values, missing };
    }
  }

  if (!resolver.request) return { values, missing: misses };
  const resolved = await Promise.all(misses.map(async request => {
    const snapshot = await cache.resolve(request, async () => await resolver.request!(request), ttlMs);
    return { request, snapshot };
  }));
  for (const { request, snapshot } of resolved) {
    if (snapshot) values.set(request.key, snapshot);
    else missing.push(request);
  }
  return { values, missing };
}

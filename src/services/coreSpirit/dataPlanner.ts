import type { CoreSpiritDataRequest, CoreSpiritDataSnapshot, CoreSpiritDataResolver } from './types';
import { CoreSpiritDataCache } from './dataCache';

export type CoreSpiritPlannedRequest = CoreSpiritDataRequest & { key: string };
export type CoreSpiritDataPlan = {
  requests: CoreSpiritPlannedRequest[];
  dedupedCount: number;
  batchable: boolean;
};

export type CoreSpiritDataPlanResult = {
  values: Map<string, CoreSpiritDataSnapshot>;
  missing: CoreSpiritPlannedRequest[];
};

function keyOf(r: CoreSpiritDataRequest): string {
  return `${r.symbol}|${r.timeframe}|${r.field}|${Math.max(0, Math.floor(r.offset ?? 0))}`;
}

/**
 * Plans host data access before execution. The VM remains network-free; this layer
 * deduplicates identical requests and gives the host one deterministic batch.
 */
export function planCoreSpiritDataRequests(requests: CoreSpiritDataRequest[]): CoreSpiritDataPlan {
  const unique = new Map<string, CoreSpiritPlannedRequest>();
  for (const request of requests) {
    const normalized = { ...request, offset: Math.max(0, Math.floor(request.offset ?? 0)) };
    const key = keyOf(normalized);
    if (!unique.has(key)) unique.set(key, { ...normalized, key });
  }
  const planned = [...unique.values()];
  return { requests: planned, dedupedCount: Math.max(0, requests.length - planned.length), batchable: planned.length > 1 };
}

export async function resolveCoreSpiritDataPlan(
  plan: CoreSpiritDataPlan,
  resolver: CoreSpiritDataResolver,
): Promise<CoreSpiritDataPlanResult> {
  const values = new Map<string, CoreSpiritDataSnapshot>();
  const missing: CoreSpiritPlannedRequest[] = [];
  if (!plan.requests.length) return { values, missing };

  if (resolver.requestBatch) {
    const snapshots = await resolver.requestBatch(plan.requests.map(({ key: _key, ...request }) => request));
    for (let i = 0; i < plan.requests.length; i++) {
      const snapshot = snapshots[i];
      if (snapshot) values.set(plan.requests[i].key, snapshot);
      else missing.push(plan.requests[i]);
    }
    return { values, missing };
  }

  if (!resolver.request) return { values, missing: [...plan.requests] };
  await Promise.all(plan.requests.map(async planned => {
    const { key: _key, ...request } = planned;
    try {
      const snapshot = await resolver.request!(request);
      if (snapshot) values.set(planned.key, snapshot);
      else missing.push(planned);
    } catch {
      missing.push(planned);
    }
  }));
  return { values, missing };
}


/** Resolves a plan through a shared bounded cache. Cached values are used first; only misses reach the host. */
export async function resolveCoreSpiritDataPlanCached(
  plan: CoreSpiritDataPlan,
  resolver: CoreSpiritDataResolver,
  cache: CoreSpiritDataCache,
  ttlMs: number | undefined = undefined,
): Promise<CoreSpiritDataPlanResult> {
  const values = new Map<string, CoreSpiritDataSnapshot>();
  const misses: CoreSpiritPlannedRequest[] = [];
  for (const request of plan.requests) {
    const cached = cache.get(request);
    if (cached) values.set(request.key, cached);
    else misses.push(request);
  }
  if (!misses.length) return { values, missing: [] };
  const resolved = await resolveCoreSpiritDataPlan({ ...plan, requests: misses }, resolver);
  for (const request of misses) {
    const snapshot = resolved.values.get(request.key);
    if (snapshot) { cache.set(request, snapshot, ttlMs); values.set(request.key, snapshot); }
  }
  return { values, missing: resolved.missing };
}

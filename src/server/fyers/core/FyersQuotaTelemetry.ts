import type { FyersApiCategory, FyersApiPlan } from './FyersCapabilities.js';

type Entry = {
  category: FyersApiCategory;
  plan: FyersApiPlan;
  endpoint: string;
  minuteKey: number;
  dayKey: string;
  minuteRequests: number;
  dayRequests: number;
  minuteDenials: number;
  dayDenials: number;
  statuses: Record<string, number>;
  updatedAt: number;
};
const MAX_ENTRIES = 512;
const entries = new Map<string, Entry>();

function indiaDayKey(timestamp = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(timestamp));
}
function endpointKey(path: string): string {
  const clean = String(path || '/').split('?')[0] || '/';
  return clean.length > 100 ? clean.slice(0, 100) : clean;
}
function getEntry(category: FyersApiCategory, plan: FyersApiPlan, path: string): Entry {
  const endpoint = endpointKey(path);
  const key = `${category}|${plan}|${endpoint}`;
  const now = Date.now();
  const minuteKey = Math.floor(now / 60_000);
  const dayKey = indiaDayKey(now);
  let value = entries.get(key);
  if (!value) {
    value = { category, plan, endpoint, minuteKey, dayKey, minuteRequests: 0, dayRequests: 0, minuteDenials: 0, dayDenials: 0, statuses: {}, updatedAt: now };
    entries.set(key, value);
  }
  if (value.minuteKey !== minuteKey) {
    value.minuteKey = minuteKey;
    value.minuteRequests = 0;
    value.minuteDenials = 0;
    value.statuses = {};
  }
  if (value.dayKey !== dayKey) {
    value.dayKey = dayKey;
    value.dayRequests = 0;
    value.dayDenials = 0;
  }
  value.updatedAt = now;
  entries.delete(key);
  entries.set(key, value);
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value as string | undefined;
    if (!oldest) break;
    entries.delete(oldest);
  }
  return value;
}

/** Process-local observability only; authoritative admission counters live in shared Redis. */
export function recordFyersQuotaAttempt(category: FyersApiCategory, plan: FyersApiPlan, path: string): void {
  const value = getEntry(category, plan, path);
  value.minuteRequests += 1;
  value.dayRequests += 1;
}
export function recordFyersQuotaDenial(category: FyersApiCategory, plan: FyersApiPlan, path: string, status = 429): void {
  const value = getEntry(category, plan, path);
  value.minuteDenials += 1;
  value.dayDenials += 1;
  const label = status === 503 ? 'coordination-unavailable' : 'local-quota-denied';
  value.statuses[label] = (value.statuses[label] || 0) + 1;
}
export function recordFyersQuotaResponse(category: FyersApiCategory, plan: FyersApiPlan, path: string, status: number): void {
  const value = getEntry(category, plan, path);
  const label = status === 0 ? 'network-error' : status >= 200 && status < 300 ? '2xx' : status === 429 ? '429' : status >= 500 ? '5xx' : status >= 400 ? '4xx' : 'other';
  value.statuses[label] = (value.statuses[label] || 0) + 1;
}
export function getFyersQuotaTelemetry() {
  return {
    scope: 'process-local; admission authority is shared Redis',
    observedAt: new Date().toISOString(),
    entries: [...entries.values()].map(value => ({
      category: value.category,
      plan: value.plan,
      endpoint: value.endpoint,
      minuteRequests: value.minuteRequests,
      dayRequests: value.dayRequests,
      minuteDenials: value.minuteDenials,
      dayDenials: value.dayDenials,
      statuses: { ...value.statuses },
      updatedAt: new Date(value.updatedAt).toISOString(),
    })),
  };
}

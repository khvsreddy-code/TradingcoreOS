import type { CoreSpiritDataRequest, CoreSpiritDataSnapshot } from './types';

export type CoreSpiritCacheEntry = CoreSpiritDataSnapshot & { expiresAt?: number };
export type CoreSpiritDataCacheStats = Readonly<{ hits:number; misses:number; inflightHits:number; evictions:number; entries:number; hitRate:number }>;

/** Shared bounded host cache. It stores resolved data only; I/O remains host-owned. */
export class CoreSpiritDataCache {
  private readonly entries = new Map<string, CoreSpiritCacheEntry>();
  private readonly inflight = new Map<string, Promise<CoreSpiritCacheEntry | undefined>>();
  private metrics = { hits:0, misses:0, inflightHits:0, evictions:0 };

  constructor(private readonly maxEntries = 5000) {}

  key(request: CoreSpiritDataRequest): string {
    return `${request.symbol}|${request.timeframe}|${request.field}|${Math.max(0, Math.floor(request.offset ?? 0))}`;
  }

  get(request: CoreSpiritDataRequest, now = Date.now()): CoreSpiritCacheEntry | undefined {
    const key = this.key(request);
    const value = this.entries.get(key);
    if (!value) { this.metrics.misses++; return undefined; }
    if (value.expiresAt != null && value.expiresAt <= now) {
      this.entries.delete(key);
      this.metrics.misses++;
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, value);
    this.metrics.hits++;
    return value;
  }

  peek(request: CoreSpiritDataRequest, now = Date.now()): CoreSpiritCacheEntry | undefined {
    const value = this.entries.get(this.key(request));
    if (!value || (value.expiresAt != null && value.expiresAt <= now)) return undefined;
    return value;
  }

  set(request: CoreSpiritDataRequest, snapshot: CoreSpiritDataSnapshot, ttlMs?: number): void {
    const key = this.key(request);
    this.entries.delete(key);
    this.entries.set(key, { ...snapshot, expiresAt: ttlMs == null ? undefined : Date.now() + Math.max(0, ttlMs) });
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value!);
      this.metrics.evictions++;
    }
  }

  async resolve(request: CoreSpiritDataRequest, loader: () => Promise<CoreSpiritDataSnapshot | undefined>, ttlMs?: number): Promise<CoreSpiritDataSnapshot | undefined> {
    const cached = this.get(request);
    if (cached) return cached;
    const key = this.key(request);
    const existing = this.inflight.get(key);
    if (existing) {
      this.metrics.inflightHits++;
      return existing;
    }
    const promise = loader().then(snapshot => {
      if (snapshot) this.set(request, snapshot, ttlMs);
      return snapshot ? this.peek(request) : undefined;
    }).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }

  clear(): void { this.entries.clear(); this.inflight.clear(); this.metrics = { hits:0, misses:0, inflightHits:0, evictions:0 }; }
  get size() { return this.entries.size; }
  getStats(): CoreSpiritDataCacheStats {
    const total = this.metrics.hits + this.metrics.misses;
    return Object.freeze({ ...this.metrics, entries:this.entries.size, hitRate: total ? this.metrics.hits / total : 0 });
  }
}

import type { CoreSpiritDataRequest, CoreSpiritDataSnapshot } from './types';

export type CoreSpiritCacheEntry = CoreSpiritDataSnapshot & { expiresAt?: number };

/** Shared, bounded host-side cache. It stores resolved data only; it never performs I/O. */
export class CoreSpiritDataCache {
  private readonly entries = new Map<string, CoreSpiritCacheEntry>();
  constructor(private readonly maxEntries = 5000) {}

  key(request: CoreSpiritDataRequest): string {
    return `${request.symbol}|${request.timeframe}|${request.field}|${Math.max(0, Math.floor(request.offset ?? 0))}`;
  }

  get(request: CoreSpiritDataRequest, now = Date.now()): CoreSpiritCacheEntry | undefined {
    const key = this.key(request);
    const value = this.entries.get(key);
    if (!value) return undefined;
    if (value.expiresAt != null && value.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(request: CoreSpiritDataRequest, snapshot: CoreSpiritDataSnapshot, ttlMs?: number): void {
    const key = this.key(request);
    this.entries.delete(key);
    this.entries.set(key, { ...snapshot, expiresAt: ttlMs == null ? undefined : Date.now() + Math.max(0, ttlMs) });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
  }

  clear() { this.entries.clear(); }
  get size() { return this.entries.size; }
}

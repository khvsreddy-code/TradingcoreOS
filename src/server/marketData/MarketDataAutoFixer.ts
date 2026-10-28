import { randomUUID } from 'node:crypto';
import { getSharedRedis } from '../coordination/UpstashRedisRest.js';

export type MarketDataFixerSource = 'nse' | 'investiny' | 'fyers' | 'tvdatafeed';
export type MarketDataFixerCapability = 'history' | 'live' | 'options';
export type MarketDataFixerState = 'healthy' | 'open' | 'half-open';

export interface MarketDataFixerSnapshot {
  source: MarketDataFixerSource;
  capability: MarketDataFixerCapability;
  resource: string;
  state: MarketDataFixerState;
  failures: number;
  attempts: number;
  successes: number;
  lastStatus: number | null;
  lastError: string | null;
  lastAction: string;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  nextProbeAt: number | null;
}
type Entry = MarketDataFixerSnapshot & { probeInFlight: boolean; updatedAt: number; };
export interface MarketDataAutoFixerOptions {
  now?: () => number;
  baseCooldownMs?: number;
  maxCooldownMs?: number;
  authCooldownMs?: number;
  rateLimitFloorMs?: number;
  maxEntries?: number;
  /** Disable shared Redis state for deterministic unit tests. */
  useSharedCoordination?: boolean;
  /** Injected for deterministic tests; defaults to Math.random. */
  random?: () => number;
  /** Symmetric jitter applied to transient exponential cooldowns (0–0.5). */
  jitterRatio?: number;
}
function safeError(error: unknown): string {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  return String(error instanceof Error ? error.message : value.message ?? error ?? 'provider failure').replace(/[\r\n\t]+/g, ' ').slice(0, 240);
}
function statusOf(error: unknown): number | null {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const n = Number(value.status ?? value.statusCode ?? value.httpStatus);
  return Number.isInteger(n) && n >= 100 && n <= 599 ? n : null;
}
function retryAfterOf(error: unknown): number {
  const value = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const n = Number(value.retryAfterMs ?? value.retry_after_ms);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 60 * 60_000) : 0;
}

/**
 * Runtime self-recovery supervisor. It never modifies application source code
 * or bypasses provider access controls. It suppresses retry storms and permits
 * one half-open probe after a cooldown; a valid response automatically restores
 * that source on a subsequent request.
 */
export class MarketDataAutoFixer {
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly baseCooldownMs: number;
  private readonly maxCooldownMs: number;
  private readonly authCooldownMs: number;
  private readonly rateLimitFloorMs: number;
  private readonly maxEntries: number;
  private readonly useSharedCoordination: boolean;
  private readonly random: () => number;
  private readonly jitterRatio: number;
  private readonly probeOwners = new Map<string, string>();
  private readonly sharedStateTtlMs = 60 * 60_000;
  private readonly probeLockTtlMs = 30_000;
  constructor(options: MarketDataAutoFixerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.baseCooldownMs = Math.max(1, options.baseCooldownMs ?? 15_000);
    this.maxCooldownMs = Math.max(this.baseCooldownMs, options.maxCooldownMs ?? 5 * 60_000);
    this.authCooldownMs = Math.max(this.maxCooldownMs, options.authCooldownMs ?? 15 * 60_000);
    this.rateLimitFloorMs = Math.max(1, options.rateLimitFloorMs ?? 30_000);
    this.maxEntries = Math.max(16, Math.floor(options.maxEntries ?? 512));
    this.useSharedCoordination = options.useSharedCoordination ?? true;
    this.random = options.random ?? Math.random;
    this.jitterRatio = Math.max(0, Math.min(0.5, options.jitterRatio ?? 0.2));
  }
  private randomUnit(): number {
    const value = Number(this.random());
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
  }
  private jitterTransientCooldown(cooldownMs: number): number {
    const factor = 1 - this.jitterRatio + 2 * this.jitterRatio * this.randomUnit();
    return Math.max(1, Math.min(this.maxCooldownMs, Math.round(cooldownMs * factor)));
  }
  private jitterRateLimitCooldown(cooldownMs: number): number {
    // Never retry earlier than Retry-After/rateLimitFloorMs; jitter is positive only.
    return Math.max(this.rateLimitFloorMs, Math.min(60 * 60_000,
      Math.round(cooldownMs * (1 + this.jitterRatio * this.randomUnit()))));
  }
  private key(source: MarketDataFixerSource, capability: MarketDataFixerCapability, resource: string): string {
    return [source, capability, String(resource || 'global').slice(0, 180)].join('|');
  }
  private touch(key: string, entry: Entry): Entry {
    entry.updatedAt = this.now();
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return entry;
  }
  private getOrCreate(source: MarketDataFixerSource, capability: MarketDataFixerCapability, resource: string): Entry {
    const key = this.key(source, capability, resource);
    const old = this.entries.get(key);
    if (old) return this.touch(key, old);
    const now = this.now();
    const entry: Entry = {
      source, capability, resource: String(resource || 'global').slice(0, 180), state: 'healthy',
      failures: 0, attempts: 0, successes: 0, lastStatus: null, lastError: null,
      lastAction: 'ready', lastAttemptAt: null, lastSuccessAt: null, nextProbeAt: null,
      probeInFlight: false, updatedAt: now,
    };
    return this.touch(key, entry);
  }
  private sharedKey(key: string): string { return 'tco:market-data:fixer:v1:' + encodeURIComponent(key); }
  private sharedProbeKey(key: string): string { return this.sharedKey(key) + ':probe'; }

  private hydrate(snapshot: MarketDataFixerSnapshot): Entry {
    const key = this.key(snapshot.source, snapshot.capability, snapshot.resource);
    const entry = this.getOrCreate(snapshot.source, snapshot.capability, snapshot.resource);
    Object.assign(entry, snapshot, { probeInFlight: snapshot.state === 'half-open', updatedAt: this.now() });
    return this.touch(key, entry);
  }

  private async readShared(key: string): Promise<MarketDataFixerSnapshot | null> {
    const redis = getSharedRedis();
    if (!this.useSharedCoordination || !redis.configured) return null;
    try {
      const raw = await redis.get<string>(this.sharedKey(key));
      if (typeof raw !== 'string' || !raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const value = parsed as Partial<MarketDataFixerSnapshot>;
      if (!['healthy', 'open', 'half-open'].includes(String(value.state))
        || !['nse', 'investiny', 'fyers', 'tvdatafeed'].includes(String(value.source))
        || !['history', 'live', 'options'].includes(String(value.capability))
        || typeof value.resource !== 'string') return null;
      return value as MarketDataFixerSnapshot;
    } catch {
      // When Redis is unavailable, retain bounded process-local protection.
      return null;
    }
  }

  private async writeShared(key: string, snapshot: MarketDataFixerSnapshot, ttlMs: number): Promise<void> {
    const redis = getSharedRedis();
    if (!this.useSharedCoordination || !redis.configured) return;
    try { await redis.set(this.sharedKey(key), JSON.stringify(snapshot), { px: Math.max(1_000, ttlMs) }); } catch {}
  }

  private async releaseProbe(key: string): Promise<void> {
    const owner = this.probeOwners.get(key);
    if (!owner) return;
    this.probeOwners.delete(key);
    const redis = getSharedRedis();
    if (!this.useSharedCoordination || !redis.configured) return;
    try { await redis.releaseLock(this.sharedProbeKey(key), owner); } catch {}
  }

  async canAttempt(source: MarketDataFixerSource, capability: MarketDataFixerCapability, resource: string): Promise<boolean> {
    const key = this.key(source, capability, resource);
    const redis = getSharedRedis();
    if (this.useSharedCoordination && redis.configured) {
      const remote = await this.readShared(key);
      if (remote) {
        this.hydrate(remote);
        if (remote.state === 'open' && remote.nextProbeAt != null && this.now() < remote.nextProbeAt) return false;
        if (remote.state === 'open' || remote.state === 'half-open') {
          const owner = randomUUID();
          try {
            const acquired = await redis.acquireLock(this.sharedProbeKey(key), owner, this.probeLockTtlMs);
            if (!acquired) return false;
            this.probeOwners.set(key, owner);
            const entry = this.hydrate({ ...remote, state: 'half-open', lastAction: 'distributed-half-open-single-probe' });
            entry.attempts += 1;
            entry.lastAttemptAt = this.now();
            await this.writeShared(key, this.publicSnapshot(entry), this.probeLockTtlMs * 2);
            return true;
          } catch {
            // Fall through to the local breaker if coordination cannot be reached.
          }
        } else if (remote.state === 'healthy') {
          const entry = this.hydrate(remote);
          entry.attempts += 1;
          entry.lastAttemptAt = this.now();
          return true;
        }
      }
    }
    const entry = this.getOrCreate(source, capability, resource);
    this.touch(key, entry);
    if (entry.state === 'healthy') {
      entry.attempts += 1;
      entry.lastAttemptAt = this.now();
      return true;
    }
    if (entry.state === 'half-open') return false;
    if (entry.nextProbeAt != null && this.now() < entry.nextProbeAt) return false;
    entry.state = 'half-open';
    entry.probeInFlight = true;
    entry.attempts += 1;
    entry.lastAttemptAt = this.now();
    entry.lastAction = 'cooldown-expired-single-probe';
    return true;
  }

  async recordSuccess(source: MarketDataFixerSource, capability: MarketDataFixerCapability, resource: string): Promise<MarketDataFixerSnapshot> {
    const key = this.key(source, capability, resource);
    const entry = this.getOrCreate(source, capability, resource);
    const recovered = entry.state !== 'healthy' || entry.failures > 0;
    entry.state = 'healthy';
    entry.failures = 0;
    entry.successes += 1;
    entry.lastStatus = 200;
    entry.lastError = null;
    entry.lastAction = recovered ? 'automatic-recovery-success' : 'validated-response';
    entry.lastAttemptAt = this.now();
    entry.lastSuccessAt = this.now();
    entry.nextProbeAt = null;
    entry.probeInFlight = false;
    const snapshot = this.publicSnapshot(this.touch(key, entry));
    await this.writeShared(key, snapshot, this.sharedStateTtlMs);
    await this.releaseProbe(key);
    return snapshot;
  }

  async recordFailure(source: MarketDataFixerSource, capability: MarketDataFixerCapability, resource: string, error: unknown): Promise<MarketDataFixerSnapshot> {
    const key = this.key(source, capability, resource);
    const entry = this.getOrCreate(source, capability, resource);
    const status = statusOf(error);
    entry.failures += 1;
    entry.lastStatus = status;
    entry.lastError = safeError(error);
    entry.lastAttemptAt = this.now();
    entry.probeInFlight = false;
    let cooldown: number;
    if (status === 401 || status === 403 || status === 400 || status === 404 || status === 422) {
      cooldown = this.authCooldownMs;
      entry.lastAction = 'credentials-permission-or-mapping-check-required';
    } else if (status === 429) {
      cooldown = this.jitterRateLimitCooldown(Math.max(this.rateLimitFloorMs, retryAfterOf(error)));
      entry.lastAction = 'rate-limited-respecting-cooldown-with-positive-jitter';
    } else {
      const exponential = Math.min(this.maxCooldownMs, this.baseCooldownMs * 2 ** Math.min(8, entry.failures - 1));
      cooldown = this.jitterTransientCooldown(exponential);
      entry.lastAction = 'fallback-bounded-exponential-backoff-with-jitter';
    }
    entry.state = 'open';
    entry.nextProbeAt = this.now() + cooldown;
    const snapshot = this.publicSnapshot(this.touch(key, entry));
    await this.writeShared(key, snapshot, cooldown + 60_000);
    await this.releaseProbe(key);
    return snapshot;
  }
  snapshot(source?: MarketDataFixerSource, capability?: MarketDataFixerCapability, resource?: string): MarketDataFixerSnapshot[] {
    const wantedKey = source && capability && resource != null ? this.key(source, capability, resource) : null;
    return [...this.entries.entries()]
      .filter(([key, entry]) => (!source || entry.source === source)
        && (!capability || entry.capability === capability)
        && (!wantedKey || key === wantedKey))
      .map(([, entry]) => this.publicSnapshot(entry));
  }
  private publicSnapshot(entry: Entry): MarketDataFixerSnapshot {
    const { probeInFlight: _probeInFlight, updatedAt: _updatedAt, ...snapshot } = entry;
    return { ...snapshot };
  }
}
export const marketDataAutoFixer = new MarketDataAutoFixer();

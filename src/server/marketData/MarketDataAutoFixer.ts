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
  constructor(options: MarketDataAutoFixerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.baseCooldownMs = Math.max(1, options.baseCooldownMs ?? 15_000);
    this.maxCooldownMs = Math.max(this.baseCooldownMs, options.maxCooldownMs ?? 5 * 60_000);
    this.authCooldownMs = Math.max(this.maxCooldownMs, options.authCooldownMs ?? 15 * 60_000);
    this.rateLimitFloorMs = Math.max(1, options.rateLimitFloorMs ?? 30_000);
    this.maxEntries = Math.max(16, Math.floor(options.maxEntries ?? 512));
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
  canAttempt(source: MarketDataFixerSource, capability: MarketDataFixerCapability, resource: string): boolean {
    const key = this.key(source, capability, resource);
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
  recordSuccess(source: MarketDataFixerSource, capability: MarketDataFixerCapability, resource: string): MarketDataFixerSnapshot {
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
    return this.publicSnapshot(this.touch(this.key(source, capability, resource), entry));
  }
  recordFailure(source: MarketDataFixerSource, capability: MarketDataFixerCapability, resource: string, error: unknown): MarketDataFixerSnapshot {
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
      cooldown = Math.max(this.rateLimitFloorMs, retryAfterOf(error));
      entry.lastAction = 'rate-limited-respecting-cooldown';
    } else {
      cooldown = Math.min(this.maxCooldownMs, this.baseCooldownMs * 2 ** Math.min(8, entry.failures - 1));
      entry.lastAction = 'fallback-and-bounded-retry';
    }
    entry.state = 'open';
    entry.nextProbeAt = this.now() + cooldown;
    return this.publicSnapshot(this.touch(this.key(source, capability, resource), entry));
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

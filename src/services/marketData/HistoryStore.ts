import { HistoricalCandle } from '../brokers/BrokerAdapter';
import { candleTimestampMs, mergeCanonicalCandleRows } from './chartCandleEvents';

type Bucket = { data: HistoricalCandle[]; updatedAt: number; oldestAt: number; newestAt: number; target: number; revision: number; estimatedBytes: number; loading?: Promise<HistoricalCandle[]> };

export const PERSISTED_HISTORY_CANDLE_LIMIT = 2_000;
const HISTORY_DB_NAME = 'tradingcore-history-cache-v1';
const HISTORY_DB_STORE = 'datasets';
type PersistedHistoryBucket = { key: string; data: HistoricalCandle[]; updatedAt: number; revision: number; target: number };
let historyDbPromise: Promise<IDBDatabase | null> | undefined;
const historyHydrations = new Map<string, Promise<HistoricalCandle[] | undefined>>();
const historyPersistTimers = new Map<string, ReturnType<typeof setTimeout>>();

function openHistoryDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (historyDbPromise) return historyDbPromise;
  historyDbPromise = new Promise(resolve => {
    try {
      const request = indexedDB.open(HISTORY_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(HISTORY_DB_STORE)) request.result.createObjectStore(HISTORY_DB_STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); historyDbPromise = undefined; };
        resolve(db);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return historyDbPromise;
}

function readPersistedHistory(key: string): Promise<PersistedHistoryBucket | undefined> {
  return openHistoryDb().then(db => new Promise(resolve => {
    if (!db) { resolve(undefined); return; }
    try {
      const request = db.transaction(HISTORY_DB_STORE, 'readonly').objectStore(HISTORY_DB_STORE).get(key);
      request.onsuccess = () => {
        const value = request.result as PersistedHistoryBucket | undefined;
        resolve(value && value.key === key && Array.isArray(value.data) ? value : undefined);
      };
      request.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

async function writePersistedHistory(key: string, bucket: Bucket): Promise<void> {
  const db = await openHistoryDb();
  if (!db) return;
  const data = bucket.data.slice(-PERSISTED_HISTORY_CANDLE_LIMIT);
  if (!data.length) return;
  await new Promise<void>(resolve => {
    try {
      const transaction = db.transaction(HISTORY_DB_STORE, 'readwrite');
      transaction.objectStore(HISTORY_DB_STORE).put({ key, data, updatedAt: bucket.updatedAt, revision: bucket.revision, target: PERSISTED_HISTORY_CANDLE_LIMIT } satisfies PersistedHistoryBucket);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch { resolve(); }
  });
}

function clearPersistedHistory(): void {
  void openHistoryDb().then(db => {
    if (!db) return;
    try { db.transaction(HISTORY_DB_STORE, 'readwrite').objectStore(HISTORY_DB_STORE).clear(); } catch {}
  });
}

/** Shared in-memory candle store. History is reusable across chart switches and is
 * deliberately independent from React/chart lifecycle. */
export class HistoryStore {
  private buckets = new Map<string, Bucket>();
  constructor(private readonly maxCandles = 50_000, private readonly ttlMs = 600_000, private readonly maxBuckets = 96) {}
  private touch(key: string, bucket: Bucket): Bucket { this.buckets.delete(key); this.buckets.set(key, bucket); return bucket; }
  private trimBuckets(): void { while (this.buckets.size > Math.max(1, this.maxBuckets)) { const oldest = this.buckets.keys().next().value; if (oldest == null) break; this.buckets.delete(oldest); } }
  key(broker: string, symbol: string, timeframe: string) { return `${broker.toLowerCase()}:${symbol}:${timeframe}`; }

  /** Restore persisted candles before a broker request; stale data can paint immediately. */
  async hydrate(broker: string, symbol: string, timeframe: string): Promise<HistoricalCandle[] | undefined> {
    const key = this.key(broker, symbol, timeframe);
    const resident = this.buckets.get(key);
    if (resident) return resident.data;
    const pending = historyHydrations.get(key);
    if (pending) return pending;
    const promise = (async () => {
      const saved = await readPersistedHistory(key);
      if (!saved?.data.length) return undefined;
      const rows = saved.data.filter((row): row is HistoricalCandle => {
        if (!row || typeof row !== 'object') return false;
        const time = Date.parse(String(row.timestamp));
        const open = Number(row.open), high = Number(row.high), low = Number(row.low), close = Number(row.close);
        const volume = Number(row.volume ?? 0);
        return Number.isFinite(time) && time > 0 && [open, high, low, close].every(Number.isFinite)
          && high >= Math.max(open, close) && low <= Math.min(open, close) && high >= low
          && Number.isFinite(volume) && volume >= 0;
      }).sort((a, b) => Date.parse(String(a.timestamp)) - Date.parse(String(b.timestamp)));
      const data = this.merge([], rows).slice(-PERSISTED_HISTORY_CANDLE_LIMIT);
      if (!data.length) return undefined;
      const stamps = data.map(row => Date.parse(String(row.timestamp))).filter(Number.isFinite);
      const oldestAt = Math.min(...stamps), newestAt = Math.max(...stamps);
      if (!Number.isFinite(oldestAt) || !Number.isFinite(newestAt)) return undefined;
      const current = this.buckets.get(key);
      if (current) return current.data;
      const bucket: Bucket = { data, updatedAt: Number.isFinite(Number(saved.updatedAt)) ? Number(saved.updatedAt) : 0,
        oldestAt, newestAt, target: PERSISTED_HISTORY_CANDLE_LIMIT, revision: Math.max(1, Number(saved.revision) || 1), estimatedBytes: data.length * 80 };
      this.buckets.set(key, bucket);
      this.trimBuckets();
      return data;
    })().finally(() => historyHydrations.delete(key));
    historyHydrations.set(key, promise);
    return promise;
  }

  private schedulePersist(key: string, bucket: Bucket): void {
    if (typeof indexedDB === 'undefined') return;
    const old = historyPersistTimers.get(key);
    if (old) clearTimeout(old);
    const timer = setTimeout(() => {
      historyPersistTimers.delete(key);
      const latest = this.buckets.get(key);
      if (latest) void writePersistedHistory(key, latest);
    }, 350);
    historyPersistTimers.set(key, timer);
  }

  get(broker: string, symbol: string, timeframe: string): HistoricalCandle[] | undefined {
    const key = this.key(broker, symbol, timeframe);
    const b = this.buckets.get(key);
    if (!b || Date.now() - b.updatedAt > this.ttlMs) return undefined;
    return this.touch(key, b).data;
  }
  getStale(broker: string, symbol: string, timeframe: string): HistoricalCandle[] | undefined { const key=this.key(broker,symbol,timeframe); const bucket=this.buckets.get(key); return bucket ? this.touch(key,bucket).data : undefined; }
  set(broker: string, symbol: string, timeframe: string, rows: HistoricalCandle[], target = 25_000) {
    const key = this.key(broker, symbol, timeframe);
    const previous = this.buckets.get(key);
    // A shorter or later-arriving response must not erase known non-overlapping history.
    // Incoming rows remain authoritative when a timestamp is present in both sets.
    const data = this.merge(previous?.data ?? [], rows).slice(-this.maxCandles);
    if (!data.length) return data;
    let oldestAt = Number.POSITIVE_INFINITY;
    let newestAt = Number.NEGATIVE_INFINITY;
    for (const row of data) {
      const timestamp = Date.parse(String(row.timestamp));
      if (!Number.isFinite(timestamp)) continue;
      if (timestamp < oldestAt) oldestAt = timestamp;
      if (timestamp > newestAt) newestAt = timestamp;
    }
    if (!Number.isFinite(oldestAt) || !Number.isFinite(newestAt)) return data;
    this.buckets.delete(key);
    const bucket: Bucket = { data, updatedAt: Date.now(), oldestAt, newestAt, target, revision: (previous?.revision ?? 0) + 1, estimatedBytes: data.length * 80 };
    this.buckets.set(key, bucket);
    this.trimBuckets();
    this.schedulePersist(key, bucket);
    return data;
  }
  mergeInto(broker: string, symbol: string, timeframe: string, rows: HistoricalCandle[], target = 25_000) {
    const current = this.getStale(broker, symbol, timeframe) || [];
    return this.set(broker, symbol, timeframe, this.merge(current, rows), target);
  }
  upsertLatest(broker: string, symbol: string, timeframe: string, row: HistoricalCandle, target = 25_000) {
    const key = this.key(broker, symbol, timeframe);
    const bucket = this.buckets.get(key);
    if (!bucket) return this.set(broker, symbol, timeframe, [row], target);
    this.touch(key, bucket);
    const timestamp = candleTimestampMs(row.timestamp);
    if (timestamp == null) return bucket.data;
    const last = bucket.data[bucket.data.length - 1];
    const lastTimestamp = last ? candleTimestampMs(last.timestamp) : undefined;
    if (lastTimestamp != null && Math.floor(timestamp / 1000) === Math.floor(lastTimestamp / 1000)) bucket.data[bucket.data.length - 1] = row;
    else if (lastTimestamp == null || timestamp > lastTimestamp) bucket.data.push(row);
    else return bucket.data;
    if (bucket.data.length > this.maxCandles) bucket.data.splice(0, bucket.data.length - this.maxCandles);
    bucket.updatedAt = Date.now();
    bucket.target = target;
    bucket.revision += 1;
    bucket.estimatedBytes = bucket.data.length * 80;
    bucket.oldestAt = Date.parse(String(bucket.data[0]?.timestamp));
    bucket.newestAt = Date.parse(String(bucket.data[bucket.data.length - 1]?.timestamp));
    this.schedulePersist(key, bucket);
    return bucket.data;
  }
  merge(a: HistoricalCandle[], b: HistoricalCandle[]) { return mergeCanonicalCandleRows(a, b, this.maxCandles); }
  estimatedBytesFor(broker: string, symbol: string, timeframe: string): number {
    return this.buckets.get(this.key(broker, symbol, timeframe))?.estimatedBytes ?? 0;
  }
  stats() {
    let candleCount = 0; let estimatedBytes = 0;
    for (const bucket of this.buckets.values()) { candleCount += bucket.data.length; estimatedBytes += bucket.estimatedBytes; }
    return Object.freeze({ buckets: this.buckets.size, candleCount, estimatedBytes, maxCandlesPerBucket: this.maxCandles, maxBuckets: this.maxBuckets });
  }
  range(broker: string, symbol: string, timeframe: string) {
    const b = this.buckets.get(this.key(broker, symbol, timeframe));
    return b ? { oldestAt:b.oldestAt, newestAt:b.newestAt, count:b.data.length, target:b.target, updatedAt:b.updatedAt, revision:b.revision, estimatedBytes:b.estimatedBytes } : undefined;
  }
  getBefore(broker: string, symbol: string, timeframe: string, beforeTimestamp: string, limit = 1000): HistoricalCandle[] {
    const key = this.key(broker, symbol, timeframe);
    const bucket = this.buckets.get(key);
    if (!bucket?.data.length) return [];
    this.touch(key, bucket);
    const before = Date.parse(String(beforeTimestamp));
    if (!Number.isFinite(before)) return [];
    let lo = 0; let hi = bucket.data.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const ts = Date.parse(String(bucket.data[mid]?.timestamp));
      if (Number.isFinite(ts) && ts < before) lo = mid + 1;
      else hi = mid;
    }
    const count = Math.max(1, Math.min(Math.floor(Number(limit) || 1000), 5000));
    const end = lo;
    return bucket.data.slice(Math.max(0, end - count), end);
  }
  invalidate(broker?: string) { if (!broker) { this.buckets.clear(); return; } const p=`${broker.toLowerCase()}:`; for (const k of this.buckets.keys()) if(k.startsWith(p)) this.buckets.delete(k); }
  clear(){
    this.buckets.clear();
    for (const timer of historyPersistTimers.values()) clearTimeout(timer);
    historyPersistTimers.clear();
    clearPersistedHistory();
  }
}

export const historyStore = new HistoryStore(50_000, 120_000, 32);

function normalizeTickTimestampSeconds(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return NaN;
    return value > 1e12 ? value / 1000 : value;
  }
  const text = String(value ?? '').trim();
  if (!text) return NaN;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric / 1000 : numeric;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed / 1000 : NaN;
}

export function reconcileRealtimeCandle(existing: HistoricalCandle[], tick: { price: number; timestamp: number | string }, intervalSeconds: number, maxCandles = 50_000, mutateExisting = false): { candles: HistoricalCandle[]; bucketChanged: boolean } {
  const timestamp = normalizeTickTimestampSeconds(tick.timestamp);
  if (!Number.isFinite(tick.price) || !Number.isFinite(timestamp) || !Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    return { candles: existing, bucketChanged: false };
  }

  const last = existing[existing.length - 1];
  const lastTimestamp = last ? normalizeTickTimestampSeconds(last.timestamp) : NaN;

  // A live broker packet can carry a stale last-trade timestamp even though
  // the packet itself arrived just now. Never let that timestamp prevent the
  // forming candle from receiving the fresh LTP. For an older timestamp, pin
  // the update to the current forming candle; for a newer timestamp, advance
  // normally. This keeps the chart moving while still respecting candle
  // boundaries.
  const effectiveTimestamp = Number.isFinite(lastTimestamp)
    ? Math.max(timestamp, lastTimestamp)
    : timestamp;

  // Align the live bucket to the timestamp grid already used by the broker's
  // historical candles. This matters for NSE 1H/1D candles (for example 09:15
  // session alignment) where UTC epoch-flooring would create a 03:00 bucket.
  const bucket = Number.isFinite(lastTimestamp)
    ? Math.floor((effectiveTimestamp - (lastTimestamp % intervalSeconds)) / intervalSeconds) * intervalSeconds + (lastTimestamp % intervalSeconds)
    : Math.floor(effectiveTimestamp / intervalSeconds) * intervalSeconds;

  const lastBucket = Number.isFinite(lastTimestamp)
    ? Math.floor((lastTimestamp - (lastTimestamp % intervalSeconds)) / intervalSeconds) * intervalSeconds + (lastTimestamp % intervalSeconds)
    : undefined;

  if (lastBucket != null && Math.abs(bucket - lastBucket) > 604800) return { candles: existing, bucketChanged: false };

  const next = existing.slice();
  if (!last || lastBucket !== bucket) {
    next.push({
      timestamp: new Date(bucket * 1000).toISOString(),
      open: last?.close ?? tick.price,
      high: tick.price,
      low: tick.price,
      close: tick.price,
      // Broker quote volume is often cumulative session volume, not candle
      // volume. Do not copy it into the new candle and inflate the bar.
      volume: 0,
    });
    return { candles: next.slice(-maxCandles), bucketChanged: true };
  }

  if (mutateExisting && last) {
    last.high = Math.max(Number(last.high), tick.price);
    last.low = Math.min(Number(last.low), tick.price);
    last.close = tick.price;
    return { candles: existing, bucketChanged: false };
  }
  const updated = {
    ...last,
    high: Math.max(Number(last.high), tick.price),
    low: Math.min(Number(last.low), tick.price),
    close: tick.price,
  };
  next[next.length - 1] = updated;
  return { candles: next, bucketChanged: false };
}

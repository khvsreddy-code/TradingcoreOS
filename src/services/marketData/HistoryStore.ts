import { HistoricalCandle } from '../brokers/BrokerAdapter';

type Bucket = { data: HistoricalCandle[]; updatedAt: number; oldestAt: number; newestAt: number; target: number; loading?: Promise<HistoricalCandle[]> };

/** Shared in-memory candle store. History is reusable across chart switches and is
 * deliberately independent from React/chart lifecycle. */
export class HistoryStore {
  private buckets = new Map<string, Bucket>();
  constructor(private readonly maxCandles = 50_000, private readonly ttlMs = 120_000, private readonly maxBuckets = 32) {}
  private touch(key: string, bucket: Bucket): Bucket { this.buckets.delete(key); this.buckets.set(key, bucket); return bucket; }
  private trimBuckets(): void { while (this.buckets.size > Math.max(1, this.maxBuckets)) { const oldest = this.buckets.keys().next().value; if (oldest == null) break; this.buckets.delete(oldest); } }
  key(broker: string, symbol: string, timeframe: string) { return `${broker.toLowerCase()}:${symbol}:${timeframe}`; }
  get(broker: string, symbol: string, timeframe: string): HistoricalCandle[] | undefined {
    const key = this.key(broker, symbol, timeframe);
    const b = this.buckets.get(key);
    if (!b || Date.now() - b.updatedAt > this.ttlMs) return undefined;
    return this.touch(key, b).data;
  }
  getStale(broker: string, symbol: string, timeframe: string): HistoricalCandle[] | undefined { const key=this.key(broker,symbol,timeframe); const bucket=this.buckets.get(key); return bucket ? this.touch(key,bucket).data : undefined; }
  set(broker: string, symbol: string, timeframe: string, rows: HistoricalCandle[], target = 25_000) {
    const data = this.merge([], rows).slice(-this.maxCandles);
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
    const key = this.key(broker, symbol, timeframe);
    this.buckets.delete(key);
    this.buckets.set(key, { data, updatedAt: Date.now(), oldestAt, newestAt, target });
    this.trimBuckets();
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
    const timestamp = Date.parse(String(row.timestamp));
    if (!Number.isFinite(timestamp)) return bucket.data;
    const last = bucket.data[bucket.data.length - 1];
    const lastTimestamp = last ? Date.parse(String(last.timestamp)) : NaN;
    if (Number.isFinite(lastTimestamp) && timestamp === lastTimestamp) bucket.data[bucket.data.length - 1] = row;
    else if (!Number.isFinite(lastTimestamp) || timestamp > lastTimestamp) bucket.data.push(row);
    else return bucket.data;
    if (bucket.data.length > this.maxCandles) bucket.data.splice(0, bucket.data.length - this.maxCandles);
    bucket.updatedAt = Date.now();
    bucket.target = target;
    bucket.oldestAt = Date.parse(String(bucket.data[0]?.timestamp));
    bucket.newestAt = Date.parse(String(bucket.data[bucket.data.length - 1]?.timestamp));
    return bucket.data;
  }
  merge(a: HistoricalCandle[], b: HistoricalCandle[]) {
    const map = new Map<number, HistoricalCandle>();
    for (const row of [...a, ...b]) { const t = Date.parse(String(row.timestamp)); if (Number.isFinite(t)) map.set(Math.floor(t / 1000), row); }
    return [...map.entries()].sort((x,y)=>x[0]-y[0]).map(x=>x[1]).slice(-this.maxCandles);
  }
  range(broker: string, symbol: string, timeframe: string) { const b=this.buckets.get(this.key(broker,symbol,timeframe)); return b ? {oldestAt:b.oldestAt,newestAt:b.newestAt,count:b.data.length,target:b.target,updatedAt:b.updatedAt} : undefined; }
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
  clear(){this.buckets.clear();}
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

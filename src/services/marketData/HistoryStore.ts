import { HistoricalCandle } from '../brokers/BrokerAdapter';

type Bucket = { data: HistoricalCandle[]; updatedAt: number; oldestAt: number; newestAt: number; target: number; loading?: Promise<HistoricalCandle[]> };

/** Shared in-memory candle store. History is reusable across chart switches and is
 * deliberately independent from React/chart lifecycle. */
export class HistoryStore {
  private buckets = new Map<string, Bucket>();
  constructor(private readonly maxCandles = 50_000, private readonly ttlMs = 120_000) {}
  key(broker: string, symbol: string, timeframe: string) { return `${broker.toLowerCase()}:${symbol}:${timeframe}`; }
  get(broker: string, symbol: string, timeframe: string): HistoricalCandle[] | undefined {
    const b = this.buckets.get(this.key(broker, symbol, timeframe));
    if (!b || Date.now() - b.updatedAt > this.ttlMs) return undefined;
    return b.data;
  }
  getStale(broker: string, symbol: string, timeframe: string): HistoricalCandle[] | undefined { return this.buckets.get(this.key(broker, symbol, timeframe))?.data; }
  set(broker: string, symbol: string, timeframe: string, rows: HistoricalCandle[], target = 20_000) {
    const data = this.merge([], rows).slice(-this.maxCandles);
    if (!data.length) return data;
    const times = data.map(x => Date.parse(x.timestamp)).filter(Number.isFinite);
    this.buckets.set(this.key(broker, symbol, timeframe), { data, updatedAt: Date.now(), oldestAt: Math.min(...times), newestAt: Math.max(...times), target });
    return data;
  }
  mergeInto(broker: string, symbol: string, timeframe: string, rows: HistoricalCandle[], target = 20_000) {
    const current = this.getStale(broker, symbol, timeframe) || [];
    return this.set(broker, symbol, timeframe, this.merge(current, rows), target);
  }
  merge(a: HistoricalCandle[], b: HistoricalCandle[]) {
    const map = new Map<number, HistoricalCandle>();
    for (const row of [...a, ...b]) { const t = Date.parse(String(row.timestamp)); if (Number.isFinite(t)) map.set(Math.floor(t / 1000), row); }
    return [...map.entries()].sort((x,y)=>x[0]-y[0]).map(x=>x[1]).slice(-this.maxCandles);
  }
  range(broker: string, symbol: string, timeframe: string) { const b=this.buckets.get(this.key(broker,symbol,timeframe)); return b ? {oldestAt:b.oldestAt,newestAt:b.newestAt,count:b.data.length,target:b.target,updatedAt:b.updatedAt} : undefined; }
  invalidate(broker?: string) { if (!broker) { this.buckets.clear(); return; } const p=`${broker.toLowerCase()}:`; for (const k of this.buckets.keys()) if(k.startsWith(p)) this.buckets.delete(k); }
  clear(){this.buckets.clear();}
}

export const historyStore = new HistoryStore(50_000, 120_000);

export function reconcileRealtimeCandle(existing: HistoricalCandle[], tick: { price: number; timestamp: number; volume?: number }, intervalSeconds: number, maxCandles = 50_000): { candles: HistoricalCandle[]; bucketChanged: boolean } {
  if (!Number.isFinite(tick.price) || !Number.isFinite(tick.timestamp)) return { candles: existing, bucketChanged: false };
  const bucket = Math.floor(tick.timestamp / intervalSeconds) * intervalSeconds;
  const last = existing[existing.length - 1];
  const lastBucket = last ? Math.floor(Date.parse(last.timestamp) / 1000 / intervalSeconds) * intervalSeconds : undefined;
  if (lastBucket != null && bucket < lastBucket) return { candles: existing, bucketChanged: false };
  if (lastBucket != null && Math.abs(bucket - lastBucket) > 604800) return { candles: existing, bucketChanged: false };
  const next = existing.slice();
  if (!last || lastBucket !== bucket) {
    next.push({ timestamp: new Date(bucket * 1000).toISOString(), open: last?.close ?? tick.price, high: tick.price, low: tick.price, close: tick.price, volume: Number(tick.volume) || 0 });
    return { candles: next.slice(-maxCandles), bucketChanged: true };
  }
  const updated = { ...last, high: Math.max(Number(last.high), tick.price), low: Math.min(Number(last.low), tick.price), close: tick.price, volume: Number(tick.volume) || Number(last.volume) || 0 };
  next[next.length - 1] = updated;
  return { candles: next, bucketChanged: false };
}

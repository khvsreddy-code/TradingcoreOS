import type { ChartDataPoint, MarketDataStore } from './chartDataModel';
import { normalizeChartViewport, type ChartViewport } from './chartViewport';

export type ChartLodBar = ChartDataPoint & { sourceFrom: number; sourceTo: number };

/**
 * Retained zero-object LOD representation. Typed arrays are capacity-backed so
 * realtime appends do not require a new bucket array on every tick.
 */
export type ChartLodIndex = {
  from: Uint32Array;
  to: Uint32Array;
  time: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
  count: number;
  capacity: number;
  bucketSize: number;
  sourceRevision: number;
  sourceLength: number;
  dirtyFromBucket: number;
  dirtyToBucket: number;
  viewport: ChartViewport;
};

export function createLodIndex(): ChartLodIndex {
  return {
    from: new Uint32Array(0), to: new Uint32Array(0),
    time: new Float64Array(0), open: new Float64Array(0), high: new Float64Array(0),
    low: new Float64Array(0), close: new Float64Array(0), volume: new Float64Array(0),
    count: 0, capacity: 0, bucketSize: 1, sourceRevision: -1, sourceLength: 0,
    dirtyFromBucket: 0, dirtyToBucket: 0, viewport: normalizeChartViewport(0, { from: 0, to: 0, pixelWidth: 1 }),
  };
}

export function updateLodIndex(store: MarketDataStore, index: ChartLodIndex, viewportInput: ChartViewport): ChartLodIndex {
  const viewport = normalizeChartViewport(store.length, viewportInput);
  const rows = viewport.to - viewport.from;
  const bucketSize = rows <= viewport.pixelWidth * 1.5
    ? 1
    : Math.max(1, Math.ceil(rows / Math.max(1, Math.floor(viewport.pixelWidth))));
  const bucketCount = rows > 0 ? Math.ceil(rows / bucketSize) : 0;
  const topologyChanged = index.sourceRevision < 0
    || index.bucketSize !== bucketSize
    || index.viewport.from !== viewport.from
    || index.viewport.to !== viewport.to
    || index.viewport.pixelWidth !== viewport.pixelWidth
    || bucketCount > index.capacity;

  if (topologyChanged) {
    ensureCapacity(index, bucketCount);
    index.count = bucketCount;
    index.bucketSize = bucketSize;
    index.viewport = viewport;
    recomputeBuckets(store, index, 0, bucketCount);
    index.dirtyFromBucket = 0;
    index.dirtyToBucket = bucketCount;
  } else {
    index.count = bucketCount;
    index.viewport = viewport;
    const dirty = store.dirtyRange;
    const firstSource = Math.max(viewport.from, dirty.from);
    const lastSource = Math.min(viewport.to, Math.max(dirty.to, dirty.from + 1));
    if (firstSource < lastSource && bucketCount > 0) {
      const firstBucket = Math.max(0, Math.floor((firstSource - viewport.from) / bucketSize));
      const lastBucket = Math.min(bucketCount, Math.ceil((lastSource - viewport.from) / bucketSize));
      recomputeBuckets(store, index, firstBucket, lastBucket);
      index.dirtyFromBucket = firstBucket;
      index.dirtyToBucket = lastBucket;
    } else {
      index.dirtyFromBucket = 0;
      index.dirtyToBucket = 0;
    }
  }

  index.sourceRevision = store.revision;
  index.sourceLength = store.length;
  return index;
}

function ensureCapacity(index: ChartLodIndex, needed: number): void {
  if (needed <= index.capacity) return;
  let next = Math.max(64, index.capacity || 64);
  while (next < needed) next *= 2;
  index.from = grow(index.from, next);
  index.to = grow(index.to, next);
  index.time = grow(index.time, next);
  index.open = grow(index.open, next);
  index.high = grow(index.high, next);
  index.low = grow(index.low, next);
  index.close = grow(index.close, next);
  index.volume = grow(index.volume, next);
  index.capacity = next;
}

function grow<T extends Float64Array | Uint32Array>(previous: T, size: number): T {
  const next = new (previous.constructor as { new(size: number): T })(size);
  next.set(previous);
  return next;
}

function recomputeBuckets(store: MarketDataStore, index: ChartLodIndex, fromBucket: number, toBucket: number): void {
  const source = store.views();
  for (let bucket = fromBucket; bucket < toBucket; bucket += 1) {
    const start = index.viewport.from + bucket * index.bucketSize;
    const end = Math.min(index.viewport.to, start + index.bucketSize);
    if (start >= end) continue;
    index.from[bucket] = start;
    index.to[bucket] = end;
    index.time[bucket] = source.time[start];
    index.open[bucket] = source.open[start];
    index.close[bucket] = source.close[end - 1];
    let maxHigh = source.high[start];
    let minLow = source.low[start];
    let totalVolume = 0;
    for (let i = start; i < end; i += 1) {
      maxHigh = Math.max(maxHigh, source.high[i]);
      minLow = Math.min(minLow, source.low[i]);
      totalVolume += Number.isFinite(source.volume[i]) ? source.volume[i] : 0;
    }
    index.high[bucket] = maxHigh;
    index.low[bucket] = minLow;
    index.volume[bucket] = totalVolume;
  }
}

/** Explicit object compatibility helper; native chart paths should use updateLodIndex(). */
export function reduceCandlesForPixels(rows: readonly ChartDataPoint[], pixelWidth: number): ChartLodBar[] {
  if (rows.length <= 2 || pixelWidth <= 0 || rows.length <= pixelWidth * 1.5) {
    return rows.map((row, index) => ({ ...row, sourceFrom: index, sourceTo: index + 1 }));
  }
  const bucketSize = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(pixelWidth))));
  const result: ChartLodBar[] = [];
  for (let from = 0; from < rows.length; from += bucketSize) {
    const to = Math.min(rows.length, from + bucketSize);
    const first = rows[from];
    const last = rows[to - 1];
    let high = first.high;
    let low = first.low;
    let volume = 0;
    for (let i = from; i < to; i++) {
      high = Math.max(high, rows[i].high);
      low = Math.min(low, rows[i].low);
      volume += Number.isFinite(rows[i].volume) ? rows[i].volume : 0;
    }
    result.push({ time: first.time, open: first.open, high, low, close: last.close, volume, sourceFrom: from, sourceTo: to });
  }
  return result;
}

import { centeredRollingExtrema } from '../coreSpirit/statefulIndicatorKernel';
import { HistoricalCandle } from '../brokers/BrokerAdapter';
import { DynamicLevelSettings, getDynamicLevelSettings } from './levelSettings';

export type StructureSide = 'support' | 'resistance';
export type StructureLevelSource = 'KDE' | 'FRACTAL' | 'CLUSTER';

export interface TradingCoreVLevel {
  time: number;
  price: number;
  side: StructureSide;
  label: string;
  score: number;
  source: StructureLevelSource;
  touches: number;
  /** Best available source candle index for downstream lifecycle analysis. */
  pivotIndex?: number;
}

export interface TradingCoreVZone {
  time: number;
  startTime: number;
  upper: number;
  lower: number;
  kind: 'Demand' | 'Supply';
  score: number;
  mitigated: boolean;
  impulseIndex: number;
  baseIndex: number;
}

export interface TradingCoreVStructure {
  levels: TradingCoreVLevel[];
  zones: TradingCoreVZone[];
  atr: number;
  lookback: number;
  bandwidth: number;
  confluence?: Array<{ tf: string; levels: TradingCoreVLevel[]; zones: TradingCoreVZone[] }>;
}

export interface TradingCoreVOptions {
  fractalPeriod?: number;
  impulseAtrMultiplier?: number;
  lookback?: number;
  kdeGridSize?: number;
  kdeBandwidthAtr?: number;
  clusterAtrTolerance?: number;
  maxLevels?: number;
  maxZones?: number;
  confluenceBoost?: number;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const epoch = (ts: string | number) => Math.floor(new Date(ts).getTime() / 1000);

function atrValue(c: HistoricalCandle[], period = 14): number {
  if (c.length < 2) return 0;
  const trs = c.map((x, i) => i === 0
    ? Math.max(0, x.high - x.low)
    : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close)));
  const p = Math.min(period, trs.length);
  // Wilder-style seed for a stable structure scale.
  let value = trs.slice(0, p).reduce((a, b) => a + b, 0) / Math.max(1, p);
  for (let i = p; i < trs.length; i++) value = ((value * (p - 1)) + trs[i]) / p;
  return Number.isFinite(value) ? value : 0;
}

function gaussian(u: number): number {
  return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
}

function resample(c: HistoricalCandle[], factor: number): HistoricalCandle[] {
  if (factor <= 1) return c.slice();
  const out: HistoricalCandle[] = [];
  for (let i = 0; i < c.length; i += factor) {
    const g = c.slice(i, i + factor);
    if (!g.length) continue;
    out.push({
      timestamp: g[0].timestamp,
      open: g[0].open,
      high: Math.max(...g.map(x => x.high)),
      low: Math.min(...g.map(x => x.low)),
      close: g[g.length - 1].close,
      volume: g.reduce((a, x) => a + Math.max(0, x.volume || 0), 0),
    });
  }
  return out;
}

function validateCandles(c: HistoricalCandle[]): HistoricalCandle[] {
  return c.filter(x =>
    finite(x.open) && finite(x.high) && finite(x.low) && finite(x.close) &&
    x.high >= Math.max(x.open, x.close) &&
    x.low <= Math.min(x.open, x.close) &&
    x.high >= x.low &&
    Number.isFinite(new Date(x.timestamp).getTime())
  ).slice().sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

type WeightedPoint = { price: number; weight: number; source: 'KDE' | 'FRACTAL'; index?: number };

function fractalPoints(c: HistoricalCandle[], period: number, start: number, end: number): WeightedPoint[] {
  const out: WeightedPoint[] = [];
  const highs = new Float64Array(c.length);
  const lows = new Float64Array(c.length);
  const volumeMean = new Float64Array(c.length);
  let volumeSum = 0;
  for (let i = 0; i < c.length; i += 1) {
    highs[i] = c[i].high;
    lows[i] = c[i].low;
    volumeMean[i] = i > 0 ? volumeSum / Math.min(20, i) : 0;
    volumeSum += Math.max(0, c[i].volume || 0);
    if (i >= 20) volumeSum -= Math.max(0, c[i - 20].volume || 0);
  }
  const addPoint = (index: number, price: number) => {
    if (index < Math.max(period, start) || index >= Math.min(c.length - period, end)) return;
    const meanVolume = volumeMean[index] || 0;
    const volumeWeight = meanVolume > 0
      ? Math.min(4, Math.max(0.5, (c[index].volume || 0) / meanVolume))
      : 1;
    out.push({ price, weight: 1 + volumeWeight, source: 'FRACTAL', index });
  };
  centeredRollingExtrema(highs, period, (i, _min, max) => {
    if (highs[i] === max) addPoint(i, highs[i]);
  });
  centeredRollingExtrema(lows, period, (i, min, _max) => {
    if (lows[i] === min) addPoint(i, lows[i]);
  });
  return out;
}

function kdePeaks(c: HistoricalCandle[], start: number, atr: number, options: TradingCoreVOptions): { points: WeightedPoint[]; bandwidth: number } {
  const gridSize = Math.max(32, Math.min(240, Math.floor(options.kdeGridSize ?? 120)));
  const prices = c.slice(start).flatMap(x => [
    { price: x.high, weight: Math.max(1, x.volume || 1) },
    { price: x.low, weight: Math.max(1, x.volume || 1) },
    { price: x.close, weight: Math.max(1, x.volume || 1) },
  ]);
  if (!prices.length) return { points: [], bandwidth: 0 };
  const lo = Math.min(...prices.map(x => x.price));
  const hi = Math.max(...prices.map(x => x.price));
  if (!finite(lo) || !finite(hi) || hi <= lo) return { points: [], bandwidth: Math.max(atr * 0.45, Number.EPSILON) };
  const bandwidth = Math.max(
    atr * (options.kdeBandwidthAtr ?? 0.45),
    (hi - lo) / gridSize,
    Number.EPSILON,
  );
  const densityAt = (px: number) => prices.reduce((sum, q) =>
    sum + Math.min(q.weight, 1e6) * gaussian((px - q.price) / bandwidth), 0);
  const points: WeightedPoint[] = [];
  let previous = densityAt(lo);
  for (let k = 1; k < gridSize - 1; k++) {
    const px = lo + (hi - lo) * (k / (gridSize - 1));
    const density = densityAt(px);
    const next = densityAt(lo + (hi - lo) * ((k + 1) / (gridSize - 1)));
    if (density >= previous && density >= next && density > 0) {
      points.push({ price: px, weight: density / Math.max(1, prices.length), source: 'KDE' });
    }
    previous = density;
  }
  return { points, bandwidth };
}

function clusterPoints(points: WeightedPoint[], tolerance: number, spot: number, time: number, maxLevels: number): TradingCoreVLevel[] {
  const sorted = points.filter(x => finite(x.price) && finite(x.weight)).sort((a, b) => a.price - b.price);
  const clusters: WeightedPoint[][] = [];
  for (const point of sorted) {
    const current = clusters[clusters.length - 1];
    if (!current || Math.abs(point.price - current[current.length - 1].price) > tolerance) clusters.push([point]);
    else current.push(point);
  }
  return clusters.map(group => {
    const total = group.reduce((s, x) => s + Math.max(0, x.weight), 0) || 1;
    const price = group.reduce((s, x) => s + x.price * Math.max(0, x.weight), 0) / total;
    const fractals = group.filter(x => x.source === 'FRACTAL').length;
    const pivotIndex = group.reduce((latest, x) => Math.max(latest, x.index ?? -1), -1);
    const kde = group.filter(x => x.source === 'KDE').length;
    const side: StructureSide = price <= spot ? 'support' : 'resistance';
    const source: StructureLevelSource = fractals && kde ? 'CLUSTER' : fractals ? 'FRACTAL' : 'KDE';
    const score = Math.min(1, 0.25 + Math.log1p(total) / 6 + Math.min(0.2, group.length * 0.025));
    return {
      time,
      price,
      side,
      label: source === 'KDE' ? 'KDE S/R' : `S/R · ${group.length}x`,
      score,
      source,
      touches: group.length,
      ...(pivotIndex >= 0 ? { pivotIndex } : {}),
    };
  })
    .filter(x => Number.isFinite(x.price))
    .sort((a, b) => Math.abs(a.price - spot) - Math.abs(b.price - spot))
    .slice(0, Math.max(1, maxLevels));
}

type ZoneHeapMode = 'maxUpper' | 'minLower';

function heapBetter(a: TradingCoreVZone, b: TradingCoreVZone, mode: ZoneHeapMode): boolean {
  return mode === 'maxUpper' ? a.upper > b.upper : a.lower < b.lower;
}

function heapPush(heap: TradingCoreVZone[], zone: TradingCoreVZone, mode: ZoneHeapMode): void {
  let index = heap.length;
  heap.push(zone);
  while (index > 0) {
    const parent = (index - 1) >>> 1;
    if (heapBetter(heap[parent]!, heap[index]!, mode)) break;
    [heap[parent], heap[index]] = [heap[index]!, heap[parent]!];
    index = parent;
  }
}

function heapPop(heap: TradingCoreVZone[], mode: ZoneHeapMode): TradingCoreVZone | undefined {
  if (!heap.length) return undefined;
  const root = heap[0];
  const last = heap.pop()!;
  if (heap.length) {
    heap[0] = last;
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let best = index;
      if (left < heap.length && heapBetter(heap[left]!, heap[best]!, mode)) best = left;
      if (right < heap.length && heapBetter(heap[right]!, heap[best]!, mode)) best = right;
      if (best === index) break;
      [heap[index], heap[best]] = [heap[best]!, heap[index]!];
      index = best;
    }
  }
  return root;
}

function buildZones(c: HistoricalCandle[], start: number, multiplier: number, maxZones: number): TradingCoreVZone[] {
  const zones: TradingCoreVZone[] = [];
  const active = new Set<TradingCoreVZone>();
  const demandHeap: TradingCoreVZone[] = [];
  const supplyHeap: TradingCoreVZone[] = [];
  const atrSeries = canonicalAtrSeries(c, 14);

  for (let i = 0; i < c.length; i += 1) {
    while (demandHeap.length && demandHeap[0]!.upper >= c[i].low) {
      const zone = heapPop(demandHeap, 'maxUpper')!;
      if (active.delete(zone)) zone.mitigated = true;
    }
    while (supplyHeap.length && supplyHeap[0]!.lower <= c[i].high) {
      const zone = heapPop(supplyHeap, 'minLower')!;
      if (active.delete(zone)) zone.mitigated = true;
    }

    if (i < Math.max(1, start) || i >= c.length - 1) continue;
    const localAtr = atrSeries[i] || 0;
    if (!(localAtr > 0)) continue;
    const body = Math.abs(c[i].close - c[i].open);
    if (body < multiplier * localAtr) continue;

    const base = c[i - 1];
    const bullish = c[i].close > c[i].open;
    const zone: TradingCoreVZone = {
      time: epoch(base.timestamp),
      startTime: epoch(base.timestamp),
      upper: bullish ? Math.max(base.open, base.close) : base.high,
      lower: bullish ? base.low : Math.min(base.open, base.close),
      kind: bullish ? 'Demand' : 'Supply',
      score: Math.min(1, body / Math.max(Number.EPSILON, multiplier * localAtr)),
      mitigated: false,
      impulseIndex: i,
      baseIndex: i - 1,
    };
    active.add(zone);
    if (zone.kind === 'Demand') heapPush(demandHeap, zone, 'maxUpper');
    else heapPush(supplyHeap, zone, 'minLower');
  }

  zones.push(...active);
  return zones
    .sort((a, b) => b.score - a.score || b.baseIndex - a.baseIndex)
    .slice(0, Math.max(1, maxZones))
    .sort((a, b) => a.baseIndex - b.baseIndex);
}

export function buildTradingCoreVStructure(
  candles: HistoricalCandle[],
  options: TradingCoreVOptions = {},
): TradingCoreVStructure {
  const c = validateCandles(candles);
  const period = Math.max(2, Math.floor(options.fractalPeriod ?? 5));
  const lookback = Math.max(period * 2 + 1, Math.floor(options.lookback ?? 200));
  const multiplier = Math.max(0.1, options.impulseAtrMultiplier ?? 2);
  const maxLevels = Math.max(1, Math.floor(options.maxLevels ?? 18));
  const maxZones = Math.max(1, Math.floor(options.maxZones ?? 12));
  if (c.length < period * 2 + 5) return { levels: [], zones: [], atr: 0, lookback, bandwidth: 0 };

  const atr = atrValue(c, 14);
  const safeAtr = Math.max(atr, (c[c.length - 1].close || 1) * 0.0002, Number.EPSILON);
  const start = Math.max(period, c.length - lookback);
  const time = epoch(c[c.length - 1].timestamp);
  const tolerance = Math.max(safeAtr * (options.clusterAtrTolerance ?? 0.25), (c[c.length - 1].close || 1) * 0.0005);
  const fractals = fractalPoints(c, period, start, c.length - period);
  const kde = kdePeaks(c, start, safeAtr, options);
  const levels = clusterPoints([...fractals, ...kde.points], tolerance, c[c.length - 1].close, time, maxLevels);
  const zones = buildZones(c, start, multiplier, maxZones);
  return { levels, zones, atr: safeAtr, lookback, bandwidth: kde.bandwidth };
}

export function tradingCoreVPriceAction(
  candles: HistoricalCandle[],
  period = 5,
  multiplier = 2,
  lookback = 200,
  mtfFactors: number[] = [3, 12],
): TradingCoreVStructure {
  const base = buildTradingCoreVStructure(candles, {
    fractalPeriod: period,
    impulseAtrMultiplier: multiplier,
    lookback,
  });
  const confluence = [
    { tf: 'Current', data: candles },
    ...mtfFactors.map(factor => ({ tf: `Higher ×${factor}`, data: resample(candles, factor) })),
  ].map(frame => ({
    tf: frame.tf,
    ...buildTradingCoreVStructure(frame.data, {
      fractalPeriod: period,
      impulseAtrMultiplier: multiplier,
      lookback,
    }),
  }));
  const tolerance = Math.max(base.atr * 0.25, (candles.at(-1)?.close || 1) * 0.0005);
  const levels = base.levels.map(level => {
    const hits = confluence.slice(1).reduce((count, frame) =>
      count + (frame.levels.some(x => Math.abs(x.price - level.price) <= tolerance) ? 1 : 0), 0);
    return { ...level, score: Math.min(1, level.score + hits * (0.12)) };
  });
  const zones = base.zones.map(zone => {
    const hits = confluence.slice(1).reduce((count, frame) =>
      count + (frame.zones.some(x => Math.max(zone.lower, x.lower) <= Math.min(zone.upper, x.upper)) ? 1 : 0), 0);
    return { ...zone, score: Math.min(1, zone.score + hits * (0.12)) };
  });
  return { ...base, levels, zones, confluence: confluence.map(({ tf, levels: ls, zones: zs }) => ({ tf, levels: ls, zones: zs })) };
}


// ---------------------------------------------------------------------------
// Stage 11 — Canonical Levels / shared structure lifecycle
// ---------------------------------------------------------------------------

export type CanonicalCoreLevelState = 'ACTIVE' | 'TESTING' | 'BROKEN' | 'RETESTED' | 'FAILED';
export type CanonicalCoreLevelSource =
  | 'SWING'
  | 'SESSION'
  | 'OPENING_RANGE'
  | 'EQUAL_HL'
  | 'PREVIOUS_CLOSE'
  | 'STRUCTURE';

export interface CanonicalCoreLevel {
  side: 'support' | 'resistance';
  price: number;
  structural: number;
  strength?: number;
  state: CanonicalCoreLevelState;
  distance: number;
  tests: number;
  source: CanonicalCoreLevelSource;
  reactionAtr: number;
  rejectionRatio: number;
  volumeRatio: number;
  reason?: string;
  pivotIndex?: number;
  confirmationIndex?: number;
  breakoutIndex?: number;
  zoneTop?: number;
  zoneBottom?: number;
  flipped?: boolean;
}

export interface CanonicalLevelEvent {
  type: 'BREAKOUT' | 'RESISTANCE_TO_SUPPORT' | 'SUPPORT_TO_RESISTANCE' | 'SUPPORT_FAILURE' | 'RESISTANCE_FAILURE';
  price: number;
  index: number;
  side: 'support' | 'resistance';
}

export interface CanonicalChartAnalytics {
  vwap: number;
  atr: number;
  previousHigh: number;
  previousLow: number;
  openingHigh: number;
  openingLow: number;
  dayHigh: number;
  dayLow: number;
  support: CanonicalCoreLevel[];
  resistance: CanonicalCoreLevel[];
  bias: 'BULLISH' | 'BEARISH' | 'RANGE';
  events: CanonicalLevelEvent[];
  structure: TradingCoreVStructure;
}

type LifecycleLevel = {
  pivotIndex: number;
  confirmationIndex: number;
  price: number;
  zoneTop: number;
  zoneBottom: number;
  state: 'ACTIVE' | 'BROKEN' | 'RETESTED';
  breakoutIndex: number | null;
  side: 'support' | 'resistance';
  tests: number;
  source: CanonicalCoreLevelSource;
};

type FlipLevel = {
  price: number;
  zoneTop: number;
  zoneBottom: number;
  originalIndex: number;
  breakoutIndex: number;
  isSupport: boolean;
  state: 'ACTIVE' | 'FAILED';
};

const finiteCandle = (x: HistoricalCandle) =>
  Number.isFinite(x.open) &&
  Number.isFinite(x.high) &&
  Number.isFinite(x.low) &&
  Number.isFinite(x.close) &&
  x.high >= Math.max(x.open, x.close) &&
  x.low <= Math.min(x.open, x.close) &&
  x.high >= x.low &&
  Number.isFinite(new Date(x.timestamp).getTime());

function canonicalAtrSeries(c: HistoricalCandle[], period = 14): number[] {
  if (!c.length) return [];
  const out: number[] = [];
  let atr = 0;
  for (let i = 0; i < c.length; i++) {
    const tr = i === 0
      ? Math.max(0, c[i].high - c[i].low)
      : Math.max(
          c[i].high - c[i].low,
          Math.abs(c[i].high - c[i - 1].close),
          Math.abs(c[i].low - c[i - 1].close),
        );
    if (i === 0) atr = tr;
    else if (i < period) atr = (atr * i + tr) / (i + 1);
    else atr = ((atr * (period - 1)) + tr) / period;
    out.push(Number.isFinite(atr) ? atr : 0);
  }
  return out;
}

function canonicalSessionKey(ts: string | number): string {
  return new Date(ts).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function canonicalSessions(c: HistoricalCandle[]): HistoricalCandle[][] {
  const map = new Map<string, HistoricalCandle[]>();
  for (const bar of c) {
    const key = canonicalSessionKey(bar.timestamp);
    const bucket = map.get(key) || [];
    bucket.push(bar);
    map.set(key, bucket);
  }
  return [...map.values()].sort(
    (a, b) => new Date(a[0].timestamp).getTime() - new Date(b[0].timestamp).getTime(),
  );
}

function canonicalRejection(bar: HistoricalCandle, side: 'support' | 'resistance'): number {
  const range = Math.max(bar.high - bar.low, Number.EPSILON);
  const body = Math.abs(bar.close - bar.open);
  const wick = side === 'support'
    ? Math.min(bar.open, bar.close) - bar.low
    : bar.high - Math.max(bar.open, bar.close);
  return Math.max(0, Math.min(1, (wick / range) * (wick > body ? 1 : 0.5)));
}

function canonicalAverageVolume(c: HistoricalCandle[], index: number, period = 20): number {
  const values = c
    .slice(Math.max(0, index - period + 1), index + 1)
    .map(x => Math.max(0, x.volume || 0))
    .filter(Boolean);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function canonicalReaction(
  c: HistoricalCandle[],
  index: number,
  side: 'support' | 'resistance',
  atr: number,
): number {
  if (!(atr > 0)) return 0;
  let excursion = 0;
  for (let i = index + 1; i <= Math.min(c.length - 1, index + 8); i++) {
    excursion = Math.max(
      excursion,
      side === 'support' ? c[i].high - c[index].low : c[index].high - c[i].low,
    );
  }
  return Math.max(0, Math.min(5, excursion / atr));
}

function canonicalAddAnchor(
  levels: LifecycleLevel[],
  price: number | undefined,
  side: 'support' | 'resistance',
  source: CanonicalCoreLevelSource,
  c: HistoricalCandle[],
  atr: number,
  settings: DynamicLevelSettings,
): void {
  if (!finite(price) || !c.length) return;
  const index = c.length - 1;
  if (
    settings.mergeNearbyLevels &&
    levels.some(x =>
      x.side === side &&
      x.state === 'ACTIVE' &&
      Math.abs(x.price - price) <= atr * settings.mergeAtrMultiplier,
    )
  ) return;
  levels.push({
    pivotIndex: index,
    confirmationIndex: index,
    price,
    zoneTop: side === 'resistance' ? price : Math.min(c[index].open, c[index].close),
    zoneBottom: side === 'support' ? price : Math.max(c[index].open, c[index].close),
    state: 'ACTIVE',
    breakoutIndex: null,
    side,
    tests: 1,
    source,
  });
}

function canonicalLifecycle(
  c: HistoricalCandle[],
  structure: TradingCoreVStructure,
  settings: DynamicLevelSettings,
): { levels: LifecycleLevel[]; flips: FlipLevel[]; events: CanonicalLevelEvent[]; atr: number } {
  const atrSeries = canonicalAtrSeries(c, 14);
  const atr = Math.max(
    atrSeries.at(-1) || 0,
    (c.at(-1)?.close || 1) * 0.0002,
    Number.EPSILON,
  );
  const levels: LifecycleLevel[] = [];
  const flips: FlipLevel[] = [];
  const events: CanonicalLevelEvent[] = [];
  const start = Math.max(0, c.length - settings.lookbackPeriod);

  // Structure levels are the sole structural source. Levels no longer runs a
  // separate pivot/S&R detector.
  for (const candidate of structure.levels) {
    const index = Math.max(start, Math.min(c.length - 1, candidate.pivotIndex ?? start));
    const side = candidate.side;
    const bar = c[index];
    const width = Math.max(atr * 0.12, (bar.high - bar.low) * 0.15, Number.EPSILON);
    const zoneTop = side === 'resistance' ? candidate.price : candidate.price + width;
    const zoneBottom = side === 'support' ? candidate.price : candidate.price - width;
    const level: LifecycleLevel = {
      pivotIndex: index,
      confirmationIndex: Math.min(c.length - 1, index + Math.max(1, settings.pivotLength)),
      price: candidate.price,
      zoneTop,
      zoneBottom,
      state: 'ACTIVE',
      breakoutIndex: null,
      side,
      tests: Math.max(1, candidate.touches),
      source: 'STRUCTURE',
    };
    if (
      settings.mergeNearbyLevels &&
      levels.some(x => x.side === side && Math.abs(x.price - level.price) <= atr * settings.mergeAtrMultiplier)
    ) continue;
    levels.push(level);
  }

  const sessions = canonicalSessions(c);
  const current = sessions.at(-1) || c;
  const previous = sessions.at(-2) || [];
  const opening = current.slice(0, Math.min(3, current.length));
  canonicalAddAnchor(
    levels,
    previous.length ? Math.min(...previous.map(x => x.low)) : undefined,
    'support',
    'SESSION',
    c,
    atr,
    settings,
  );
  canonicalAddAnchor(
    levels,
    previous.length ? Math.max(...previous.map(x => x.high)) : undefined,
    'resistance',
    'SESSION',
    c,
    atr,
    settings,
  );
  canonicalAddAnchor(
    levels,
    opening.length ? Math.min(...opening.map(x => x.low)) : undefined,
    'support',
    'OPENING_RANGE',
    c,
    atr,
    settings,
  );
  canonicalAddAnchor(
    levels,
    opening.length ? Math.max(...opening.map(x => x.high)) : undefined,
    'resistance',
    'OPENING_RANGE',
    c,
    atr,
    settings,
  );

  for (const level of levels) {
    for (let i = level.confirmationIndex; i < c.length; i++) {
      const x = c[i];
      const localAtr = Math.max(atrSeries[i] || atr, Number.EPSILON);
      const buffer = localAtr * settings.breakoutAtrBuffer;
      const breakoutPrice = level.side === 'resistance'
        ? level.zoneTop + buffer
        : level.zoneBottom - buffer;

      const touches = x.high >= level.zoneBottom && x.low <= level.zoneTop;
      if (touches && i > level.confirmationIndex) level.tests += 1;

      if (level.state === 'ACTIVE') {
        const crossed = settings.breakoutConfirmation === 'Close'
          ? (level.side === 'resistance' ? x.close > breakoutPrice : x.close < breakoutPrice)
          : (level.side === 'resistance' ? x.high > breakoutPrice : x.low < breakoutPrice);
        if (crossed) {
          level.state = 'BROKEN';
          level.breakoutIndex = i;
          if (settings.showBreakouts) {
            events.push({ type: 'BREAKOUT', price: level.price, index: i, side: level.side });
          }
        }
      } else if (
        level.state === 'BROKEN' &&
        settings.showReversals &&
        i > (level.breakoutIndex ?? -1)
      ) {
        const held =
          settings.retestConfirmation === 'Touch' ||
          (level.side === 'resistance' ? x.close >= level.zoneTop : x.close <= level.zoneBottom);
        if (touches && held) {
          level.state = 'RETESTED';
          flips.push({
            price: level.price,
            zoneTop: level.zoneTop,
            zoneBottom: level.zoneBottom,
            originalIndex: level.pivotIndex,
            breakoutIndex: level.breakoutIndex ?? i,
            isSupport: level.side === 'resistance',
            state: 'ACTIVE',
          });
          events.push({
            type: level.side === 'resistance' ? 'RESISTANCE_TO_SUPPORT' : 'SUPPORT_TO_RESISTANCE',
            price: level.price,
            index: i,
            side: level.side === 'resistance' ? 'support' : 'resistance',
          });
          break;
        }
      }
    }
  }

  if (settings.showFailures) {
    for (const flip of flips) {
      for (let i = flip.breakoutIndex + 1; i < c.length; i++) {
        const failed = flip.isSupport
          ? c[i].close < flip.zoneBottom
          : c[i].close > flip.zoneTop;
        if (failed) {
          flip.state = 'FAILED';
          events.push({
            type: flip.isSupport ? 'SUPPORT_FAILURE' : 'RESISTANCE_FAILURE',
            price: flip.price,
            index: i,
            side: flip.isSupport ? 'support' : 'resistance',
          });
          break;
        }
      }
    }
  }

  return { levels, flips, events, atr };
}

export function buildCanonicalLevelAnalytics(
  candles: HistoricalCandle[],
  spot: number,
  overrides?: Partial<DynamicLevelSettings>,
): CanonicalChartAnalytics {
  const settings = { ...getDynamicLevelSettings(), ...overrides };
  const c = candles
    .filter(finiteCandle)
    .slice()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (!c.length || !finite(spot)) {
    return {
      vwap: 0,
      atr: 0,
      previousHigh: 0,
      previousLow: 0,
      openingHigh: 0,
      openingLow: 0,
      dayHigh: 0,
      dayLow: 0,
      support: [],
      resistance: [],
      bias: 'RANGE',
      events: [],
      structure: { levels: [], zones: [], atr: 0, lookback: settings.lookbackPeriod, bandwidth: 0 },
    };
  }

  const sessions = canonicalSessions(c);
  const current = sessions.at(-1) || c;
  const previous = sessions.at(-2) || [];
  const opening = current.slice(0, Math.min(3, current.length));
  const dayHigh = Math.max(...current.map(x => x.high), spot);
  const dayLow = Math.min(...current.map(x => x.low), spot);
  const previousHigh = previous.length ? Math.max(...previous.map(x => x.high)) : dayHigh;
  const previousLow = previous.length ? Math.min(...previous.map(x => x.low)) : dayLow;
  const openingHigh = opening.length ? Math.max(...opening.map(x => x.high)) : dayHigh;
  const openingLow = opening.length ? Math.min(...opening.map(x => x.low)) : dayLow;

  let pv = 0;
  let vv = 0;
  for (const bar of current) {
    const volume = Math.max(0, bar.volume || 0);
    pv += ((bar.high + bar.low + bar.close) / 3) * volume;
    vv += volume;
  }
  const vwap = vv ? pv / vv : current.at(-1)?.close || spot;
  const atr = canonicalAtrSeries(c, 14).at(-1) || 0;

  const structure = buildTradingCoreVStructure(c, {
    fractalPeriod: settings.pivotLength,
    lookback: settings.lookbackPeriod,
    maxLevels: Math.max(settings.maxLevelsPerType * 2, 18),
    clusterAtrTolerance: settings.mergeAtrMultiplier,
  });

  if (!settings.enabled) {
    return {
      vwap, atr, previousHigh, previousLow, openingHigh, openingLow, dayHigh, dayLow,
      support: [], resistance: [], bias: 'RANGE', events: [], structure,
    };
  }

  const lifecycle = canonicalLifecycle(c, structure, settings);
  const safeAtr = Math.max(atr, spot * 0.0002, Number.EPSILON);

  const core = (level: LifecycleLevel): CanonicalCoreLevel => {
    const distance = Math.abs(spot - level.price);
    const index = Math.max(0, Math.min(c.length - 1, level.pivotIndex));
    const bar = c[index];
    const rejection = canonicalRejection(bar, level.side);
    const reaction = canonicalReaction(c, index, level.side, safeAtr);
    const volumeRatio = (bar.volume || 0) / Math.max(1, canonicalAverageVolume(c, index));
    const reactionScore = Math.min(1, reaction / 3);
    const volumeScore = Math.min(1, volumeRatio / 2);
    const recencyScore = Math.max(0, 1 - (c.length - 1 - index) / Math.max(1, settings.lookbackPeriod));
    const strength = Math.max(
      0,
      Math.min(
        1,
        0.28 * rejection +
          0.27 * reactionScore +
          0.20 * volumeScore +
          0.15 * recencyScore +
          0.10 * Math.min(1, level.tests / 3),
      ),
    );
    const state: CanonicalCoreLevelState =
      level.state === 'RETESTED' ? 'RETESTED' :
      level.state === 'BROKEN' ? 'BROKEN' :
      distance <= safeAtr * 0.3 ? 'TESTING' : 'ACTIVE';
    return {
      side: level.side,
      price: Math.round(level.price * 100) / 100,
      structural: level.tests,
      strength: Math.round(strength * 100) / 100,
      state,
      distance: Math.round(distance * 100) / 100,
      tests: level.tests,
      source: level.source,
      reactionAtr: Math.round(reaction * 100) / 100,
      rejectionRatio: Math.round(rejection * 100) / 100,
      volumeRatio: Math.round(volumeRatio * 100) / 100,
      reason:
        state === 'BROKEN'
          ? 'Price crossed the canonical structure level; retained as historical broken structure.'
          : `${level.source} level · rejection ${Math.round(rejection * 100)}% · reaction ${reaction.toFixed(1)} ATR`,
      pivotIndex: level.pivotIndex,
      confirmationIndex: level.confirmationIndex,
      breakoutIndex: level.breakoutIndex ?? undefined,
      zoneTop: level.zoneTop,
      zoneBottom: level.zoneBottom,
    };
  };

  const flipped = lifecycle.flips
    .filter(x => x.state === 'ACTIVE')
    .map(x => ({
      side: x.isSupport ? 'support' as const : 'resistance' as const,
      price: Math.round(x.price * 100) / 100,
      structural: 1,
      state: 'RETESTED' as const,
      distance: Math.round(Math.abs(spot - x.price) * 100) / 100,
      tests: 1,
      source: 'STRUCTURE' as const,
      reactionAtr: 0,
      rejectionRatio: 0,
      volumeRatio: 0,
      breakoutIndex: x.breakoutIndex,
      zoneTop: x.zoneTop,
      zoneBottom: x.zoneBottom,
      flipped: true,
    }));

  const support = [
    ...lifecycle.levels.filter(x => x.side === 'support').map(core),
    ...flipped.filter(x => x.side === 'support'),
  ]
    .filter(x => x.price < spot)
    .sort((a, b) => (a.state === 'BROKEN' ? 1 : 0) - (b.state === 'BROKEN' ? 1 : 0) || a.distance - b.distance)
    .slice(0, settings.maxLevelsPerType);

  const resistance = [
    ...lifecycle.levels.filter(x => x.side === 'resistance').map(core),
    ...flipped.filter(x => x.side === 'resistance'),
  ]
    .filter(x => x.price > spot)
    .sort((a, b) => (a.state === 'BROKEN' ? 1 : 0) - (b.state === 'BROKEN' ? 1 : 0) || a.distance - b.distance)
    .slice(0, settings.maxLevelsPerType);

  const last = c.at(-1)!;
  const bullish = !!support[0] && last.close > support[0].price && last.close >= vwap;
  const bearish = !!resistance[0] && last.close < resistance[0].price && last.close <= vwap;

  return {
    vwap, atr, previousHigh, previousLow, openingHigh, openingLow, dayHigh, dayLow,
    support, resistance,
    bias: bullish && !bearish ? 'BULLISH' : bearish && !bullish ? 'BEARISH' : 'RANGE',
    events: lifecycle.events,
    structure,
  };
}

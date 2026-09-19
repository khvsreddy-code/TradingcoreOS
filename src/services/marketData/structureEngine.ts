import { HistoricalCandle } from '../brokers/BrokerAdapter';

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

type WeightedPoint = { price: number; weight: number; source: 'KDE' | 'FRACTAL' };

function fractalPoints(c: HistoricalCandle[], period: number, start: number, end: number): WeightedPoint[] {
  const out: WeightedPoint[] = [];
  for (let i = Math.max(period, start); i < Math.min(c.length - period, end); i++) {
    let highPivot = true;
    let lowPivot = true;
    for (let j = 1; j <= period; j++) {
      if (c[i].high < c[i - j].high || c[i].high < c[i + j].high) highPivot = false;
      if (c[i].low > c[i - j].low || c[i].low > c[i + j].low) lowPivot = false;
      if (!highPivot && !lowPivot) break;
    }
    const prior = c.slice(Math.max(0, i - 20), i);
    const meanVolume = prior.length
      ? prior.reduce((s, x) => s + Math.max(0, x.volume || 0), 0) / prior.length
      : 0;
    const volumeWeight = meanVolume > 0 ? Math.min(4, Math.max(0.5, (c[i].volume || 0) / meanVolume)) : 1;
    if (highPivot) out.push({ price: c[i].high, weight: 1 + volumeWeight, source: 'FRACTAL' });
    if (lowPivot) out.push({ price: c[i].low, weight: 1 + volumeWeight, source: 'FRACTAL' });
  }
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
    };
  })
    .filter(x => Number.isFinite(x.price))
    .sort((a, b) => Math.abs(a.price - spot) - Math.abs(b.price - spot))
    .slice(0, Math.max(1, maxLevels));
}

function buildZones(c: HistoricalCandle[], start: number, multiplier: number, maxZones: number): TradingCoreVZone[] {
  const zones: TradingCoreVZone[] = [];
  for (let i = Math.max(1, start); i < c.length - 1; i++) {
    const localAtr = atrValue(c.slice(0, i + 1), 14);
    if (!(localAtr > 0)) continue;
    const body = Math.abs(c[i].close - c[i].open);
    if (body < multiplier * localAtr) continue;
    const base = c[i - 1];
    const bullish = c[i].close > c[i].open;
    const upper = bullish ? Math.max(base.open, base.close) : base.high;
    const lower = bullish ? base.low : Math.min(base.open, base.close);
    const zone: TradingCoreVZone = {
      time: epoch(base.timestamp),
      startTime: epoch(base.timestamp),
      upper,
      lower,
      kind: bullish ? 'Demand' : 'Supply',
      score: Math.min(1, body / Math.max(Number.EPSILON, multiplier * localAtr)),
      mitigated: false,
      impulseIndex: i,
      baseIndex: i - 1,
    };
    for (let j = i + 1; j < c.length; j++) {
      if (zone.kind === 'Demand' && c[j].low <= zone.upper) { zone.mitigated = true; break; }
      if (zone.kind === 'Supply' && c[j].high >= zone.lower) { zone.mitigated = true; break; }
    }
    if (!zone.mitigated) zones.push(zone);
  }
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

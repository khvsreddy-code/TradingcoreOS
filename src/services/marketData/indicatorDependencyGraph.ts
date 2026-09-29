import type { HistoricalCandle } from '../brokers/BrokerAdapter';
import {
  type IndicatorConfig,
  type IndicatorKind,
  type IndicatorPoint,
  type BollingerPoint,
  type ChannelPoint,
  type MacdPoint,
  type SupertrendPoint,
  sourceValues,
  series,
  vwap,
  bollinger,
  keltner,
  donchian,
  rsi,
  macd,
  supertrend,
  stochastic,
  ichimoku,
} from './indicatorEngine';
import { ema, sma, rma, trueRanges, wma } from './coreIndicatorKernel';

type NumericSeries = Array<number | null>;
type GraphCache = Map<string, unknown>;

export type IndicatorGraphStats = {
  requestedNodes: number;
  computedNodes: number;
  reusedNodes: number;
  cacheHits: number;
};

export type IndicatorGraphEvaluation = {
  results: Array<{ id: string; kind: IndicatorKind; data: any[] }>;
  stats: IndicatorGraphStats;
};

export const GRAPH_SUPPORTED_INDICATORS = new Set<IndicatorKind>([
  'EMA',
  'SMA',
  'VWAP',
  'Bollinger Bands',
  'Keltner Channels',
  'RSI',
  'MACD',
  'ATR',
  'Supertrend',
  'HMA',
  'Donchian Channels',
]);

const times = (candles: HistoricalCandle[]) => candles.map(x => Math.floor(new Date(x.timestamp).getTime() / 1000));
const pointSeries = (candles: HistoricalCandle[], raw: NumericSeries): IndicatorPoint[] => raw.map((value, i) => value == null ? null : ({ time: times(candles)[i], value })).filter(Boolean) as IndicatorPoint[];

function seriesFromValues(candles: HistoricalCandle[], values: NumericSeries, input: number[]): IndicatorPoint[] {
  return pointSeries(candles, values.length === input.length ? values : input.map(() => null));
}

function emaNode(cache: GraphCache, nodeKey: string, values: NumericSeries, period: number): NumericSeries {
  const hit = cache.get(nodeKey) as NumericSeries | undefined;
  if (hit) return hit;
  const concrete = values.map(value => value == null ? NaN : value);
  const out = ema(concrete, period).map(value => Number.isFinite(value as number) ? value : null);
  cache.set(nodeKey, out);
  return out;
}

function smaNode(cache: GraphCache, nodeKey: string, values: NumericSeries, period: number): NumericSeries {
  const hit = cache.get(nodeKey) as NumericSeries | undefined;
  if (hit) return hit;
  const concrete = values.map(value => value == null ? NaN : value);
  const out = sma(concrete, period).map(value => Number.isFinite(value as number) ? value : null);
  cache.set(nodeKey, out);
  return out;
}

function sourceNode(cache: GraphCache, source: NonNullable<IndicatorConfig['source']>, candles: HistoricalCandle[]): NumericSeries {
  const key = `source:${source}`;
  const hit = cache.get(key) as NumericSeries | undefined;
  if (hit) return hit;
  const out = sourceValues(candles, source).map(Number);
  cache.set(key, out);
  return out;
}

function trueRangeNode(cache: GraphCache, candles: HistoricalCandle[]): NumericSeries {
  const key = 'true-range';
  const hit = cache.get(key) as NumericSeries | undefined;
  if (hit) return hit;
  const out = trueRanges(candles).map(Number);
  cache.set(key, out);
  return out;
}

function atrNode(cache: GraphCache, period: number, candles: HistoricalCandle[]): NumericSeries {
  const key = `atr:${period}`;
  const hit = cache.get(key) as NumericSeries | undefined;
  if (hit) return hit;
  const tr = trueRangeNode(cache, candles).map(Number);
  const out = rma(tr, period).map(value => Number.isFinite(value as number) ? value : null);
  cache.set(key, out);
  return out;
}

function vwapNode(cache: GraphCache, source: NonNullable<IndicatorConfig['source']>, candles: HistoricalCandle[]): NumericSeries {
  const key = `vwap:${source}`;
  const hit = cache.get(key) as NumericSeries | undefined;
  if (hit) return hit;
  const out = vwap(candles, source).map(x => x.value);
  cache.set(key, out);
  return out;
}


function wmaNode(cache: GraphCache, nodeKey: string, values: NumericSeries, period: number): NumericSeries {
  const hit = cache.get(nodeKey) as NumericSeries | undefined;
  if (hit) return hit;
  const out = wma(values, period).map(value => Number.isFinite(Number(value)) ? value : null);
  cache.set(nodeKey, out);
  return out;
}

function hmaNode(cache: GraphCache, source: NonNullable<IndicatorConfig['source']>, period: number, candles: HistoricalCandle[]): NumericSeries {
  const key = `hma:${source}:${period}`;
  const hit = cache.get(key) as NumericSeries | undefined;
  if (hit) return hit;
  const values = sourceNode(cache, source, candles);
  const half = Math.max(1, Math.floor(period / 2));
  const sqrt = Math.max(1, Math.floor(Math.sqrt(period)));
  const fast = wmaNode(cache, `wma:${source}:${half}`, values, half);
  const slow = wmaNode(cache, `wma:${source}:${period}`, values, period);
  const raw = values.map((_, i) => fast[i] != null && slow[i] != null ? 2 * Number(fast[i]) - Number(slow[i]) : null);
  const out = wmaNode(cache, `wma:hma:${source}:${period}:${sqrt}`, raw, sqrt);
  cache.set(key, out);
  return out;
}

function donchianNode(cache: GraphCache, period: number, candles: HistoricalCandle[]): ChannelPoint[] {
  const key = `donchian:${period}`;
  const hit = cache.get(key) as ChannelPoint[] | undefined;
  if (hit) return hit;
  const out: ChannelPoint[] = [];
  const p = Math.max(1, Math.floor(period));
  const highDeque: number[] = [];
  const lowDeque: number[] = [];
  let highHead = 0;
  let lowHead = 0;
  for (let i = 0; i < candles.length; i += 1) {
    while (highDeque.length > highHead && candles[highDeque[highDeque.length - 1]].high <= candles[i].high) highDeque.pop();
    while (lowDeque.length > lowHead && candles[lowDeque[lowDeque.length - 1]].low >= candles[i].low) lowDeque.pop();
    highDeque.push(i);
    lowDeque.push(i);
    const minIndex = i - p + 1;
    while (highHead < highDeque.length && highDeque[highHead] < minIndex) highHead += 1;
    while (lowHead < lowDeque.length && lowDeque[lowHead] < minIndex) lowHead += 1;
    if (i < p - 1) continue;
    const upper = candles[highDeque[highHead]].high;
    const lower = candles[lowDeque[lowHead]].low;
    if (highHead > 128 && highHead * 2 > highDeque.length) { highDeque.splice(0, highHead); highHead = 0; }
    if (lowHead > 128 && lowHead * 2 > lowDeque.length) { lowDeque.splice(0, lowHead); lowHead = 0; }
    out.push({
      time: Math.floor(new Date(candles[i].timestamp).getTime() / 1000),
      middle: (upper + lower) / 2,
      upper,
      lower,
    });
  }
  cache.set(key, out);
  return out;
}

function bollingerNode(cache: GraphCache, source: NonNullable<IndicatorConfig['source']>, period: number, multiplier: number, candles: HistoricalCandle[]): BollingerPoint[] {
  const key = `bollinger:${source}:${period}:${multiplier}`;
  const hit = cache.get(key);
  if (hit) return hit as unknown as BollingerPoint[];
  const values = sourceNode(cache, source, candles).map(v => v == null ? NaN : Number(v));
  const out: BollingerPoint[] = [];
  let sum = 0;
  let sumSquares = 0;
  let validRun = 0;
  for (let i = 0; i < values.length; i += 1) {
    const current = values[i];
    if (!Number.isFinite(current)) {
      sum = 0;
      sumSquares = 0;
      validRun = 0;
      continue;
    }
    sum += current;
    sumSquares += current * current;
    validRun += 1;
    if (validRun > period) {
      const leaving = values[i - period];
      if (Number.isFinite(leaving)) {
        sum -= leaving;
        sumSquares -= leaving * leaving;
      }
      validRun = period;
    }
    if (validRun < period) continue;
    const mean = sum / period;
    const variance = Math.max(0, (sumSquares / period) - mean * mean);
    const sd = Math.sqrt(variance);
    out.push({ time: Math.floor(new Date(candles[i].timestamp).getTime() / 1000), middle: mean, upper: mean + multiplier * sd, lower: mean - multiplier * sd });
  }
  cache.set(key, out as unknown as NumericSeries);
  return out;
}

function keltnerNode(cache: GraphCache, source: NonNullable<IndicatorConfig['source']>, period: number, multiplier: number, candles: HistoricalCandle[]): ChannelPoint[] {
  const key = `keltner:${source}:${period}:${multiplier}`;
  const hit = cache.get(key);
  if (hit) return hit as unknown as ChannelPoint[];
  const values = sourceNode(cache, source, candles);
  const mid = emaNode(cache, `ema:${source}:${period}`, values, period);
  const atrValues = atrNode(cache, period, candles);
  const out: ChannelPoint[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    if (mid[i] == null || atrValues[i] == null) continue;
    out.push({
      time: Math.floor(new Date(candles[i].timestamp).getTime() / 1000),
      middle: Number(mid[i]),
      upper: Number(mid[i]) + multiplier * Number(atrValues[i]),
      lower: Number(mid[i]) - multiplier * Number(atrValues[i]),
    });
  }
  cache.set(key, out as unknown as NumericSeries);
  return out;
}

function rsiNode(cache: GraphCache, source: NonNullable<IndicatorConfig['source']>, period: number, candles: HistoricalCandle[]): IndicatorPoint[] {
  const key = `rsi:${source}:${period}`;
  const hit = cache.get(key);
  if (hit) return hit as unknown as IndicatorPoint[];
  const values = sourceNode(cache, source, candles);
  const out: IndicatorPoint[] = [];
  if (values.length > period) {
    let gainSum = 0;
    let lossSum = 0;
    for (let i = 1; i <= period; i += 1) {
      const delta = Number(values[i]) - Number(values[i - 1]);
      if (delta >= 0) gainSum += delta; else lossSum -= delta;
    }
    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;
    for (let i = period; i < values.length; i += 1) {
      if (i > period) {
        const delta = Number(values[i]) - Number(values[i - 1]);
        avgGain = ((period - 1) * avgGain + Math.max(delta, 0)) / period;
        avgLoss = ((period - 1) * avgLoss + Math.max(-delta, 0)) / period;
      }
      const value = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - (100 / (1 + avgGain / avgLoss));
      out.push({ time: Math.floor(new Date(candles[i].timestamp).getTime() / 1000), value });
    }
  }
  cache.set(key, out as unknown as NumericSeries);
  return out;
}

function macdNode(cache: GraphCache, source: NonNullable<IndicatorConfig['source']>, fast: number, slow: number, signal: number, candles: HistoricalCandle[]): MacdPoint[] {
  const resultKey = `macd:${source}:${fast}:${slow}:${signal}`;
  const hit = cache.get(resultKey);
  if (hit) return hit as unknown as MacdPoint[];
  const values = sourceNode(cache, source, candles);
  const fastEma = emaNode(cache, `ema:${source}:${fast}`, values, fast);
  const slowEma = emaNode(cache, `ema:${source}:${slow}`, values, slow);
  const macdValues: Array<{ index: number; value: number }> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (fastEma[i] == null || slowEma[i] == null) continue;
    macdValues.push({ index: i, value: Number(fastEma[i]) - Number(slowEma[i]) });
  }
  const signalInput = macdValues.map(x => x.value);
  const signalValues = ema(signalInput, signal).map(value => Number.isFinite(value as number) ? value : null);
  const signalNodeKey = `ema:macd:${source}:${fast}:${slow}:${signal}`;
  cache.set(signalNodeKey, signalValues);
  const out: MacdPoint[] = [];
  for (let j = 0; j < macdValues.length; j += 1) {
    const sig = signalValues[j];
    if (sig == null) continue;
    const row = macdValues[j];
    out.push({ time: Math.floor(new Date(candles[row.index].timestamp).getTime() / 1000), macd: row.value, signal: Number(sig), histogram: row.value - Number(sig) });
  }
  cache.set(resultKey, out as unknown as NumericSeries);
  return out;
}

function supertrendNode(cache: GraphCache, period: number, multiplier: number, candles: HistoricalCandle[]): SupertrendPoint[] {
  const key = `supertrend:${period}:${multiplier}`;
  const hit = cache.get(key);
  if (hit) return hit as unknown as SupertrendPoint[];
  const atrValues = atrNode(cache, period, candles);
  let finalUpper = 0;
  let finalLower = 0;
  let trend: 1 | -1 = 1;
  const out: SupertrendPoint[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const a = atrValues[i];
    if (a == null) continue;
    const mid = (candles[i].high + candles[i].low) / 2;
    const upper = mid + multiplier * Number(a);
    const lower = mid - multiplier * Number(a);
    if (i === period - 1) {
      finalUpper = upper;
      finalLower = lower;
    } else {
      const prevUpper = finalUpper;
      const prevLower = finalLower;
      finalUpper = upper < prevUpper || candles[i - 1].close > prevUpper ? upper : prevUpper;
      finalLower = lower > prevLower || candles[i - 1].close < prevLower ? lower : prevLower;
      if (trend === -1 && candles[i].close > prevUpper) trend = 1;
      else if (trend === 1 && candles[i].close < prevLower) trend = -1;
    }
    out.push({ time: Math.floor(new Date(candles[i].timestamp).getTime() / 1000), value: trend === 1 ? finalLower : finalUpper, direction: trend });
  }
  cache.set(key, out as unknown as NumericSeries);
  return out;
}

function markRequested(stats: IndicatorGraphStats) { stats.requestedNodes += 1; }

export function evaluateIndicatorDependencyGraph(candles: HistoricalCandle[], configs: IndicatorConfig[], cache: GraphCache = new Map()): IndicatorGraphEvaluation {
  const stats: IndicatorGraphStats = { requestedNodes: 0, computedNodes: 0, reusedNodes: 0, cacheHits: 0 };
  const results: Array<{ id: string; kind: IndicatorKind; data: any[] }> = [];
  const active = configs.filter(config => config.enabled && GRAPH_SUPPORTED_INDICATORS.has(config.kind));

  const before = new Set(cache.keys());
  for (const cfg of active) {
    const source = cfg.source || (cfg.kind === 'VWAP' ? 'hlc3' : 'close');
    markRequested(stats);
    const preExisting = cache.size;
    let data: any[] = [];
    if (cfg.kind === 'EMA') data = pointSeries(candles, emaNode(cache, `ema:${source}:${cfg.period || 20}`, sourceNode(cache, source, candles), cfg.period || 20));
    else if (cfg.kind === 'SMA') data = pointSeries(candles, smaNode(cache, `sma:${source}:${cfg.period || 20}`, sourceNode(cache, source, candles), cfg.period || 20));
    else if (cfg.kind === 'VWAP') data = pointSeries(candles, vwapNode(cache, source, candles));
    else if (cfg.kind === 'Bollinger Bands') data = bollingerNode(cache, source, cfg.period || 20, cfg.multiplier || 2, candles);
    else if (cfg.kind === 'Keltner Channels') data = keltnerNode(cache, source, cfg.period || 20, cfg.multiplier || 2, candles);
    else if (cfg.kind === 'RSI') data = rsiNode(cache, source, cfg.period || 14, candles);
    else if (cfg.kind === 'MACD') data = macdNode(cache, source, cfg.fast || 12, cfg.slow || 26, cfg.signal || 9, candles);
    else if (cfg.kind === 'ATR') data = pointSeries(candles, atrNode(cache, cfg.period || 14, candles));
    else if (cfg.kind === 'Supertrend') data = supertrendNode(cache, cfg.period || 10, cfg.multiplier || 3, candles);
    else if (cfg.kind === 'HMA') data = pointSeries(candles, hmaNode(cache, source, cfg.period || 20, candles));
    else if (cfg.kind === 'Donchian Channels') data = donchianNode(cache, cfg.period || 20, candles);
    if (cache.size > preExisting) stats.computedNodes += cache.size - preExisting;
    else stats.reusedNodes += 1;
    results.push({ id: cfg.id, kind: cfg.kind, data });
  }
  stats.cacheHits = [...cache.keys()].filter(key => before.has(key)).length;
  return { results, stats };
}

export function isDependencyGraphSupported(kind: IndicatorKind): boolean {
  return GRAPH_SUPPORTED_INDICATORS.has(kind);
}

export function dependencyNodeKeysFor(configs: IndicatorConfig[]): string[] {
  const keys = new Set<string>();
  for (const cfg of configs.filter(x => x.enabled && GRAPH_SUPPORTED_INDICATORS.has(x.kind))) {
    const source = cfg.source || (cfg.kind === 'VWAP' ? 'hlc3' : 'close');
    const p = cfg.period || 20;
    if (cfg.kind === 'EMA') keys.add(`ema:${source}:${p}`);
    if (cfg.kind === 'HMA') { const half = Math.max(1, Math.floor(p / 2)); const sqrt = Math.max(1, Math.floor(Math.sqrt(p))); keys.add(`wma:${source}:${half}`); keys.add(`wma:${source}:${p}`); keys.add(`wma:hma:${source}:${p}:${sqrt}`); keys.add(`hma:${source}:${p}`); }
    if (cfg.kind === 'SMA') keys.add(`sma:${source}:${p}`);
    if (cfg.kind === 'VWAP') keys.add(`vwap:${source}`);
    if (cfg.kind === 'Donchian Channels') keys.add(`donchian:${p}`);
    if (cfg.kind === 'Bollinger Bands') keys.add(`sma:${source}:${p}`);
    if (cfg.kind === 'Keltner Channels') { keys.add(`ema:${source}:${p}`); keys.add(`atr:${p}`); keys.add('true-range'); }
    if (cfg.kind === 'RSI') keys.add(`rsi:${source}:${p}`);
    if (cfg.kind === 'MACD') { keys.add(`ema:${source}:${cfg.fast || 12}`); keys.add(`ema:${source}:${cfg.slow || 26}`); keys.add(`ema:macd:${source}:${cfg.fast || 12}:${cfg.slow || 26}:${cfg.signal || 9}`); }
    if (cfg.kind === 'ATR' || cfg.kind === 'Supertrend') { keys.add(`atr:${p}`); keys.add('true-range'); }
    if (cfg.kind === 'Supertrend') keys.add(`supertrend:${p}:${cfg.multiplier || 3}`);
  }
  return [...keys];
}


export type IndicatorDependencyEdge = { from: string; to: string };
export type IndicatorDependencyPlan = { nodes: string[]; edges: IndicatorDependencyEdge[]; order: string[] };

export function buildIndicatorDependencyGraph(configs: IndicatorConfig[]): IndicatorDependencyPlan {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  const connect = (from: string, to: string) => { nodes.add(from); nodes.add(to); edges.add(`${from}=>${to}`); };
  for (const cfg of configs.filter(x => x.enabled && GRAPH_SUPPORTED_INDICATORS.has(x.kind))) {
    const source = cfg.source || (cfg.kind === 'VWAP' ? 'hlc3' : 'close');
    const p = cfg.period || 20;
    if (cfg.kind === 'EMA') connect(`source:${source}`, `ema:${source}:${p}`);
    if (cfg.kind === 'SMA') connect(`source:${source}`, `sma:${source}:${p}`);
    if (cfg.kind === 'HMA') {
      const half = Math.max(1, Math.floor(p / 2));
      const sqrt = Math.max(1, Math.floor(Math.sqrt(p)));
      connect(`source:${source}`, `wma:${source}:${half}`);
      connect(`source:${source}`, `wma:${source}:${p}`);
      connect(`wma:${source}:${half}`, `wma:hma:${source}:${p}:${sqrt}`);
      connect(`wma:${source}:${p}`, `wma:hma:${source}:${p}:${sqrt}`);
      connect(`wma:hma:${source}:${p}:${sqrt}`, `hma:${source}:${p}`);
    }
    if (cfg.kind === 'VWAP') connect(`source:${source}`, `vwap:${source}`);
    if (cfg.kind === 'Bollinger Bands') { connect(`source:${source}`, `sma:${source}:${p}`); connect(`sma:${source}:${p}`, `bollinger:${source}:${p}:${cfg.multiplier || 2}`); }
    if (cfg.kind === 'Keltner Channels') { connect(`source:${source}`, `ema:${source}:${p}`); connect(`ema:${source}:${p}`, `keltner:${source}:${p}:${cfg.multiplier || 2}`); connect('true-range', `atr:${p}`); connect(`atr:${p}`, `keltner:${source}:${p}:${cfg.multiplier || 2}`); }
    if (cfg.kind === 'RSI') connect(`source:${source}`, `rsi:${source}:${p}`);
    if (cfg.kind === 'MACD') { const fast = cfg.fast || 12, slow = cfg.slow || 26, signal = cfg.signal || 9; connect(`source:${source}`, `ema:${source}:${fast}`); connect(`source:${source}`, `ema:${source}:${slow}`); connect(`ema:${source}:${fast}`, `macd:${source}:${fast}:${slow}:${signal}`); connect(`ema:${source}:${slow}`, `macd:${source}:${fast}:${slow}:${signal}`); connect(`macd:${source}:${fast}:${slow}:${signal}`, `ema:macd:${source}:${fast}:${slow}:${signal}`); }
    if (cfg.kind === 'ATR' || cfg.kind === 'Supertrend') { connect('candle:high-low', 'true-range'); connect('true-range', `atr:${p}`); }
    if (cfg.kind === 'Supertrend') connect(`atr:${p}`, `supertrend:${p}:${cfg.multiplier || 3}`);
    if (cfg.kind === 'Donchian Channels') connect('price:high-low', `donchian:${p}`);
  }
  const edgeList = [...edges].map(edge => { const [from,to] = edge.split('=>'); return {from,to}; });
  const indegree = new Map<string, number>([...nodes].map(node => [node, 0]));
  const adjacency = new Map<string, string[]>();
  for (const edge of edgeList) {
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
    const list = adjacency.get(edge.from) || [];
    list.push(edge.to);
    adjacency.set(edge.from, list);
  }
  const ready = [...nodes].filter(node => (indegree.get(node) || 0) === 0).sort();
  const order: string[] = [];
  while (ready.length) {
    const node = ready.shift()!;
    order.push(node);
    for (const next of adjacency.get(node) || []) {
      const nextDegree = (indegree.get(next) || 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree === 0) ready.push(next);
    }
  }
  if (order.length !== nodes.size) throw new Error('Indicator dependency graph contains a cycle');
  return { nodes: [...nodes], edges: edgeList, order };
}

export function createIndicatorDependencyCache(): GraphCache { return new Map(); }

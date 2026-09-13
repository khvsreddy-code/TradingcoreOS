import { HistoricalCandle } from '../brokers/BrokerAdapter';

export type CoreLevelState = 'ACTIVE' | 'TESTING' | 'BROKEN';

export interface CoreLevel {
  side: 'support' | 'resistance';
  price: number;
  structural: number;
  state: CoreLevelState;
  distance: number;
  tests: number;
  source: 'SWING' | 'SESSION' | 'RANGE' | 'VWAP';
}

export interface ChartAnalytics {
  vwap: number;
  atr: number;
  previousHigh: number;
  previousLow: number;
  openingHigh: number;
  openingLow: number;
  dayHigh: number;
  dayLow: number;
  support: CoreLevel[];
  resistance: CoreLevel[];
  bias: 'BULLISH' | 'BEARISH' | 'RANGE';
}

const round = (n: number) => Math.round(n * 100) / 100;

function atr14(candles: HistoricalCandle[]): number {
  if (candles.length < 2) return 0;
  const tr = candles.slice(1).map((c, i) => {
    const prev = candles[i].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  });
  const window = tr.slice(-14);
  return window.reduce((a, b) => a + b, 0) / Math.max(1, window.length);
}

function sessionBuckets(candles: HistoricalCandle[]) {
  const map = new Map<string, HistoricalCandle[]>();
  for (const c of candles) {
    const key = new Date(c.timestamp).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
    const arr = map.get(key) || [];
    arr.push(c);
    map.set(key, arr);
  }
  return [...map.values()].sort((a, b) => new Date(a[0].timestamp).getTime() - new Date(b[0].timestamp).getTime());
}

function nearestDistinct(values: number[], spot: number, side: 'support' | 'resistance', minGap: number, limit = 4) {
  const filtered = values
    .filter(Number.isFinite)
    .filter(v => side === 'support' ? v < spot : v > spot)
    .sort((a, b) => side === 'support' ? b - a : a - b);
  const out: number[] = [];
  for (const v of filtered) {
    if (out.every(x => Math.abs(x - v) >= minGap)) {
      out.push(v);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Lightweight browser-safe adaptation of the TradingCoreOS level blueprint. */
export function buildChartAnalytics(candles: HistoricalCandle[], spot: number): ChartAnalytics {
  if (!candles.length || !spot) {
    return { vwap: 0, atr: 0, previousHigh: 0, previousLow: 0, openingHigh: 0, openingLow: 0, dayHigh: 0, dayLow: 0, support: [], resistance: [], bias: 'RANGE' };
  }

  const sessions = sessionBuckets(candles);
  const current = sessions[sessions.length - 1] || candles;
  const previous = sessions[sessions.length - 2] || [];
  const todayStart = new Date(current[0].timestamp).getTime();
  const currentSession = candles.filter(c => new Date(c.timestamp).getTime() >= todayStart);
  const opening = currentSession.slice(0, Math.min(3, currentSession.length));
  const dayHigh = Math.max(...currentSession.map(c => c.high), spot);
  const dayLow = Math.min(...currentSession.map(c => c.low), spot);
  const previousHigh = previous.length ? Math.max(...previous.map(c => c.high)) : dayHigh;
  const previousLow = previous.length ? Math.min(...previous.map(c => c.low)) : dayLow;
  const openingHigh = opening.length ? Math.max(...opening.map(c => c.high)) : dayHigh;
  const openingLow = opening.length ? Math.min(...opening.map(c => c.low)) : dayLow;

  let pv = 0, vv = 0;
  for (const c of currentSession) {
    const typical = (c.high + c.low + c.close) / 3;
    const volume = Math.max(0, c.volume || 0);
    pv += typical * volume;
    vv += volume;
  }
  const vwap = vv > 0 ? pv / vv : currentSession[currentSession.length - 1]?.close || spot;
  const atr = atr14(candles);
  const minGap = Math.max(atr * 0.35, spot * 0.00045, 1);

  const swingsSupport: number[] = [];
  const swingsResistance: number[] = [];
  const source = currentSession.length > 8 ? currentSession : candles.slice(-120);
  for (let i = 2; i < source.length - 2; i++) {
    const c = source[i];
    if (c.low <= source[i - 1].low && c.low <= source[i - 2].low && c.low <= source[i + 1].low && c.low <= source[i + 2].low) swingsSupport.push(c.low);
    if (c.high >= source[i - 1].high && c.high >= source[i - 2].high && c.high >= source[i + 1].high && c.high >= source[i + 2].high) swingsResistance.push(c.high);
  }

  const supports = nearestDistinct([...swingsSupport, previousLow, openingLow, dayLow, vwap - Math.max(atr * 0.5, minGap)], spot, 'support', minGap);
  const resistances = nearestDistinct([...swingsResistance, previousHigh, openingHigh, dayHigh, vwap + Math.max(atr * 0.5, minGap)], spot, 'resistance', minGap);

  const build = (prices: number[], side: 'support' | 'resistance'): CoreLevel[] => prices.map((price) => {
    const tolerance = Math.max(atr * 0.12, spot * 0.00025, 1);
    const touches = source.filter(c => Math.abs((side === 'support' ? c.low : c.high) - price) <= tolerance).length;
    const broken = side === 'support' ? spot < price - tolerance : spot > price + tolerance;
    const testing = Math.abs(spot - price) <= Math.max(atr * 0.35, spot * 0.0005);
    return {
      side, price: round(price), structural: round(price), distance: round(Math.abs(spot - price)),
      tests: touches, state: broken ? 'BROKEN' : testing ? 'TESTING' : 'ACTIVE',
      source: price === previousHigh || price === previousLow ? 'SESSION' : price === openingHigh || price === openingLow ? 'RANGE' : 'SWING'
    };
  });

  const support = build(supports, 'support');
  const resistance = build(resistances, 'resistance');
  const score = (spot > vwap ? 1 : -1) + (spot > openingHigh ? 1 : spot < openingLow ? -1 : 0) + (spot > previousHigh ? 1 : spot < previousLow ? -1 : 0);
  const bias = score >= 2 ? 'BULLISH' : score <= -2 ? 'BEARISH' : 'RANGE';

  return { vwap: round(vwap), atr: round(atr), previousHigh: round(previousHigh), previousLow: round(previousLow), openingHigh: round(openingHigh), openingLow: round(openingLow), dayHigh: round(dayHigh), dayLow: round(dayLow), support, resistance, bias };
}

import { HistoricalCandle } from '../brokers/BrokerAdapter';

export type CoreLevelState = 'ACTIVE' | 'TESTING' | 'BROKEN';

export interface CoreLevel {
  side: 'support' | 'resistance';
  price: number;
  structural: number;
  state: CoreLevelState;
  distance: number;
  tests: number;
  source: 'SWING' | 'SESSION' | 'OPENING_RANGE' | 'EQUAL_HL' | 'PREVIOUS_CLOSE';
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
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

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

function pivotLevels(candles: HistoricalCandle[]) {
  const lows: number[] = [];
  const highs: number[] = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const lowPivot = c.low <= candles[i - 1].low && c.low <= candles[i - 2].low && c.low <= candles[i + 1].low && c.low <= candles[i + 2].low;
    const highPivot = c.high >= candles[i - 1].high && c.high >= candles[i - 2].high && c.high >= candles[i + 1].high && c.high >= candles[i + 2].high;
    if (lowPivot) lows.push(c.low);
    if (highPivot) highs.push(c.high);
  }
  return { lows, highs };
}

function cluster(values: number[], tolerance: number) {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const value of sorted) {
    const group = groups[groups.length - 1];
    if (group && Math.abs(value - group[group.length - 1]) <= tolerance) group.push(value);
    else groups.push([value]);
  }
  return groups.map(group => ({
    price: group.reduce((a, b) => a + b, 0) / group.length,
    touches: group.length,
  }));
}

function nearestDistinct(
  values: Array<{ price: number; touches: number; source: CoreLevel['source'] }>,
  spot: number,
  side: 'support' | 'resistance',
  minGap: number,
  limit = 4,
) {
  const filtered = values
    .filter(x => finite(x.price) && (side === 'support' ? x.price < spot : x.price > spot))
    .sort((a, b) => side === 'support' ? b.price - a.price : a.price - b.price);
  const out: Array<{ price: number; touches: number; source: CoreLevel['source'] }> = [];
  for (const value of filtered) {
    if (out.every(x => Math.abs(x.price - value.price) >= minGap)) {
      out.push(value);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * Price-action level engine.
 *
 * Support/resistance is built only from observable OHLC structure:
 * confirmed swing pivots, previous-session extremes, previous close,
 * current opening-range extremes, and clustered equal highs/lows.
 * VWAP remains an informational statistic but is deliberately excluded from
 * the support/resistance set.
 */
export function buildChartAnalytics(candles: HistoricalCandle[], spot: number): ChartAnalytics {
  if (!candles.length || !finite(spot) || spot <= 0) {
    return { vwap: 0, atr: 0, previousHigh: 0, previousLow: 0, openingHigh: 0, openingLow: 0, dayHigh: 0, dayLow: 0, support: [], resistance: [], bias: 'RANGE' };
  }

  const sessions = sessionBuckets(candles);
  const currentSession = sessions[sessions.length - 1] || candles;
  const previousSession = sessions[sessions.length - 2] || [];
  const opening = currentSession.slice(0, Math.min(3, currentSession.length));

  const dayHigh = Math.max(...currentSession.map(c => c.high), spot);
  const dayLow = Math.min(...currentSession.map(c => c.low), spot);
  const previousHigh = previousSession.length ? Math.max(...previousSession.map(c => c.high)) : dayHigh;
  const previousLow = previousSession.length ? Math.min(...previousSession.map(c => c.low)) : dayLow;
  const previousClose = previousSession.length ? previousSession[previousSession.length - 1].close : undefined;
  const openingHigh = opening.length ? Math.max(...opening.map(c => c.high)) : dayHigh;
  const openingLow = opening.length ? Math.min(...opening.map(c => c.low)) : dayLow;

  // VWAP is retained for the dashboard only. It never creates a price-action level.
  let pv = 0;
  let vv = 0;
  for (const c of currentSession) {
    const volume = Math.max(0, c.volume || 0);
    pv += ((c.high + c.low + c.close) / 3) * volume;
    vv += volume;
  }
  const vwap = vv > 0 ? pv / vv : currentSession[currentSession.length - 1]?.close || spot;
  const atr = atr14(candles);
  const minGap = Math.max(atr * 0.35, spot * 0.00045, 1);
  const clusterTolerance = Math.max(atr * 0.18, spot * 0.00025, 1);

  // Use the current session when enough candles exist; otherwise use the most
  // recent 180 candles so the level engine still has confirmed structure.
  const structure = currentSession.length >= 20 ? currentSession : candles.slice(-180);
  const pivots = pivotLevels(structure);
  const lowClusters = cluster(pivots.lows, clusterTolerance);
  const highClusters = cluster(pivots.highs, clusterTolerance);

  const candidatesSupport: Array<{ price: number; touches: number; source: CoreLevel['source'] }> = [];
  const candidatesResistance: Array<{ price: number; touches: number; source: CoreLevel['source'] }> = [];

  for (const p of lowClusters) candidatesSupport.push({ price: p.price, touches: p.touches, source: p.touches >= 2 ? 'EQUAL_HL' : 'SWING' });
  for (const p of highClusters) candidatesResistance.push({ price: p.price, touches: p.touches, source: p.touches >= 2 ? 'EQUAL_HL' : 'SWING' });

  if (finite(previousLow)) candidatesSupport.push({ price: previousLow, touches: 1, source: 'SESSION' });
  if (finite(previousHigh)) candidatesResistance.push({ price: previousHigh, touches: 1, source: 'SESSION' });
  if (finite(previousClose)) {
    if (previousClose < spot) candidatesSupport.push({ price: previousClose, touches: 1, source: 'PREVIOUS_CLOSE' });
    if (previousClose > spot) candidatesResistance.push({ price: previousClose, touches: 1, source: 'PREVIOUS_CLOSE' });
  }
  if (finite(openingLow)) candidatesSupport.push({ price: openingLow, touches: 1, source: 'OPENING_RANGE' });
  if (finite(openingHigh)) candidatesResistance.push({ price: openingHigh, touches: 1, source: 'OPENING_RANGE' });
  if (finite(dayLow)) candidatesSupport.push({ price: dayLow, touches: 1, source: 'SESSION' });
  if (finite(dayHigh)) candidatesResistance.push({ price: dayHigh, touches: 1, source: 'SESSION' });

  const supports = nearestDistinct(candidatesSupport, spot, 'support', minGap);
  const resistances = nearestDistinct(candidatesResistance, spot, 'resistance', minGap);

  const build = (levels: Array<{ price: number; touches: number; source: CoreLevel['source'] }>, side: 'support' | 'resistance'): CoreLevel[] => levels.map(level => {
    const testTolerance = Math.max(atr * 0.22, spot * 0.0003, 1);
    const broken = side === 'support' ? spot < level.price - testTolerance : spot > level.price + testTolerance;
    const testing = Math.abs(spot - level.price) <= Math.max(atr * 0.35, spot * 0.0005, 1);
    return {
      side,
      price: round(level.price),
      // Structural field is an observable touch count, not a synthetic confidence score.
      structural: level.touches,
      state: broken ? 'BROKEN' : testing ? 'TESTING' : 'ACTIVE',
      distance: round(Math.abs(spot - level.price)),
      tests: level.touches,
      source: level.source,
    };
  });

  // Simple price-action bias for the existing dashboard: last confirmed swing
  // relationship plus session location. It does not affect level selection.
  const recentLows = pivots.lows.slice(-3);
  const recentHighs = pivots.highs.slice(-3);
  const higherStructure = recentHighs.length >= 2 && recentLows.length >= 2 && recentHighs[recentHighs.length - 1] > recentHighs[recentHighs.length - 2] && recentLows[recentLows.length - 1] > recentLows[recentLows.length - 2];
  const lowerStructure = recentHighs.length >= 2 && recentLows.length >= 2 && recentHighs[recentHighs.length - 1] < recentHighs[recentHighs.length - 2] && recentLows[recentLows.length - 1] < recentLows[recentLows.length - 2];
  const bias = higherStructure && spot >= openingHigh ? 'BULLISH' : lowerStructure && spot <= openingLow ? 'BEARISH' : 'RANGE';

  return {
    vwap: round(vwap), atr: round(atr),
    previousHigh: round(previousHigh), previousLow: round(previousLow),
    openingHigh: round(openingHigh), openingLow: round(openingLow),
    dayHigh: round(dayHigh), dayLow: round(dayLow),
    support: build(supports, 'support'),
    resistance: build(resistances, 'resistance'),
    bias,
  };
}

import { HistoricalCandle } from '../brokers/BrokerAdapter';

export type CoreLevelState = 'ACTIVE' | 'TESTING' | 'BROKEN';
export type CoreLevelSource = 'SWING' | 'SESSION' | 'OPENING_RANGE' | 'EQUAL_HL' | 'PREVIOUS_CLOSE';

export interface CoreLevel {
  side: 'support' | 'resistance';
  price: number;
  structural: number;
  state: CoreLevelState;
  distance: number;
  tests: number;
  source: CoreLevelSource;
  reactionAtr: number;
  rejectionRatio: number;
  volumeRatio: number;
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

type Candidate = {
  price: number;
  touches: number;
  source: CoreLevelSource;
  reactionAtr: number;
  rejectionRatio: number;
  volumeRatio: number;
  anchor: boolean;
};

const round = (n: number) => Math.round(n * 100) / 100;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function atr14(candles: HistoricalCandle[]): number {
  if (candles.length < 2) return 0;
  const tr = candles.map((c, i) => {
    if (i === 0) return Math.max(0, c.high - c.low);
    const prev = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  });
  const period = Math.min(14, tr.length);
  if (period <= 0) return 0;
  let value = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < tr.length; i++) value = ((value * (period - 1)) + tr[i]) / period;
  return value;
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

function pivotLevels(candles: HistoricalCandle[], span = 5) {
  const lows: Array<{ index: number; price: number }> = [];
  const highs: Array<{ index: number; price: number }> = [];
  if (candles.length < span * 2 + 1) return { lows, highs };
  for (let i = span; i < candles.length - span; i++) {
    const c = candles[i];
    let lowPivot = true;
    let highPivot = true;
    for (let j = 1; j <= span; j++) {
      if (c.low > candles[i - j].low || c.low > candles[i + j].low) lowPivot = false;
      if (c.high < candles[i - j].high || c.high < candles[i + j].high) highPivot = false;
      if (!lowPivot && !highPivot) break;
    }
    if (lowPivot) lows.push({ index: i, price: c.low });
    if (highPivot) highs.push({ index: i, price: c.high });
  }
  return { lows, highs };
}

function cluster(values: Array<{ index: number; price: number }>, tolerance: number) {
  const sorted = values.filter(x => finite(x.price)).sort((a, b) => a.price - b.price);
  const groups: Array<Array<{ index: number; price: number }>> = [];
  for (const value of sorted) {
    const group = groups[groups.length - 1];
    if (group && Math.abs(value.price - group[group.length - 1].price) <= tolerance) group.push(value);
    else groups.push([value]);
  }
  return groups.map(group => ({
    price: group.reduce((a, b) => a + b.price, 0) / group.length,
    touches: group.length,
    latestIndex: Math.max(...group.map(x => x.index)),
  }));
}

function meanVolume(candles: HistoricalCandle[], endIndex: number, period = 20) {
  const start = Math.max(0, endIndex - period + 1);
  const values = candles.slice(start, endIndex + 1).map(c => Math.max(0, c.volume || 0)).filter(v => v > 0);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function pivotReaction(candles: HistoricalCandle[], pivotIndex: number, side: 'support' | 'resistance', atr: number) {
  if (!atr || pivotIndex >= candles.length - 1) return 0;
  const end = Math.min(candles.length - 1, pivotIndex + 8);
  let excursion = 0;
  for (let i = pivotIndex + 1; i <= end; i++) {
    excursion = Math.max(excursion, side === 'support'
      ? candles[i].high - candles[pivotIndex].low
      : candles[pivotIndex].high - candles[i].low);
  }
  return clamp(excursion / atr, 0, 5);
}

function rejectionRatio(c: HistoricalCandle, side: 'support' | 'resistance') {
  const range = Math.max(c.high - c.low, Number.EPSILON);
  const body = Math.abs(c.close - c.open);
  const wick = side === 'support'
    ? Math.min(c.open, c.close) - c.low
    : c.high - Math.max(c.open, c.close);
  return clamp(wick / range, 0, 1) * (wick > body ? 1 : 0.5);
}

function candidatePriority(c: Candidate) {
  const sourcePriority: Record<CoreLevelSource, number> = {
    SESSION: 5,
    PREVIOUS_CLOSE: 5,
    OPENING_RANGE: 5,
    EQUAL_HL: 4,
    SWING: 1,
  };
  return [c.anchor ? 1 : 0, sourcePriority[c.source], c.touches, c.reactionAtr, c.rejectionRatio, c.volumeRatio];
}

function compareCandidate(a: Candidate, b: Candidate) {
  const pa = candidatePriority(a);
  const pb = candidatePriority(b);
  for (let i = 0; i < pa.length; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i];
  }
  return 0;
}

function mergeCandidates(candidates: Candidate[], tolerance: number, spot: number, side: 'support' | 'resistance') {
  const relevant = candidates
    .filter(c => side === 'support' ? c.price < spot : c.price > spot)
    .sort((a, b) => side === 'support' ? b.price - a.price : a.price - b.price);
  const groups: Candidate[][] = [];
  for (const candidate of relevant) {
    const group = groups.find(g => Math.abs(g[0].price - candidate.price) <= tolerance);
    if (group) group.push(candidate);
    else groups.push([candidate]);
  }
  return groups.map(group => {
    const best = [...group].sort(compareCandidate)[0];
    const touchSum = group.reduce((sum, x) => sum + x.touches, 0);
    const weightSum = group.reduce((sum, x) => sum + Math.max(1, x.touches), 0);
    return {
      ...best,
      price: group.reduce((sum, x) => sum + x.price * Math.max(1, x.touches), 0) / weightSum,
      touches: touchSum,
    };
  });
}

function passesEvidence(candidate: Candidate) {
  return candidate.anchor || candidate.touches >= 2 || candidate.reactionAtr >= 0.75 || candidate.rejectionRatio >= 0.45;
}

/**
 * Quantitative price-action level engine.
 * Raw OHLC structure creates the candidate price. Wilder ATR, volatility-normalized
 * reaction, rejection geometry and real-volume participation only validate/normalize
 * that candidate. No directional indicator voting or synthetic confidence score is used.
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

  let pv = 0;
  let vv = 0;
  for (const c of currentSession) {
    const volume = Math.max(0, c.volume || 0);
    pv += ((c.high + c.low + c.close) / 3) * volume;
    vv += volume;
  }
  const vwap = vv > 0 ? pv / vv : currentSession[currentSession.length - 1]?.close || spot;

  const atr = atr14(candles);
  const safeAtr = Math.max(atr, spot * 0.0002, Number.EPSILON);
  const recent = candles.slice(-5);
  const shortTr = recent.length ? recent.reduce((sum, c, i) => {
    const globalIndex = candles.length - recent.length + i;
    const prev = globalIndex > 0 ? candles[globalIndex - 1].close : c.close;
    return sum + Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
  }, 0) / recent.length : safeAtr;
  const volatilityRatio = shortTr / safeAtr;
  const mergeDistance = safeAtr * clamp(0.24 + volatilityRatio * 0.10, 0.28, 0.60);
  const clusterTolerance = safeAtr * clamp(0.12 + volatilityRatio * 0.04, 0.14, 0.24);

  const structure = candles.slice(-240);
  const pivots = pivotLevels(structure, 5);
  const lowClusters = cluster(pivots.lows, clusterTolerance);
  const highClusters = cluster(pivots.highs, clusterTolerance);

  const supports: Candidate[] = [];
  const resistances: Candidate[] = [];

  for (const p of lowClusters) {
    const source: CoreLevelSource = p.touches >= 2 ? 'EQUAL_HL' : 'SWING';
    const candle = structure[p.latestIndex];
    const avgVol = meanVolume(structure, p.latestIndex);
    const volRatio = avgVol > 0 && (candle.volume || 0) > 0 ? (candle.volume || 0) / avgVol : 0;
    supports.push({ price: p.price, touches: p.touches, source, reactionAtr: round(pivotReaction(structure, p.latestIndex, 'support', safeAtr)), rejectionRatio: round(rejectionRatio(candle, 'support')), volumeRatio: round(volRatio), anchor: false });
  }
  for (const p of highClusters) {
    const source: CoreLevelSource = p.touches >= 2 ? 'EQUAL_HL' : 'SWING';
    const candle = structure[p.latestIndex];
    const avgVol = meanVolume(structure, p.latestIndex);
    const volRatio = avgVol > 0 && (candle.volume || 0) > 0 ? (candle.volume || 0) / avgVol : 0;
    resistances.push({ price: p.price, touches: p.touches, source, reactionAtr: round(pivotReaction(structure, p.latestIndex, 'resistance', safeAtr)), rejectionRatio: round(rejectionRatio(candle, 'resistance')), volumeRatio: round(volRatio), anchor: false });
  }

  const addAnchor = (price: number | undefined, side: 'support' | 'resistance', source: CoreLevelSource) => {
    if (!finite(price)) return;
    (side === 'support' ? supports : resistances).push({ price, touches: 1, source, reactionAtr: 0, rejectionRatio: 0, volumeRatio: 0, anchor: true });
  };
  addAnchor(previousLow, 'support', 'SESSION');
  addAnchor(previousHigh, 'resistance', 'SESSION');
  if (finite(previousClose)) {
    if (previousClose < spot) addAnchor(previousClose, 'support', 'PREVIOUS_CLOSE');
    if (previousClose > spot) addAnchor(previousClose, 'resistance', 'PREVIOUS_CLOSE');
  }
  addAnchor(openingLow, 'support', 'OPENING_RANGE');
  addAnchor(openingHigh, 'resistance', 'OPENING_RANGE');
  addAnchor(dayLow, 'support', 'SESSION');
  addAnchor(dayHigh, 'resistance', 'SESSION');

  const mergedSupport = mergeCandidates(supports.filter(passesEvidence), mergeDistance, spot, 'support').slice(0, 3);
  const mergedResistance = mergeCandidates(resistances.filter(passesEvidence), mergeDistance, spot, 'resistance').slice(0, 3);

  const build = (levels: Candidate[], side: 'support' | 'resistance'): CoreLevel[] => levels.map(level => {
    const testTolerance = Math.max(safeAtr * 0.20, spot * 0.00025);
    const distance = Math.abs(spot - level.price);
    const broken = side === 'support' ? spot < level.price - testTolerance : spot > level.price + testTolerance;
    const testing = distance <= Math.max(safeAtr * 0.30, spot * 0.00045);
    return {
      side,
      price: round(level.price),
      structural: level.touches,
      state: broken ? 'BROKEN' : testing ? 'TESTING' : 'ACTIVE',
      distance: round(distance),
      tests: level.touches,
      source: level.source,
      reactionAtr: level.reactionAtr,
      rejectionRatio: level.rejectionRatio,
      volumeRatio: level.volumeRatio,
    };
  });

  const recentLows = pivots.lows.slice(-3).map(x => x.price);
  const recentHighs = pivots.highs.slice(-3).map(x => x.price);
  const higherStructure = recentHighs.length >= 2 && recentLows.length >= 2 && recentHighs[recentHighs.length - 1] > recentHighs[recentHighs.length - 2] && recentLows[recentLows.length - 1] > recentLows[recentLows.length - 2];
  const lowerStructure = recentHighs.length >= 2 && recentLows.length >= 2 && recentHighs[recentHighs.length - 1] < recentHighs[recentHighs.length - 2] && recentLows[recentLows.length - 1] < recentLows[recentLows.length - 2];
  const bias = higherStructure && spot >= openingHigh ? 'BULLISH' : lowerStructure && spot <= openingLow ? 'BEARISH' : 'RANGE';

  return {
    vwap: round(vwap), atr: round(atr),
    previousHigh: round(previousHigh), previousLow: round(previousLow),
    openingHigh: round(openingHigh), openingLow: round(openingLow),
    dayHigh: round(dayHigh), dayLow: round(dayLow),
    support: build(mergedSupport, 'support'),
    resistance: build(mergedResistance, 'resistance'),
    bias,
  };
}

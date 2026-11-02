import type { HistoricalCandle } from '../brokers/BrokerAdapter';

const MAX_HISTORY_CANDLES = 50_000;

export function normalizeHistory(rows: HistoricalCandle[]): HistoricalCandle[] {
  const bySecond = new Map<number, HistoricalCandle>();
  for (const row of rows || []) {
    if (row.source === 'unknown') continue;
    const raw = Date.parse(String(row.timestamp));
    const time = Math.floor(raw / 1000);
    const values = [Number(row.open), Number(row.high), Number(row.low), Number(row.close)];
    if (!Number.isFinite(raw) || !Number.isFinite(time) || time <= 0 || values.some(v => !Number.isFinite(v))) continue;
    const volume = Number(row.volume);
    bySecond.set(time, {
      timestamp: new Date(time * 1000).toISOString(),
      open: values[0], high: values[1], low: values[2], close: values[3],
      volume: Number.isFinite(volume) ? volume : 0,
      ...(row.source === 'nse' || row.source === 'investiny' || row.source === 'fyers' || row.source === 'tvdatafeed' || row.source === 'unknown' ? { source: row.source } : {}),
      phase: row.phase === 'historical' || row.phase === 'confirmed' || row.phase === 'developing' || row.phase === 'realtime' || row.phase === 'forecast' ? row.phase : 'historical',
      confirmed: typeof row.confirmed === 'boolean' ? row.confirmed : row.phase === 'developing' || row.phase === 'realtime' || row.phase === 'forecast' ? false : true,
      ...(typeof row.availableAt === 'string' || typeof row.availableAt === 'number' ? { availableAt: row.availableAt } : {}),
      ...(typeof row.exchangeTimestamp === 'string' || typeof row.exchangeTimestamp === 'number' ? { exchangeTimestamp: row.exchangeTimestamp } : {}),
      ...(typeof row.ingestedAt === 'string' || typeof row.ingestedAt === 'number' ? { ingestedAt: row.ingestedAt } : {}),
      ...(typeof row.timeframe === 'string' && row.timeframe.trim() ? { timeframe: row.timeframe } : {}),
      ...(typeof row.revision === 'number' && Number.isSafeInteger(row.revision) && row.revision >= 0 ? { revision: row.revision } : {}),
    });
  }
  return [...bySecond.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)).slice(-MAX_HISTORY_CANDLES);
}

export function columnarHistoryToCandles(columns: {
  time: ArrayLike<number>; open: ArrayLike<number>; high: ArrayLike<number>; low: ArrayLike<number>; close: ArrayLike<number>; volume: ArrayLike<number>; timeUnit?: 'milliseconds' | 'seconds';
  source?: ArrayLike<string>; phase?: ArrayLike<string>; confirmed?: ArrayLike<boolean>; availableAt?: ArrayLike<number>; revision?: ArrayLike<number>;
  exchangeTime?: ArrayLike<number>; ingestedAt?: ArrayLike<number>; timeframe?: string;
}, limit = 5000): HistoricalCandle[] {
  const count = Math.min(columns.time.length, columns.open.length, columns.high.length, columns.low.length, columns.close.length, columns.volume.length);
  const start = Math.max(0, count - Math.max(1, limit));
  const out: HistoricalCandle[] = new Array(Math.max(0, count - start));
  const multiplier = columns.timeUnit === 'seconds' ? 1000 : 1;
  let previous = Number.NaN;
  let written = 0;
  for (let i = start; i < count; i += 1) {
    const time = Number(columns.time[i]) * multiplier;
    const open = Number(columns.open[i]), high = Number(columns.high[i]), low = Number(columns.low[i]), close = Number(columns.close[i]), volume = Number(columns.volume[i]);
    if (!Number.isFinite(time) || time <= 0 || ![open, high, low, close].every(Number.isFinite)) continue;
    const source = columns.source?.[i];
    if (source === 'unknown') continue;
    if (time === previous) continue;
    previous = time;
    const phaseRaw = columns.phase?.[i];
    const phase = phaseRaw === 'historical' || phaseRaw === 'confirmed' || phaseRaw === 'developing' || phaseRaw === 'realtime' || phaseRaw === 'forecast'
      ? phaseRaw
      : 'historical';
    const confirmedRaw = columns.confirmed?.[i];
    const confirmed = typeof confirmedRaw === 'boolean' ? confirmedRaw : phase === 'historical' || phase === 'confirmed';
    const availableAtRaw = columns.availableAt?.[i];
    const revisionRaw = columns.revision?.[i];
    const exchangeTimeRaw = columns.exchangeTime?.[i];
    const ingestedAtRaw = columns.ingestedAt?.[i];
    const availableAtMs = typeof availableAtRaw === 'number' ? availableAtRaw : Number.NaN;
    const exchangeTimeMs = typeof exchangeTimeRaw === 'number' && Number.isFinite(exchangeTimeRaw) && exchangeTimeRaw > 0 ? exchangeTimeRaw : time;
    const ingestedAtMs = typeof ingestedAtRaw === 'number' ? ingestedAtRaw : Number.NaN;
    const revision = typeof revisionRaw === 'number' ? revisionRaw : Number.NaN;
    out[written++] = {
      timestamp: new Date(time).toISOString(), open, high, low, close, volume: Number.isFinite(volume) ? volume : 0,
      ...(source === 'nse' || source === 'investiny' || source === 'fyers' || source === 'tvdatafeed' || source === 'unknown' ? { source } : {}),
      phase,
      confirmed,
      ...(Number.isFinite(availableAtMs) && availableAtMs > 0 ? { availableAt: new Date(availableAtMs).toISOString() } : {}),
      exchangeTimestamp: new Date(exchangeTimeMs).toISOString(),
      ...(Number.isFinite(ingestedAtMs) && ingestedAtMs > 0 ? { ingestedAt: new Date(ingestedAtMs).toISOString() } : {}),
      ...(typeof columns.timeframe === 'string' && columns.timeframe.trim() ? { timeframe: columns.timeframe } : {}),
      ...(Number.isSafeInteger(revision) && revision >= 0 ? { revision } : {}),
    };
  }
  out.length = written;
  return out;
}

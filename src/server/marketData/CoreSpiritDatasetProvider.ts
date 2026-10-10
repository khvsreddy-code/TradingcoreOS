/**
 * Named, authenticated market datasets for CoreSpirit research.
 *
 * Dataset names are intentionally resolved to a strict symbol/timeframe pair;
 * user input never becomes a URL or an arbitrary provider path. History is
 * fetched through the existing FYERS client/request gate and then passed to
 * the bounded CoreSpirit feature materializer.
 */
import type { CoreSpiritFeatureRange, CoreSpiritResearchBar } from '../../services/coreSpirit/coreSpiritFeatureMaterializer.js';

export type CoreSpiritMarketDataset = Readonly<{
  name: string;
  symbol: string;
  resolution: string;
  intervalMinutes: number | null;
  chunkDays: number;
}>;

export type CoreSpiritHistoryFetcher = (
  dataset: CoreSpiritMarketDataset,
  from: string,
  to: string,
) => Promise<unknown>;

export class CoreSpiritDatasetProviderError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode = 422) {
    super(message);
    this.name = 'CoreSpiritDatasetProviderError';
    this.statusCode = statusCode;
  }
}

const DAY_MS = 86_400_000;
const MAX_INPUT_BARS = 10_000;
const MAX_PROVIDER_CANDLES_PER_WINDOW = 1_000;
// The feature materializer supports at most 512 bars of lookback and the
// current HMM trainer accepts at most 1,024 usable observations.
const MAX_IN_RANGE_BARS_BEFORE_WARMUP = 1_535;
const MAX_HISTORY_WINDOWS = 64;

const TIMEFRAMES: Record<string, Omit<CoreSpiritMarketDataset, 'name' | 'symbol'>> = {
  // Keep each provider request comfortably below FYERS' common 1,000-candle
  // history response ceiling, including long MCX sessions.
  '1M': { resolution: '1', intervalMinutes: 1, chunkDays: 1 },
  '3M': { resolution: '3', intervalMinutes: 3, chunkDays: 3 },
  '5M': { resolution: '5', intervalMinutes: 5, chunkDays: 5 },
  '10M': { resolution: '10', intervalMinutes: 10, chunkDays: 10 },
  '15M': { resolution: '15', intervalMinutes: 15, chunkDays: 15 },
  '30M': { resolution: '30', intervalMinutes: 30, chunkDays: 30 },
  '60M': { resolution: '60', intervalMinutes: 60, chunkDays: 60 },
  '120M': { resolution: '120', intervalMinutes: 120, chunkDays: 120 },
  '240M': { resolution: '240', intervalMinutes: 240, chunkDays: 240 },
  '1D': { resolution: 'D', intervalMinutes: null, chunkDays: 1_000 },
  '1W': { resolution: '1W', intervalMinutes: null, chunkDays: 3_650 },
  '1MO': { resolution: '1M', intervalMinutes: null, chunkDays: 3_650 },
};

const INDEX_ALIASES: Record<string, string> = {
  NIFTY: 'NSE:NIFTY50-INDEX',
  NIFTY50: 'NSE:NIFTY50-INDEX',
  'NIFTY50-INDEX': 'NSE:NIFTY50-INDEX',
  BANKNIFTY: 'NSE:NIFTYBANK-INDEX',
  NIFTYBANK: 'NSE:NIFTYBANK-INDEX',
  'NIFTYBANK-INDEX': 'NSE:NIFTYBANK-INDEX',
  FINNIFTY: 'NSE:FINNIFTY-INDEX',
  'FINNIFTY-INDEX': 'NSE:FINNIFTY-INDEX',
  MIDCPNIFTY: 'NSE:MIDCPNIFTY-INDEX',
  'MIDCPNIFTY-INDEX': 'NSE:MIDCPNIFTY-INDEX',
  SENSEX: 'BSE:SENSEX-INDEX',
  'SENSEX-INDEX': 'BSE:SENSEX-INDEX',
};

function resolveSymbol(rawSymbol: string): string {
  const raw = rawSymbol.trim().toUpperCase();
  const alias = INDEX_ALIASES[raw];
  if (alias) return alias;

  if (/^(NSE|BSE|MCX):[A-Z0-9&._-]{1,48}$/.test(raw)) return raw;
  if (!/^[A-Z0-9&._-]{1,32}$/.test(raw)) {
    throw new CoreSpiritDatasetProviderError('Dataset symbol must be a supported index alias, NSE/BSE/MCX symbol, or equity ticker.');
  }
  if (/(?:-INDEX|-FUT|-CE|-PE)$/.test(raw)) return 'NSE:' + raw;
  return 'NSE:' + (/(?:-EQ|-BE|-SM|-ST)$/.test(raw) ? raw : raw + '-EQ');
}

/** Supported format: NIFTY_5M, BANKNIFTY_15M, NSE:RELIANCE-EQ_1D. */
export function resolveCoreSpiritMarketDataset(name: string): CoreSpiritMarketDataset {
  const normalized = String(name ?? '').trim().toUpperCase();
  const match = normalized.match(/^(.+)_((?:1|3|5|10|15|30|60|120|240)M|1D|1W|1MO)$/);
  if (!match) {
    throw new CoreSpiritDatasetProviderError(
      'Unsupported market dataset name. Use SYMBOL_1M/3M/5M/10M/15M/30M/60M/120M/240M, SYMBOL_1D, SYMBOL_1W or SYMBOL_1MO.',
    );
  }
  const timeframe = TIMEFRAMES[match[2]!];
  if (!timeframe) throw new CoreSpiritDatasetProviderError('Unsupported market dataset timeframe.');
  return Object.freeze({
    name: normalized,
    symbol: resolveSymbol(match[1]!),
    ...timeframe,
  });
}

function rangeBounds(range: CoreSpiritFeatureRange): { from: number; to: number } {
  const from = Date.parse(range.from);
  const dateOnlyTo = /^\d{4}-\d{2}-\d{2}$/.test(range.to);
  const to = Date.parse(range.to) + (dateOnlyTo ? DAY_MS - 1 : 0);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    throw new CoreSpiritDatasetProviderError('Dataset range must contain valid dates with from < to.');
  }
  return { from, to };
}

function utcDayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function dateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function warmupCalendarDays(dataset: CoreSpiritMarketDataset): number {
  if (dataset.intervalMinutes !== null) {
    const barsPerSession = 375 / dataset.intervalMinutes;
    const sessions = Math.ceil(512 / barsPerSession);
    return Math.ceil(sessions * 7 / 5) + 3;
  }
  if (dataset.resolution === 'D') return 725;
  if (dataset.resolution === '1W') return 3_600;
  // A decade of monthly bars is a bounded warm-up. Longer periods naturally
  // produce missing values and are rejected by the feature materializer if
  // the requested history cannot satisfy them.
  return 3_650;
}

function readCandles(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  if (String(record.s ?? '').toLowerCase() === 'error') {
    throw new Error(typeof record.message === 'string' ? record.message : 'FYERS rejected the historical-data request.');
  }
  if (record.candles === undefined) return [];
  if (!Array.isArray(record.candles)) throw new Error('FYERS history response has an invalid candles field.');
  return record.candles;
}

function normalizeCandle(value: unknown): CoreSpiritResearchBar | null {
  if (!Array.isArray(value) || value.length < 5) return null;
  const rawTimestamp = Number(value[0]);
  const timestamp = rawTimestamp > 1e12 ? rawTimestamp : rawTimestamp * 1000;
  const open = Number(value[1]);
  const high = Number(value[2]);
  const low = Number(value[3]);
  const close = Number(value[4]);
  const volume = value.length > 5 && Number.isFinite(Number(value[5])) ? Number(value[5]) : 0;
  if (![timestamp, open, high, low, close, volume].every(Number.isFinite)) return null;
  return { timestamp, open, high, low, close, volume };
}

/**
 * Fetches the named dataset in bounded provider windows. The fetcher is
 * injected so this policy can be contract-tested without broker credentials.
 * It fails rather than silently truncating an oversized research range.
 */
export async function fetchCoreSpiritDatasetBars(
  datasetName: string,
  trainingRange: CoreSpiritFeatureRange,
  fetchHistory: CoreSpiritHistoryFetcher,
): Promise<CoreSpiritResearchBar[]> {
  const dataset = resolveCoreSpiritMarketDataset(datasetName);
  const { from, to } = rangeBounds(trainingRange);
  const warmupStart = Math.max(0, utcDayStart(from) - warmupCalendarDays(dataset) * DAY_MS);
  const endDay = utcDayStart(to);
  const chunkMs = dataset.chunkDays * DAY_MS;
  const barsByTimestamp = new Map<number, CoreSpiritResearchBar>();
  let cursor = warmupStart;
  let windows = 0;
  let inRangeBars = 0;

  while (cursor <= endDay && windows < MAX_HISTORY_WINDOWS) {
    const chunkEnd = Math.min(cursor + chunkMs - DAY_MS, endDay);
    const payload = await fetchHistory(dataset, dateKey(cursor), dateKey(chunkEnd));
    const candles = readCandles(payload);
    if (candles.length >= MAX_PROVIDER_CANDLES_PER_WINDOW) {
      throw new CoreSpiritDatasetProviderError(
        'FYERS returned the per-request candle ceiling for one history window. The result may be truncated; retry with a smaller date range.',
      );
    }
    for (const rawCandle of candles) {
      const bar = normalizeCandle(rawCandle);
      if (!bar || bar.timestamp < warmupStart || bar.timestamp > to) continue;
      if (!barsByTimestamp.has(bar.timestamp)) {
        barsByTimestamp.set(bar.timestamp, bar);
        if (bar.timestamp >= from && bar.timestamp <= to) inRangeBars += 1;
      }
    }
    if (barsByTimestamp.size > MAX_INPUT_BARS) {
      throw new CoreSpiritDatasetProviderError(
        'Requested market history exceeds 10,000 candles. Narrow the range; CoreSpirit will not silently truncate a training dataset.',
      );
    }
    if (inRangeBars > MAX_IN_RANGE_BARS_BEFORE_WARMUP) {
      throw new CoreSpiritDatasetProviderError(
        'Requested range exceeds the current HMM training budget: at most 1,024 usable observations plus up to 512 warm-up candles. Narrow the date range or choose a coarser timeframe.',
      );
    }
    cursor = chunkEnd + DAY_MS;
    windows += 1;
  }

  if (cursor <= endDay) {
    throw new CoreSpiritDatasetProviderError('Dataset range requires too many history windows; split it into smaller, versioned training ranges.');
  }
  const bars = [...barsByTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
  if (!bars.some(bar => bar.timestamp >= from && bar.timestamp <= to)) {
    throw new CoreSpiritDatasetProviderError('FYERS returned no candles inside the requested training range.', 422);
  }
  return bars;
}

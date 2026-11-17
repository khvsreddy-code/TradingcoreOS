/**
 * Convert validated historical records straight into Vela's numeric history ABI.
 *
 * This mirrors range selection followed by the former OHLCV-to-column conversion,
 * without constructing an intermediate per-candle OHLCV object graph.
 */
export type HistoricalColumnRow = Readonly<{
  timestamp: string | number;
  open: unknown;
  high: unknown;
  low: unknown;
  close: unknown;
  volume?: unknown;
}>;

export type HistoricalColumnRange = Readonly<{ from?: number; to?: number }>;

export type HistoricalColumnBars = Readonly<{
  time: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
  length: number;
  timeUnit: 'milliseconds';
}>;

function epochMilliseconds(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function rangeEpochMilliseconds(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  if (numeric > 1e12) return numeric;
  if (numeric >= 1e9) return numeric * 1000;
  return undefined;
}

export function historicalRowsToVelaColumns(
  rows: readonly HistoricalColumnRow[],
  range?: HistoricalColumnRange,
  limit = 5_000,
): HistoricalColumnBars {
  const from = rangeEpochMilliseconds(range?.from);
  const to = rangeEpochMilliseconds(range?.to);
  const requested = Math.max(0, Math.floor(Number(limit) || rows.length));

  // Retain source row indexes/timestamps while selecting. No OHLCV objects or
  // per-row wrapper objects are allocated on this cold columnar boundary.
  const selectedIndexes = new Uint32Array(rows.length);
  const selectedTimes = new Float64Array(rows.length);
  let selectedCount = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    const time = epochMilliseconds(row.timestamp);
    if (from !== undefined && !(time >= from)) continue;
    if (to !== undefined && !(time <= to)) continue;
    selectedIndexes[selectedCount] = index;
    selectedTimes[selectedCount] = time;
    selectedCount += 1;
  }

  // Match filter(...).slice(-limit): cap the source window first, then discard
  // malformed OHLC rows from that selected window.
  const selectedStart = Math.max(0, selectedCount - requested);
  const selectedLength = selectedCount - selectedStart;
  const time = new Float64Array(selectedLength);
  const open = new Float64Array(selectedLength);
  const high = new Float64Array(selectedLength);
  const low = new Float64Array(selectedLength);
  const close = new Float64Array(selectedLength);
  const volume = new Float64Array(selectedLength);
  let written = 0;

  for (let index = selectedStart; index < selectedCount; index += 1) {
    const row = rows[selectedIndexes[index]!]!;
    const timestamp = selectedTimes[index]!;
    const o = Number(row.open);
    const h = Number(row.high);
    const l = Number(row.low);
    const c = Number(row.close);
    if (!Number.isFinite(timestamp) || ![o, h, l, c].every(Number.isFinite)) continue;
    const v = Number(row.volume);
    time[written] = timestamp;
    open[written] = o;
    high[written] = h;
    low[written] = l;
    close[written] = c;
    volume[written] = Number.isFinite(v) ? v || 0 : 0;
    written += 1;
  }

  return {
    time: time.subarray(0, written),
    open: open.subarray(0, written),
    high: high.subarray(0, written),
    low: low.subarray(0, written),
    close: close.subarray(0, written),
    volume: volume.subarray(0, written),
    length: written,
    timeUnit: 'milliseconds',
  };
}

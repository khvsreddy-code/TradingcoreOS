export type ChartDataPoint = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketDataPoint = ChartDataPoint & Partial<{
  oi: number;
  bid: number;
  ask: number;
  bidVolume: number;
  askVolume: number;
  trades: number;
  session: number;
}>;

export type ChartDataRange = { from: number; to: number };
export type MarketDataField =
  | 'time'
  | 'open'
  | 'high'
  | 'low'
  | 'close'
  | 'volume'
  | 'oi'
  | 'bid'
  | 'ask'
  | 'bidVolume'
  | 'askVolume'
  | 'trades'
  | 'session';

export type MarketDataViews = Readonly<{
  time: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
  oi: Float64Array;
  bid: Float64Array;
  ask: Float64Array;
  bidVolume: Float64Array;
  askVolume: Float64Array;
  trades: Float64Array;
  session: Float64Array;
}>;

/**
 * Canonical columnar market-data plane.
 *
 * Hot-path consumers should use typed-array views. Object materialization via
 * get()/toArray() exists only as an explicit compatibility boundary for APIs
 * that still require ordinary JavaScript objects (for example renderer adapters that require ordinary JavaScript rows).
 */
export class MarketDataStore {
  private readonly _timelineKey: string;
  private _metadata: Readonly<Record<string, string | number | boolean>> = {};
  protected _time = new Float64Array(0);
  protected _open = new Float64Array(0);
  protected _high = new Float64Array(0);
  protected _low = new Float64Array(0);
  protected _close = new Float64Array(0);
  protected _volume = new Float64Array(0);
  protected _oi = new Float64Array(0);
  protected _bid = new Float64Array(0);
  protected _ask = new Float64Array(0);
  protected _bidVolume = new Float64Array(0);
  protected _askVolume = new Float64Array(0);
  protected _trades = new Float64Array(0);
  protected _session = new Float64Array(0);
  protected _length = 0;
  protected _revision = 0;
  protected _dirtyFrom = 0;
  protected _dirtyTo = 0;
  private capacity = 0;

  constructor(timelineKey = 'chart') {
    this._timelineKey = String(timelineKey);
  }

  get timelineKey() { return this._timelineKey; }
  get metadata() { return this._metadata; }
  setMetadata(metadata: Record<string, string | number | boolean>): void { this._metadata = Object.freeze({ ...metadata }); }

  get length() { return this._length; }
  get revision() { return this._revision; }
  get dirtyRange(): ChartDataRange { return { from: this._dirtyFrom, to: this._dirtyTo }; }

  get time() { return this._time.subarray(0, this._length); }
  get open() { return this._open.subarray(0, this._length); }
  get high() { return this._high.subarray(0, this._length); }
  get low() { return this._low.subarray(0, this._length); }
  get close() { return this._close.subarray(0, this._length); }
  get volume() { return this._volume.subarray(0, this._length); }
  get oi() { return this._oi.subarray(0, this._length); }
  get bid() { return this._bid.subarray(0, this._length); }
  get ask() { return this._ask.subarray(0, this._length); }
  get bidVolume() { return this._bidVolume.subarray(0, this._length); }
  get askVolume() { return this._askVolume.subarray(0, this._length); }
  get trades() { return this._trades.subarray(0, this._length); }
  get session() { return this._session.subarray(0, this._length); }

  /** Stable collection of zero-copy views into the current backing store. */
  views(): MarketDataViews {
    return {
      time: this.time,
      open: this.open,
      high: this.high,
      low: this.low,
      close: this.close,
      volume: this.volume,
      oi: this.oi,
      bid: this.bid,
      ask: this.ask,
      bidVolume: this.bidVolume,
      askVolume: this.askVolume,
      trades: this.trades,
      session: this.session,
    };
  }

  replace(rows: readonly MarketDataPoint[]): void {
    this.ensure(rows.length);
    for (let i = 0; i < rows.length; i++) this.write(i, rows[i]);
    this._length = rows.length;
    this.markDirty(0, this._length);
  }

  /** Replace typed OHLCV columns without materializing per-bar objects. */
  replaceColumns(columns: {
    time: ArrayLike<number>;
    open: ArrayLike<number>;
    high: ArrayLike<number>;
    low: ArrayLike<number>;
    close: ArrayLike<number>;
    volume: ArrayLike<number>;
    timeUnit?: 'milliseconds' | 'seconds';
  }, from = 0, to = columns.time.length): void {
    const count = Math.max(0, Math.min(columns.time.length, columns.open.length, columns.high.length, columns.low.length, columns.close.length, columns.volume.length));
    const start = Math.max(0, Math.min(count, Math.floor(from)));
    const end = Math.max(start, Math.min(count, Math.ceil(to)));
    const length = end - start;
    this.ensure(length);
    const multiplier = columns.timeUnit === 'seconds' ? 1 : 0.001;
    for (let i = 0; i < length; i += 1) {
      const source = start + i;
      this._time[i] = Number(columns.time[source]) * multiplier;
      this._open[i] = Number(columns.open[source]);
      this._high[i] = Number(columns.high[source]);
      this._low[i] = Number(columns.low[source]);
      this._close[i] = Number(columns.close[source]);
      const volume = Number(columns.volume[source]);
      this._volume[i] = Number.isFinite(volume) ? volume : 0;
      this._oi[i] = NaN; this._bid[i] = NaN; this._ask[i] = NaN;
      this._bidVolume[i] = NaN; this._askVolume[i] = NaN; this._trades[i] = NaN; this._session[i] = NaN;
    }
    this._length = length;
    this.markDirty(0, this._length);
  }

  /**
   * Replace OHLCV history directly from an existing broker/history object array.
   * No intermediate MarketDataPoint objects are created; the caller's rows are
   * projected straight into the canonical typed columns. This is a compatibility
   * ingress until broker adapters expose a native columnar history contract.
   */
  replaceHistoricalCandleRows(rows: readonly { timestamp: string; open: number; high: number; low: number; close: number; volume: number }[], from = 0, to = rows.length): void {
    const start = Math.max(0, Math.min(rows.length, Math.floor(from)));
    const end = Math.max(start, Math.min(rows.length, Math.ceil(to)));
    const length = end - start;
    this.ensure(length);
    for (let i = 0; i < length; i += 1) {
      const row = rows[start + i]!;
      const parsed = Date.parse(String(row.timestamp));
      this._time[i] = Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
      this._open[i] = Number(row.open);
      this._high[i] = Number(row.high);
      this._low[i] = Number(row.low);
      this._close[i] = Number(row.close);
      this._volume[i] = Number.isFinite(Number(row.volume)) ? Number(row.volume) : 0;
      this._oi[i] = NaN; this._bid[i] = NaN; this._ask[i] = NaN;
      this._bidVolume[i] = NaN; this._askVolume[i] = NaN; this._trades[i] = NaN; this._session[i] = NaN;
    }
    this._length = length;
    this.markDirty(0, this._length);
  }

  append(row: MarketDataPoint): void {
    this.ensure(this._length + 1);
    const index = this._length;
    this.write(index, row);
    this._length += 1;
    this.markDirty(index, index + 1);
  }

  updateLast(row: MarketDataPoint): void {
    if (!this._length) return this.append(row);
    const index = this._length - 1;
    this.write(index, row);
    this.markDirty(index, index + 1);
  }

  /** Explicit compatibility boundary. Hot-path renderers should avoid this. */
  get(index: number): MarketDataPoint | undefined {
    if (index < 0 || index >= this._length) return undefined;
    return {
      time: this._time[index],
      open: this._open[index],
      high: this._high[index],
      low: this._low[index],
      close: this._close[index],
      volume: this._volume[index],
      oi: this._oi[index],
      bid: this._bid[index],
      ask: this._ask[index],
      bidVolume: this._bidVolume[index],
      askVolume: this._askVolume[index],
      trades: this._trades[index],
      session: this._session[index],
    };
  }

  /** Explicit compatibility boundary; this intentionally allocates objects. */
  toArray(from = 0, to = this._length): MarketDataPoint[] {
    const start = Math.max(0, Math.floor(from));
    const end = Math.min(this._length, Math.ceil(to));
    const result = new Array<MarketDataPoint>(Math.max(0, end - start));
    for (let i = start; i < end; i++) result[i - start] = this.get(i)!;
    return result;
  }

  clear(): void {
    this._length = 0;
    this.markDirty(0, 0);
  }

  protected markDirty(from: number, to: number): void {
    this._dirtyFrom = Math.max(0, Math.floor(from));
    this._dirtyTo = Math.max(this._dirtyFrom, Math.min(this._length, Math.ceil(to)));
    this._revision += 1;
  }

  protected ensure(size: number): void {
    if (size <= this.capacity) return;
    let next = Math.max(256, this.capacity || 256);
    while (next < size) next *= 2;
    const arrays = [
      this._time, this._open, this._high, this._low, this._close, this._volume,
      this._oi, this._bid, this._ask, this._bidVolume, this._askVolume, this._trades, this._session,
    ];
    const replacements = arrays.map(previous => {
      const nextArray = new Float64Array(next);
      nextArray.set(previous.subarray(0, this._length));
      return nextArray;
    });
    [
      this._time, this._open, this._high, this._low, this._close, this._volume,
      this._oi, this._bid, this._ask, this._bidVolume, this._askVolume, this._trades, this._session,
    ] = replacements as [
      Float64Array, Float64Array, Float64Array, Float64Array, Float64Array, Float64Array,
      Float64Array, Float64Array, Float64Array, Float64Array, Float64Array, Float64Array, Float64Array,
    ];
    this.capacity = next;
  }

  private write(index: number, row: MarketDataPoint): void {
    this._time[index] = row.time;
    this._open[index] = row.open;
    this._high[index] = row.high;
    this._low[index] = row.low;
    this._close[index] = row.close;
    this._volume[index] = row.volume;
    this._oi[index] = row.oi ?? Number.NaN;
    this._bid[index] = row.bid ?? Number.NaN;
    this._ask[index] = row.ask ?? Number.NaN;
    this._bidVolume[index] = row.bidVolume ?? Number.NaN;
    this._askVolume[index] = row.askVolume ?? Number.NaN;
    this._trades[index] = row.trades ?? Number.NaN;
    this._session[index] = row.session ?? Number.NaN;
  }
}

/** Backward-compatible chart-facing name over the canonical market-data plane. */
export class ColumnarCandleStore extends MarketDataStore {}

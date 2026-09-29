import type { ChartViewportController } from './chartViewportController';

export type ChartTimeScaleMode = 'continuous' | 'compressed' | 'session-compressed';

export type ChartSessionCalendar = Readonly<{
  timezone: string;
  isTradingDay?: (isoDate: string) => boolean;
  sessionWindowForDate?: (isoDate: string) => Readonly<{ openMinute: number; closeMinute: number }> | null;
}>;

export type ChartTimeScaleOptions = Readonly<{
  mode?: ChartTimeScaleMode;
  timezone?: string;
  timeframe?: string;
  sessionGapBars?: number;
  calendar?: ChartSessionCalendar;
}>;

/** Timeline-only coordinate model. It never creates candle objects. */
export class ChartTimeScale {
  private _timeline = new Float64Array(0);
  private _coordinates = new Float64Array(0);
  private _mode: ChartTimeScaleMode = 'compressed';
  private _timezone = 'UTC';
  private _timeframeSeconds = 60;
  private _sessionGapBars = 1;
  private _calendar?: ChartSessionCalendar;
  private _timelineBuffer: ArrayBufferLike | null = null;
  private _previousLength = 0;

  constructor(options: ChartTimeScaleOptions = {}) { this.configure(options); }

  configure(options: ChartTimeScaleOptions): void {
    if (options.mode) this._mode = options.mode;
    if (options.timezone) this._timezone = options.timezone;
    if (options.timeframe) this._timeframeSeconds = parseTimeframeSeconds(options.timeframe);
    if (Number.isFinite(options.sessionGapBars)) this._sessionGapBars = Math.max(0, Math.floor(Number(options.sessionGapBars)));
    if (options.calendar) this._calendar = options.calendar;
    if (this._timeline.length) this.rebuildCoordinates();
  }

  bindTimeline(timeline: Float64Array): void {
    const sameBuffer = this._timelineBuffer === timeline.buffer && this._previousLength <= timeline.length;
    const previousLength = this._previousLength;
    this._timeline = timeline;
    this._timelineBuffer = timeline.buffer;
    this._previousLength = timeline.length;
    if (!sameBuffer || previousLength === 0 || previousLength > timeline.length) {
      this.rebuildCoordinates();
      return;
    }
    if (previousLength === timeline.length) return;
    this.extendCoordinates(previousLength);
  }

  get timeline(): Float64Array { return this._timeline; }
  get mode(): ChartTimeScaleMode { return this._mode; }
  get timezone(): string { return this._timezone; }
  get timeframeSeconds(): number { return this._timeframeSeconds; }

  barIndexToTime(index: number): number {
    if (!this._timeline.length) return NaN;
    const i = Math.max(0, Math.min(this._timeline.length - 1, Math.round(index)));
    return this._timeline[i];
  }

  timeToBarIndex(timestamp: number): number {
    if (!this._timeline.length || !Number.isFinite(timestamp)) return NaN;
    const right = lowerBound(this._timeline, timestamp);
    if (right <= 0) return 0;
    if (right >= this._timeline.length) return this._timeline.length - 1;
    const left = right - 1;
    if (this._timeline[right] === timestamp) return right;
    const a = this._timeline[left];
    const b = this._timeline[right];
    if (this._mode === 'continuous' || (b - a <= this._timeframeSeconds * 2)) {
      const ratio = b > a ? (timestamp - a) / (b - a) : 0;
      return left + Math.max(0, Math.min(1, ratio));
    }
    return Math.abs(timestamp - a) <= Math.abs(b - timestamp) ? left : right;
  }

  xFromTime(timestamp: number, viewport: ChartViewportController): number {
    if (!this._timeline.length) return NaN;
    const state = viewport.get();
    const first = Math.max(0, Math.min(this._timeline.length - 1, state.firstVisibleBar));
    const last = Math.max(first, Math.min(this._timeline.length - 1, state.lastVisibleBar));
    const coordinate = this.timeToDisplayCoordinate(timestamp);
    const firstCoordinate = this.displayCoordinateForBar(first);
    const lastCoordinate = this.displayCoordinateForBar(last);
    if (this._mode === 'continuous') {
      const t0 = this._timeline[first];
      const t1 = this._timeline[last];
      return t1 === t0 ? 0 : ((timestamp - t0) / (t1 - t0)) * state.pixelWidth;
    }
    const span = Math.max(Number.EPSILON, lastCoordinate - firstCoordinate);
    return ((coordinate - firstCoordinate) / span) * state.pixelWidth;
  }

  timeFromX(x: number, viewport: ChartViewportController): number {
    if (!this._timeline.length) return NaN;
    const state = viewport.get();
    const first = Math.max(0, Math.min(this._timeline.length - 1, state.firstVisibleBar));
    const last = Math.max(first, Math.min(this._timeline.length - 1, state.lastVisibleBar));
    if (this._mode === 'continuous') {
      const t0 = this._timeline[first];
      const t1 = this._timeline[last];
      return t0 + (x / Math.max(1, state.pixelWidth)) * (t1 - t0);
    }
    const firstCoordinate = this.displayCoordinateForBar(first);
    const lastCoordinate = this.displayCoordinateForBar(last);
    const coordinate = firstCoordinate + (x / Math.max(1, state.pixelWidth)) * Math.max(0, lastCoordinate - firstCoordinate);
    return this.timeFromDisplayCoordinate(coordinate);
  }

  displayCoordinateForBar(index: number): number {
    if (!this._coordinates.length) return index;
    const i = Math.max(0, Math.min(this._coordinates.length - 1, index));
    return this._coordinates[i];
  }

  snapshot() {
    return Object.freeze({ mode: this._mode, timezone: this._timezone, timeframeSeconds: this._timeframeSeconds, sessionGapBars: this._sessionGapBars, length: this._timeline.length });
  }

  private timeToDisplayCoordinate(timestamp: number): number {
    const raw = this.timeToBarIndex(timestamp);
    if (!Number.isFinite(raw) || !this._coordinates.length) return raw;
    const left = Math.floor(raw);
    const frac = raw - left;
    if (left >= this._coordinates.length - 1) return this._coordinates[this._coordinates.length - 1];
    return this._coordinates[left] + (this._coordinates[left + 1] - this._coordinates[left]) * frac;
  }

  private timeFromDisplayCoordinate(coordinate: number): number {
    if (!this._timeline.length) return NaN;
    const idx = lowerBound(this._coordinates, coordinate);
    if (idx <= 0) return this._timeline[0];
    if (idx >= this._coordinates.length) return this._timeline[this._timeline.length - 1];
    const left = idx - 1;
    const a = this._coordinates[left];
    const b = this._coordinates[idx];
    const ratio = b > a ? (coordinate - a) / (b - a) : 0;
    return this._timeline[left] + Math.max(0, Math.min(1, ratio)) * (this._timeline[idx] - this._timeline[left]);
  }

  private extendCoordinates(fromIndex: number): void {
    const out = new Float64Array(this._timeline.length);
    out.set(this._coordinates.subarray(0, Math.min(this._coordinates.length, fromIndex)));
    if (this._mode === 'continuous') {
      const first = this._timeline[0];
      const step = Math.max(1, this._timeframeSeconds);
      for (let i = fromIndex; i < this._timeline.length; i += 1) out[i] = (this._timeline[i] - first) / step;
      this._coordinates = out;
      return;
    }
    let coordinate = fromIndex > 0 ? out[fromIndex - 1] + 1 : 0;
    let previousSession = fromIndex > 0 ? this.sessionKey(this._timeline[fromIndex - 1]) : '';
    for (let i = fromIndex; i < this._timeline.length; i += 1) {
      const session = this.sessionKey(this._timeline[i]);
      if (this._mode === 'session-compressed' && i > 0 && session !== previousSession) coordinate += this._sessionGapBars;
      out[i] = coordinate;
      coordinate += 1;
      previousSession = session;
    }
    this._coordinates = out;
  }

  private rebuildCoordinates(): void {
    if (!this._timeline.length) { this._coordinates = new Float64Array(0); return; }
    const out = new Float64Array(this._timeline.length);
    if (this._mode === 'continuous') {
      const first = this._timeline[0];
      const step = Math.max(1, this._timeframeSeconds);
      for (let i = 0; i < this._timeline.length; i += 1) out[i] = (this._timeline[i] - first) / step;
      this._coordinates = out;
      return;
    }
    let coordinate = 0;
    let previousSession = '';
    for (let i = 0; i < this._timeline.length; i += 1) {
      const session = this.sessionKey(this._timeline[i]);
      if (this._mode === 'session-compressed' && i > 0 && session !== previousSession) coordinate += this._sessionGapBars;
      out[i] = coordinate;
      coordinate += 1;
      previousSession = session;
    }
    this._coordinates = out;
  }

  private sessionKey(timestamp: number): string {
    const d = new Date(timestamp * 1000);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: this._timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const get = (kind: string) => parts.find(part => part.type === kind)?.value || '';
    const isoDate = `${get('year')}-${get('month')}-${get('day')}`;
    if (this._calendar?.isTradingDay && !this._calendar.isTradingDay(isoDate)) return `closed:${isoDate}`;
    if (this._calendar?.sessionWindowForDate && !this._calendar.sessionWindowForDate(isoDate)) return `closed:${isoDate}`;
    return isoDate;
  }
}

export function createWeekdaySessionCalendar(options: Readonly<{
  timezone: string;
  holidayDates?: readonly string[];
  openMinute?: number;
  closeMinute?: number;
}>): ChartSessionCalendar {
  const holidays = new Set(options.holidayDates || []);
  const openMinute = options.openMinute ?? 0;
  const closeMinute = options.closeMinute ?? 24 * 60 - 1;
  return Object.freeze({
    timezone: options.timezone,
    isTradingDay: (isoDate: string) => {
      if (holidays.has(isoDate)) return false;
      const weekday = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
      return weekday !== 0 && weekday !== 6;
    },
    sessionWindowForDate: (isoDate: string) => {
      if (holidays.has(isoDate)) return null;
      const weekday = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
      return weekday === 0 || weekday === 6 ? null : { openMinute, closeMinute };
    },
  });
}

function lowerBound(values: Float64Array, target: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (values[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function parseTimeframeSeconds(value: string): number {
  const text = String(value).trim().toLowerCase();
  const match = text.match(/^(\d+(?:\.\d+)?)(s|m|h|d|w)$/);
  if (!match) return 60;
  const magnitude = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : unit === 'd' ? 86400 : 604800;
  return Math.max(1, magnitude * multiplier);
}

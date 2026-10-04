import type { OHLCV } from './ohlcv';
import type { ColumnarBars, ColumnarTimeUnit } from './columnar-bars';

/**
 * Vela's bounded retained history source-of-truth.
 *
 * Storage is columnar and mutable. OHLCV objects are created only at the
 * compatibility seam instead of during every renderer update.
 */
export class ColumnarHistoryTape {
    private capacity: number;
    private _length = 0;
    private _time: Float64Array;
    private _open: Float64Array;
    private _high: Float64Array;
    private _low: Float64Array;
    private _close: Float64Array;
    private _volume: Float64Array;

    constructor(private readonly maxCapacity = 50_000, initialCapacity = 8_192) {
        this.capacity = Math.max(256, Math.min(maxCapacity, initialCapacity));
        this._time = new Float64Array(this.capacity);
        this._open = new Float64Array(this.capacity);
        this._high = new Float64Array(this.capacity);
        this._low = new Float64Array(this.capacity);
        this._close = new Float64Array(this.capacity);
        this._volume = new Float64Array(this.capacity);
        this.clear();
    }

    get length(): number { return this._length; }
    get time(): Float64Array { return this._time.subarray(0, this._length); }
    get open(): Float64Array { return this._open.subarray(0, this._length); }
    get high(): Float64Array { return this._high.subarray(0, this._length); }
    get low(): Float64Array { return this._low.subarray(0, this._length); }
    get close(): Float64Array { return this._close.subarray(0, this._length); }
    get volume(): Float64Array { return this._volume.subarray(0, this._length); }

    firstTime(): number { return this._length ? this._time[0]! : Number.NaN; }
    lastTime(): number { return this._length ? this._time[this._length - 1]! : Number.NaN; }

    at(index: number): OHLCV | null {
        if (index < 0 || index >= this._length) return null;
        return {
            time: this._time[index]!,
            open: this._open[index]!,
            high: this._high[index]!,
            low: this._low[index]!,
            close: this._close[index]!,
            volume: Number.isFinite(this._volume[index]!) ? this._volume[index]! : undefined,
        };
    }

    private ensureCapacity(required: number): void {
        const next = Math.min(this.maxCapacity, Math.max(required, this.capacity * 2));
        if (next <= this.capacity) return;
        const grow = (source: Float64Array): Float64Array => {
            const out = new Float64Array(next);
            out.set(source.subarray(0, this._length));
            return out;
        };
        this._time = grow(this._time);
        this._open = grow(this._open);
        this._high = grow(this._high);
        this._low = grow(this._low);
        this._close = grow(this._close);
        this._volume = grow(this._volume);
        this.capacity = next;
    }

    clear(): void {
        this._length = 0;
        this._volume.fill(Number.NaN);
    }

    replaceColumns(columns: ColumnarBars): void {
        const n = Math.max(0, Math.min(
            this.maxCapacity,
            columns.length,
            columns.time.length,
            columns.open.length,
            columns.high.length,
            columns.low.length,
            columns.close.length,
            columns.volume.length,
        ));
        this.ensureCapacity(Math.max(256, n));
        const start = Math.max(0, columns.length - n);
        const factor = (columns.timeUnit ?? 'milliseconds') === 'seconds' ? 1000 : 1;
        for (let i = 0; i < n; i += 1) {
            const source = start + i;
            this._time[i] = Number(columns.time[source]) * factor;
            this._open[i] = Number(columns.open[source]);
            this._high[i] = Number(columns.high[source]);
            this._low[i] = Number(columns.low[source]);
            this._close[i] = Number(columns.close[source]);
            const volume = Number(columns.volume[source]);
            this._volume[i] = Number.isFinite(volume) ? volume : Number.NaN;
        }
        this._length = n;
    }

    replaceRows(rows: readonly OHLCV[]): void {
        const n = Math.max(0, Math.min(this.maxCapacity, rows.length));
        this.ensureCapacity(Math.max(256, n));
        const start = Math.max(0, rows.length - n);
        for (let i = 0; i < n; i += 1) this.writeRow(i, rows[start + i]!);
        this._length = n;
    }

    prependRows(rows: readonly OHLCV[]): number {
        if (!rows.length) return 0;
        const first = this.firstTime();
        const older = Number.isFinite(first) ? rows.filter((row) => Number(row.time) < first) : [...rows];
        if (!older.length) return 0;
        const keepOlder = Math.min(older.length, this.maxCapacity - this._length);
        const startOlder = older.length - keepOlder;
        const nextLength = keepOlder + this._length;
        this.ensureCapacity(Math.max(256, nextLength));
        if (this._length > 0) {
            this._time.copyWithin(keepOlder, 0, this._length);
            this._open.copyWithin(keepOlder, 0, this._length);
            this._high.copyWithin(keepOlder, 0, this._length);
            this._low.copyWithin(keepOlder, 0, this._length);
            this._close.copyWithin(keepOlder, 0, this._length);
            this._volume.copyWithin(keepOlder, 0, this._length);
        }
        for (let i = 0; i < keepOlder; i += 1) this.writeRow(i, older[startOlder + i]!);
        this._length = nextLength;
        return keepOlder;
    }

    /**
     * Prepend an ordered columnar history page without materializing OHLCV objects.
     * Only values strictly older than the retained head are accepted, preserving the
     * exact backfill boundary and allowing the caller to hand the same columns to a
     * native renderer.
     */
    prependColumns(columns: ColumnarBars): number {
        const available = Math.max(0, Math.min(
            columns.length,
            columns.time.length,
            columns.open.length,
            columns.high.length,
            columns.low.length,
            columns.close.length,
            columns.volume.length,
        ));
        if (!available) return 0;
        const factor = (columns.timeUnit ?? 'milliseconds') === 'seconds' ? 1000 : 1;
        const first = this.firstTime();
        let olderCount = available;
        if (Number.isFinite(first)) {
            olderCount = 0;
            while (olderCount < available && Number(columns.time[olderCount]) * factor < first) olderCount += 1;
        }
        if (!olderCount) return 0;
        const keepOlder = Math.min(olderCount, this.maxCapacity - this._length);
        if (keepOlder <= 0) return 0;
        const sourceStart = olderCount - keepOlder;
        this.ensureCapacity(Math.max(256, keepOlder + this._length));
        if (this._length > 0) {
            this._time.copyWithin(keepOlder, 0, this._length);
            this._open.copyWithin(keepOlder, 0, this._length);
            this._high.copyWithin(keepOlder, 0, this._length);
            this._low.copyWithin(keepOlder, 0, this._length);
            this._close.copyWithin(keepOlder, 0, this._length);
            this._volume.copyWithin(keepOlder, 0, this._length);
        }
        for (let i = 0; i < keepOlder; i += 1) {
            const source = sourceStart + i;
            this._time[i] = Number(columns.time[source]) * factor;
            this._open[i] = Number(columns.open[source]);
            this._high[i] = Number(columns.high[source]);
            this._low[i] = Number(columns.low[source]);
            this._close[i] = Number(columns.close[source]);
            const volume = Number(columns.volume[source]);
            this._volume[i] = Number.isFinite(volume) ? volume : Number.NaN;
        }
        this._length += keepOlder;
        return keepOlder;
    }

    appendValues(time: number, open: number, high: number, low: number, close: number, volume?: number): void {
        if (this._length >= this.maxCapacity) this.dropOldest(1);
        else this.ensureCapacity(this._length + 1);
        this.writeValues(this._length, time, open, high, low, close, volume);
        this._length += 1;
    }

    replaceLastValues(time: number, open: number, high: number, low: number, close: number, volume?: number): void {
        if (!this._length) {
            this.appendValues(time, open, high, low, close, volume);
            return;
        }
        this.writeValues(this._length - 1, time, open, high, low, close, volume);
    }

    trimTo(length: number): void {
        const target = Math.max(0, Math.min(this._length, Math.floor(length)));
        if (target === this._length) return;
        const start = this._length - target;
        this._time.copyWithin(0, start, this._length);
        this._open.copyWithin(0, start, this._length);
        this._high.copyWithin(0, start, this._length);
        this._low.copyWithin(0, start, this._length);
        this._close.copyWithin(0, start, this._length);
        this._volume.copyWithin(0, start, this._length);
        this._length = target;
    }

    dropOldest(count: number): void {
        const amount = Math.max(0, Math.min(this._length, Math.floor(count)));
        if (amount) this.trimTo(this._length - amount);
    }

    snapshotColumns(timeUnit: ColumnarTimeUnit = 'milliseconds'): ColumnarBars {
        if (timeUnit === 'milliseconds') {
            return {
                time: this.time,
                open: this.open,
                high: this.high,
                low: this.low,
                close: this.close,
                volume: this.volume,
                length: this._length,
                timeUnit,
            };
        }
        const time = new Float64Array(this._length);
        for (let i = 0; i < this._length; i += 1) time[i] = this._time[i]! / 1000;
        return {
            time,
            open: this.open,
            high: this.high,
            low: this.low,
            close: this.close,
            volume: this.volume,
            length: this._length,
            timeUnit,
        };
    }

    toOHLCV(): OHLCV[] {
        return this.toOHLCVRange(0, this._length);
    }

    toOHLCVRange(from = 0, to = this._length): OHLCV[] {
        const start = Math.max(0, Math.min(this._length, Math.floor(from)));
        const end = Math.max(start, Math.min(this._length, Math.ceil(to)));
        const out = new Array<OHLCV>(end - start);
        for (let i = start; i < end; i += 1) {
            out[i - start] = {
                time: this._time[i]!,
                open: this._open[i]!,
                high: this._high[i]!,
                low: this._low[i]!,
                close: this._close[i]!,
                volume: Number.isFinite(this._volume[i]!) ? this._volume[i]! : undefined,
            };
        }
        return out;
    }

    private writeRow(index: number, row: OHLCV): void {
        this.writeValues(index, row.time, row.open, row.high, row.low, row.close, row.volume);
    }

    private writeValues(index: number, time: number, open: number, high: number, low: number, close: number, volume?: number): void {
        this._time[index] = Number(time);
        this._open[index] = Number(open);
        this._high[index] = Number(high);
        this._low[index] = Number(low);
        this._close[index] = Number(close);
        this._volume[index] = Number.isFinite(Number(volume)) ? Number(volume) : Number.NaN;
    }
}

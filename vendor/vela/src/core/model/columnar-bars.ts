/**
 * Numeric OHLCV transport understood by the native renderer.
 *
 * The arrays are intentionally retained as typed views rather than converted to
 * OHLCV objects. `timeUnit` makes the seam explicit because TradingCoreOS keeps
 * canonical market time in epoch seconds while Vela's public OHLCV model uses ms.
 */
export type ColumnarTimeUnit = 'seconds' | 'milliseconds';

export interface ColumnarBars {
    readonly time: Float64Array;
    readonly open: Float64Array;
    readonly high: Float64Array;
    readonly low: Float64Array;
    readonly close: Float64Array;
    readonly volume: Float64Array;
    readonly length: number;
    readonly timeUnit?: ColumnarTimeUnit;
}

/** One forming-bar update. Kept scalar so callers do not need a one-element OHLCV array.
 * `sequence` is the canonical mutation revision; consumers must treat gaps as a
 * reconciliation request rather than silently applying out-of-order market state.
 */
export interface ColumnarBarUpdate {
    readonly time: number;
    readonly open: number;
    readonly high: number;
    readonly low: number;
    readonly close: number;
    readonly volume?: number;
    readonly timeUnit?: ColumnarTimeUnit;
    readonly sequence?: number;
    readonly timelineKey?: string;
}

export interface ColumnarLodIndex {
    readonly from: Uint32Array;
    readonly to: Uint32Array;
    readonly time: Float64Array;
    readonly open: Float64Array;
    readonly high: Float64Array;
    readonly low: Float64Array;
    readonly close: Float64Array;
    readonly volume: Float64Array;
    readonly count: number;
    readonly sourceRevision?: number;
    readonly sourceLength?: number;
    readonly timeUnit?: ColumnarTimeUnit;
}

export function columnarTimeToMillis(value: number, unit: ColumnarTimeUnit = 'milliseconds'): number {
    return unit === 'seconds' ? value * 1000 : value;
}

export function columnarTimeAt(columns: ColumnarBars, index: number): number {
    const raw = columns.time[index];
    return raw == null ? Number.NaN : columnarTimeToMillis(raw, columns.timeUnit);
}
export function columnarOpenAt(columns: ColumnarBars, index: number): number { return columns.open[index] ?? Number.NaN; }
export function columnarHighAt(columns: ColumnarBars, index: number): number { return columns.high[index] ?? Number.NaN; }
export function columnarLowAt(columns: ColumnarBars, index: number): number { return columns.low[index] ?? Number.NaN; }
export function columnarCloseAt(columns: ColumnarBars, index: number): number { return columns.close[index] ?? Number.NaN; }
export function columnarVolumeAt(columns: ColumnarBars, index: number): number { return columns.volume[index] ?? Number.NaN; }


export interface MutableColumnarBars extends ColumnarBars {
    time: Float64Array;
    open: Float64Array;
    high: Float64Array;
    low: Float64Array;
    close: Float64Array;
    volume: Float64Array;
    length: number;
    capacity: number;
}

export function createMutableColumnarBars(source: ColumnarBars): MutableColumnarBars {
    const n = Math.max(0, Math.min(source.length, source.time.length, source.open.length, source.high.length, source.low.length, source.close.length, source.volume.length));
    let capacity = Math.max(256, n || 1);
    while (capacity < n) capacity *= 2;
    const make = (v: Float64Array): Float64Array => { const out = new Float64Array(capacity); out.set(v.subarray(0, n)); return out; };
    return {
        time: make(source.time), open: make(source.open), high: make(source.high), low: make(source.low), close: make(source.close), volume: make(source.volume),
        length: n, capacity, timeUnit: source.timeUnit,
    };
}

export function appendColumnarBar(store: MutableColumnarBars, time: number, open: number, high: number, low: number, close: number, volume?: number): { time: number } {
    if (store.length >= store.capacity) {
        let next = Math.max(256, store.capacity * 2);
        while (next <= store.length) next *= 2;
        const grow = (v: Float64Array): Float64Array => { const out = new Float64Array(next); out.set(v.subarray(0, store.length)); return out; };
        store.time = grow(store.time); store.open = grow(store.open); store.high = grow(store.high); store.low = grow(store.low); store.close = grow(store.close); store.volume = grow(store.volume);
        store.capacity = next;
    }
    const i = store.length;
    store.time[i] = time; store.open[i] = open; store.high[i] = high; store.low[i] = low; store.close[i] = close; store.volume[i] = Number.isFinite(volume ?? Number.NaN) ? volume! : Number.NaN;
    store.length += 1;
    return { time };
}

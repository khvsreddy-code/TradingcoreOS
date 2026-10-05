import type { HistoricalCandle } from './types';

export interface CoreSpiritColumnarBars {
  readonly time: Float64Array;
  readonly open: Float64Array;
  readonly high: Float64Array;
  readonly low: Float64Array;
  readonly close: Float64Array;
  readonly volume: Float64Array;
  readonly length: number;
  readonly timeUnit?: 'seconds' | 'milliseconds';
}

export class CoreSpiritColumnarHistory {
  private _length = 0;
  private capacity = 0;
  private _time = new Float64Array(0);
  private _open = new Float64Array(0);
  private _high = new Float64Array(0);
  private _low = new Float64Array(0);
  private _close = new Float64Array(0);
  private _volume = new Float64Array(0);

  get length(): number { return this._length; }
  get time(): Float64Array { return this._time.subarray(0, this._length); }
  get open(): Float64Array { return this._open.subarray(0, this._length); }
  get high(): Float64Array { return this._high.subarray(0, this._length); }
  get low(): Float64Array { return this._low.subarray(0, this._length); }
  get close(): Float64Array { return this._close.subarray(0, this._length); }
  get volume(): Float64Array { return this._volume.subarray(0, this._length); }

  clear(): void { this._length = 0; }

  replaceRows(rows: readonly HistoricalCandle[]): void {
    this.ensure(rows.length);
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      this.write(i, Number(row.timestamp), row.open, row.high, row.low, row.close, row.volume);
    }
    this._length = rows.length;
  }

  replaceColumns(columns: CoreSpiritColumnarBars): void {
    const n = Math.max(0, Math.min(columns.length, columns.time.length, columns.open.length, columns.high.length, columns.low.length, columns.close.length, columns.volume.length));
    this.ensure(n);
    const factor = columns.timeUnit === 'seconds' ? 1 : 0.001;
    for (let i = 0; i < n; i += 1) this.write(i, Number(columns.time[i]) * factor, columns.open[i]!, columns.high[i]!, columns.low[i]!, columns.close[i]!, columns.volume[i]!);
    this._length = n;
  }

  append(bar: HistoricalCandle): void { this.appendValues(this.timeFrom(bar.timestamp), bar.open, bar.high, bar.low, bar.close, bar.volume); }
  appendValues(time: number, open: number, high: number, low: number, close: number, volume: number): void {
    this.ensure(this._length + 1);
    this.write(this._length, time, open, high, low, close, volume);
    this._length += 1;
  }
  replaceLast(bar: HistoricalCandle): void {
    if (!this._length) { this.append(bar); return; }
    this.write(this._length - 1, this.timeFrom(bar.timestamp), bar.open, bar.high, bar.low, bar.close, bar.volume);
  }
  valueAt(name: string, index: number): number | null {
    if (index < 0 || index >= this._length) return null;
    const value = name === 'time' ? this._time[index] : name === 'open' ? this._open[index] : name === 'high' ? this._high[index] : name === 'low' ? this._low[index] : name === 'close' ? this._close[index] : name === 'volume' ? this._volume[index] : Number.NaN;
    return Number.isFinite(value) ? value : null;
  }
  snapshot(): CoreSpiritColumnarBars {
    return { time:this.time, open:this.open, high:this.high, low:this.low, close:this.close, volume:this.volume, length:this._length, timeUnit:'seconds' };
  }

  private ensure(size: number): void {
    if (size <= this.capacity) return;
    let next = Math.max(256, this.capacity || 256);
    while (next < size) next *= 2;
    const grow = (source: Float64Array): Float64Array => { const out = new Float64Array(next); out.set(source.subarray(0, this._length)); return out; };
    this._time=grow(this._time); this._open=grow(this._open); this._high=grow(this._high); this._low=grow(this._low); this._close=grow(this._close); this._volume=grow(this._volume); this.capacity=next;
  }
  private write(index:number,time:number,open:number,high:number,low:number,close:number,volume:number):void { this._time[index]=time; this._open[index]=Number(open); this._high[index]=Number(high); this._low[index]=Number(low); this._close[index]=Number(close); this._volume[index]=Number.isFinite(Number(volume))?Number(volume):Number.NaN; }
  private timeFrom(timestamp:string):number { const n=Number(timestamp); if(Number.isFinite(n))return n>1e12?n/1000:n; const parsed=Date.parse(timestamp); return Number.isFinite(parsed)?Math.floor(parsed/1000):Number.NaN; }
}

export function coreSpiritColumnarFromBars(rows: readonly HistoricalCandle[]): CoreSpiritColumnarBars {
  const time=new Float64Array(rows.length),open=new Float64Array(rows.length),high=new Float64Array(rows.length),low=new Float64Array(rows.length),close=new Float64Array(rows.length),volume=new Float64Array(rows.length);
  for(let i=0;i<rows.length;i+=1){const row=rows[i]!;const n=Number(row.timestamp);time[i]=Number.isFinite(n)?(n>1e12?n/1000:n):(Date.parse(row.timestamp)/1000);open[i]=row.open;high[i]=row.high;low[i]=row.low;close[i]=row.close;volume[i]=Number.isFinite(Number(row.volume))?Number(row.volume):Number.NaN;}
  return {time,open,high,low,close,volume,length:rows.length,timeUnit:'seconds'};
}
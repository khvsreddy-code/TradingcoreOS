import type { CoreSpiritMarketBar } from './marketData';
import type { CoreSpiritColumnarSeries } from './columnarSeries';
import { columnarSeriesLength, columnarSeriesValue } from './columnarSeries';

export type CoreSpiritSeriesField = 'open'|'high'|'low'|'close'|'volume'|'time';
export type CoreSpiritSeriesMode = 'historical'|'realtime'|'replay'|'backtest'|'historicalTick';
export type CoreSpiritSeriesRevision = { barIndex:number; timestamp:number; revision:number; confirmed:boolean };

/** Canonical bar/series cursor. All history indexing goes through this class. */
export class CoreSpiritSeriesEngine {
  private bars: CoreSpiritMarketBar[] = [];
  private revision = 0;
  private currentBarIndex = -1;
  private currentTimestamp = 0;
  private currentConfirmed = true;
  private columns: CoreSpiritColumnarSeries | undefined;

  reset(bars: CoreSpiritMarketBar[] = []) { this.columns=undefined; this.bars=[...bars]; this.revision=0; this.currentBarIndex=-1; this.currentTimestamp=0; this.currentConfirmed=true; }
  /** Bind the canonical typed tape without copying it into object bars. */
  bindColumns(columns: CoreSpiritColumnarSeries): void { this.columns=columns; this.bars=[]; this.currentBarIndex=-1; }
  get columnar() { return this.columns; }
  setBars(bars: CoreSpiritMarketBar[]) { this.columns=undefined; this.bars=[...bars]; }
  beginBar(index:number, bar:CoreSpiritMarketBar, confirmed:boolean, revision:number) {
    this.currentBarIndex=index; this.currentTimestamp=Date.parse(String(bar.timestamp)); this.currentConfirmed=confirmed; this.revision=revision;
    if (index < 0) throw new Error('invalid bar index');
  }
  getRevision(): CoreSpiritSeriesRevision { return { barIndex:this.currentBarIndex, timestamp:this.currentTimestamp, revision:this.revision, confirmed:this.currentConfirmed }; }
  get length(){ return this.columns ? columnarSeriesLength(this.columns) : this.bars.length; }
  get currentIndex(){ return this.currentBarIndex; }
  get currentBar(){ return this.bars[this.currentBarIndex]; }
  getBars(){ return this.bars; }
  replaceCurrent(bar:CoreSpiritMarketBar){ if(this.currentBarIndex>=0)this.bars[this.currentBarIndex]=bar; }

  value(field:CoreSpiritSeriesField, offset=0): number|null {
    if(!Number.isInteger(offset)||offset<0) throw new Error(`future indexing is not allowed for ${field}[${offset}]`);
    const index=this.currentBarIndex-offset;
    if(index<0) return null;
    if (this.columns) return columnarSeriesValue(this.columns, field, index);
    const bar=this.bars[index]; if(!bar)return null;
    const raw=field==='time'?Date.parse(String(bar.timestamp)):(bar as any)[field];
    const n=Number(raw); return Number.isFinite(n)?n:null;
  }

  window(field:CoreSpiritSeriesField, length:number): number[] {
    const size=Math.max(1,Math.floor(length)); const out:number[]=[];
    for(let i=0;i<size;i++){const v=this.value(field,i); if(v==null)break; out.push(v);}
    return out;
  }

  indexed(name:string, offset:number): number|null {
    if(!['open','high','low','close','volume','time'].includes(name)) return null;
    return this.value(name as CoreSpiritSeriesField,offset);
  }

  snapshot(){ return { bars:this.bars.map(x=>({...x})), revision:this.revision, currentBarIndex:this.currentBarIndex, currentTimestamp:this.currentTimestamp, currentConfirmed:this.currentConfirmed }; }
  restore(snapshot:any){ this.bars=(snapshot?.bars||[]).map((x:any)=>({...x})); this.revision=Number(snapshot?.revision||0); this.currentBarIndex=Number(snapshot?.currentBarIndex??-1); this.currentTimestamp=Number(snapshot?.currentTimestamp||0); this.currentConfirmed=Boolean(snapshot?.currentConfirmed); }
}

/**
 * CoreSpirit-owned market data contracts.
 *
 * CoreSpirit must not depend on broker adapters. Brokers, files, databases,
 * websockets and research datasets adapt into these neutral host contracts.
 */
export const CORE_SPIRIT_MARKET_DATA_VERSION = 1 as const;

export interface CoreSpiritMarketBar {
  /** Canonical CoreSpirit bar time. Vela/host adapters normalize epoch input before entering CoreSpirit. */
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Numeric-first market frame shared by workers and quant/ML feature adapters.
 * Time is Unix seconds; columns can be views directly into SharedArrayBuffer.
 */
export type CoreSpiritMarketFrame = Readonly<{
  time:Float64Array; open:Float64Array; high:Float64Array; low:Float64Array;
  close:Float64Array; volume:Float64Array; length:number; timeUnit:'seconds';
}>;
type CoreSpiritMarketColumns = Readonly<{
  time:Float64Array; open:Float64Array; high:Float64Array; low:Float64Array;
  close:Float64Array; volume:Float64Array; length:number;
  timeUnit?:'seconds'|'milliseconds';
}>;

export function emptyCoreSpiritMarketFrame():CoreSpiritMarketFrame {
  return Object.freeze({time:new Float64Array(0),open:new Float64Array(0),high:new Float64Array(0),low:new Float64Array(0),close:new Float64Array(0),volume:new Float64Array(0),length:0,timeUnit:'seconds' as const});
}

/** Wrap numeric columns without copying their underlying buffers. */
export function coreSpiritMarketFrameFromColumns(columns:CoreSpiritMarketColumns, requestedLength=columns.length):CoreSpiritMarketFrame {
  const n=Math.max(0,Math.min(Math.floor(Number.isFinite(requestedLength)?requestedLength:0),columns.length,columns.time.length,columns.open.length,columns.high.length,columns.low.length,columns.close.length,columns.volume.length));
  const time=columns.timeUnit==='milliseconds'
    ? Float64Array.from(columns.time.subarray(0,n),value=>value*0.001)
    : columns.time.subarray(0,n);
  return Object.freeze({time,open:columns.open.subarray(0,n),high:columns.high.subarray(0,n),low:columns.low.subarray(0,n),close:columns.close.subarray(0,n),volume:columns.volume.subarray(0,n),length:n,timeUnit:'seconds' as const});
}

function timestampToEpochSeconds(timestamp:string|number):number {
  const numeric=Number(timestamp);
  if(Number.isFinite(numeric))return numeric>1e12?numeric/1000:numeric;
  const parsed=Date.parse(String(timestamp));
  return Number.isFinite(parsed)?parsed/1000:Number.NaN;
}

/** Compatibility value is a snapshot; the worker never stores it once per row. */
export function coreSpiritMarketFrameBarAt(frame:CoreSpiritMarketFrame,index:number):CoreSpiritMarketBar|undefined {
  if(!Number.isInteger(index)||index<0||index>=frame.length)return undefined;
  const seconds=frame.time[index]!;
  let timestamp:string|undefined;
  return {
    get timestamp(){
      if(timestamp===undefined){const millis=seconds*1000;timestamp=Number.isFinite(millis)?new Date(millis).toISOString():'';}
      return timestamp;
    },
    open:frame.open[index]!,high:frame.high[index]!,low:frame.low[index]!,
    close:frame.close[index]!,volume:frame.volume[index]!,
  };
}

/**
 * Read-only Array facade for legacy VM code. Numeric columns remain canonical;
 * indexed access synthesizes a value snapshot and does not cache bar objects.
 */
export function coreSpiritMarketFrameArrayFacade(getFrame:()=>CoreSpiritMarketFrame):CoreSpiritMarketBar[] {
  const target:CoreSpiritMarketBar[]=[];
  const indexOf=(property:PropertyKey):number|undefined=>{
    if(typeof property!=='string'||!/^(0|[1-9][0-9]*)$/.test(property))return undefined;
    const index=Number(property);
    return Number.isSafeInteger(index)&&index<0xffff_ffff?index:undefined;
  };
  return new Proxy(target,{
    get(array,property,receiver){
      const index=indexOf(property);
      if(index!==undefined)return coreSpiritMarketFrameBarAt(getFrame(),index);
      if(property==='length')return getFrame().length;
      return Reflect.get(array,property,receiver);
    },
    has(array,property){
      const index=indexOf(property);
      if(index!==undefined)return index<getFrame().length;
      if(property==='length')return true;
      return Reflect.has(array,property);
    },
    set(){throw new TypeError('CoreSpirit market-frame facade is read-only; update numeric columns instead.');},
  });
}

/** Normalize non-shared compatibility input once into the numeric representation. */
export function coreSpiritMarketFrameFromBars(bars:readonly CoreSpiritMarketBar[]):CoreSpiritMarketFrame {
  const time=new Float64Array(bars.length),open=new Float64Array(bars.length),high=new Float64Array(bars.length),low=new Float64Array(bars.length),close=new Float64Array(bars.length),volume=new Float64Array(bars.length);
  for(let i=0;i<bars.length;i+=1){const bar=bars[i]!;time[i]=timestampToEpochSeconds(bar.timestamp);open[i]=Number(bar.open);high[i]=Number(bar.high);low[i]=Number(bar.low);close[i]=Number(bar.close);volume[i]=Number(bar.volume);}
  return coreSpiritMarketFrameFromColumns({time,open,high,low,close,volume,length:bars.length,timeUnit:'seconds'});
}

export interface CoreSpiritMarketTick {
  timestamp: number;
  price: number;
  volume?: number;
  bid?: number;
  ask?: number;
  side?: 'buy' | 'sell' | 'unknown';
}

export interface CoreSpiritMarketDataProvenance {
  provider?: string;
  source?: string;
  fetchedAt?: string;
  requestId?: string;
  checksum?: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface CoreSpiritMarketDataset {
  version: typeof CORE_SPIRIT_MARKET_DATA_VERSION;
  id: string;
  symbol: string;
  timeframe: string;
  bars: readonly CoreSpiritMarketBar[];
  source: 'broker' | 'file' | 'database' | 'research' | 'synthetic' | 'replay';
  checksum?: string;
  provenance?: CoreSpiritMarketDataProvenance;
}

export function validateCoreSpiritMarketBar(bar: CoreSpiritMarketBar): void {
  if (!bar.timestamp) throw new Error('market bar timestamp is required');
  for (const [name, value] of Object.entries(bar)) {
    if (name === 'timestamp') continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`market bar '${name}' must be finite`);
    }
  }
  if (bar.high < Math.max(bar.open, bar.close, bar.low)) throw new Error('market bar high is invalid');
  if (bar.low > Math.min(bar.open, bar.close, bar.high)) throw new Error('market bar low is invalid');
  if (bar.volume < 0) throw new Error('market bar volume cannot be negative');
}

export function normalizeCoreSpiritMarketDataset(
  dataset: Omit<CoreSpiritMarketDataset, 'version'> & { version?: typeof CORE_SPIRIT_MARKET_DATA_VERSION },
): CoreSpiritMarketDataset {
  const bars = dataset.bars.map(bar => ({ ...bar }));
  bars.forEach(validateCoreSpiritMarketBar);
  return {
    version: CORE_SPIRIT_MARKET_DATA_VERSION,
    id: dataset.id,
    symbol: dataset.symbol,
    timeframe: dataset.timeframe,
    bars,
    source: dataset.source,
    checksum: dataset.checksum,
    provenance: dataset.provenance,
  };
}

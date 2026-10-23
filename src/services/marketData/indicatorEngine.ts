import type { IndicatorAppearanceConfig } from '../coreSpirit/indicatorAppearance';
import { HistoricalCandle } from '../brokers/BrokerAdapter';
import { buildTradingCoreVStructure } from './structureEngine';
import { sma, ema, rma as wilder, trueRanges, atr, wma as weightedMovingAverage } from './coreIndicatorKernel';
import { RollingMean, RollingVariance, RollingMinMax, RollingSum, RollingAbsoluteDeviation, RollingPercentile, EMAState, centeredRollingExtrema } from './incrementalIndicatorKernel';
import { CORE_PRICE_SOURCE_OPTIONS } from '../coreSpirit/indicatorSettingsSchema';
import type { IndicatorSettingsSchema } from '../coreSpirit/indicatorSettingsSchema';

export type IndicatorKind =
  | 'EMA' | 'SMA' | 'HMA' | 'VWAP' | 'Bollinger Bands' | 'Keltner Channels' | 'Donchian Channels'
  | 'RSI' | 'MACD' | 'ATR' | 'ADX' | 'Stochastic' | 'CCI' | 'OBV' | 'MFI'
  | 'Supertrend' | 'Ichimoku Cloud' | 'Pivot Points' | 'Reversal Price' | 'CPR' | 'Key Levels' | 'Opening Range' | 'Weekly Levels' | 'Swing Levels' | 'Gap Levels' | 'Market Structure' | 'Fair Value Gaps' | 'Dynamic Support/Resistance' | 'Liquidity Sweeps' | 'Order Blocks' | 'Previous Day Levels' | 'Previous Week Levels' | 'Previous Month Levels' | 'Opening Range Pro' | 'Gap Zones' | 'Equal Highs/Lows' | 'Liquidity Pools' | 'BOS / CHOCH' | 'FVG + Mitigation' | 'Order Blocks + Mitigation' | 'Breakout / Retest' | 'Failed Breakout' | 'Rejection Candles' | 'Inside Bar Breakout' | 'Engulfing Patterns' | 'Pin Bars' | 'NR7 Volatility Contraction' | 'Developing Day High/Low' | 'VWAP Deviation Bands' | 'Anchored VWAP' | 'CPR R1-R5 / S1-S5' | 'Camarilla Pivots' | 'Fibonacci Pivots' | 'Weekly Pivots' | 'Monthly Pivots' | 'TradingCore V Price Action'
  | 'Adaptive Ehlers' | 'ATR Percentile Bands' | 'CVD Profiles' | 'Delta Sigma Heatmap'
  | 'Dual Phase Reversal' | 'Fractional EMA Kalman Filter' | 'Harmonic Lab' | 'HTF 3 Candle System'
  | 'HTF Volume Spike & Imbalance Projection' | 'Initial Balance Auction Intelligence'
  | 'LTF Volume Microburst Bubbles' | 'Market Structure Dashboard' | 'Neural Weight Oscillator'
  | 'OrderBlock AI' | 'Pivot Consolidation Zone' | 'Stoploss Cascades' | 'Trend Pressure'
  | 'Trend Target Ribbon' | 'Trinity' | 'Volatility Shock Half Life Monitor'
  | 'Volume Delta Footprint' | 'Wyckoff' ;
export type PriceSource = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' | 'hlcc4';
export type IndicatorDisplayConfig = {
  opacity?: number;
  showLegend?: boolean;
  showValues?: boolean;
  pane?: 'auto' | 'overlay' | 'separate';
  scale?: 'price' | 'percent' | 'indexed' | 'log';
  precision?: number;
};
export type IndicatorConfig = {
  id: string; kind: IndicatorKind; period?: number; fast?: number; slow?: number; signal?: number; multiplier?: number; enabled: boolean; smooth?: number; displacement?: number; lookback?: number; mtf?: number;
  source?: PriceSource; color?: string; signalColor?: string; upperColor?: string; lowerColor?: string; lineWidth?: number; lineStyle?: 0 | 1 | 2; display?: IndicatorDisplayConfig; settingsSchema?: IndicatorSettingsSchema; [key: string]: unknown;
};
export const PRICE_SOURCES: Array<{value: PriceSource; label: string}> = CORE_PRICE_SOURCE_OPTIONS as Array<{value: PriceSource; label: string}>;
export const defaultIndicatorStyle = (kind: IndicatorKind) => ({
  color: ({EMA:'#38bdf8',SMA:'#f59e0b',HMA:'#e879f9',VWAP:'#c084fc',RSI:'#f59e0b',MACD:'#38bdf8',ATR:'#22c55e',ADX:'#22c55e',CCI:'#fb7185',OBV:'#60a5fa',MFI:'#a78bfa'} as Record<string,string>)[kind] || '#94a3b8',
  lineWidth: 2 as number, lineStyle: 0 as 0 | 1 | 2,
});
export const INDICATOR_LIBRARY: Array<{ kind: IndicatorKind; description: string; overlay: boolean; defaults: Partial<IndicatorConfig> }> = [
  { kind: 'EMA', description: 'Exponential moving average for trend direction.', overlay: true, defaults: { period: 20 } },
  { kind: 'SMA', description: 'Simple moving average baseline.', overlay: true, defaults: { period: 20 } },
  { kind: 'HMA', description: 'Hull moving average for a faster, smoother trend line.', overlay: true, defaults: { period: 20 } },
  { kind: 'VWAP', description: 'Session volume-weighted average price.', overlay: true, defaults: {} },
  { kind: 'Bollinger Bands', description: 'Volatility envelope around a moving average.', overlay: true, defaults: { period: 20, multiplier: 2 } },
  { kind: 'Keltner Channels', description: 'EMA centerline with ATR-based volatility bands.', overlay: true, defaults: { period: 20, multiplier: 2 } },
  { kind: 'Donchian Channels', description: 'Rolling high/low breakout channel.', overlay: true, defaults: { period: 20 } },
  { kind: 'Supertrend', description: 'ATR-based trend direction and trailing band.', overlay: true, defaults: { period: 10, multiplier: 3 } },
  { kind: 'Ichimoku Cloud', description: 'Trend, momentum and support/resistance cloud.', overlay: true, defaults: { period: 9, slow: 26, displacement: 26 } },
  { kind: 'Pivot Points', description: 'Classic daily pivot, support and resistance levels.', overlay: true, defaults: {} },
  { kind: 'Reversal Price', description: 'Experimental five-level, prior-session pivot ladder with Trend Decide Price. Reverse-engineered approximation; not OptionMate’s verified proprietary formula.', overlay: true, defaults: {} },
  { kind: 'CPR', description: 'Indian-market Central Pivot Range with P, TC, BC and S/R.', overlay: true, defaults: {} },
  { kind: 'Key Levels', description: 'PDH, PDL, previous close, day open, weekly open and current session extremes.', overlay: true, defaults: {} },
  { kind: 'Opening Range', description: 'NSE 15-minute opening range with breakout reference levels.', overlay: true, defaults: { period: 15 } },
  { kind: 'Weekly Levels', description: 'Previous week high/low/close and current week open.', overlay: true, defaults: {} },
  { kind: 'Swing Levels', description: 'Confirmed swing highs/lows extended as price-action reference levels.', overlay: true, defaults: { period: 3 } },
  { kind: 'Gap Levels', description: 'Current-session gap from previous close with fill tracking.', overlay: true, defaults: {} },
  { kind: 'Market Structure', description: 'Swing highs/lows with BOS and CHoCH-style structure markers.', overlay: true, defaults: { period: 3 } },
  { kind: 'Fair Value Gaps', description: 'Three-candle imbalance zones with active/mitigated state.', overlay: true, defaults: { period: 1 } },
  { kind: 'Dynamic Support/Resistance', description: 'Pivot-derived adaptive support and resistance levels with touch validation.', overlay: true, defaults: { period: 5 } },
  { kind: 'Liquidity Sweeps', description: 'Swing liquidity grabs that breach a prior level and close back inside.', overlay: true, defaults: { period: 5 } },
  { kind: 'Order Blocks', description: 'Recent impulse-origin zones derived from confirmed swing/engulfing structure.', overlay: true, defaults: { period: 5 } },
  { kind: 'Previous Day Levels', description: 'Previous NSE session high, low and close.', overlay: true, defaults: {} },
  { kind: 'Previous Week Levels', description: 'Previous trading week high, low and close.', overlay: true, defaults: {} },
  { kind: 'Previous Month Levels', description: 'Previous calendar month high, low and close.', overlay: true, defaults: {} },
  { kind: 'Opening Range Pro', description: '15, 30 or 60 minute Indian-market opening range.', overlay: true, defaults: { period: 30 } },
  { kind: 'Gap Zones', description: 'Session gap-up/down zones and live gap-fill status.', overlay: true, defaults: {} },
  { kind: 'Equal Highs/Lows', description: 'Near-equal swing highs and lows that can form liquidity pools.', overlay: true, defaults: { period: 3 } },
  { kind: 'Liquidity Pools', description: 'Clustered swing levels with repeated touches.', overlay: true, defaults: { period: 5 } },
  { kind: 'BOS / CHOCH', description: 'Break of structure and change of character from confirmed swings.', overlay: true, defaults: { period: 3 } },
  { kind: 'FVG + Mitigation', description: 'Fair value gaps with live mitigation state.', overlay: true, defaults: {} },
  { kind: 'Order Blocks + Mitigation', description: 'Impulse-origin order blocks with mitigation state.', overlay: true, defaults: { period: 5 } },
  { kind: 'Breakout / Retest', description: 'Breaks of recent swing levels followed by retest detection.', overlay: true, defaults: { period: 5 } },
  { kind: 'Failed Breakout', description: 'Breakout attempts that close back through the broken level.', overlay: true, defaults: { period: 5 } },
  { kind: 'Rejection Candles', description: 'Long-wick rejection candles at meaningful price locations.', overlay: true, defaults: {} },
  { kind: 'Inside Bar Breakout', description: 'Inside-bar compression followed by range breakout.', overlay: true, defaults: {} },
  { kind: 'Engulfing Patterns', description: 'Bullish and bearish body-engulfing candle patterns.', overlay: true, defaults: {} },
  { kind: 'Pin Bars', description: 'Bullish and bearish pin-bar / hammer-style rejection candles.', overlay: true, defaults: {} },
  { kind: 'NR7 Volatility Contraction', description: 'Narrow-range-seven compression candles.', overlay: true, defaults: {} },
  { kind: 'Developing Day High/Low', description: 'Current NSE session high and low as they develop.', overlay: true, defaults: {} },
  { kind: 'VWAP Deviation Bands', description: 'Session VWAP with volume-weighted deviation bands.', overlay: true, defaults: { multiplier: 1 } },
  { kind: 'Anchored VWAP', description: 'VWAP anchored from the latest confirmed swing point.', overlay: true, defaults: { period: 5 } },
  { kind: 'CPR R1-R5 / S1-S5', description: 'Extended Indian CPR with R1-R5 and S1-S5.', overlay: true, defaults: {} },
  { kind: 'Camarilla Pivots', description: 'Camarilla intraday support/resistance levels.', overlay: true, defaults: {} },
  { kind: 'Fibonacci Pivots', description: 'Fibonacci-derived pivot support and resistance.', overlay: true, defaults: {} },
  { kind: 'Weekly Pivots', description: 'Weekly pivot with support/resistance levels.', overlay: true, defaults: {} },
  { kind: 'Monthly Pivots', description: 'Monthly pivot with support/resistance levels.', overlay: true, defaults: {} },
  { kind: 'TradingCore V Price Action', description: 'Quantitative price-action engine: fractal + volume-weighted KDE S/R, ATR impulse Supply/Demand zones, mitigation, DBSCAN-style clustering and multi-timeframe confluence.', overlay: true, defaults: { period: 5, multiplier: 2, lookback: 200, mtf: 3 } },
  { kind: 'Adaptive Ehlers', description: 'Adaptive Ehlers-style low-lag trend filter using cycle-sensitive smoothing.', overlay: true, defaults: { period: 20 } },
  { kind: 'ATR Percentile Bands', description: 'ATR percentile volatility envelope around price.', overlay: true, defaults: { period: 14, multiplier: 2 } },
  { kind: 'CVD Profiles', description: 'Cumulative volume-delta profile approximation from candle direction and volume.', overlay: true, defaults: { period: 20 } },
  { kind: 'Delta Sigma Heatmap', description: 'Standardized candle delta/volume pressure mapped to the price chart.', overlay: true, defaults: { period: 20 } },
  { kind: 'Dual Phase Reversal', description: 'Two-phase momentum exhaustion and reversal detector.', overlay: true, defaults: { period: 14 } },
  { kind: 'Fractional EMA Kalman Filter', description: 'Low-noise adaptive price filter combining fractional smoothing and Kalman-style updating.', overlay: true, defaults: { period: 20 } },
  { kind: 'Harmonic Lab', description: 'Swing-ratio harmonic pattern scanner with pivot legs and projected reaction zones.', overlay: true, defaults: { period: 5 } },
  { kind: 'HTF 3 Candle System', description: 'Higher-timeframe three-candle structure and range projection.', overlay: true, defaults: { period: 3 } },
  { kind: 'HTF Volume Spike & Imbalance Projection', description: 'Higher-timeframe volume-spike detection and directional imbalance projection.', overlay: true, defaults: { period: 20, multiplier: 2 } },
  { kind: 'Initial Balance Auction Intelligence', description: 'Initial-balance range, extensions and auction breakout state.', overlay: true, defaults: { period: 60, multiplier: 1 } },
  { kind: 'LTF Volume Microburst Bubbles', description: 'Short-term volume microbursts with price-location markers.', overlay: true, defaults: { period: 20, multiplier: 2 } },
  { kind: 'Market Structure Dashboard', description: 'Swing structure, trend state, BOS/CHOCH and range boundaries.', overlay: true, defaults: { period: 5 } },
  { kind: 'Neural Weight Oscillator', description: 'Feature-weighted nonlinear momentum oscillator mapped to price pivots.', overlay: true, defaults: { period: 20 } },
  { kind: 'OrderBlock AI', description: 'Impulse-origin order blocks with volume and displacement scoring.', overlay: true, defaults: { period: 5, multiplier: 2 } },
  { kind: 'Pivot Consolidation Zone', description: 'Pivot clustering and consolidation-zone detection.', overlay: true, defaults: { period: 5 } },
  { kind: 'Stoploss Cascades', description: 'Breakout/stop-run cascade detector using range expansion and failed levels.', overlay: true, defaults: { period: 20, multiplier: 2 } },
  { kind: 'Trend Pressure', description: 'Directional trend-pressure score from price, range and volume.', overlay: true, defaults: { period: 14 } },
  { kind: 'Trend Target Ribbon', description: 'Multi-speed trend ribbon with volatility-adjusted target bands.', overlay: true, defaults: { period: 20, multiplier: 2 } },
  { kind: 'Trinity', description: 'Three-factor trend, momentum and volatility confluence overlay.', overlay: true, defaults: { period: 14 } },
  { kind: 'Volatility Shock Half Life Monitor', description: 'Volatility shock and decay monitor using rolling realized volatility.', overlay: true, defaults: { period: 20 } },
  { kind: 'Volume Delta Footprint', description: 'Candle-level buy/sell volume-delta approximation with imbalance markers.', overlay: true, defaults: { period: 20 } },
  { kind: 'Wyckoff', description: 'Volume/price Wyckoff-style accumulation, distribution and spring/upthrust markers.', overlay: true, defaults: { period: 20 } },
  { kind: 'RSI', description: 'Wilder momentum oscillator from 0 to 100.', overlay: false, defaults: { period: 14 } },
  { kind: 'MACD', description: 'Trend momentum using fast, slow and signal averages.', overlay: false, defaults: { fast: 12, slow: 26, signal: 9 } },
  { kind: 'ATR', description: 'Average true range for volatility.', overlay: false, defaults: { period: 14 } },
  { kind: 'ADX', description: 'Trend strength with directional movement.', overlay: false, defaults: { period: 14 } },
  { kind: 'Stochastic', description: 'Fast/slow stochastic momentum oscillator.', overlay: false, defaults: { period: 14, smooth: 3, signal: 3 } },
  { kind: 'CCI', description: 'Commodity Channel Index for momentum extremes.', overlay: false, defaults: { period: 20 } },
  { kind: 'OBV', description: 'On-balance volume accumulation/distribution line.', overlay: false, defaults: {} },
  { kind: 'MFI', description: 'Money Flow Index combining price and volume.', overlay: false, defaults: { period: 14 } },
];

export type IndicatorPoint = { time: number; value: number };
export type BollingerPoint = { time: number; middle: number; upper: number; lower: number };
export type ChannelPoint = { time: number; middle?: number; upper: number; lower: number };
export type MacdPoint = { time: number; macd: number; signal: number; histogram: number };
export type StochasticPoint = { time: number; k: number; d: number };
export type IchimokuPoint = { time: number; tenkan: number; kijun: number; spanA: number; spanB: number };
export type SupertrendPoint = { time: number; value: number; direction: 1 | -1 };

export type ZonePoint = { time:number; upper:number; lower:number; kind:'bullish'|'bearish' };
export type SRPoint = { time:number; price:number; side:'support'|'resistance' };
const indiaDate = (timestamp:string|number): string => new Date(timestamp).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'});

const times = (c: HistoricalCandle[]) => c.map(x => Math.floor(new Date(x.timestamp).getTime() / 1000));
const closeValues = (c: HistoricalCandle[]) => c.map(x => x.close);
export const sourceValues = (c: HistoricalCandle[], source: PriceSource = 'close') => c.map(x => {
  if (source === 'open') return x.open;
  if (source === 'high') return x.high;
  if (source === 'low') return x.low;
  if (source === 'hl2') return (x.high + x.low) / 2;
  if (source === 'hlc3') return (x.high + x.low + x.close) / 3;
  if (source === 'ohlc4') return (x.open + x.high + x.low + x.close) / 4;
  if (source === 'hlcc4') return (x.high + x.low + x.close + x.close) / 4;
  return x.close;
});
const typicalValues = (c: HistoricalCandle[]) => sourceValues(c, 'hlc3');
function pointSeries(candles: HistoricalCandle[], raw:Array<number|null>) { const t=times(candles); return raw.map((v,i)=>v==null?null:{time:t[i],value:v}).filter(Boolean) as IndicatorPoint[]; }

export function series(candles: HistoricalCandle[], kind: IndicatorKind, cfg: IndicatorConfig): IndicatorPoint[] {
  const vals=sourceValues(candles, cfg.source || 'close'); const p=cfg.period||20;
  if(kind==='EMA')return pointSeries(candles,ema(vals,p));
  if(kind==='SMA')return pointSeries(candles,sma(vals,p));
  if(kind==='HMA')return pointSeries(candles,hma(vals,p));
  if(kind==='ATR')return pointSeries(candles,atr(candles,p));
  if(kind==='RSI')return rsi(candles,p,cfg.source||'close');
  if(kind==='ADX')return pointSeries(candles,adx(candles,p));
  if(kind==='CCI')return pointSeries(candles,cci(candles,p,cfg.source||'hlc3'));
  if(kind==='OBV')return obv(candles,cfg.source||'close');
  if(kind==='MFI')return mfi(candles,p,cfg.source||'hlc3');
  return [];
}

export function vwap(candles: HistoricalCandle[], source: PriceSource = 'hlc3'): IndicatorPoint[] { const vals=sourceValues(candles,source),map=new Map<string,{pv:number;vol:number}>(); return candles.map((c,i)=>{ const key=new Date(c.timestamp).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}); const b=map.get(key)||{pv:0,vol:0}; const vol=Math.max(0,c.volume||0); b.pv+=vals[i]*vol; b.vol+=vol; map.set(key,b); return {time:Math.floor(new Date(c.timestamp).getTime()/1000),value:b.vol?b.pv/b.vol:c.close}; }); }
export function bollinger(c: HistoricalCandle[], period=20, multiplier=2, source: PriceSource = 'close'): BollingerPoint[] { const vals=sourceValues(c,source),mean=new RollingMean(period),variance=new RollingVariance(period),out:BollingerPoint[]=[]; vals.forEach((v,i)=>{mean.update(v);variance.update(v);const m=mean.value(),sd=variance.value();if(m==null||sd==null)return;out.push({time:Math.floor(new Date(c[i].timestamp).getTime()/1000),middle:m,upper:m+multiplier*sd,lower:m-multiplier*sd});});return out; }
export function keltner(c: HistoricalCandle[], period=20, multiplier=2, source: PriceSource = 'close'): ChannelPoint[] { const mid=ema(sourceValues(c, source),period), a=atr(c,period); return c.map((x,i)=>mid[i]==null||a[i]==null?null:{time:Math.floor(new Date(x.timestamp).getTime()/1000),middle:mid[i]!,upper:mid[i]!+multiplier*a[i]!,lower:mid[i]!-multiplier*a[i]!}).filter(Boolean) as ChannelPoint[]; }
export function donchian(c: HistoricalCandle[], period=20): ChannelPoint[] { const high=new RollingMinMax(period),low=new RollingMinMax(period),out:ChannelPoint[]=[];c.forEach((x,i)=>{const hi=high.update(x.high).max,lo=low.update(x.low).min;if(hi==null||lo==null)return;out.push({time:Math.floor(new Date(x.timestamp).getTime()/1000),middle:(hi+lo)/2,upper:hi,lower:lo});});return out; }
export function rsi(c: HistoricalCandle[], period=14, source: PriceSource = 'close'): IndicatorPoint[] { const vals=sourceValues(c, source), p=Math.max(1,Math.floor(period)); if(vals.length<=p)return []; let gains=0,losses=0; for(let i=1;i<=p;i++){const d=vals[i]-vals[i-1]; if(d>0)gains+=d;else losses-=d;} let avgG=gains/p,avgL=losses/p; const out:IndicatorPoint[]=[]; for(let i=p;i<vals.length;i++){ if(i>p){const d=vals[i]-vals[i-1]; avgG=(avgG*(p-1)+Math.max(d,0))/p; avgL=(avgL*(p-1)+Math.max(-d,0))/p;} const value=avgL===0?(avgG===0?50:100):100-(100/(1+avgG/avgL)); out.push({time:Math.floor(new Date(c[i].timestamp).getTime()/1000),value}); } return out; }
export function macd(c: HistoricalCandle[], fast=12, slow=26, signal=9, source: PriceSource = 'close'): MacdPoint[] { const vals=sourceValues(c, source); const ef=ema(vals,fast), es=ema(vals,slow); const macdVals=vals.map((_,i)=>ef[i]!=null&&es[i]!=null?(ef[i] as number)-(es[i] as number):null); const valid=macdVals.map((v,i)=>v==null?null:{v,i}).filter(Boolean) as Array<{v:number;i:number}>; const sig=ema(valid.map(x=>x.v),signal); return valid.map((x,j)=>sig[j]==null?null:{time:Math.floor(new Date(c[x.i].timestamp).getTime()/1000),macd:x.v,signal:sig[j] as number,histogram:x.v-(sig[j] as number)}).filter(Boolean) as MacdPoint[]; }
export function stochastic(c: HistoricalCandle[], period=14, smooth=3, signal=3, source: PriceSource = 'close'): StochasticPoint[] { const src=sourceValues(c,source),p=Math.max(1,Math.floor(period)),s=Math.max(1,Math.floor(smooth)),sig=Math.max(1,Math.floor(signal)),high=new RollingMinMax(p),low=new RollingMinMax(p),ks=new RollingMean(s),signalState=new EMAState(sig),out:StochasticPoint[]=[];src.forEach((value,i)=>{const hi=high.update(c[i].high).max,lo=low.update(c[i].low).min;if(hi==null||lo==null)return;const raw=hi===lo?50:100*(value-lo)/(hi-lo);const k=ks.update(raw).value;if(k==null)return;const d=signalState.update(k);if(d!=null)out.push({time:Math.floor(new Date(c[i].timestamp).getTime()/1000),k,d});});return out; }
export function cci(c: HistoricalCandle[], period=20, source: PriceSource = 'hlc3'): Array<number|null> { const tp=sourceValues(c,source),mean=new RollingMean(period),dev=new RollingAbsoluteDeviation(period),out:Array<number|null>=[];for(let i=0;i<tp.length;i++){mean.update(tp[i]);dev.update(tp[i]);const m=mean.value(),d=dev.value(m);out.push(m==null||d==null?null:(d===0?0:(tp[i]-m)/(0.015*d)));}return out; }
export function obv(c: HistoricalCandle[], source: PriceSource = 'close'): IndicatorPoint[] { const vals=sourceValues(c, source); let value=0; return c.map((x,i)=>{if(i>0){if(vals[i]>vals[i-1])value+=x.volume||0;else if(vals[i]<vals[i-1])value-=x.volume||0;}return {time:Math.floor(new Date(x.timestamp).getTime()/1000),value};}); }
export function mfi(c: HistoricalCandle[], period=14, source: PriceSource = 'hlc3'): IndicatorPoint[] { const tp=sourceValues(c,source),p=Math.max(1,Math.floor(period)),pos=new RollingSum(p),neg=new RollingSum(p),out:IndicatorPoint[]=[];for(let i=0;i<tp.length;i++){if(i===0)continue;const flow=tp[i]*(c[i].volume||0);pos.update(tp[i]>tp[i-1]?flow:0);neg.update(tp[i]<tp[i-1]?flow:0);if(pos.size!==p||neg.size!==p)continue;const pv=pos.sumValue(),nv=neg.sumValue(),value=nv===0?(pv===0?50:100):100-(100/(1+pv/nv));out.push({time:Math.floor(new Date(c[i].timestamp).getTime()/1000),value});}return out; }
export function adx(c: HistoricalCandle[], period=14): Array<number|null> { if(c.length<period*2)return c.map(()=>null); const tr=trueRanges(c), plus:number[]=[],minus:number[]=[]; for(let i=0;i<c.length;i++){if(i===0){plus.push(0);minus.push(0);continue;}const up=c[i].high-c[i-1].high,down=c[i-1].low-c[i].low;plus.push(up>down&&up>0?up:0);minus.push(down>up&&down>0?down:0);}const atrs=wilder(tr,period),p=wilder(plus,period),m=wilder(minus,period);const dx:Array<number|null>=c.map((_,i)=>{if(atrs[i]==null||p[i]==null||m[i]==null)return null;const pi=100*p[i]!/atrs[i]!,mi=100*m[i]!/atrs[i]!,sum=pi+mi;return sum===0?0:100*Math.abs(pi-mi)/sum;});return wilder(dx.map(x=>x??0),period); }
export function hma(values:number[],period=20):Array<number|null>{const p=Math.max(1,Math.floor(period)),half=Math.max(1,Math.floor(p/2)),sqrt=Math.max(1,Math.floor(Math.sqrt(p))),a=weightedMovingAverage(values,half),b=weightedMovingAverage(values,p),raw=values.map((_,i)=>a[i]!=null&&b[i]!=null?2*a[i]!-b[i]!:null);return weightedMovingAverage(raw,sqrt);}
export function supertrend(c: HistoricalCandle[], period=10, multiplier=3): SupertrendPoint[] { const atrs=atr(c,period); let finalUpper=0,finalLower=0,trend=1; const out:SupertrendPoint[]=[]; for(let i=0;i<c.length;i++){ const a=atrs[i]; if(a==null)continue; const mid=(c[i].high+c[i].low)/2; const upper=mid+multiplier*a,lower=mid-multiplier*a; if(i===period-1){finalUpper=upper;finalLower=lower;} else {const prevUpper=finalUpper,prevLower=finalLower;finalUpper=upper<prevUpper||c[i-1].close>prevUpper?upper:prevUpper;finalLower=lower>prevLower||c[i-1].close<prevLower?lower:prevLower;if(trend===-1&&c[i].close>prevUpper)trend=1;else if(trend===1&&c[i].close<prevLower)trend=-1;} out.push({time:Math.floor(new Date(c[i].timestamp).getTime()/1000),value:trend===1?finalLower:finalUpper,direction:trend as 1|-1}); } return out; }
export function ichimoku(c: HistoricalCandle[], conversion=9, base=26, displacement=26): IchimokuPoint[] { void displacement;const ch=new RollingMinMax(conversion),cl=new RollingMinMax(conversion),bh=new RollingMinMax(base),bl=new RollingMinMax(base),sh=new RollingMinMax(52),sl=new RollingMinMax(52),out:IchimokuPoint[]=[];for(let i=0;i<c.length;i++){const tenH=ch.update(c[i].high).max,tenL=cl.update(c[i].low).min,baseH=bh.update(c[i].high).max,baseL=bl.update(c[i].low).min,spanH=sh.update(c[i].high).max,spanL=sl.update(c[i].low).min;if(tenH==null||tenL==null||baseH==null||baseL==null)continue;const ten=(tenH+tenL)/2,kij=(baseH+baseL)/2,spanA=(ten+kij)/2,spanB=spanH!=null&&spanL!=null?(spanH+spanL)/2:spanA;out.push({time:Math.floor(new Date(c[i].timestamp).getTime()/1000),tenkan:ten,kijun:kij,spanA,spanB});}return out; }

function groupedBy(c: HistoricalCandle[], keyFn:(x:HistoricalCandle)=>string){const m=new Map<string,HistoricalCandle[]>();for(const x of c){const k=keyFn(x),a=m.get(k)||[];a.push(x);m.set(k,a);}return m;}
function istParts(ts:string){const d=new Date(ts),p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);return {y:Number(p.find(x=>x.type==='year')?.value),m:Number(p.find(x=>x.type==='month')?.value),day:Number(p.find(x=>x.type==='day')?.value),hour:Number(p.find(x=>x.type==='hour')?.value),min:Number(p.find(x=>x.type==='minute')?.value)};}
const dayKey=(x:HistoricalCandle)=>{const p=istParts(x.timestamp);return `${p.y}-${String(p.m).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;};
const monthKey=(x:HistoricalCandle)=>{const p=istParts(x.timestamp);return `${p.y}-${String(p.m).padStart(2,'0')}`;};
const weekKey=(x:HistoricalCandle)=>{const p=istParts(x.timestamp);const d=new Date(Date.UTC(p.y,p.m-1,p.day));const dow=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-dow);return `${d.getUTCFullYear()}-W${String(Math.ceil((((d.getTime()-new Date(Date.UTC(d.getUTCFullYear(),0,1)).getTime()) / 86400000)+1)/7)).padStart(2,'0')}`;};
export type KeyLevel = {time:number; price:number; label:string; side:'support'|'resistance'|'neutral'};
export function previousDayLevels(c:HistoricalCandle[]):KeyLevel[]{const days=groupedBy(c,dayKey),ks=[...days.keys()];if(ks.length<2)return [];const g=days.get(ks[ks.length-2])!,t=Math.floor(new Date(c[c.length-1].timestamp).getTime()/1000);return [{time:t,price:Math.max(...g.map(x=>x.high)),label:'PDH',side:'resistance'},{time:t,price:Math.min(...g.map(x=>x.low)),label:'PDL',side:'support'},{time:t,price:g[g.length-1].close,label:'PDC',side:'neutral'}];}
export function previousPeriodLevels(c:HistoricalCandle[], period:'week'|'month'):KeyLevel[]{const key=period==='week'?weekKey:monthKey,m=groupedBy(c,key),ks=[...m.keys()];if(ks.length<2)return [];const g=m.get(ks[ks.length-2])!,t=Math.floor(new Date(c[c.length-1].timestamp).getTime()/1000),name=period==='week'?'PW':'PM';return [{time:t,price:Math.max(...g.map(x=>x.high)),label:`${name}H`,side:'resistance'},{time:t,price:Math.min(...g.map(x=>x.low)),label:`${name}L`,side:'support'},{time:t,price:g[g.length-1].close,label:`${name}C`,side:'neutral'}];}
export function gapZones(c:HistoricalCandle[]):ZonePoint[]{const days=groupedBy(c,dayKey),ks=[...days.keys()];if(ks.length<2)return [];const prev=days.get(ks[ks.length-2])!,cur=days.get(ks[ks.length-1])!,pc=prev[prev.length-1].close,op=cur[0].open;if(op===pc)return [];const upper=Math.max(op,pc),lower=Math.min(op,pc);return [{time:Math.floor(new Date(cur[0].timestamp).getTime()/1000),upper,lower,kind:op>pc?'bullish':'bearish'}];}
export function equalHighLow(c:HistoricalCandle[],swing=3,tolerance=0.0015):KeyLevel[]{const ms=marketStructure(c,swing),out:KeyLevel[]=[];for(let i=1;i<ms.length;i++){const a=ms[i-1],b=ms[i],tol=Math.max(a.price,b.price)*tolerance;if(a.type.includes('H')&&b.type.includes('H')&&Math.abs(a.price-b.price)<=tol)out.push({time:b.time,price:(a.price+b.price)/2,label:'EQH',side:'resistance'});if(a.type.includes('L')&&b.type.includes('L')&&Math.abs(a.price-b.price)<=tol)out.push({time:b.time,price:(a.price+b.price)/2,label:'EQL',side:'support'});}return out.slice(-20);}
export function liquidityPools(c:HistoricalCandle[],swing=5):KeyLevel[]{const levels=dynamicSupportResistance(c,swing),out:KeyLevel[]=[];for(let i=0;i<levels.length;i++){let touches=1;for(let j=i+1;j<levels.length;j++)if(Math.abs(levels[i].price-levels[j].price)<=levels[i].price*0.001)touches++;if(touches>=2)out.push({...levels[i],label:`LP ${touches}x`});}return out.slice(-12);}
export type EventPoint={time:number;price:number;label:string;side:'bullish'|'bearish'};
export function bosChoch(c:HistoricalCandle[],swing=3):EventPoint[]{const ms=marketStructure(c,swing),out:EventPoint[]=[],highs=ms.filter(x=>x.type.includes('H')),lows=ms.filter(x=>x.type.includes('L'));let hiIndex=0,loIndex=0,latestHigh:typeof highs[number]|undefined,latestLow:typeof lows[number]|undefined,trend:1|-1=1;for(let i=0;i<c.length;i++){const time=Math.floor(new Date(c[i].timestamp).getTime()/1000);while(hiIndex<highs.length&&highs[hiIndex]!.time<=time)latestHigh=highs[hiIndex++]!;while(loIndex<lows.length&&lows[loIndex]!.time<=time)latestLow=lows[loIndex++]!;if(latestHigh&&c[i].close>latestHigh.price){out.push({time,price:c[i].close,label:trend<0?'CHOCH ↑':'BOS ↑',side:'bullish'});trend=1;latestHigh=undefined;}else if(latestLow&&c[i].close<latestLow.price){out.push({time,price:c[i].close,label:trend>0?'CHOCH ↓':'BOS ↓',side:'bearish'});trend=-1;latestLow=undefined;}}return out.slice(-20);}
export type CandleEvent={time:number;price:number;label:string;side:'bullish'|'bearish'};
export function priceActionEvents(c:HistoricalCandle[]):CandleEvent[]{const out:CandleEvent[]=[];for(let i=1;i<c.length;i++){const x=c[i],p=c[i-1],range=x.high-x.low,body=Math.abs(x.close-x.open),upper=x.high-Math.max(x.open,x.close),lower=Math.min(x.open,x.close)-x.low,t=Math.floor(new Date(x.timestamp).getTime()/1000);if(range>0&&upper/range>0.55&&body/range<0.4)out.push({time:t,price:x.high,label:'REJECTION ↓',side:'bearish'});if(range>0&&lower/range>0.55&&body/range<0.4)out.push({time:t,price:x.low,label:'REJECTION ↑',side:'bullish'});if(x.high<=p.high&&x.low>=p.low){if(i+1<c.length){const n=c[i+1];if(n.close>x.high)out.push({time:Math.floor(new Date(n.timestamp).getTime()/1000),price:n.close,label:'INSIDE ↑',side:'bullish'});else if(n.close<x.low)out.push({time:Math.floor(new Date(n.timestamp).getTime()/1000),price:n.close,label:'INSIDE ↓',side:'bearish'});}}const bull=x.close>x.open&&p.close<p.open&&x.open<=p.close&&x.close>=p.open,bear=x.close<x.open&&p.close>p.open&&x.open>=p.close&&x.close<=p.open;if(bull)out.push({time:t,price:x.low,label:'ENGULF ↑',side:'bullish'});if(bear)out.push({time:t,price:x.high,label:'ENGULF ↓',side:'bearish'});if(range>0&&lower>body*2&&upper<body*0.8)out.push({time:t,price:x.low,label:'PIN ↑',side:'bullish'});if(range>0&&upper>body*2&&lower<body*0.8)out.push({time:t,price:x.high,label:'PIN ↓',side:'bearish'});}return out.slice(-40);}
export function nr7(c:HistoricalCandle[]):CandleEvent[]{const out:CandleEvent[]=[],state=new RollingMinMax(6);for(let i=0;i<c.length;i++){const r=c[i].high-c[i].low,min6=state.min();if(i>=6&&min6!=null&&r<=min6)out.push({time:Math.floor(new Date(c[i].timestamp).getTime()/1000),price:c[i].close,label:'NR7',side:c[i].close>=c[i].open?'bullish':'bearish'});state.update(r);}return out.slice(-20);}
export function developingDayLevels(c:HistoricalCandle[]):KeyLevel[]{if(!c.length)return [];const days=groupedBy(c,dayKey),g=[...days.values()].at(-1)||[],t=Math.floor(new Date(c[c.length-1].timestamp).getTime()/1000);return [{time:t,price:Math.max(...g.map(x=>x.high)),label:'DAY HIGH',side:'resistance'},{time:t,price:Math.min(...g.map(x=>x.low)),label:'DAY LOW',side:'support'}];}
export function vwapDeviationBands(c:HistoricalCandle[],mult=1,source:PriceSource='hlc3'){const v=vwap(c,source),days=groupedBy(c,dayKey),out:Array<{time:number,middle:number,upper:number,lower:number}>=[];for(const [,g] of days){const idx0=c.indexOf(g[0]);const vals=g.map((x,i)=>{const vv=v[idx0+i].value;return {x,dev:(sourceValues([x],source)[0]-vv)**2};});const sd=Math.sqrt(vals.reduce((a,b)=>a+b.dev,0)/Math.max(1,vals.length));for(let i=0;i<g.length;i++){const vv=v[idx0+i].value,t=Math.floor(new Date(g[i].timestamp).getTime()/1000);out.push({time:t,middle:vv,upper:vv+sd*mult,lower:vv-sd*mult});}}return out;}
export function anchoredVwap(c:HistoricalCandle[],swing=5,source:PriceSource='hlc3'){const ms=marketStructure(c,swing),anchor=ms.at(-1);const start=anchor?c.findIndex(x=>Math.floor(new Date(x.timestamp).getTime()/1000)>=anchor.time):0;if(start<0)return [];let pv=0,vol=0;return c.slice(start).map(x=>{const vv=Math.max(0,x.volume||0);pv+=sourceValues([x],source)[0]*vv;vol+=vv;return {time:Math.floor(new Date(x.timestamp).getTime()/1000),value:vol?pv/vol:x.close};});}
function pivotSet(h:number,l:number,cl:number,mode:'cpr'|'camarilla'|'fib'){const p=(h+l+cl)/3,r=h-l;if(mode==='cpr')return [{price:p,label:'P',side:'neutral' as const},{price:2*p-l,label:'R1',side:'resistance' as const},{price:2*p-h,label:'S1',side:'support' as const}];if(mode==='camarilla'){return [1.1*r/12,1.1*r/6,1.1*r/4,1.1*r/2].flatMap((d,i)=>[{price:cl+d,label:`R${i+1}`,side:'resistance' as const},{price:cl-d,label:`S${i+1}`,side:'support' as const}]);}return [0.382,0.618,1].flatMap((f,i)=>[{price:p+r*f,label:`R${i+1}`,side:'resistance' as const},{price:p-r*f,label:`S${i+1}`,side:'support' as const}]);}
export function extendedCpr(c:HistoricalCandle[]):KeyLevel[]{if(c.length<2)return [];const days=groupedBy(c,dayKey),ks=[...days.keys()];const g=days.get(ks[ks.length-2]);if(!g)return [];const h=Math.max(...g.map(x=>x.high)),l=Math.min(...g.map(x=>x.low)),cl=g.at(-1)!.close,p=(h+l+cl)/3,bc=(h+l)/2,tc=2*p-bc,r=h-l,t=Math.floor(new Date(c.at(-1)!.timestamp).getTime()/1000);const rs=[2*p-l,p+r*.382,p+r*.618,p+r,p+r*1.618],ss=[2*p-h,p-r*.382,p-r*.618,p-r,p-r*1.618];return [{time:t,price:tc,label:'TC',side:'resistance'},{time:t,price:p,label:'P',side:'neutral'},{time:t,price:bc,label:'BC',side:'support'},...rs.map((x,i)=>({time:t,price:x,label:`R${i+1}`,side:'resistance' as const})),...ss.map((x,i)=>({time:t,price:x,label:`S${i+1}`,side:'support' as const}))];}
export function periodPivots(c:HistoricalCandle[],period:'week'|'month',mode:'classic'|'fib'='classic'):KeyLevel[]{const key=period==='week'?weekKey:monthKey,m=groupedBy(c,key),ks=[...m.keys()];if(ks.length<2)return [];const g=m.get(ks[ks.length-2])!,h=Math.max(...g.map(x=>x.high)),l=Math.min(...g.map(x=>x.low)),cl=g.at(-1)!.close,p=(h+l+cl)/3,r=h-l,t=Math.floor(new Date(c.at(-1)!.timestamp).getTime()/1000);const lv=mode==='classic'?[{price:p,label:'P',side:'neutral' as const},{price:p+r,label:'R1',side:'resistance' as const},{price:p+2*r,label:'R2',side:'resistance' as const},{price:p+3*r,label:'R3',side:'resistance' as const},{price:p-r,label:'S1',side:'support' as const},{price:p-2*r,label:'S2',side:'support' as const},{price:p-3*r,label:'S3',side:'support' as const}]:pivotSet(h,l,cl,'fib');return lv.map(x=>({time:t,...x}));}
export function pivots(c: HistoricalCandle[]): IndicatorPoint[] {
  if(c.length<2)return [];
  const sessions=new Map<string,HistoricalCandle[]>();
  for(const x of c){const k=indiaDate(x.timestamp),a=sessions.get(k)||[];a.push(x);sessions.set(k,a);}
  const days=[...sessions.values()]; if(days.length<2)return [];
  const d=days[days.length-2],h=Math.max(...d.map(x=>x.high)),l=Math.min(...d.map(x=>x.low)),cl=d[d.length-1].close;
  const p=(h+l+cl)/3,r=h-l;
  return [p,p+r,p+2*r,p+3*r,p-r,p-2*r,p-3*r].map((value)=>({time:Math.floor(new Date(c[c.length-1].timestamp).getTime()/1000),value}));
}

export { tradingCoreVPriceAction } from './structureEngine';
export type { TradingCoreVLevel, TradingCoreVZone, TradingCoreVStructure } from './structureEngine';

export type AdvancedIndicatorZone = { startTime:number; endTime:number; upper:number; lower:number; label:string; score?:number; side?:'bull'|'bear' };
export type AdvancedIndicatorResult = { lines: Record<string, IndicatorPoint[]>; zones: AdvancedIndicatorZone[]; markers: Array<{time:number;price:number;label:string;side?:'bull'|'bear'}> };

const rollingMean = (v:number[], p:number) => sma(v,p);
const rollingStd = (v:number[], p:number) => { const state=new RollingVariance(p); return v.map(x=>state.update(x).value); };
const normalized = (v:number[],p:number) => { const mean=new RollingMean(p),variance=new RollingVariance(p); return v.map(x=>{mean.update(x);variance.update(x);const m=mean.value(),sd=variance.value();return m==null?null:(sd?(x-m)/sd:0);}); };
const advPoints = (c:HistoricalCandle[], raw:Array<number|null>) => pointSeries(c,raw);

export function advancedIndicatorModel(c: HistoricalCandle[], kind: IndicatorKind, cfg: IndicatorConfig = {id:'',kind,enabled:true}): AdvancedIndicatorResult {
  const p=Math.max(3,cfg.period||20), mult=cfg.multiplier||2, t=times(c), close=c.map(x=>x.close), high=c.map(x=>x.high), low=c.map(x=>x.low), vol=c.map(x=>Math.max(0,x.volume||0));
  const lines:Record<string,IndicatorPoint[]>={}, zones:AdvancedIndicatorZone[]=[], markers:Array<{time:number;price:number;label:string;side?:'bull'|'bear'}>=[];
  const add=(name:string,raw:Array<number|null>)=>{lines[name]=advPoints(c,raw);};
  const emaP=ema(close,p), atrP=atr(c,p);
  if(kind==='Adaptive Ehlers'){
    const alpha=2/(p+1), out:(number|null)[]=[]; let prev=close[0]||0;
    close.forEach((x,i)=>{const volr=i?Math.abs(x-close[i-1])/(atrP[i]||Math.max(1,x*0.001)):0; const a=Math.max(0.05,Math.min(0.7,alpha*(1+volr))); prev=prev+a*(x-prev);out.push(i>=p-1?prev:null)}); add('Adaptive',out);
  } else if(kind==='ATR Percentile Bands'){
    const rank=new RollingPercentile(p);
    const upper: Array<number | null> = [];
    const lower: Array<number | null> = [];
    const atrVals: number[] = atrP.map(x => x ?? 0);
    atrVals.forEach((a,i)=>{
      rank.update(a>0?a:Number.NaN);
      const pct=a>0?(rank.rank(a)??0.5):0.5;
      const k=0.5+pct*mult;
      upper.push(i>=p-1?close[i]+a*k:null);
      lower.push(i>=p-1?close[i]-a*k:null);
    });
    add('Upper',upper);add('Lower',lower);
  } else if(kind==='CVD Profiles' || kind==='Volume Delta Footprint'){
    let cvd=0; const raw:(number|null)[]=[]; c.forEach((x,i)=>{const d=x.close>x.open?x.volume:x.close<x.open?-x.volume:0;cvd+=d;raw.push(cvd)});add('CVD',raw);
    const z=normalized(c.map(x=>x.close>x.open?x.volume:x.close<x.open?-x.volume:0),p); z.forEach((v,i)=>{if(v!=null&&Math.abs(v)>2)markers.push({time:t[i],price:v>0?low[i]:high[i],label:v>0?'Δ+':'Δ-',side:v>0?'bull':'bear'})});
  } else if(kind==='Delta Sigma Heatmap'){
    const d=c.map(x=>x.close>x.open?x.volume:x.close<x.open?-x.volume:0), z=normalized(d,p); add('Sigma',z);
    z.forEach((v,i)=>{if(v!=null&&Math.abs(v)>=2)markers.push({time:t[i],price:v>0?high[i]:low[i],label:`σ ${v.toFixed(1)}`,side:v>0?'bull':'bear'})});
  } else if(kind==='Dual Phase Reversal'){
    const r=rsi(c,p,'close'), out:(number|null)[]=[]; r.forEach((x,i)=>out.push(x?((x.value-50)/50):null)); add('Phase',out);
    r.forEach((x,i)=>{if(i>0&&x){const prev=r[i-1]?.value||50;if(prev<30&&x.value>=30)markers.push({time:t[i],price:low[i],label:'Reversal ↑',side:'bull'});if(prev>70&&x.value<=70)markers.push({time:t[i],price:high[i],label:'Reversal ↓',side:'bear'})}});
  } else if(kind==='Fractional EMA Kalman Filter'){
    const out:(number|null)[]=[]; let xhat=close[0]||0, err=1;
    close.forEach((x,i)=>{const q=(atrP[i]||x*0.005)**2, r=(atrP[i]||x*0.005)**2*0.5; const pred=err+q,k=pred/(pred+r);xhat=xhat+k*(x-xhat);err=(1-k)*pred;out.push(i>=p-1?xhat:null)});add('Filter',out);
  } else if(kind==='Harmonic Lab'){
    for(let i=p;i<c.length;i++){const a=high[i-p],b=low[i-Math.floor(p*.75)],d=high[i-Math.floor(p*.5)],e=low[i];const ab=Math.abs(b-a),bc=Math.abs(d-b),cd=Math.abs(e-d);if(ab&&bc&&cd){const r1=bc/ab,r2=cd/bc;if(r1>0.45&&r1<0.9&&r2>0.8&&r2<1.6)markers.push({time:t[i],price:e,label:'Harmonic',side:e<d?'bull':'bear'})}}
  } else if(kind==='HTF 3 Candle System'){
    const step=3; for(let i=step*2;i<c.length;i+=step){const h=Math.max(...high.slice(i-step,i)),l=Math.min(...low.slice(i-step,i));zones.push({startTime:t[i-step],endTime:t[Math.min(c.length-1,i+step-1)],upper:h,lower:l,label:'HTF 3C',score:.7})}
  } else if(kind==='HTF Volume Spike & Imbalance Projection'){
    const vz=normalized(vol,p); vz.forEach((v,i)=>{if(v!=null&&v>=2){const bull=close[i]>=c[i].open;zones.push({startTime:t[i],endTime:t[Math.min(c.length-1,i+p)],upper:bull?high[i]+(atrP[i]||0):high[i],lower:bull?low[i]:low[i]-(atrP[i]||0),label:'HTF Volume Imbalance',score:Math.min(1,v/4),side:bull?'bull':'bear'})}});
  } else if(kind==='Initial Balance Auction Intelligence'){
    const start=Math.max(0,c.length-p), h=Math.max(...high.slice(start)), l=Math.min(...low.slice(start)); add('IB High',c.map((_,i)=>i>=start?h:null));add('IB Low',c.map((_,i)=>i>=start?l:null));add('IB Mid',c.map((_,i)=>i>=start?(h+l)/2:null));
  } else if(kind==='LTF Volume Microburst Bubbles'){
    const vz=normalized(vol,Math.max(5,Math.min(p,20)));vz.forEach((v,i)=>{if(v!=null&&v>=2)markers.push({time:t[i],price:close[i],label:`Microburst ${v.toFixed(1)}σ`,side:close[i]>=c[i].open?'bull':'bear'})});
  } else if(kind==='Market Structure Dashboard'){
    const sw=5; centeredRollingExtrema(high,sw,(i,_minH,maxH)=>{if(high[i]===maxH)markers.push({time:t[i],price:high[i],label:'Swing H'});}); centeredRollingExtrema(low,sw,(i,minL,_maxL)=>{if(low[i]===minL)markers.push({time:t[i],price:low[i],label:'Swing L'});});
    add('Trend',emaP);
  } else if(kind==='Neural Weight Oscillator'){
    const z1=normalized(close.map((x,i)=>i?x-close[i-1]:0),p), z2=normalized(vol,p); add('NWO',z1.map((x,i)=>x==null||z2[i]==null?null:Math.tanh(.65*x+.35*z2[i])));
  } else if(kind==='OrderBlock AI'){
    const volumeMean=rollingMean(vol,p);
    for(let i=p;i<c.length;i++){const a=atrP[i]||0,body=Math.abs(close[i]-c[i].open),vr=(vol[i]||0)/(volumeMean[i]||1);if(a&&body>mult*a&&vr>1.2){const base=c[i-1],bull=close[i]>c[i].open;zones.push({startTime:t[i-1],endTime:t[c.length-1],upper:bull?Math.max(base.open,base.close):base.high,lower:bull?base.low:Math.min(base.open,base.close),label:'OB AI',score:Math.min(1,(body/a)/4*.6+Math.min(vr/3,1)*.4),side:bull?'bull':'bear'})}}
  } else if(kind==='Pivot Consolidation Zone'){
    const highState=new RollingMinMax(p), lowState=new RollingMinMax(p);
    for(let i=0;i<c.length;i++){const h=highState.max(),l=lowState.min();if(i>=p&&h!=null&&l!=null){const range=h-l;if(range<=((atrP[i]||range)*1.5))zones.push({startTime:t[i-p]!,endTime:t[i],upper:h,lower:l,label:'Pivot Consolidation',score:.7});}highState.update(high[i]);lowState.update(low[i]);}
  } else if(kind==='Stoploss Cascades'){
    const highState=new RollingMinMax(p), lowState=new RollingMinMax(p);
    for(let i=0;i<c.length;i++){
      const rh=highState.max(), rl=lowState.min(), a=atrP[i]||0;
      if(i>=p&&a&&rh!=null&&rl!=null){
        if(high[i]>rh+mult*a&&close[i]<rh)markers.push({time:t[i],price:high[i],label:'Stop Cascade ↓',side:'bear'});
        if(low[i]<rl-mult*a&&close[i]>rl)markers.push({time:t[i],price:low[i],label:'Stop Cascade ↑',side:'bull'});
      }
      highState.update(high[i]); lowState.update(low[i]);
    }
  } else if(kind==='Trend Pressure'){
    const mom=close.map((x,i)=>i?x-close[i-1]:0), z=normalized(mom,p), vr=normalized(vol,p);add('Pressure',z.map((x,i)=>x==null||vr[i]==null?null:Math.tanh(.7*x+.3*vr[i])));
  } else if(kind==='Trend Target Ribbon'){
    const e1=ema(close,p), e2=ema(close,Math.max(2,Math.round(p*1.8))), e3=ema(close,Math.max(2,p*2.7));add('Fast',e1);add('Mid',e2);add('Slow',e3);add('Target+',e3.map((x,i)=>x==null||atrP[i]==null?null:x+mult*atrP[i]));add('Target-',e3.map((x,i)=>x==null||atrP[i]==null?null:x-mult*atrP[i]));
  } else if(kind==='Trinity'){
    const r=rsi(c,p,'close'), ad=adx(c,p), v=normalized(vol,p);add('Trinity',r.map((x,i)=>x==null||ad[i]==null||v[i]==null?null:((x.value-50)/50)*.45+(ad[i]/100)*.35+Math.tanh(v[i])*.2));
  } else if(kind==='Volatility Shock Half Life Monitor'){
    const rv=normalized(atrP.map(x=>x||0),p);add('Shock',rv);
    rv.forEach((v,i)=>{if(v!=null&&v>=2)markers.push({time:t[i],price:close[i],label:`Vol shock ${v.toFixed(1)}σ`,side:'bear'})});
  } else if(kind==='Wyckoff'){
    const zvol=normalized(vol,p); for(let i=1;i<c.length;i++){if(zvol[i]!=null&&zvol[i]>=1.8&&close[i]<c[i].open&&close[i]>low[i]+(high[i]-low[i])*.6)markers.push({time:t[i],price:low[i],label:'Spring?',side:'bull'});if(zvol[i]!=null&&zvol[i]>=1.8&&close[i]>c[i].open&&close[i]<low[i]+(high[i]-low[i])*.4)markers.push({time:t[i],price:high[i],label:'Upthrust?',side:'bear'})}
  }
  return {lines,zones,markers};
}

export function marketStructure(c: HistoricalCandle[], swing=3): Array<{time:number;price:number;type:'HH'|'HL'|'LH'|'LL'}> {
  const out:Array<{time:number;price:number;type:'HH'|'HL'|'LH'|'LL'}>=[], highs=c.map(x=>x.high), lows=c.map(x=>x.low);
  let lastHigh:number|undefined,lastLow:number|undefined;
  centeredRollingExtrema(highs,swing,(i,_minH,maxH)=>{
    if(highs[i]!==maxH)return;
    const type=lastHigh==null?'HH':highs[i]>lastHigh?'HH':'LH';
    lastHigh=highs[i];out.push({time:Math.floor(new Date(c[i].timestamp).getTime()/1000),price:highs[i],type});
  });
  centeredRollingExtrema(lows,swing,(i,minL,_maxL)=>{
    if(lows[i]!==minL)return;
    const type=lastLow==null?'HL':lows[i]>lastLow?'HL':'LL';
    lastLow=lows[i];out.push({time:Math.floor(new Date(c[i].timestamp).getTime()/1000),price:lows[i],type});
  });
  out.sort((a,b)=>a.time-b.time);
  return out;
}

export function dynamicSupportResistance(c: HistoricalCandle[], swing=5): SRPoint[] {
  const structure = buildTradingCoreVStructure(c, {
    fractalPeriod: Math.max(2, swing),
    lookback: Math.min(800, Math.max(100, c.length)),
    maxLevels: 20,
  });
  return structure.levels
    .map(level => ({
      time: level.time,
      price: level.price,
      side: level.side,
    }))
    .sort((a, b) => a.price - b.price)
    .slice(-20);
}
export type SweepPoint={time:number;price:number;side:'buy-side'|'sell-side'};

export function fairValueGaps(c: HistoricalCandle[], maxZones=50): ZonePoint[] {
  const out: ZonePoint[] = [];
  for (let i=2;i<c.length;i+=1) {
    const left=c[i-2]!, right=c[i]!;
    if (right.low>left.high) out.push({time:Math.floor(new Date(right.timestamp).getTime()/1000),upper:right.low,lower:left.high,kind:'bullish'});
    else if (right.high<left.low) out.push({time:Math.floor(new Date(right.timestamp).getTime()/1000),upper:left.low,lower:right.high,kind:'bearish'});
  }
  return out.slice(-Math.max(1,Math.floor(maxZones)));
}

export function orderBlocks(c: HistoricalCandle[], period=5): ZonePoint[] {
  const p=Math.max(1,Math.floor(period));
  const bodies=c.map(x=>Math.abs(x.close-x.open));
  const bodyState=new RollingMean(p);
  const out: ZonePoint[]=[];
  for(let i=0;i<c.length;i+=1){
    const avg=bodyState.value();
    const body=bodies[i]!;
    if(i>0 && avg!=null && body>=avg*1.5){
      const base=c[i-1]!;
      out.push({
        time:Math.floor(new Date(base.timestamp).getTime()/1000),
        upper:Math.max(base.open,base.close),
        lower:Math.min(base.open,base.close),
        kind:c[i]!.close>=c[i]!.open?'bullish':'bearish',
      });
    }
    bodyState.update(body);
  }
  return out.slice(-30);
}

export function indianKeyLevels(c: HistoricalCandle[]): KeyLevel[] {
  if(!c.length) return [];
  const t=Math.floor(new Date(c[c.length-1]!.timestamp).getTime()/1000);
  const out:KeyLevel[]=[];
  const previous=previousDayLevels(c);
  out.push(...previous);
  const todayKey=indiaDate(c[c.length-1]!.timestamp);
  const today=c.filter(x=>indiaDate(x.timestamp)===todayKey);
  if(today.length){
    out.push(
      {time:t,price:today[0]!.open,label:'DAY OPEN',side:'neutral'},
      {time:t,price:Math.max(...today.map(x=>x.high)),label:'DAY HIGH',side:'resistance'},
      {time:t,price:Math.min(...today.map(x=>x.low)),label:'DAY LOW',side:'support'},
    );
  }
  return out;
}

/**
 * Experimental Reversal Price approximation.
 *
 * This deliberately uses only the last completed India-market session:
 * P = (H + L + C) / 3 is the Trend Decide Price;
 * R1/S1 are the classic inner pivot levels; R2/S2 extend by the prior range.
 * The original OptionMate formula has not been verified. Keeping the previous
 * session as the input makes today's levels stable as the current candle forms.
 */
export function reversalPriceLevels(c: HistoricalCandle[]): KeyLevel[] {
  if (c.length < 2) return [];

  const sessions = new Map<string, HistoricalCandle[]>();
  for (const candle of c) {
    const key = indiaDate(candle.timestamp);
    const session = sessions.get(key) || [];
    session.push(candle);
    sessions.set(key, session);
  }

  const keys = [...sessions.keys()];
  if (keys.length < 2) return [];
  const previous = sessions.get(keys[keys.length - 2]);
  const current = sessions.get(keys[keys.length - 1]);
  if (!previous?.length || !current?.length) return [];

  const high = Math.max(...previous.map(candle => candle.high));
  const low = Math.min(...previous.map(candle => candle.low));
  const close = previous[previous.length - 1]!.close;
  const pivot = (high + low + close) / 3;
  const priorRange = high - low;
  const time = Math.floor(new Date(current[0]!.timestamp).getTime() / 1000);

  const levels: KeyLevel[] = [
    { time, price: pivot + priorRange, label: 'Reversal Price R2', side: 'resistance' },
    { time, price: 2 * pivot - low, label: 'Reversal Price R1', side: 'resistance' },
    { time, price: pivot, label: 'Trend Decide Price', side: 'neutral' },
    { time, price: 2 * pivot - high, label: 'Reversal Price S1', side: 'support' },
    { time, price: pivot - priorRange, label: 'Reversal Price S2', side: 'support' },
  ];

  return levels.filter(level => Number.isFinite(level.price));
}

export function classicPivots(c: HistoricalCandle[]): IndicatorPoint[] {
  if(!c.length) return [];
  const keys=[...new Set(c.map(x=>indiaDate(x.timestamp)))];
  if(keys.length<2) return [];
  const previous=c.filter(x=>indiaDate(x.timestamp)===keys[keys.length-2]);
  if(!previous.length) return [];
  const h=Math.max(...previous.map(x=>x.high)), l=Math.min(...previous.map(x=>x.low)), cl=previous[previous.length-1]!.close;
  const p=(h+l+cl)/3, r=h-l;
  const time=Math.floor(new Date(c[c.length-1]!.timestamp).getTime()/1000);
  return [p,2*p-l,2*p-h,p+r, p-r].map(value=>({time,value}));
}

export function liquiditySweeps(c: HistoricalCandle[], swing=5): SweepPoint[] {
  const out:SweepPoint[]=[], highState=new RollingMinMax(swing), lowState=new RollingMinMax(swing);
  for(let i=0;i<c.length;i++){
    const hi=highState.max(),lo=lowState.min();
    if(i>=swing&&hi!=null&&lo!=null){
      if(c[i].high>hi&&c[i].close<hi)out.push({time:Math.floor(new Date(c[i].timestamp).getTime()/1000),price:c[i].high,side:'buy-side'});
      if(c[i].low<lo&&c[i].close>lo)out.push({time:Math.floor(new Date(c[i].timestamp).getTime()/1000),price:c[i].low,side:'sell-side'});
    }
    highState.update(c[i].high); lowState.update(c[i].low);
  }
  return out.slice(-30);
}
export function cpr(c: HistoricalCandle[]): KeyLevel[] {
  if(!c.length)return []; const sessions=new Map<string,HistoricalCandle[]>();for(const x of c){const k=indiaDate(x.timestamp),a=sessions.get(k)||[];a.push(x);sessions.set(k,a);}const days=[...sessions.values()];if(days.length<2)return [];const d=days[days.length-2],h=Math.max(...d.map(x=>x.high)),l=Math.min(...d.map(x=>x.low)),cl=d[d.length-1].close,p=(h+l+cl)/3,bc=(h+l)/2,tc=2*p-bc,r1=2*p-l,s1=2*p-h,t=Math.floor(new Date(c[c.length-1].timestamp).getTime()/1000);return [{time:t,price:tc,label:'CPR TC',side:'resistance'},{time:t,price:p,label:'CPR P',side:'neutral'},{time:t,price:bc,label:'CPR BC',side:'support'},{time:t,price:r1,label:'R1',side:'resistance'},{time:t,price:s1,label:'S1',side:'support'}];
}
export function openingRange(c: HistoricalCandle[], minutes=15): KeyLevel[] { if(!c.length)return []; const sessions=new Map<string,HistoricalCandle[]>();for(const x of c){const k=indiaDate(x.timestamp),a=sessions.get(k)||[];a.push(x);sessions.set(k,a);}const cur=[...sessions.values()].at(-1)||[];const start=cur.filter(x=>{const d=new Date(x.timestamp);const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);const h=Number(parts.find(y=>y.type==='hour')?.value||0),m=Number(parts.find(y=>y.type==='minute')?.value||0);return h*60+m>=555&&h*60+m<555+minutes;});if(!start.length)return [];const t=Math.floor(new Date(c[c.length-1].timestamp).getTime()/1000),hi=Math.max(...start.map(x=>x.high)),lo=Math.min(...start.map(x=>x.low));return [{time:t,price:hi,label:`OR${minutes} HIGH`,side:'resistance'},{time:t,price:lo,label:`OR${minutes} LOW`,side:'support'}]; }
export function swingLevels(c: HistoricalCandle[], swing=3): KeyLevel[] {const ms=marketStructure(c,swing);return ms.slice(-12).map(x=>({time:x.time,price:x.price,label:x.type,side:x.type.includes('H')?'resistance':'support'}));}
export function gapLevels(c: HistoricalCandle[]): KeyLevel[] {if(c.length<2)return [];const sessions=new Map<string,HistoricalCandle[]>();for(const x of c){const k=indiaDate(x.timestamp),a=sessions.get(k)||[];a.push(x);sessions.set(k,a);}const days=[...sessions.values()];if(days.length<2)return [];const prev=days[days.length-2],cur=days[days.length-1];const pc=prev.at(-1)!.close,op=cur[0].open,t=Math.floor(new Date(cur[0].timestamp).getTime()/1000);if(op>pc)return [{time:t,price:op,label:'GAP UP',side:'resistance'},{time:t,price:pc,label:'GAP FILL',side:'neutral'}];if(op<pc)return [{time:t,price:op,label:'GAP DOWN',side:'support'},{time:t,price:pc,label:'GAP FILL',side:'neutral'}];return [];}



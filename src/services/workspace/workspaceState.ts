import { IndicatorConfig } from '../marketData/indicatorEngine';
export type AutomationMode = 'Paper' | 'Live' | 'Off';
export type AutomationConfig = { id:string; name:string; description:string; mode:AutomationMode; enabled:boolean; kind:'VWAP_RECLAIM'|'EMA_CROSS'|'OPENING_RANGE'|'RSI_REVERSAL'|'DONCHIAN_BREAKOUT'|'SUPERTREND_FLIP'|'BOLLINGER_BREAKOUT'|'CPR_BREAKOUT'|'PDH_PDL_SWEEP'; period?:number; fast?:number; slow?:number; multiplier?:number };
const IND='tradingcore:indicators'; const AUTO='tradingcore:automations';
export const defaultIndicators: IndicatorConfig[] = [
 {id:'ema20',kind:'EMA',period:20,enabled:true},
 {id:'vwap',kind:'VWAP',enabled:true},
 {id:'bb20',kind:'Bollinger Bands',period:20,multiplier:2,enabled:false},
 {id:'rsi14',kind:'RSI',period:14,enabled:false},
 {id:'macd',kind:'MACD',fast:12,slow:26,signal:9,enabled:false},
 {id:'supertrend',kind:'Supertrend',period:10,multiplier:3,enabled:false},
 {id:'sma50',kind:'SMA',period:50,enabled:false},
 {id:'atr14',kind:'ATR',period:14,enabled:false},
 {id:'hma20',kind:'HMA',period:20,enabled:false},
 {id:'keltner20',kind:'Keltner Channels',period:20,multiplier:2,enabled:false},
 {id:'donchian20',kind:'Donchian Channels',period:20,enabled:false},
 {id:'adx14',kind:'ADX',period:14,enabled:false},
 {id:'stoch14',kind:'Stochastic',period:14,smooth:3,signal:3,enabled:false},
 {id:'cci20',kind:'CCI',period:20,enabled:false},
 {id:'obv',kind:'OBV',enabled:false},
 {id:'mfi14',kind:'MFI',period:14,enabled:false},
 {id:'ichimoku',kind:'Ichimoku Cloud',period:9,slow:26,displacement:26,enabled:false},
 {id:'pivots',kind:'Pivot Points',enabled:false},
 {id:'cpr',kind:'CPR',enabled:true},
 {id:'key-levels',kind:'Key Levels',enabled:true},
 {id:'opening-range',kind:'Opening Range',period:15,enabled:true},
 {id:'weekly-levels',kind:'Weekly Levels',enabled:false},
 {id:'swing-levels',kind:'Swing Levels',period:3,enabled:true},
 {id:'gap-levels',kind:'Gap Levels',enabled:false},
 {id:'structure',kind:'Market Structure',period:3,enabled:false},
 {id:'prev-day',kind:'Previous Day Levels',enabled:true},{id:'prev-week',kind:'Previous Week Levels',enabled:false},{id:'prev-month',kind:'Previous Month Levels',enabled:false},{id:'or-pro',kind:'Opening Range Pro',period:30,enabled:false},{id:'gap-zones',kind:'Gap Zones',enabled:false},{id:'equal-hl',kind:'Equal Highs/Lows',period:3,enabled:false},{id:'liquidity-pools',kind:'Liquidity Pools',period:5,enabled:false},{id:'bos-choch',kind:'BOS / CHOCH',period:3,enabled:false},{id:'fvg-mit',kind:'FVG + Mitigation',enabled:false},{id:'ob-mit',kind:'Order Blocks + Mitigation',period:5,enabled:false},{id:'break-retest',kind:'Breakout / Retest',period:5,enabled:false},{id:'failed-break',kind:'Failed Breakout',period:5,enabled:false},{id:'rejection',kind:'Rejection Candles',enabled:false},{id:'inside',kind:'Inside Bar Breakout',enabled:false},{id:'engulf',kind:'Engulfing Patterns',enabled:false},{id:'pinbars',kind:'Pin Bars',enabled:false},{id:'nr7',kind:'NR7 Volatility Contraction',enabled:false},{id:'developing-day',kind:'Developing Day High/Low',enabled:false},{id:'vwap-dev',kind:'VWAP Deviation Bands',multiplier:1,enabled:false},{id:'avwap',kind:'Anchored VWAP',period:5,enabled:false},{id:'cpr-extended',kind:'CPR R1-R5 / S1-S5',enabled:false},{id:'camarilla',kind:'Camarilla Pivots',enabled:false},{id:'fib-pivots',kind:'Fibonacci Pivots',enabled:false},{id:'weekly-pivots',kind:'Weekly Pivots',enabled:false},{id:'monthly-pivots',kind:'Monthly Pivots',enabled:false},
];
export const defaultAutomations: AutomationConfig[] = [
 {id:'vwap-reclaim',name:'VWAP reclaim',description:'Signal when price crosses back above/below session VWAP.',mode:'Paper',enabled:false,kind:'VWAP_RECLAIM'},
 {id:'ema-cross',name:'EMA crossover',description:'Signal on a fast EMA / slow EMA cross.',mode:'Paper',enabled:false,kind:'EMA_CROSS',fast:9,slow:21},
 {id:'opening-range',name:'NSE opening-range breakout',description:'Paper signal when price breaks the NSE 09:15–09:30 opening range.',mode:'Paper',enabled:false,kind:'OPENING_RANGE'},
 {id:'pdh-pdl-sweep',name:'PDH/PDL sweep',description:'Indian-session price-action signal after a previous-day high/low sweep and close back inside.',mode:'Paper',enabled:false,kind:'PDH_PDL_SWEEP'},
 {id:'cpr-breakout',name:'CPR breakout',description:'Paper signal when price breaks above/below the previous-session CPR boundary.',mode:'Paper',enabled:false,kind:'CPR_BREAKOUT'},
 {id:'rsi-reversal',name:'RSI reversal',description:'Paper signal when RSI exits an oversold/overbought extreme.',mode:'Paper',enabled:false,kind:'RSI_REVERSAL'},
 {id:'donchian-breakout',name:'Donchian breakout',description:'Paper signal on a close outside the rolling channel.',mode:'Paper',enabled:false,kind:'DONCHIAN_BREAKOUT',period:20},
 {id:'supertrend-flip',name:'Supertrend flip',description:'Paper signal when Supertrend changes direction.',mode:'Paper',enabled:false,kind:'SUPERTREND_FLIP',period:10},
 {id:'bollinger-breakout',name:'Bollinger breakout',description:'Paper signal when price closes beyond the volatility envelope.',mode:'Paper',enabled:false,kind:'BOLLINGER_BREAKOUT',period:20,multiplier:2},
];
function read<T>(key:string, fallback:T):T { try { const x=localStorage.getItem(key); return x?JSON.parse(x):fallback; } catch{return fallback;} }
export const getIndicators=()=>read<IndicatorConfig[]>(IND,defaultIndicators);
export const saveIndicators=(v:IndicatorConfig[])=>{localStorage.setItem(IND,JSON.stringify(v));window.dispatchEvent(new CustomEvent('tradingcore:indicators',{detail:v}));};
export const getAutomations=()=>read<AutomationConfig[]>(AUTO,defaultAutomations);
export const saveAutomations=(v:AutomationConfig[])=>{localStorage.setItem(AUTO,JSON.stringify(v));window.dispatchEvent(new CustomEvent('tradingcore:automations',{detail:v}));};

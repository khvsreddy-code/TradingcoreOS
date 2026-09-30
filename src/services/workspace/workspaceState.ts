import { IndicatorConfig } from '../marketData/indicatorEngine';
import { getIndicatorSettingsSchema, readIndicatorSettingValue, writeIndicatorSettingValue } from '../coreSpirit/indicatorSettingsSchema';
export type AutomationMode = 'Paper' | 'Live' | 'Off';
export type AutomationConfig = { id:string; name:string; description:string; mode:AutomationMode; enabled:boolean; kind:'VWAP_RECLAIM'|'EMA_CROSS'|'OPENING_RANGE'|'RSI_REVERSAL'|'DONCHIAN_BREAKOUT'|'SUPERTREND_FLIP'|'BOLLINGER_BREAKOUT'|'CPR_BREAKOUT'|'PDH_PDL_SWEEP'; period?:number; fast?:number; slow?:number; multiplier?:number };
const IND='tradingcore:indicators'; const AUTO='tradingcore:automations'; const IND_VERSION='indicator-settings-v8';

export const defaultIndicators: IndicatorConfig[] = [
 {id:'ema20',kind:'EMA',period:20,enabled:false}, {id:'vwap',kind:'VWAP',enabled:false},
 {id:'bb20',kind:'Bollinger Bands',period:20,multiplier:2,enabled:false}, {id:'rsi14',kind:'RSI',period:14,enabled:false},
 {id:'macd',kind:'MACD',fast:12,slow:26,signal:9,enabled:false}, {id:'supertrend',kind:'Supertrend',period:10,multiplier:3,enabled:false},
 {id:'sma50',kind:'SMA',period:50,enabled:false}, {id:'atr14',kind:'ATR',period:14,enabled:false},
 {id:'hma20',kind:'HMA',period:20,enabled:false}, {id:'keltner20',kind:'Keltner Channels',period:20,multiplier:2,enabled:false},
 {id:'donchian20',kind:'Donchian Channels',period:20,enabled:false}, {id:'adx14',kind:'ADX',period:14,enabled:false},
 {id:'stoch14',kind:'Stochastic',period:14,smooth:3,signal:3,enabled:false}, {id:'cci20',kind:'CCI',period:20,enabled:false},
 {id:'obv',kind:'OBV',enabled:false}, {id:'mfi14',kind:'MFI',period:14,enabled:false},
 {id:'ichimoku',kind:'Ichimoku Cloud',period:9,slow:26,displacement:26,enabled:false}, {id:'pivots',kind:'Pivot Points',enabled:false},
 {id:'cpr',kind:'CPR',enabled:false}, {id:'key-levels',kind:'Key Levels',enabled:false}, {id:'opening-range',kind:'Opening Range',period:15,enabled:false},
 {id:'weekly-levels',kind:'Weekly Levels',enabled:false}, {id:'swing-levels',kind:'Swing Levels',period:3,enabled:false}, {id:'gap-levels',kind:'Gap Levels',enabled:false},
 {id:'structure',kind:'Market Structure',period:3,enabled:false}, {id:'prev-day',kind:'Previous Day Levels',enabled:false}, {id:'prev-week',kind:'Previous Week Levels',enabled:false},
 {id:'prev-month',kind:'Previous Month Levels',enabled:false}, {id:'or-pro',kind:'Opening Range Pro',period:30,enabled:false}, {id:'gap-zones',kind:'Gap Zones',enabled:false},
 {id:'equal-hl',kind:'Equal Highs/Lows',period:3,enabled:false}, {id:'liquidity-pools',kind:'Liquidity Pools',period:5,enabled:false}, {id:'bos-choch',kind:'BOS / CHOCH',period:3,enabled:false},
 {id:'fvg-mit',kind:'FVG + Mitigation',enabled:false}, {id:'ob-mit',kind:'Order Blocks + Mitigation',period:5,enabled:false}, {id:'break-retest',kind:'Breakout / Retest',period:5,enabled:false},
 {id:'failed-break',kind:'Failed Breakout',period:5,enabled:false}, {id:'rejection',kind:'Rejection Candles',enabled:false}, {id:'inside',kind:'Inside Bar Breakout',enabled:false},
 {id:'engulf',kind:'Engulfing Patterns',enabled:false}, {id:'pinbars',kind:'Pin Bars',enabled:false}, {id:'nr7',kind:'NR7 Volatility Contraction',enabled:false},
 {id:'developing-day',kind:'Developing Day High/Low',enabled:false}, {id:'vwap-dev',kind:'VWAP Deviation Bands',multiplier:1,enabled:false},
 ({id:'avwap',kind:'Anchored VWAP',anchor:'Swing High',enabled:false} as IndicatorConfig),
 {id:'cpr-extended',kind:'CPR R1-R5 / S1-S5',enabled:false}, {id:'camarilla',kind:'Camarilla Pivots',enabled:false}, {id:'fib-pivots',kind:'Fibonacci Pivots',enabled:false},
 {id:'weekly-pivots',kind:'Weekly Pivots',enabled:false}, {id:'monthly-pivots',kind:'Monthly Pivots',enabled:false},
 {id:'tradingcore-v-price-action',kind:'TradingCore V Price Action',period:5,multiplier:2,enabled:false},
 {id:'adaptive-ehlers',kind:'Adaptive Ehlers',period:20,enabled:false}, {id:'atr-percentile',kind:'ATR Percentile Bands',period:14,multiplier:2,enabled:false}, {id:'cvd-profiles',kind:'CVD Profiles',period:20,enabled:false}, {id:'delta-sigma',kind:'Delta Sigma Heatmap',period:20,enabled:false}, {id:'dual-phase',kind:'Dual Phase Reversal',period:14,enabled:false}, {id:'fractional-kalman',kind:'Fractional EMA Kalman Filter',period:20,enabled:false}, {id:'harmonic-lab',kind:'Harmonic Lab',period:5,enabled:false}, {id:'htf-3-candle',kind:'HTF 3 Candle System',period:3,enabled:false}, {id:'htf-volume-imbalance',kind:'HTF Volume Spike & Imbalance Projection',period:20,multiplier:2,enabled:false}, {id:'initial-balance',kind:'Initial Balance Auction Intelligence',period:60,multiplier:1,enabled:false}, {id:'ltf-microburst',kind:'LTF Volume Microburst Bubbles',period:20,multiplier:2,enabled:false}, {id:'structure-dashboard',kind:'Market Structure Dashboard',period:5,enabled:false}, {id:'neural-weight',kind:'Neural Weight Oscillator',period:20,enabled:false}, {id:'orderblock-ai',kind:'OrderBlock AI',period:5,multiplier:2,enabled:false}, {id:'pivot-zone',kind:'Pivot Consolidation Zone',period:5,enabled:false}, {id:'stoploss-cascades',kind:'Stoploss Cascades',period:20,multiplier:2,enabled:false}, {id:'trend-pressure',kind:'Trend Pressure',period:14,enabled:false}, {id:'trend-target-ribbon',kind:'Trend Target Ribbon',period:20,multiplier:2,enabled:false}, {id:'trinity',kind:'Trinity',period:14,enabled:false}, {id:'vol-shock-half-life',kind:'Volatility Shock Half Life Monitor',period:20,enabled:false}, {id:'volume-delta-footprint',kind:'Volume Delta Footprint',period:20,enabled:false}, {id:'wyckoff',kind:'Wyckoff',period:20,enabled:false},
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
let indicatorStateCache: IndicatorConfig[] | null = null;
const normalizeIndicator=(item: IndicatorConfig): IndicatorConfig => {
  const legacyAppearance = item.appearance && typeof item.appearance === 'object' ? item.appearance as any : {};
  const legacyLine = legacyAppearance.line && typeof legacyAppearance.line === 'object' ? legacyAppearance.line as any : {};
  const legacyFill = legacyAppearance.fill && typeof legacyAppearance.fill === 'object' ? legacyAppearance.fill as any : {};
  const normalizedSeed: IndicatorConfig = {
    ...item,
    appearance: {
      ...legacyAppearance,
      line: {
        ...legacyLine,
        ...(legacyLine.color == null && item.color != null ? { color: item.color } : {}),
        ...(legacyLine.width == null && item.lineWidth != null ? { width: item.lineWidth } : {}),
        ...(legacyLine.style == null && item.lineStyle != null ? { style: Number(item.lineStyle)===1?'dashed':Number(item.lineStyle)===2?'dotted':'solid' } : {}),
        ...(legacyLine.opacity == null && item.display?.opacity != null ? { opacity: item.display.opacity } : {}),
      },
      fill: {
        ...legacyFill,
        ...(legacyFill.upperColor == null && item.upperColor != null ? { upperColor: item.upperColor } : {}),
        ...(legacyFill.lowerColor == null && item.lowerColor != null ? { lowerColor: item.lowerColor } : {}),
      },
    },
  };
  const schema = getIndicatorSettingsSchema(item.kind, normalizedSeed as Record<string, unknown>);
  let normalized: IndicatorConfig = normalizedSeed;
  for (const section of schema.sections) for (const field of section.fields) {
    if (readIndicatorSettingValue(normalized as Record<string, unknown>, field.path) === undefined) {
      normalized = { ...normalized, ...writeIndicatorSettingValue(normalized as Record<string, unknown>, field.path, field.defaultValue) } as IndicatorConfig;
    }
  }
  const display = {
    opacity: Number.isFinite(Number(normalized.display?.opacity)) ? Math.max(0.15, Math.min(1, Number(normalized.display?.opacity))) : 1,
    showLegend: normalized.display?.showLegend ?? true,
    showValues: normalized.display?.showValues ?? true,
    pane: normalized.display?.pane ?? 'auto',
    scale: normalized.display?.scale ?? 'price',
    precision: Number.isFinite(Number(normalized.display?.precision)) ? Math.max(0, Math.min(8, Number(normalized.display?.precision))) : 2,
  };
  const lineWidth = Math.max(1, Math.min(6, Number(normalized.lineWidth) || 2));
  return { ...normalized, display, lineWidth, lineStyle: normalized.lineStyle ?? 0 };
};
export const getIndicators=()=>{ if (indicatorStateCache) return indicatorStateCache; const stored=read<IndicatorConfig[]|null>(IND,null); const base=Array.isArray(stored)&&stored.length ? stored.filter((item:any)=>item&&typeof item==='object'&&typeof item.kind==='string') : defaultIndicators.map((item)=>({...item})); indicatorStateCache = (base.length?base:defaultIndicators.map((item)=>({...item}))).map(normalizeIndicator); localStorage.setItem(IND,JSON.stringify(indicatorStateCache)); localStorage.setItem(`${IND}:version`,IND_VERSION); return indicatorStateCache; };
export const saveIndicators=(v:IndicatorConfig[])=>{ const cache=getIndicators(); cache.splice(0,cache.length,...v.map(normalizeIndicator)); localStorage.setItem(IND,JSON.stringify(cache)); localStorage.setItem(`${IND}:version`,IND_VERSION); window.dispatchEvent(new CustomEvent('tradingcore:indicators',{detail:cache.slice()})); };
export const getAutomations=()=>read<AutomationConfig[]>(AUTO,defaultAutomations);
export const saveAutomations=(v:AutomationConfig[])=>{localStorage.setItem(AUTO,JSON.stringify(v));window.dispatchEvent(new CustomEvent('tradingcore:automations',{detail:v}));};

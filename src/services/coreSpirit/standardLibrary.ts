import type { CoreSpiritType } from './typeSystem';
import type { CoreSpiritIrEmitKind } from './callContract';

export type CoreSpiritBuiltin = {
  name: string;
  minArgs: number;
  maxArgs?: number;
  returnType: CoreSpiritType | 'event' | 'unknown';
  pure: boolean;
  capability?: 'alert' | 'webhook' | 'market' | 'ai';
  emitKind?: CoreSpiritIrEmitKind;
  category: 'series' | 'math' | 'condition' | 'market' | 'state' | 'output' | 'extension';
  seriesExecution?: Readonly<{ vectorizable: boolean; fusible: boolean; strategy: 'elementwise' | 'rolling' | 'stateful' }>;
  temporalSafety?: Readonly<{ causality:'causal'|'noncausal'|'future-dependent'|'repainting'|'unknown'; lookahead:boolean; realtimeSafe:boolean }>;
};

export type CoreSpiritLibraryGroupId =
  | 'core'
  | 'price'
  | 'math'
  | 'trend'
  | 'momentum'
  | 'volatility'
  | 'structure'
  | 'market'
  | 'models'
  | 'visual'
  | 'events'
  | 'data'
  | 'state'
  | 'quant'
  | 'automation'
  | 'model'
  | 'strategy'
  | 'portfolio'
  | 'orderflow'
  | 'options'
  | 'probability'
  | 'system';

export type CoreSpiritLibraryGroup = {
  id: CoreSpiritLibraryGroupId;
  label: string;
  description: string;
  names: readonly string[];
};

/**
 * CoreSpirit v1 standard library.
 * Keep this list intentionally small. Every primitive here must have a
 * deterministic runtime implementation and a contract test.
 */
export const CORE_SPIRIT_STANDARD_LIBRARY: readonly CoreSpiritBuiltin[] = [
  // Series
  { name:'sma', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series', seriesExecution:{vectorizable:true,fusible:true,strategy:'rolling'} },
  { name:'ema', minArgs:1, maxArgs:2, returnType:'series<float>', pure:false, category:'series', seriesExecution:{vectorizable:true,fusible:true,strategy:'stateful'} },
  { name:'hma', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series' },
  { name:'highest', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series', seriesExecution:{vectorizable:true,fusible:true,strategy:'rolling'} },
  { name:'lowest', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series', seriesExecution:{vectorizable:true,fusible:true,strategy:'rolling'} },
  { name:'sum', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series', seriesExecution:{vectorizable:true,fusible:true,strategy:'rolling'} },
  { name:'mean', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series', seriesExecution:{vectorizable:true,fusible:true,strategy:'rolling'} },
  { name:'stdev', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series', seriesExecution:{vectorizable:true,fusible:true,strategy:'rolling'} },
  { name:'wma', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series', seriesExecution:{vectorizable:true,fusible:true,strategy:'rolling'} },
  { name:'rma', minArgs:1, maxArgs:2, returnType:'series<float>', pure:false, category:'series', seriesExecution:{vectorizable:true,fusible:true,strategy:'stateful'} },
  { name:'median', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series', seriesExecution:{vectorizable:true,fusible:true,strategy:'rolling'} },
  { name:'zscore', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'extension', seriesExecution:{vectorizable:true,fusible:true,strategy:'rolling'} },
  { name:'normalize', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'extension', seriesExecution:{vectorizable:true,fusible:true,strategy:'rolling'} },
  { name:'persistence', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'extension', seriesExecution:{vectorizable:true,fusible:true,strategy:'rolling'} },
  { name:'pctchange', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'extension', seriesExecution:{vectorizable:true,fusible:true,strategy:'elementwise'} },
  { name:'returns', minArgs:1, maxArgs:1, returnType:'series<float>', pure:true, category:'extension', temporalSafety:{causality:'causal',lookahead:false,realtimeSafe:true} },
  { name:'roc', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'extension', temporalSafety:{causality:'causal',lookahead:false,realtimeSafe:true} },
  { name:'beta', minArgs:3, maxArgs:3, returnType:'series<float>', pure:false, category:'extension', temporalSafety:{causality:'causal',lookahead:false,realtimeSafe:true} },
  { name:'trendStrength', minArgs:1, maxArgs:2, returnType:'series<float>', pure:false, category:'extension', temporalSafety:{causality:'causal',lookahead:false,realtimeSafe:true} },
  { name:'regimeDetect', minArgs:2, maxArgs:3, returnType:'string', pure:true, category:'extension', temporalSafety:{causality:'causal',lookahead:false,realtimeSafe:true} },
  // Math
  { name:'abs', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'math' },
  { name:'min', minArgs:2, maxArgs:2, returnType:'number', pure:true, category:'math' },
  { name:'max', minArgs:2, maxArgs:2, returnType:'number', pure:true, category:'math' },
  { name:'sqrt', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'math' },
  { name:'pow', minArgs:2, maxArgs:2, returnType:'number', pure:true, category:'math' },
  { name:'log', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'math' },
  { name:'exp', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'math' },
  { name:'round', minArgs:1, maxArgs:2, returnType:'number', pure:true, category:'math' },
  { name:'sign', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'math' },
  // Conditions
  { name:'cross', minArgs:2, maxArgs:2, returnType:'boolean', pure:false, category:'condition' },
  { name:'crossover', minArgs:2, maxArgs:2, returnType:'boolean', pure:false, category:'condition' },
  { name:'crossunder', minArgs:2, maxArgs:2, returnType:'boolean', pure:false, category:'condition' },
  { name:'rising', minArgs:1, maxArgs:2, returnType:'boolean', pure:true, category:'condition' },
  { name:'falling', minArgs:1, maxArgs:2, returnType:'boolean', pure:true, category:'condition' },
  // First-class bounded collections.
  { name:'array', minArgs:0, maxArgs:16_384, returnType:'array<unknown>', pure:true, category:'extension' },
  { name:'map', minArgs:0, maxArgs:16_384, returnType:'map<string,unknown>', pure:true, category:'extension' },
  { name:'len', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'extension' },
  // Market
  { name:'vwap', minArgs:0, maxArgs:1, returnType:'series<float>', pure:false, category:'market', seriesExecution:{vectorizable:true,fusible:false,strategy:'stateful'} },
  { name:'market', minArgs:1, maxArgs:1, returnType:'market:ref', pure:false, category:'market', capability:'market' },
  { name:'timeframe', minArgs:1, maxArgs:1, returnType:'timeframe:ref', pure:false, category:'market', capability:'market' },
  // State
  { name:'nz', minArgs:1, maxArgs:2, returnType:'number', pure:true, category:'state' },
  { name:'na', minArgs:1, maxArgs:1, returnType:'boolean', pure:true, category:'state' },
  { name:'bar_index', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'state' },
  { name:'time', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'state' },
];

/** Existing TradingCoreOS capabilities remain available as an extension set.
 * They are deliberately not part of the small language core.
 */
export const CORE_SPIRIT_EXTENSION_LIBRARY: readonly CoreSpiritBuiltin[] = [
  // Typed quant research primitives. Structured values are only combined by
  // explicit operations; there is deliberately no implicit matrix/scalar broadcast.
  { name:'vector', minArgs:1, returnType:'vector<float>', pure:true, category:'extension' },
  { name:'matrix', minArgs:2, returnType:'matrix<float>', pure:true, category:'extension' },
  { name:'tensor', minArgs:2, returnType:'tensor<float>', pure:true, category:'extension' },
  { name:'zeros', minArgs:2, maxArgs:2, returnType:'matrix<float>', pure:true, category:'extension' },
  { name:'identity', minArgs:1, maxArgs:1, returnType:'matrix<float>', pure:true, category:'extension' },
  { name:'matrixAdd', minArgs:2, maxArgs:2, returnType:'matrix<float>', pure:true, category:'extension' },
  { name:'matrixScale', minArgs:2, maxArgs:2, returnType:'matrix<float>', pure:true, category:'extension' },
  { name:'matmul', minArgs:2, maxArgs:2, returnType:'matrix<float>', pure:true, category:'extension' },
  { name:'transpose', minArgs:1, maxArgs:1, returnType:'matrix<float>', pure:true, category:'extension' },
  { name:'dot', minArgs:2, maxArgs:2, returnType:'number', pure:true, category:'extension' },
  { name:'dataset', minArgs:2, returnType:'dataset<float>', pure:true, category:'extension' },
  { name:'hmmFit', minArgs:2, maxArgs:2, returnType:'number', pure:false, category:'extension' },
  { name:'hmmDecode', minArgs:1, maxArgs:2, returnType:'prediction<float>', pure:false, category:'extension' },
  { name:'hmmProbability', minArgs:1, maxArgs:2, returnType:'probability', pure:false, category:'extension' },
  { name:'hmmPosterior', minArgs:1, maxArgs:2, returnType:'distribution<float>', pure:false, category:'extension' },
  { name:'__input', minArgs:2, maxArgs:2, returnType:'unknown', pure:true, category:'extension' },

  // Visual/output compatibility and advanced surface contracts. These remain
  // executable through the shared registry but are intentionally outside the
  // 30-primitive semantic core. SHOW/EMIT are discoverability-first surfaces.
  { name:'plot', minArgs:1, maxArgs:10, returnType:'event', pure:true, category:'extension', emitKind:'plot' },\n  { name:'plotshape', minArgs:1, maxArgs:15, returnType:'event', pure:true, category:'extension', emitKind:'plotshape' },\n  { name:'plotchar', minArgs:1, maxArgs:15, returnType:'event', pure:true, category:'extension', emitKind:'plotchar' },
{ name:'vpvr', minArgs:0, maxArgs:1, returnType:'number', pure:false, category:'extension', temporalSafety:{causality:'causal',lookahead:false,realtimeSafe:true} },
  { name:'panel', minArgs:1, maxArgs:1, returnType:'visual:area', pure:true, category:'extension' },
  { name:'sidePanel', minArgs:1, maxArgs:1, returnType:'visual:area', pure:true, category:'extension' },
  { name:'floatingArea', minArgs:1, maxArgs:1, returnType:'visual:area', pure:true, category:'extension' },
  { name:'point', minArgs:2, maxArgs:3, returnType:'visual:point', pure:true, category:'extension' },
  { name:'range', minArgs:2, maxArgs:2, returnType:'visual:range', pure:true, category:'extension' },
  { name:'above_bar', minArgs:0, maxArgs:1, returnType:'visual:position', pure:true, category:'extension' },
  { name:'below_bar', minArgs:0, maxArgs:1, returnType:'visual:position', pure:true, category:'extension' },
  { name:'at_bar', minArgs:0, maxArgs:1, returnType:'visual:position', pure:true, category:'extension' },
  { name:'meta', minArgs:2, maxArgs:undefined, returnType:'unknown', pure:true, category:'extension' },
  { name:'signal', minArgs:1, maxArgs:2, returnType:'signal-intent', pure:false, category:'extension', emitKind:'signal' },
  { name:'emit', minArgs:1, maxArgs:1, returnType:'event', pure:false, category:'extension', emitKind:'event' },

  { name:'rsi', minArgs:1, maxArgs:2, returnType:'series<float>', pure:false, category:'extension', seriesExecution:{vectorizable:true,fusible:false,strategy:'stateful'}, temporalSafety:{causality:'causal',lookahead:false,realtimeSafe:true} },
  { name:'event', minArgs:1, maxArgs:1, returnType:'boolean', pure:false, category:'extension', temporalSafety:{causality:'causal',lookahead:false,realtimeSafe:true} },
  { name:'model', minArgs:1, maxArgs:1, returnType:'model:ref', pure:false, category:'extension' },
  { name:'model.predict', minArgs:1, maxArgs:undefined, returnType:'prediction<number>', pure:false, category:'extension', capability:'ai' },
  { name:'model.probability', minArgs:1, maxArgs:undefined, returnType:'probability', pure:false, category:'extension', capability:'ai' },

  { name:'variance', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'extension', seriesExecution:{vectorizable:true,fusible:true,strategy:'rolling'} },
  { name:'atr', minArgs:0, maxArgs:1, returnType:'series<float>', pure:false, category:'extension', seriesExecution:{vectorizable:true,fusible:false,strategy:'stateful'}, temporalSafety:{causality:'causal',lookahead:false,realtimeSafe:true} },
  { name:'change', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'extension', seriesExecution:{vectorizable:true,fusible:true,strategy:'elementwise'} },
  { name:'isNa', minArgs:1, maxArgs:1, returnType:'boolean', pure:true, category:'extension' },
  { name:'exp', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'extension' },
  { name:'log', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'extension' },
  { name:'tanh', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'extension' },
  { name:'clamp', minArgs:3, maxArgs:3, returnType:'number', pure:true, category:'extension' },
  { name:'sigmoid', minArgs:1, maxArgs:2, returnType:'number', pure:true, category:'extension' },
  { name:'probability', minArgs:1, maxArgs:2, returnType:'number', pure:true, category:'extension' },
  { name:'predict', minArgs:3, maxArgs:15, returnType:'number', pure:true, category:'extension', capability:'ai' },
  { name:'score', minArgs:3, maxArgs:15, returnType:'number', pure:true, category:'extension', capability:'ai' },
  { name:'toNumber', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'extension' },
  { name:'toPrice', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'extension' },
  { name:'toVolume', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'extension' },
  { name:'toTime', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'extension' },
  { name:'toDuration', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'extension' },
  { name:'toCurrency', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'extension' },
  // request(symbol, timeframe, field, offset?, alignment?) — alignment is confirmed|historical|developing|realtime.
  { name:'request', minArgs:3, maxArgs:5, returnType:'number', pure:false, category:'extension', capability:'market', temporalSafety:{causality:'causal',lookahead:false,realtimeSafe:true} },\n  { name:'request.security', minArgs:3, maxArgs:5, returnType:'number', pure:false, category:'extension', capability:'market', temporalSafety:{causality:'causal',lookahead:false,realtimeSafe:true} },\n  { name:'request.security_lower_tf', minArgs:3, maxArgs:3, returnType:'array<float>', pure:false, category:'extension', capability:'market', temporalSafety:{causality:'causal',lookahead:false,realtimeSafe:true} },
  { name:'requestBatch', minArgs:3, maxArgs:15, returnType:'number', pure:false, category:'extension', capability:'market', temporalSafety:{causality:'causal',lookahead:false,realtimeSafe:true} },
  { name:'bid', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'ask', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'spread', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'mid', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'intrabarCount', minArgs:1, maxArgs:1, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'intrabarSum', minArgs:2, maxArgs:2, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'intrabarHigh', minArgs:2, maxArgs:2, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'intrabarLow', minArgs:2, maxArgs:2, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'intrabarDelta', minArgs:1, maxArgs:1, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'lowerTf', minArgs:2, maxArgs:2, returnType:'unknown', pure:false, category:'extension', capability:'market' },
  { name:'depthImbalance', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'footprintDelta', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'footprintBuy', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'footprintSell', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'footprintPoc', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'footprintVah', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'footprintVal', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'footprintRows', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'footprintRowPrice', minArgs:1, maxArgs:1, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'footprintRowBuy', minArgs:1, maxArgs:1, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'footprintRowSell', minArgs:1, maxArgs:1, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'footprintRowDelta', minArgs:1, maxArgs:1, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'footprintRowImbalance', minArgs:1, maxArgs:1, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'show', minArgs:1, maxArgs:16, returnType:'event', pure:true, category:'output', emitKind:'show' },
  { name:'marker', minArgs:1, maxArgs:7, returnType:'event', pure:true, category:'extension', emitKind:'marker' },
  { name:'text', minArgs:1, maxArgs:8, returnType:'event', pure:true, category:'extension', emitKind:'text' },
  { name:'polygon', minArgs:3, maxArgs:20, returnType:'event', pure:true, category:'extension', emitKind:'polygon' },
  { name:'customVisual', minArgs:2, maxArgs:6, returnType:'event', pure:true, category:'extension', emitKind:'customVisual' },
  { name:'label', minArgs:1, maxArgs:8, returnType:'event', pure:true, category:'extension', emitKind:'label' },
  { name:'labelAt', minArgs:2, maxArgs:9, returnType:'event', pure:true, category:'extension', emitKind:'labelAt' },
  { name:'line', minArgs:2, maxArgs:7, returnType:'event', pure:true, category:'extension', emitKind:'line' },
  { name:'zone', minArgs:4, maxArgs:8, returnType:'event', pure:true, category:'extension', emitKind:'zone' },
  { name:'box', minArgs:2, maxArgs:8, returnType:'event', pure:true, category:'extension', emitKind:'box' },
  { name:'band', minArgs:2, maxArgs:4, returnType:'event', pure:true, category:'extension', emitKind:'band' },
  { name:'fill', minArgs:2, maxArgs:4, returnType:'event', pure:true, category:'extension', emitKind:'fill' },
  { name:'gradient', minArgs:2, maxArgs:5, returnType:'event', pure:true, category:'extension', emitKind:'gradient' },
  { name:'arrow', minArgs:4, maxArgs:6, returnType:'event', pure:true, category:'extension', emitKind:'arrow' },
  { name:'shape', minArgs:2, maxArgs:5, returnType:'event', pure:true, category:'extension', emitKind:'shape' },
  { name:'heatmap', minArgs:2, maxArgs:5, returnType:'event', pure:true, category:'extension', emitKind:'heatmap' },
  { name:'polyline', minArgs:6, maxArgs:20, returnType:'event', pure:true, category:'extension', emitKind:'polyline' },
  { name:'hline', minArgs:1, maxArgs:4, returnType:'event', pure:true, category:'extension', emitKind:'hline' },
  { name:'bg', minArgs:1, maxArgs:2, returnType:'event', pure:true, category:'extension', emitKind:'bg' },
  { name:'barcolor', minArgs:1, maxArgs:2, returnType:'event', pure:true, category:'extension', emitKind:'barcolor' },
  { name:'table', minArgs:4, maxArgs:7, returnType:'event', pure:true, category:'extension', emitKind:'table' },
  { name:'entry', minArgs:2, maxArgs:6, returnType:'event', pure:false, category:'extension', emitKind:'entry' },
  { name:'exit', minArgs:1, maxArgs:2, returnType:'event', pure:false, category:'extension', emitKind:'exit' },
  { name:'buy', minArgs:0, maxArgs:3, returnType:'event', pure:false, category:'extension', emitKind:'buy' },
  { name:'sell', minArgs:0, maxArgs:3, returnType:'event', pure:false, category:'extension', emitKind:'sell' },
  { name:'order', minArgs:2, maxArgs:6, returnType:'event', pure:false, category:'extension', emitKind:'orderIntent' },
  { name:'alert', minArgs:0, maxArgs:2, returnType:'event', pure:false, category:'extension', capability:'alert', emitKind:'alert' },\n  { name:'alertcondition', minArgs:2, maxArgs:4, returnType:'event', pure:false, category:'extension', capability:'alert', emitKind:'alertcondition' },
  { name:'webhook', minArgs:1, returnType:'event', pure:false, category:'extension', capability:'webhook', emitKind:'webhook' },
  { name:'automation.notify', minArgs:1, maxArgs:2, returnType:'event', pure:false, category:'extension' },
  { name:'automation.route', minArgs:1, maxArgs:2, returnType:'event', pure:false, category:'extension' },
  { name:'risk.allowed', minArgs:0, maxArgs:1, returnType:'boolean', pure:false, category:'extension' },
  { name:'background.when', minArgs:2, maxArgs:2, returnType:'event', pure:false, category:'extension', emitKind:'bg' },
];

/**
 * Human-facing catalog order. This is deliberately separate from the executable
 * builtin array: reorganizing discovery must never change runtime semantics.
 *
 * Names listed here are only builtins that already exist in the registry.
 * Desired future indicators such as `roc` and `stoch` are documented as
 * candidates but are not exposed until their deterministic runtime contracts exist.
 */
export const CORE_SPIRIT_LIBRARY_GROUPS: readonly CoreSpiritLibraryGroup[] = [
  { id:'price', label:'Price', description:'Current-bar market series.', names:['open','high','low','close','volume'] },
  { id:'core', label:'Core', description:'Deterministic primitives shared by every CoreSpirit authoring level.', names:['abs','min','max','sqrt','pow','round','sign','log','exp'] },
  { id:'math', label:'Math', description:'Deterministic scalar and numerical helpers.', names:['abs','min','max','sqrt','pow','round','sign','exp','log','tanh','clamp','sigmoid'] },
  { id:'trend', label:'Trend', description:'Smoothing and trend-oriented series transforms.', names:['sma','ema','hma','wma','rma'] },
  { id:'momentum', label:'Momentum', description:'Momentum and oscillator transforms already backed by runtime contracts.', names:['rsi','change','probability'] },
  { id:'volatility', label:'Volatility', description:'Volatility and dispersion measurements.', names:['atr','stdev','variance'] },
  { id:'structure', label:'Structure', description:'Range, extrema and crossing conditions.', names:['highest','lowest','cross','crossover','crossunder','rising','falling'] },
  { id:'market', label:'Market', description:'Instrument, timeframe and session-aware market references.', names:['market','timeframe','vwap'] },
  { id:'models', label:'Models', description:'Typed model references and host-bound model inference.', names:['model','predict','score'] },
  { id:'visual', label:'Visual', description:'Primary visual projection surface.', names:['show'] },
  { id:'events', label:'Events', description:'Reactive event emission and event queries.', names:['emit','event','signal','alert','webhook'] },
  { id:'data', label:'Data', description:'Advanced host-provided market-data access.', names:['request','requestBatch','lowerTf','bid','ask','spread','mid','intrabarCount','intrabarSum','intrabarHigh','intrabarLow','intrabarDelta','depthImbalance','footprintDelta','footprintBuy','footprintSell','footprintPoc','footprintVah','footprintVal','footprintRows','footprintRowPrice','footprintRowBuy','footprintRowSell','footprintRowDelta','footprintRowImbalance'] },
  { id:'state', label:'State', description:'Execution-frame and missing-value helpers.', names:['nz','na','isNa','bar_index','time'] },
  { id:'quant', label:'Quant', description:'Research-oriented return, factor, regime and statistical transforms.', names:['returns','beta','trendStrength','regimeDetect','zscore','variance','stdev'] },
  { id:'probability', label:'Probability', description:'Probability and model-confidence semantics.', names:['probability','sigmoid'] },
  { id:'strategy', label:'Strategy', description:'Signal and broker-neutral order-intent construction.', names:['signal','order','entry','exit'] },
  { id:'automation', label:'Automation', description:'Host-routed notifications and automation actions.', names:['notify','route'] },
  { id:'portfolio', label:'Portfolio', description:'Host portfolio state surface; execution remains outside CoreSpirit.', names:['position','exposure','pnl'] },
  { id:'orderflow', label:'Order Flow', description:'Normalized trade, depth and footprint primitives.', names:['depthImbalance','footprintDelta','footprintBuy','footprintSell'] },
  { id:'options', label:'Options', description:'Explicit options analytics catalog; runtime kernels are host-provided as they become available.', names:['impliedVolatility','delta','gamma','theta','vega'] },
  { id:'system', label:'System', description:'Reactive event execution and host-owned authority boundaries.', names:['event','on','risk.allowed'] },
];

const CORE_SPIRIT_LIBRARY_GROUP_BY_NAME = new Map<string, CoreSpiritLibraryGroup>(
  CORE_SPIRIT_LIBRARY_GROUPS.flatMap(group => group.names.map(name => [name, group] as const)),
);

export function getCoreSpiritLibraryGroup(name: string): CoreSpiritLibraryGroup | undefined {
  return CORE_SPIRIT_LIBRARY_GROUP_BY_NAME.get(name);
}

export function getCoreSpiritLibraryCatalog(): readonly CoreSpiritLibraryGroup[] {
  return CORE_SPIRIT_LIBRARY_GROUPS;
}

export const CORE_SPIRIT_STDLIB: readonly CoreSpiritBuiltin[] = [
  ...CORE_SPIRIT_STANDARD_LIBRARY,
  ...CORE_SPIRIT_EXTENSION_LIBRARY,
];

export const CORE_SPIRIT_BUILTINS = new Map(CORE_SPIRIT_STDLIB.map(x => [x.name, x]));
export const CORE_SPIRIT_CORE_BUILTINS = new Map(CORE_SPIRIT_STANDARD_LIBRARY.map(x => [x.name, x]));

export function getCoreSpiritBuiltin(name: string): CoreSpiritBuiltin | undefined {
  return CORE_SPIRIT_BUILTINS.get(name);
}

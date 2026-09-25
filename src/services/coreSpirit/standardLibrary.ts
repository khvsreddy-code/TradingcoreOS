import type { CoreSpiritType } from './typeSystem';

export type CoreSpiritBuiltin = {
  name: string;
  minArgs: number;
  maxArgs?: number;
  returnType: CoreSpiritType | 'event' | 'unknown';
  pure: boolean;
  capability?: 'alert' | 'webhook' | 'market' | 'ai';
  category: 'series' | 'math' | 'condition' | 'market' | 'state' | 'output' | 'extension';
};

/**
 * CoreSpirit v1 standard library.
 * Keep this list intentionally small. Every primitive here must have a
 * deterministic runtime implementation and a contract test.
 */
export const CORE_SPIRIT_STANDARD_LIBRARY: readonly CoreSpiritBuiltin[] = [
  // Series
  { name:'sma', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series' },
  { name:'ema', minArgs:1, maxArgs:2, returnType:'series<float>', pure:false, category:'series' },
  { name:'hma', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series' },
  { name:'highest', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series' },
  { name:'lowest', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series' },
  { name:'sum', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series' },
  { name:'mean', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series' },
  { name:'stdev', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series' },
  { name:'wma', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series' },
  { name:'rma', minArgs:1, maxArgs:2, returnType:'series<float>', pure:false, category:'series' },
  { name:'median', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'series' },
  // Math
  { name:'abs', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'math' },
  { name:'min', minArgs:2, maxArgs:2, returnType:'number', pure:true, category:'math' },
  { name:'max', minArgs:2, maxArgs:2, returnType:'number', pure:true, category:'math' },
  { name:'sqrt', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'math' },
  { name:'pow', minArgs:2, maxArgs:2, returnType:'number', pure:true, category:'math' },
  { name:'round', minArgs:1, maxArgs:2, returnType:'number', pure:true, category:'math' },
  { name:'sign', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'math' },
  // Conditions
  { name:'cross', minArgs:2, maxArgs:2, returnType:'boolean', pure:false, category:'condition' },
  { name:'crossover', minArgs:2, maxArgs:2, returnType:'boolean', pure:false, category:'condition' },
  { name:'crossunder', minArgs:2, maxArgs:2, returnType:'boolean', pure:false, category:'condition' },
  { name:'rising', minArgs:1, maxArgs:2, returnType:'boolean', pure:true, category:'condition' },
  { name:'falling', minArgs:1, maxArgs:2, returnType:'boolean', pure:true, category:'condition' },
  // Market
  { name:'vwap', minArgs:0, maxArgs:1, returnType:'series<float>', pure:false, category:'market' },
  // State
  { name:'nz', minArgs:1, maxArgs:2, returnType:'number', pure:true, category:'state' },
  { name:'na', minArgs:1, maxArgs:1, returnType:'boolean', pure:true, category:'state' },
  { name:'bar_index', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'state' },
  { name:'time', minArgs:0, maxArgs:0, returnType:'number', pure:false, category:'state' },
  // Output / strategy primitives
  { name:'plot', minArgs:1, maxArgs:5, returnType:'event', pure:true, category:'output' },
  { name:'signal', minArgs:1, maxArgs:2, returnType:'event', pure:false, category:'output' },
];

/** Existing TradingCoreOS capabilities remain available as an extension set.
 * They are deliberately not part of the small language core.
 */
export const CORE_SPIRIT_EXTENSION_LIBRARY: readonly CoreSpiritBuiltin[] = [
  { name:'rsi', minArgs:1, maxArgs:2, returnType:'series<float>', pure:false, category:'extension' },
  { name:'variance', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'extension' },
  { name:'atr', minArgs:0, maxArgs:1, returnType:'series<float>', pure:false, category:'extension' },
  { name:'change', minArgs:1, maxArgs:2, returnType:'series<float>', pure:true, category:'extension' },
  { name:'isNa', minArgs:1, maxArgs:1, returnType:'boolean', pure:true, category:'extension' },
  { name:'exp', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'extension' },
  { name:'log', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'extension' },
  { name:'tanh', minArgs:1, maxArgs:1, returnType:'number', pure:true, category:'extension' },
  { name:'clamp', minArgs:3, maxArgs:3, returnType:'number', pure:true, category:'extension' },
  { name:'sigmoid', minArgs:1, maxArgs:2, returnType:'number', pure:true, category:'extension' },
  { name:'probability', minArgs:1, maxArgs:2, returnType:'number', pure:true, category:'extension' },
  { name:'predict', minArgs:3, maxArgs:15, returnType:'number', pure:true, category:'extension', capability:'ai' },
  { name:'score', minArgs:3, maxArgs:15, returnType:'number', pure:true, category:'extension', capability:'ai' },
  { name:'request', minArgs:3, maxArgs:4, returnType:'number', pure:false, category:'extension', capability:'market' },
  { name:'requestBatch', minArgs:3, maxArgs:15, returnType:'number', pure:false, category:'extension', capability:'market' },
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
  { name:'marker', minArgs:1, maxArgs:4, returnType:'event', pure:true, category:'extension' },
  { name:'label', minArgs:1, maxArgs:8, returnType:'event', pure:true, category:'extension' },
  { name:'labelAt', minArgs:2, maxArgs:9, returnType:'event', pure:true, category:'extension' },
  { name:'line', minArgs:4, maxArgs:5, returnType:'event', pure:true, category:'extension' },
  { name:'zone', minArgs:4, maxArgs:8, returnType:'event', pure:true, category:'extension' },
  { name:'box', minArgs:4, maxArgs:8, returnType:'event', pure:true, category:'extension' },
  { name:'band', minArgs:2, maxArgs:4, returnType:'event', pure:true, category:'extension' },
  { name:'fill', minArgs:2, maxArgs:4, returnType:'event', pure:true, category:'extension' },
  { name:'gradient', minArgs:2, maxArgs:5, returnType:'event', pure:true, category:'extension' },
  { name:'arrow', minArgs:4, maxArgs:6, returnType:'event', pure:true, category:'extension' },
  { name:'shape', minArgs:2, maxArgs:5, returnType:'event', pure:true, category:'extension' },
  { name:'heatmap', minArgs:2, maxArgs:5, returnType:'event', pure:true, category:'extension' },
  { name:'polyline', minArgs:6, maxArgs:20, returnType:'event', pure:true, category:'extension' },
  { name:'hline', minArgs:1, maxArgs:4, returnType:'event', pure:true, category:'extension' },
  { name:'bg', minArgs:1, maxArgs:2, returnType:'event', pure:true, category:'extension' },
  { name:'barcolor', minArgs:1, maxArgs:2, returnType:'event', pure:true, category:'extension' },
  { name:'table', minArgs:4, maxArgs:7, returnType:'event', pure:true, category:'extension' },
  { name:'entry', minArgs:2, maxArgs:6, returnType:'event', pure:false, category:'extension' },
  { name:'exit', minArgs:1, maxArgs:2, returnType:'event', pure:false, category:'extension' },
  { name:'alert', minArgs:0, returnType:'event', pure:false, category:'extension', capability:'alert' },
  { name:'webhook', minArgs:1, returnType:'event', pure:false, category:'extension', capability:'webhook' },
];

export const CORE_SPIRIT_STDLIB: readonly CoreSpiritBuiltin[] = [
  ...CORE_SPIRIT_STANDARD_LIBRARY,
  ...CORE_SPIRIT_EXTENSION_LIBRARY,
];

export const CORE_SPIRIT_BUILTINS = new Map(CORE_SPIRIT_STDLIB.map(x => [x.name, x]));
export const CORE_SPIRIT_CORE_BUILTINS = new Map(CORE_SPIRIT_STANDARD_LIBRARY.map(x => [x.name, x]));

export function getCoreSpiritBuiltin(name: string): CoreSpiritBuiltin | undefined {
  return CORE_SPIRIT_BUILTINS.get(name);
}

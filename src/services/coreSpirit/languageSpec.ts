/**
 * CoreSpirit v1 language boundary.
 *
 * This is deliberately small. New syntax should be added here first, then
 * implemented in lexer/parser/type-system/compiler/runtime together with a
 * contract test. Renderer/broker concerns are not part of the language core.
 */
export const CORE_SPIRIT_V1_SURFACE = Object.freeze({
  statements: Object.freeze(['let', 'if', 'else', 'type'] as const),
  scalarTypes: Object.freeze(['int', 'float', 'number', 'boolean', 'string', 'null'] as const),
  seriesTypes: Object.freeze([
    'series<int>',
    'series<float>',
    'series<number>',
    'series<boolean>',
    'series<string>',
  ] as const),
  builtInSeries: Object.freeze(['open', 'high', 'low', 'close', 'volume', 'time'] as const),
  standardLibrary: Object.freeze([
    'sma','ema','hma','highest','lowest','sum','mean','stdev','wma','rma','median',
    'abs','min','max','sqrt','pow','round','sign',
    'cross','crossover','crossunder','rising','falling',
    'vwap','nz','na','bar_index','time','plot','signal',
  ] as const),
  executionOutputs: Object.freeze(['plot', 'signal'] as const),
  mathIndicators: Object.freeze([
    'sma', 'ema', 'hma', 'rsi', 'atr', 'vwap', 'highest', 'lowest', 'sum', 'mean', 'stdev', 'wma', 'rma', 'median', 'variance', 'change',
  ] as const),
  coreMath: Object.freeze([
    'nz', 'na', 'bar_index', 'time', 'cross', 'crossover', 'crossunder', 'rising', 'falling', 'max', 'min', 'abs', 'sqrt', 'pow', 'round', 'sign', 'isNa', 'exp', 'log', 'tanh',
    'clamp', 'sigmoid', 'probability',
  ] as const),
  nonGoals: Object.freeze([
    'arbitrary host/network access from the VM',
    'DOM/chart ownership inside the VM',
    'broker credentials or order submission inside the VM',
    'future indexing',
    'implicit mutation of a historical bar',
  ] as const),
});

export type CoreSpiritV1ScalarType = typeof CORE_SPIRIT_V1_SURFACE.scalarTypes[number];
export type CoreSpiritV1SeriesType = typeof CORE_SPIRIT_V1_SURFACE.seriesTypes[number];

export function isCoreSpiritV1ScalarType(value: string): value is CoreSpiritV1ScalarType {
  return (CORE_SPIRIT_V1_SURFACE.scalarTypes as readonly string[]).includes(value);
}

export function isCoreSpiritV1SeriesType(value: string): value is CoreSpiritV1SeriesType {
  return (CORE_SPIRIT_V1_SURFACE.seriesTypes as readonly string[]).includes(value);
}

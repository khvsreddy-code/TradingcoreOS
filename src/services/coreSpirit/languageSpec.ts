/**
 * CoreSpirit v1 language boundary.
 *
 * This is deliberately small. New core syntax should be added here first. Surface conveniences belong in
 * registered transforms; callable/member semantics belong in the shared registries,
 * then converge through the same lexer/parser/type-system/compiler/runtime path. Renderer/broker concerns are not part of the language core.
 */
export const CORE_SPIRIT_V1_SURFACE = Object.freeze({
  userConcepts: Object.freeze(['DATA', 'LET', 'WHEN', 'SHOW', 'MODEL', 'AUTOMATE'] as const),
  statements: Object.freeze(['let', 'if', 'else', 'type', 'on', ':='] as const),
  scalarTypes: Object.freeze(['int', 'float', 'number', 'boolean', 'string', 'null', 'price', 'volume', 'time', 'duration', 'currency'] as const),
  temporalTypes: Object.freeze(['scalar<float>', 'scalar<number>', 'scalar<int>', 'series<T>', 'window<T>', 'state<T>', 'event<T>', 'snapshot<T>', 'stream<T>', 'confirmed<T>', 'developing<T>', 'forecast<T>'] as const),\n  temporalPhases: Object.freeze(['historical', 'confirmed', 'developing', 'realtime', 'forecast'] as const),
  safetyAnnotations: Object.freeze(['@causal', '@noncausal', '@futureDependent', '@repainting', '@realtimeSafe', '@lookahead(false)', '@lookahead(true)'] as const),\n  seriesTypes: Object.freeze([
    'series<int>',
    'series<float>',
    'series<number>',
    'series<boolean>',
    'series<string>',
    'series<price>',
    'series<volume>',
    'series<time>',
    'series<duration>',
    'series<currency>',
  ] as const),
  builtInSeries: Object.freeze(['open', 'high', 'low', 'close', 'volume', 'time'] as const),
  standardLibrary: Object.freeze([
    'sma','ema','hma','highest','lowest','sum','mean','stdev','wma','rma','median',
    'abs','min','max','sqrt','pow','round','sign',
    'cross','crossover','crossunder','rising','falling',
    'vwap','nz','na','bar_index','time','event','emit','show','plot','signal',
  ] as const),
  executionOutputs: Object.freeze(['show', 'plot', 'signal', 'event'] as const),
  mathIndicators: Object.freeze([
    'sma', 'ema', 'hma', 'rsi', 'atr', 'vwap', 'highest', 'lowest', 'sum', 'mean', 'stdev', 'wma', 'rma', 'median', 'variance', 'change',
  ] as const),
  coreMath: Object.freeze([
    'nz', 'na', 'bar_index', 'time', 'cross', 'crossover', 'crossunder', 'rising', 'falling', 'max', 'min', 'abs', 'sqrt', 'pow', 'round', 'sign', 'isNa', 'exp', 'log', 'tanh',
    'clamp', 'sigmoid', 'probability', 'toNumber', 'toPrice', 'toVolume', 'toTime', 'toDuration', 'toCurrency',
  ] as const),
  surfaceRules: Object.freeze([
    'WHEN blocks are indentation/colon sugar for if blocks',
    'EVENT is a shared immutable runtime value; emit produces it and when consumes it; EVENT is cross-cutting, not a seventh top-level block concept',
    'SHOW is the universal visual projection; plot() and other visual calls are compatibility/advanced APIs',
    'MODEL and AUTOMATE declarations are artifact metadata plus existing executable calls',
    'DATA is the read-only market/context concept; it is not a broker API',\n    'series<T> is typed historical/vector data; window<T> is a bounded view; state<T> is persistent mutable program memory; event<T>/stream<T> are event-fed domains',\n    'confirmed<T>, developing<T>, and forecast<T> make temporal certainty explicit instead of hiding it inside historical-series behavior',\n    'on event { ... } scopes are explicit execution regions; := is reserved for state<T> mutation',
    'repaint-safety annotations are compiler assertions; an assertion that contradicts inferred causality fails compilation rather than merely suppressing a warning',
    '@lookahead(false) forbids proven future-dependent inputs; unresolved provenance remains visible as unknown rather than being silently treated as safe',
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

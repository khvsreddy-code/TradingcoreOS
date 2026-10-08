/**
 * CoreSpirit v1 language boundary.
 *
 * This is deliberately small. New core syntax should be added here first. Surface conveniences belong in
 * registered transforms; callable/member semantics belong in the shared registries,
 * then converge through the same lexer/parser/type-system/compiler/runtime path. Renderer/broker concerns are not part of the language core.
 */
export const CORE_SPIRIT_V1_SURFACE = Object.freeze({
  language: 'CoreScript' as const,
  languageVersion: 1 as const,
  languageModel: 'one language with progressive authoring levels' as const,
  capabilityDeclaration: 'requires <capability>[, <capability>...]' as const,
  userConcepts: Object.freeze(['DATA', 'LET', 'WHEN', 'SHOW', 'MODEL', 'AUTOMATE'] as const),
  statements: Object.freeze(['let', 'if', 'else', 'type', 'on', ':='] as const),
  authoringLevels: Object.freeze(['beginner', 'trader', 'quant', 'system'] as const),
  levelSemantics: Object.freeze({
    beginner: 'readable indicator authoring over DATA / LET / WHEN / SHOW',
    trader: 'strategy, risk arithmetic, multi-symbol and multi-timeframe composition',
    quant: 'typed research, matrix/tensor/statistics, models, predictions and fitting surfaces',
    system: 'host events, automation and execution routing guarded by explicit capabilities',
  } as const),
  systemCapabilities: Object.freeze(['market.tick','order.fill','position.update','risk.evaluate','execution.route','webhooks','automation'] as const),
  namespaces: Object.freeze([
    'core', 'ta', 'stats', 'math', 'probability', 'regime', 'market', 'orderflow',
    'strategy', 'portfolio', 'risk', 'model', 'ml', 'prediction', 'automation', 'events',
    'visual', 'chart', 'state', 'data',
  ] as const),
  scalarTypes: Object.freeze(['int', 'float', 'number', 'boolean', 'string', 'null', 'price', 'volume', 'time', 'duration', 'currency'] as const),
  temporalTypes: Object.freeze(['scalar<float>', 'scalar<number>', 'scalar<int>', 'series<T>', 'window<T>', 'state<T>', 'event<T>', 'snapshot<T>', 'stream<T>', 'confirmed<T>', 'developing<T>', 'forecast<T>'] as const),
  temporalPhases: Object.freeze(['historical', 'confirmed', 'developing', 'realtime', 'forecast'] as const),
  safetyAnnotations: Object.freeze(['@causal', '@noncausal', '@futureDependent', '@repainting', '@realtimeSafe', '@lookahead(false)', '@lookahead(true)'] as const),
  seriesTypes: Object.freeze([
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
    'abs','min','max','sqrt','pow','round','sign','log','exp',
    'cross','crossover','crossunder','rising','falling',
    'vwap','returns','beta','trendStrength','regimeDetect','zscore','roc','nz','na','bar_index','time','event','emit','show','plot','signal','order',
  ] as const),
  executionOutputs: Object.freeze(['show', 'plot', 'signal', 'event', 'orderIntent', 'automationEvent'] as const),
  mathIndicators: Object.freeze([
    'sma', 'ema', 'hma', 'rsi', 'atr', 'vwap', 'highest', 'lowest', 'sum', 'mean', 'stdev', 'wma', 'rma', 'median', 'variance', 'change', 'roc', 'zscore', 'beta', 'trendStrength',
  ] as const),
  coreMath: Object.freeze([
    'nz', 'na', 'bar_index', 'time', 'cross', 'crossover', 'crossunder', 'rising', 'falling', 'max', 'min', 'abs', 'sqrt', 'pow', 'round', 'sign', 'isNa', 'exp', 'log', 'tanh',
    'clamp', 'sigmoid', 'probability', 'toNumber', 'toPrice', 'toVolume', 'toTime', 'toDuration', 'toCurrency',
  ] as const),
  firstClassValueKinds: Object.freeze([
    'series<float>', 'prediction<float>', 'probability', 'distribution<float>',
    'feature<float>', 'featureSet<float>', 'model<float>', 'forecast<float>',
    'dataset<float>', 'trainingData<float>', 'experiment<float>', 'modelArtifact<float>',
  ] as const),
  surfaceRules: Object.freeze([
    'WHEN blocks are indentation/colon sugar for if blocks',
    'EVENT is a shared immutable runtime value; emit produces it and when consumes it; EVENT is cross-cutting, not a seventh top-level block concept',
    'SHOW is the universal visual projection; plot() and other visual calls are compatibility/advanced APIs',
    'MODEL declarations describe graph inputs/outputs and execution bindings; their bodies are declarative metadata lowered into the same executable IR',
    'AUTOMATE/event declarations lower into event gates and host-routed events; they cannot submit a broker order directly',
    'namespace-qualified calls resolve through the same builtin/component contract registry as unqualified calls',
    'DATA is the read-only market/context concept; it is not a broker API',
    'series<T> is typed historical/vector data; window<T> is a bounded view; state<T> is persistent mutable program memory; event<T>/stream<T> are event-fed domains',
    'confirmed<T>, developing<T>, and forecast<T> make temporal certainty explicit instead of hiding it inside historical-series behavior',
    'on event { ... } scopes are explicit execution regions; := is reserved for state<T> mutation',
    'repaint-safety annotations are compiler assertions; an assertion that contradicts inferred causality fails compilation rather than merely suppressing a warning',
    '@lookahead(false) forbids proven future-dependent inputs; unresolved provenance remains visible as unknown rather than being silently treated as safe',
  ] as const),
  authoringDepths: Object.freeze({
    beginner: 'single-symbol indicators and visual signals',
    trader: 'multi-symbol/timeframe data graphs and strategy signals',
    quant: 'typed features, statistical factors, models, predictions and backtests',
    system: 'reactive events, automation and host-owned execution intents',
  } as const),
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

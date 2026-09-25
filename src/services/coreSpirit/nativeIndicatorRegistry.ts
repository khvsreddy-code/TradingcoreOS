/**
 * Canonical native-indicator contract. The registry is descriptive metadata;
 * calculation still lives in indicatorEngine.ts so there is exactly one math
 * implementation for every primitive.
 */
export type CoreSpiritNativeIndicatorSpec = {
  name: string;
  stateful: boolean;
  requiresCurrentValue: boolean;
  supportsRollback: boolean;
  deterministic: true;
};

export const CORE_SPIRIT_NATIVE_INDICATORS: readonly CoreSpiritNativeIndicatorSpec[] = [
  ['sma',false], ['ema',true], ['hma',false], ['highest',false], ['lowest',false],
  ['sum',false], ['mean',false], ['stdev',false], ['wma',false], ['rma',true], ['median',false],
  ['rsi',true], ['atr',true], ['change',false]
].map(([name,stateful]) => ({
  name: String(name),
  stateful: Boolean(stateful),
  requiresCurrentValue: true,
  supportsRollback: true,
  deterministic: true as const,
}));

export const CORE_SPIRIT_NATIVE_INDICATOR_NAMES = new Set(
  CORE_SPIRIT_NATIVE_INDICATORS.map(spec => spec.name),
);

export function getNativeIndicatorSpec(name: string): CoreSpiritNativeIndicatorSpec | undefined {
  return CORE_SPIRIT_NATIVE_INDICATORS.find(spec => spec.name === name);
}

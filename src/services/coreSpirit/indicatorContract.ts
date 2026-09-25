/**
 * Native indicator contract — Stage 43.
 * Mathematics are pure; state ownership belongs to the runtime transaction.
 */

export const CORE_SPIRIT_INDICATOR_ABI_VERSION = 1 as const;

export type NativeIndicatorPurity = 'pure' | 'stateful';

export interface NativeIndicatorDescriptor {
  abiVersion: typeof CORE_SPIRIT_INDICATOR_ABI_VERSION;
  name: string;
  purity: NativeIndicatorPurity;
  deterministic: true;
  rollbackSafe: true;
  minLookback: number;
  inputKinds: readonly string[];
  outputKind: 'scalar' | 'series';
}

export interface NativeIndicatorExecution {
  descriptor: NativeIndicatorDescriptor;
  inputs: readonly number[];
  history: readonly number[];
  stateKey?: string;
  previousState?: readonly number[];
  value: number | null;
  nextState?: readonly number[];
}

export const CORE_SPIRIT_NATIVE_INDICATOR_CONTRACT: Readonly<Record<string, NativeIndicatorDescriptor>> = Object.freeze({
  sma: { abiVersion: 1, name: 'sma', purity: 'pure', deterministic: true, rollbackSafe: true, minLookback: 1, inputKinds: ['series<number>', 'int'], outputKind: 'series' },
  ema: { abiVersion: 1, name: 'ema', purity: 'stateful', deterministic: true, rollbackSafe: true, minLookback: 1, inputKinds: ['series<number>', 'int'], outputKind: 'series' },
  hma: { abiVersion: 1, name: 'hma', purity: 'pure', deterministic: true, rollbackSafe: true, minLookback: 1, inputKinds: ['series<number>', 'int'], outputKind: 'series' },
  rma: { abiVersion: 1, name: 'rma', purity: 'stateful', deterministic: true, rollbackSafe: true, minLookback: 1, inputKinds: ['series<number>', 'int'], outputKind: 'series' },
  rsi: { abiVersion: 1, name: 'rsi', purity: 'stateful', deterministic: true, rollbackSafe: true, minLookback: 2, inputKinds: ['series<number>', 'int'], outputKind: 'series' },
  atr: { abiVersion: 1, name: 'atr', purity: 'stateful', deterministic: true, rollbackSafe: true, minLookback: 1, inputKinds: ['ohlc', 'int'], outputKind: 'series' },
  highest: { abiVersion: 1, name: 'highest', purity: 'pure', deterministic: true, rollbackSafe: true, minLookback: 1, inputKinds: ['series<number>', 'int'], outputKind: 'series' },
  lowest: { abiVersion: 1, name: 'lowest', purity: 'pure', deterministic: true, rollbackSafe: true, minLookback: 1, inputKinds: ['series<number>', 'int'], outputKind: 'series' },
  stdev: { abiVersion: 1, name: 'stdev', purity: 'pure', deterministic: true, rollbackSafe: true, minLookback: 1, inputKinds: ['series<number>', 'int'], outputKind: 'series' },
  vwap: { abiVersion: 1, name: 'vwap', purity: 'stateful', deterministic: true, rollbackSafe: true, minLookback: 1, inputKinds: ['ohlcv'], outputKind: 'series' },
});

export function getNativeIndicatorDescriptor(name: string): NativeIndicatorDescriptor | undefined {
  return CORE_SPIRIT_NATIVE_INDICATOR_CONTRACT[name];
}

export function assertNativeIndicatorContract(name: string): NativeIndicatorDescriptor {
  const descriptor = getNativeIndicatorDescriptor(name);
  if (!descriptor) throw new Error(`unknown native indicator '${name}'`);
  return descriptor;
}

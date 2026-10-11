import type { CoreSpiritSeriesFusionGroup, CoreSpiritFusedSeriesInput } from './seriesFusion';
import { executeCoreSpiritSeriesFusionGroupInto } from './seriesFusion';

export type CoreSpiritSeriesBackend = 'cpu' | 'wasm' | 'gpu';
export type CoreSpiritSeriesBackendProfile = Readonly<{
  backend: CoreSpiritSeriesBackend;
  available: boolean;
  deterministic: boolean;
  vectorized: boolean;
}>;
export type CoreSpiritSeriesDispatchContext = Readonly<{
  realtime: boolean;
  bars: number;
  symbols?: number;
  timeframes?: number;
  deterministic?: boolean;
  minWasmWorkUnits?: number;
  minGpuWorkUnits?: number;
  backends?: readonly CoreSpiritSeriesBackendProfile[];
  /** Optional telemetry hook when an accelerator is rejected or fails. */
  onBackendFallback?: (backend: 'wasm' | 'gpu', error?: unknown) => void;
}>;
export type CoreSpiritSeriesBackendExecutor = (
  group: CoreSpiritSeriesFusionGroup,
  input: CoreSpiritFusedSeriesInput,
  output: Float64Array,
) => void;

export const CORE_SPIRIT_SERIES_BACKENDS: readonly CoreSpiritSeriesBackendProfile[] = Object.freeze([
  { backend: 'cpu', available: true, deterministic: true, vectorized: true },
  { backend: 'wasm', available: false, deterministic: true, vectorized: true },
  { backend: 'gpu', available: false, deterministic: false, vectorized: true },
]);

function workUnits(c: CoreSpiritSeriesDispatchContext, g: CoreSpiritSeriesFusionGroup): number {
  return Math.max(1, c.bars) * Math.max(1, c.symbols ?? 1) * Math.max(1, c.timeframes ?? 1) * Math.max(1, g.operations.length);
}
function hasRecurrence(g: CoreSpiritSeriesFusionGroup): boolean {
  return g.operations.some((x) => ['ema', 'rma', 'change', 'pctchange', 'persistence', 'rsi', 'atr', 'vwap'].includes(x.name));
}

export function selectCoreSpiritSeriesBackend(
  group: CoreSpiritSeriesFusionGroup,
  context: CoreSpiritSeriesDispatchContext,
): { requested: CoreSpiritSeriesBackend; workUnits: number; reason: string } {
  const profiles = context.backends?.length ? context.backends : CORE_SPIRIT_SERIES_BACKENDS;
  const units = workUnits(context, group);
  if (context.realtime) return { requested: 'cpu', workUnits: units, reason: 'realtime work stays on fused CPU' };
  const deterministic = context.deterministic !== false;
  const gpu = profiles.find((x) => x.backend === 'gpu');
  if (gpu?.available && gpu.vectorized && (group.eligibleBackends?.includes('gpu') ?? true) && !hasRecurrence(group) && units >= Math.max(1, Math.floor(context.minGpuWorkUnits ?? 1_000_000)) && (!deterministic || gpu.deterministic)) {
    return { requested: 'gpu', workUnits: units, reason: 'large stateless historical workload' };
  }
  const wasm = profiles.find((x) => x.backend === 'wasm');
  if (wasm?.available && wasm.vectorized && (group.eligibleBackends?.includes('wasm') ?? true) && (!deterministic || wasm.deterministic) && units >= Math.max(1, Math.floor(context.minWasmWorkUnits ?? 10_000))) {
    return { requested: 'wasm', workUnits: units, reason: 'long historical workload' };
  }
  return { requested: 'cpu', workUnits: units, reason: hasRecurrence(group) ? 'chronological recurrence stays on fused CPU' : 'CPU threshold/availability fallback' };
}

export function executeCoreSpiritSeriesFusionGroupDispatched(
  group: CoreSpiritSeriesFusionGroup,
  input: CoreSpiritFusedSeriesInput,
  output: Float64Array,
  context: CoreSpiritSeriesDispatchContext,
  executors: Partial<Record<'wasm' | 'gpu', CoreSpiritSeriesBackendExecutor>> = {},
): CoreSpiritSeriesBackend {
  const choice = selectCoreSpiritSeriesBackend(group, context);
  if (choice.requested === 'cpu') {
    executeCoreSpiritSeriesFusionGroupInto(group, input, output);
    return 'cpu';
  }

  const executor = executors[choice.requested];
  if (!executor) {
    // Availability metadata is not an executor. Never report acceleration that
    // did not happen, and never skip the CPU calculation because an adapter is absent.
    context.onBackendFallback?.(choice.requested);
    executeCoreSpiritSeriesFusionGroupInto(group, input, output);
    return 'cpu';
  }

  // Isolate accelerator output: a failing/partial kernel must not leak corrupted
  // values into the chart. CPU fallback overwrites the caller's output buffer.
  const stagedOutput = new Float64Array(output.length);
  try {
    executor(group, input, stagedOutput);
    output.set(stagedOutput);
    return choice.requested;
  } catch (error) {
    context.onBackendFallback?.(choice.requested, error);
    executeCoreSpiritSeriesFusionGroupInto(group, input, output);
    return 'cpu';
  }
}

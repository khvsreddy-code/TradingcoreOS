import type { CoreSpiritSeriesFusionGroup, CoreSpiritFusedSeriesInput } from './seriesFusion';
import { executeCoreSpiritSeriesFusionGroupInto } from './seriesFusion';
import { coreSpiritKernelOperationForBuiltin } from './kernelOperationMap';
import { coreSpiritSeriesLength } from './seriesVector';
import { loadCoreSpiritBundledWasmSimdBackend } from './wasmBackend';

export type CoreSpiritSeriesBackend = 'cpu' | 'wasm' | 'gpu';
export type CoreSpiritSeriesBackendProfile = Readonly<{
  backend: CoreSpiritSeriesBackend;
  available: boolean;
  deterministic: boolean;
  vectorized: boolean;
  /** Canonical numerical-kernel operation names this exact adapter can execute. */
  supportedOperations?: readonly string[];
  /** Stateful recurrent execution is opt-in and bounded even for WASM. */
  supportsStatefulSeries?: boolean;
}>;
export type CoreSpiritSeriesDispatchContext = Readonly<{
  realtime: boolean;
  bars: number;
  symbols?: number;
  timeframes?: number;
  deterministic?: boolean;
  minWasmWorkUnits?: number;
  minGpuWorkUnits?: number;
  /** WebGPU stays disabled unless explicitly enabled for batch/research workloads. */
  allowGpu?: boolean;
  backends?: readonly CoreSpiritSeriesBackendProfile[];
  /** Optional telemetry hook when an accelerator is rejected or fails. */
  onBackendFallback?: (backend: 'wasm' | 'gpu', error?: unknown) => void;
  /** Reports the backend that actually completed, including CPU fallback. */
  onBackendExecution?: (event: Readonly<{requested:'cpu'|'wasm'|'gpu';selected:'cpu'|'wasm'|'gpu';executed:'cpu'|'wasm'|'gpu';reason:string;elapsedMs:number;fallbackReason?:string}>) => void;
  allowStatefulWasm?: boolean;
  maxStatefulWasmBars?: number;
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

/**
 * Loads and warms the bundled WASM module, then exposes its real capabilities
 * as a series-group executor. Create it outside the live chart loop; callers
 * pass its profiles/executors only to historical or research dispatches.
 */
export async function loadCoreSpiritBundledWasmSeriesRuntime(
  options: Parameters<typeof loadCoreSpiritBundledWasmSimdBackend>[0] = {},
): Promise<Readonly<{
  backend: Awaited<ReturnType<typeof loadCoreSpiritBundledWasmSimdBackend>>;
  backends: readonly CoreSpiritSeriesBackendProfile[];
  executors: Readonly<Partial<Record<'wasm' | 'gpu', CoreSpiritSeriesBackendExecutor>>>;
}>> {
  const backend = await loadCoreSpiritBundledWasmSimdBackend(options);
  const capability = backend.profile();
  if (!capability?.available || !backend.isLoaded()) {
    throw new Error('bundled CoreSpirit WASM runtime did not reach the ready state');
  }

  // The capability list comes from the validated, warm-up-tested manifest,
  // never from hardware presence or optimistic planner metadata.
  const wasmProfile: CoreSpiritSeriesBackendProfile = Object.freeze({
    backend: 'wasm',
    available: true,
    deterministic: capability.deterministic,
    // Scalar WASM kernels still process whole typed-array series. Exact ISA
    // variants remain available through backend.kernelVariant(operation).
    vectorized: true,
    supportedOperations: Object.freeze([...capability.supportedOperations]),
    supportsStatefulSeries: false,
  });
  const backends = Object.freeze(CORE_SPIRIT_SERIES_BACKENDS.map(profile =>
    profile.backend === 'wasm' ? wasmProfile : profile,
  ));

  const executeWasmGroup: CoreSpiritSeriesBackendExecutor = (group, input, output) => {
    if (input.register !== group.inputRegister) {
      throw new Error("fusion input register mismatch: expected '" + group.inputRegister + "', got '" + input.register + "'");
    }
    if (input.values.length !== output.length) {
      throw new Error('WASM fusion input/output lengths must match');
    }

    let current: Float64Array = input.values instanceof Float64Array
      ? input.values
      : Float64Array.from(input.values);
    for (let index = 0; index < group.operations.length; index += 1) {
      const operation = group.operations[index]!;
      const kernel = coreSpiritKernelOperationForBuiltin(operation.name);
      if (!kernel || !backend.hasKernel(kernel)) {
        throw new Error("bundled WASM does not implement fused operation '" + operation.name + "'");
      }
      // Intermediate arrays are private; the final stage writes directly into
      // the dispatcher's staged output. Any error falls back to the CPU pipeline.
      const target = index === group.operations.length - 1
        ? output
        : new Float64Array(output.length);
      backend.executeSync({
        kernel,
        inputs: [current],
        outputs: [target],
        params: [coreSpiritSeriesLength(operation)],
      });
      current = target;
    }
  };

  return Object.freeze({
    backend,
    backends,
    executors: Object.freeze({ wasm: executeWasmGroup }),
  });
}


function workUnits(c: CoreSpiritSeriesDispatchContext, g: CoreSpiritSeriesFusionGroup): number {
  return Math.max(1, c.bars) * Math.max(1, c.symbols ?? 1) * Math.max(1, c.timeframes ?? 1) * Math.max(1, g.operations.length);
}
function hasRecurrence(g: CoreSpiritSeriesFusionGroup): boolean {
  return g.operations.some((x) => ['ema', 'rma', 'persistence', 'rsi', 'atr', 'vwap'].includes(x.name));
}

function notifyBackendFallback(
  context: CoreSpiritSeriesDispatchContext,
  backend: 'wasm' | 'gpu',
  error?: unknown,
): void {
  try {
    context.onBackendFallback?.(backend, error);
  } catch {
    // Telemetry must never prevent the trading calculation's CPU fallback.
  }
}

function supportsGroup(profile: CoreSpiritSeriesBackendProfile | undefined, group: CoreSpiritSeriesFusionGroup): boolean {
  if (!profile?.available || !profile.vectorized) return false;
  // CPU is the semantic reference; accelerators must explicitly advertise every
  // canonical operation in a fused group. Missing capability lists fail closed.
  if (profile.backend === 'cpu') return true;
  const supported = profile.supportedOperations;
  if (!supported?.length) return false;
  return group.operations.every(operation => {
    const canonical = coreSpiritKernelOperationForBuiltin(operation.name);
    return canonical !== undefined && supported.includes(canonical);
  });
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
  if (context.allowGpu === true && gpu && supportsGroup(gpu, group) && (group.eligibleBackends?.includes('gpu') ?? true) && !hasRecurrence(group) && units >= Math.max(1, Math.floor(context.minGpuWorkUnits ?? 1_000_000)) && (!deterministic || gpu.deterministic)) {
    return { requested: 'gpu', workUnits: units, reason: 'large stateless historical workload' };
  }
  const wasm = profiles.find((x) => x.backend === 'wasm');
  const recurrence = hasRecurrence(group);
  const statefulWasmEligible = !recurrence || (context.allowStatefulWasm === true && wasm?.supportsStatefulSeries === true && context.bars <= Math.max(1, Math.floor(context.maxStatefulWasmBars ?? 16_384)));
  if (wasm && supportsGroup(wasm, group) && statefulWasmEligible && (group.eligibleBackends?.includes('wasm') ?? true) && (!deterministic || wasm.deterministic) && units >= Math.max(1, Math.floor(context.minWasmWorkUnits ?? 100_000))) {
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
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    executeCoreSpiritSeriesFusionGroupInto(group, input, output);
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
    notifyBackendExecution(context,{requested:choice.requested,selected:choice.requested,executed:'cpu',reason:choice.reason,elapsedMs:Math.max(0,ended-started)});
    return 'cpu';
  }

  const executor = executors[choice.requested];
  if (!executor) {
    // Availability metadata is not an executor. Never report acceleration that
    // did not happen, and never skip the CPU calculation because an adapter is absent.
    notifyBackendFallback(context, choice.requested);
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    executeCoreSpiritSeriesFusionGroupInto(group, input, output);
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
    notifyBackendExecution(context,{requested:choice.requested,selected:choice.requested,executed:'cpu',reason:choice.reason,elapsedMs:Math.max(0,ended-started),fallbackReason:'executor unavailable'});
    return 'cpu';
  }

  // Isolate accelerator output: a failing/partial kernel must not leak corrupted
  // values into the chart. CPU fallback overwrites the caller's output buffer.
  const stagedOutput = new Float64Array(output.length);
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    executor(group, input, stagedOutput);
    output.set(stagedOutput);
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
    notifyBackendExecution(context,{requested:choice.requested,selected:choice.requested,executed:choice.requested,reason:choice.reason,elapsedMs:Math.max(0,ended-started)});
    return choice.requested;
  } catch (error) {
    notifyBackendFallback(context, choice.requested, error);
    const fallbackStarted = typeof performance !== 'undefined' ? performance.now() : Date.now();
    executeCoreSpiritSeriesFusionGroupInto(group, input, output);
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
    notifyBackendExecution(context,{requested:choice.requested,selected:choice.requested,executed:'cpu',reason:choice.reason,elapsedMs:Math.max(0,ended-started),fallbackReason:error instanceof Error ? error.message : String(error)});
    return 'cpu';
  }
}

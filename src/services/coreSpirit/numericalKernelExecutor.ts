import { CORE_SPIRIT_MAX_KERNEL_SERIES_LENGTH, executeCoreSpiritNumericalKernel, type CoreSpiritNumericSeries, type CoreSpiritNumericalKernelOperation, type CoreSpiritNumericalKernelResult } from './numericalKernels';
import { createCoreSpiritBackendRegistry, executePlannedExternalCoreSpiritBackend, planCoreSpiritBackend, type CoreSpiritBackendKind, type CoreSpiritBackendPlan, type CoreSpiritBackendPurpose, type CoreSpiritBackendRegistry, type CoreSpiritExternalBackendAdapter, type CoreSpiritWasmBackendHandle } from './backendRegistry';
import { loadCoreSpiritBundledWasmSimdBackend, type CoreSpiritWasmExecutionRequest, type CoreSpiritWasmExecutionResult } from './wasmBackend';

export type CoreSpiritWasmNumericalExecutor = CoreSpiritWasmBackendHandle & Readonly<{
  execute(request: CoreSpiritWasmExecutionRequest): Promise<CoreSpiritWasmExecutionResult>;
}>;
export type CoreSpiritNumericalKernelExecution = Readonly<{
  operation: CoreSpiritNumericalKernelOperation;
  /** Backend that actually produced result (CPU when an accelerator failed). */
  backend: CoreSpiritBackendKind;
  requestedBackend: CoreSpiritBackendKind | 'auto';
  /** Selected by capability/cost planning, even when execution later fell back. */
  selectedBackend: CoreSpiritBackendKind;
  result: CoreSpiritNumericalKernelResult;
  plan: CoreSpiritBackendPlan;
  elapsedMs: number;
  fallbackReason?: string;
}>;
export type CoreSpiritNumericalKernelExecutorOptions = Readonly<{
  purpose?: CoreSpiritBackendPurpose;
  deterministic?: boolean;
  wasm?: CoreSpiritWasmNumericalExecutor;
  wasmKernelNames?: Readonly<Partial<Record<CoreSpiritNumericalKernelOperation, string>>>;
  webgpu?: CoreSpiritExternalBackendAdapter;
  remoteResearch?: CoreSpiritExternalBackendAdapter;
  registry?: CoreSpiritBackendRegistry;
  minWasmWorkUnits?: number;
  minWebGpuWorkUnits?: number;
  allowStatefulWasm?: boolean;
  maxStatefulWasmElements?: number;
  requestedBackend?: CoreSpiritBackendKind | 'auto';
  /** WebGPU remains disabled unless a caller explicitly opts into batch/research execution. */
  allowWebGpu?: boolean;
  onBackendFallback?: (backend: 'wasm-simd' | 'wasm-scalar' | 'webgpu', error?: unknown) => void;
  onBackendExecution?: (event: Readonly<{operation:CoreSpiritNumericalKernelOperation;requestedBackend:CoreSpiritBackendKind|'auto';selectedBackend:CoreSpiritBackendKind;executedBackend:CoreSpiritBackendKind;elapsedMs:number;reason:string;fallbackReason?:string}>) => void;
}>;

const WASM_SERIES_LAYOUT: Readonly<Partial<Record<CoreSpiritNumericalKernelOperation, Readonly<{ inputs: number; outputs: number }>>>> = Object.freeze({
  rollingMean: { inputs: 1, outputs: 1 }, rollingSum: { inputs: 1, outputs: 1 }, rollingVariance: { inputs: 1, outputs: 1 },
  rollingStd: { inputs: 1, outputs: 1 }, rollingMin: { inputs: 1, outputs: 1 }, rollingMax: { inputs: 1, outputs: 1 },
  ema: { inputs: 1, outputs: 1 }, rma: { inputs: 1, outputs: 1 }, wma: { inputs: 1, outputs: 1 },
  atr: { inputs: 3, outputs: 1 }, rsi: { inputs: 1, outputs: 1 }, linearRegression: { inputs: 1, outputs: 4 },
  correlation: { inputs: 2, outputs: 1 }, covariance: { inputs: 2, outputs: 1 }, zScore: { inputs: 1, outputs: 1 },
  softmax: { inputs: 1, outputs: 1 },
});
const STATEFUL_SERIES_OPERATIONS = new Set<CoreSpiritNumericalKernelOperation>(['ema', 'rma', 'atr', 'rsi']);
function isWasmNumericalExecutor(value: unknown): value is CoreSpiritWasmNumericalExecutor {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CoreSpiritWasmNumericalExecutor>;
  return typeof candidate.isLoaded === 'function' &&
    typeof candidate.hasKernel === 'function' &&
    typeof candidate.kernelVariant === 'function' &&
    typeof candidate.execute === 'function';
}
function now(): number { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

const BUNDLED_WASM_OPERATIONS = new Set<CoreSpiritNumericalKernelOperation>([
  'rollingMean', 'rollingSum', 'rollingVariance', 'rollingStd', 'rollingMin', 'rollingMax',
]);
let bundledWasmBackendPromise: Promise<CoreSpiritWasmNumericalExecutor> | undefined;
let bundledWasmBackendInstance: CoreSpiritWasmNumericalExecutor | undefined;

/** One warmed module per worker/runtime; failed loads are evicted so later calls can recover. */
async function getBundledWasmBackend(): Promise<CoreSpiritWasmNumericalExecutor> {
  if (bundledWasmBackendInstance?.isLoaded()) return bundledWasmBackendInstance;
  if (bundledWasmBackendPromise) return bundledWasmBackendPromise;
  const pending = loadCoreSpiritBundledWasmSimdBackend() as Promise<CoreSpiritWasmNumericalExecutor>;
  bundledWasmBackendPromise = pending;
  try {
    const backend = await pending;
    if (bundledWasmBackendPromise === pending) bundledWasmBackendInstance = backend;
    return backend;
  } catch (error) {
    if (bundledWasmBackendPromise === pending) {
      bundledWasmBackendPromise = undefined;
      bundledWasmBackendInstance = undefined;
    }
    throw error;
  }
}
function invalidateBundledWasmBackend(backend: CoreSpiritWasmNumericalExecutor): void {
  if (bundledWasmBackendInstance !== backend) return;
  bundledWasmBackendInstance = undefined;
  bundledWasmBackendPromise = undefined;
  try { (backend as CoreSpiritWasmNumericalExecutor & { unload?: () => void }).unload?.(); } catch { /* recover on next request */ }
}

function finishExecution(
  operation: CoreSpiritNumericalKernelOperation,
  result: CoreSpiritNumericalKernelResult,
  plan: CoreSpiritBackendPlan,
  executedBackend: CoreSpiritBackendKind,
  started: number,
  options: CoreSpiritNumericalKernelExecutorOptions,
  fallbackReason?: string,
): CoreSpiritNumericalKernelExecution {
  const elapsedMs = Math.max(0, now() - started);
  const requestedBackend = options.requestedBackend ?? 'auto';
  const event = Object.freeze({
    operation, requestedBackend, selectedBackend: plan.backend, executedBackend,
    elapsedMs, reason: plan.reason,
    ...(fallbackReason === undefined ? {} : { fallbackReason }),
  });
  try { options.onBackendExecution?.(event); } catch { /* telemetry must never affect calculation availability */ }
  return Object.freeze({
    operation, requestedBackend, selectedBackend: plan.backend,
    backend: executedBackend, result, plan, elapsedMs,
    ...(fallbackReason === undefined ? {} : { fallbackReason }),
  });
}

function validateInputs(inputs: readonly CoreSpiritNumericSeries[]): CoreSpiritNumericSeries[] {
  if (!Array.isArray(inputs)) throw new Error('numerical kernel inputs must be an array');
  return inputs.map((input, index) => {
    if (!input || !Number.isInteger(input.length) || input.length < 0 || input.length > CORE_SPIRIT_MAX_KERNEL_SERIES_LENGTH) {
      throw new Error(`kernel input ${index} length must be an integer in [0, ${CORE_SPIRIT_MAX_KERNEL_SERIES_LENGTH}]`);
    }
    return input;
  });
}
function toFloat64(inputs: readonly CoreSpiritNumericSeries[]): Float64Array[] { return inputs.map(input => Float64Array.from(input)); }

function wasmOutputBuffers(operation: CoreSpiritNumericalKernelOperation, inputs: readonly CoreSpiritNumericSeries[]): Float64Array[] | undefined {
  const layout = WASM_SERIES_LAYOUT[operation];
  if (!layout || inputs.length !== layout.inputs || inputs.length === 0) return undefined;
  const length = inputs[0]!.length;
  if (inputs.some(input => input.length !== length)) return undefined;
  return Array.from({ length: layout.outputs }, () => {
    const output = new Float64Array(length); output.fill(Number.NaN); return output;
  });
}
function wasmResult(operation: CoreSpiritNumericalKernelOperation, outputs: readonly Float64Array[]): CoreSpiritNumericalKernelResult {
  if (operation === 'linearRegression') return Object.freeze({
    slope: outputs[0]!, intercept: outputs[1]!, fitted: outputs[2]!, rSquared: outputs[3]!,
  });
  return outputs[0]!;
}
function validExternalResult(
  operation: CoreSpiritNumericalKernelOperation, value: unknown, inputLength: number, parameters: readonly number[],
): value is CoreSpiritNumericalKernelResult {
  if (operation === 'dotProduct' || operation === 'logSumExp') return typeof value === 'number' && Number.isFinite(value);
  if (operation === 'matrixMultiply') {
    if (!value || typeof value !== 'object') return false;
    const result = value as { rows?: unknown; columns?: unknown; data?: unknown };
    const rows = Number(parameters[0]), columns = Number(parameters[2]);
    return result.rows === rows && result.columns === columns && result.data instanceof Float64Array && result.data.length === rows * columns;
  }
  if (operation === 'matrixDecomposition') {
    if (!value || typeof value !== 'object') return false;
    const result = value as { size?: unknown; lu?: unknown; permutation?: unknown; sign?: unknown; singular?: unknown };
    const size = Number(parameters[0]);
    return result.size === size && result.lu instanceof Float64Array && result.lu.length === size * size &&
      result.permutation instanceof Int32Array && result.permutation.length === size &&
      (result.sign === 1 || result.sign === -1) && typeof result.singular === 'boolean';
  }
  if (operation === 'linearRegression') {
    if (!value || typeof value !== 'object') return false;
    const result = value as { slope?: unknown; intercept?: unknown; fitted?: unknown; rSquared?: unknown };
    return [result.slope, result.intercept, result.fitted, result.rSquared].every(series => series instanceof Float64Array && series.length === inputLength);
  }
  return value instanceof Float64Array && value.length === inputLength;
}
function notifyFallback(options: CoreSpiritNumericalKernelExecutorOptions, backend: 'wasm-simd' | 'wasm-scalar' | 'webgpu', error?: unknown): void {
  try { options.onBackendFallback?.(backend, error); } catch { /* telemetry cannot break fallback */ }
}
function estimateWorkUnits(operation: CoreSpiritNumericalKernelOperation, inputs: readonly CoreSpiritNumericSeries[], parameters: readonly number[]): number {
  const length = Math.max(1, ...inputs.map(input => input.length));
  if (operation === 'matrixMultiply' && parameters.length >= 3) return Math.max(1, Math.floor(parameters[0]! * parameters[1]! * parameters[2]!));
  if (operation === 'matrixDecomposition' && parameters.length >= 1) {
    const size = Math.floor(parameters[0]!); return Math.max(1, size * size * size);
  }
  return length * (['rollingVariance', 'linearRegression', 'correlation', 'covariance', 'zScore'].includes(operation) ? 3 : 1);
}

/** Plans and executes one backend-independent CoreScript numerical operation. */
export async function executeCoreSpiritNumericalKernelPlanned(
  operation: CoreSpiritNumericalKernelOperation,
  inputSeries: readonly CoreSpiritNumericSeries[],
  parameters: readonly number[] = [],
  options: CoreSpiritNumericalKernelExecutorOptions = {},
): Promise<CoreSpiritNumericalKernelExecution> {
  if (!parameters.every(Number.isFinite)) throw new Error('kernel parameters must be finite numbers');
  const inputs = validateInputs(inputSeries), started = now(), purpose = options.purpose ?? 'historical';
  const wasmOutputs = wasmOutputBuffers(operation, inputs);
  const workUnits = estimateWorkUnits(operation, inputs, parameters);
  const minWasmWorkUnits = Math.max(1, Math.floor(options.minWasmWorkUnits ?? 100_000));
  let wasmAdapter = options.wasm;
  let usingBundledWasm = false;
  let wasmLoadError: unknown;

  // Load the bundled ABI only for the exact rolling kernels it implements.
  // WASM loading and data transfer never run on the live chart path.
  if (!options.registry && !wasmAdapter && purpose !== 'live' &&
      BUNDLED_WASM_OPERATIONS.has(operation) && wasmOutputs &&
      workUnits >= minWasmWorkUnits) {
    try {
      wasmAdapter = await getBundledWasmBackend();
      usingBundledWasm = true;
    } catch (error) {
      wasmLoadError = error;
      notifyFallback(options, operation === 'rollingMean' ? 'wasm-simd' : 'wasm-scalar', error);
    }
  }

  const registry = options.registry ?? createCoreSpiritBackendRegistry({
    wasm: wasmAdapter, wasmKernelNames: options.wasmKernelNames, webgpu: options.webgpu, remoteResearch: options.remoteResearch,
  });
  // Dispatch through the exact adapter snapshot used by the planner. When callers
  // inject a registry directly, they need not pass the same adapter twice.
  const registeredWasmAdapter = registry.getAdapter('wasm-simd') ?? registry.getAdapter('wasm-scalar');
  const wasmExecutor = isWasmNumericalExecutor(registeredWasmAdapter) ? registeredWasmAdapter : undefined;
  const maxElements = Math.max(0, ...inputs.map(input => input.length));
  const request = {
    operation, purpose,
    workload: operation === 'matrixMultiply' || operation === 'matrixDecomposition' ? 'matrix' as const : 'series' as const,
    workUnits, inputElements: maxElements,
    stateful: STATEFUL_SERIES_OPERATIONS.has(operation), deterministic: options.deterministic,
    allowWebGpu: options.allowWebGpu === true,
    preferredBackend: options.requestedBackend && options.requestedBackend !== 'auto' ? options.requestedBackend : undefined,
    minWasmWorkUnits, minWebGpuWorkUnits: options.minWebGpuWorkUnits,
    allowStatefulWasm: options.allowStatefulWasm, maxStatefulWasmElements: options.maxStatefulWasmElements,
    excludedBackends: wasmOutputs ? [] : ['wasm-simd', 'wasm-scalar'] as const,
    payload: { operation, inputs, parameters },
  };
  const plan = planCoreSpiritBackend(request, registry);
  if (plan.backend === 'wasm-simd' || plan.backend === 'wasm-scalar') {
    try {
      const matchingAdapter = registry.getAdapter(plan.backend);
      const executor = isWasmNumericalExecutor(matchingAdapter) ? matchingAdapter : wasmExecutor;
      if (!executor || !executor.isLoaded() || !executor.hasKernel(options.wasmKernelNames?.[operation] ?? operation) || !wasmOutputs) {
        throw new Error('WASM execution requires the registered loaded kernel and compatible equal-length series ABI');
      }
      const kernel = options.wasmKernelNames?.[operation] ?? operation;
      await executor.execute({ kernel, inputs: toFloat64(inputs), outputs: wasmOutputs, params: parameters });
      const result = wasmResult(operation, wasmOutputs);
      if (!validExternalResult(operation, result, maxElements, parameters)) throw new Error(`WASM kernel '${kernel}' returned an invalid result shape`);
      return finishExecution(operation, result, plan, plan.backend, started, options);
    } catch (error) {
      notifyFallback(options, plan.backend as 'wasm-simd' | 'wasm-scalar', error);
      if (usingBundledWasm && wasmExecutor) invalidateBundledWasmBackend(wasmExecutor);
      const result = executeCoreSpiritNumericalKernel(operation, inputs, parameters);
      return finishExecution(operation, result, plan, 'cpu-optimized', started, options, error instanceof Error ? error.message : String(error));
    }
  }
  if (plan.backend === 'webgpu') {
    try {
      const isolatedRequest = { ...request, payload: { operation, inputs: toFloat64(inputs), parameters } };
      const result = await executePlannedExternalCoreSpiritBackend(plan, isolatedRequest, registry);
      if (!validExternalResult(operation, result, maxElements, parameters)) throw new Error(`WebGPU adapter returned an invalid result shape for '${operation}'`);
      return finishExecution(operation, result as CoreSpiritNumericalKernelResult, plan, plan.backend, started, options);
    } catch (error) {
      notifyFallback(options, 'webgpu', error);
      const result = executeCoreSpiritNumericalKernel(operation, inputs, parameters);
      return finishExecution(operation, result, plan, 'cpu-optimized', started, options, error instanceof Error ? error.message : String(error));
    }
  }
  const result = executeCoreSpiritNumericalKernel(operation, inputs, parameters);
  return finishExecution(
    operation, result, plan, plan.backend, started, options,
    wasmLoadError === undefined ? undefined : wasmLoadError instanceof Error ? wasmLoadError.message : String(wasmLoadError),
  );
}

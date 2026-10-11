/**
 * Explicit, capability-gated backend planning for CoreSpirit.
 *
 * A backend is eligible only when its real adapter is registered and claims the
 * requested operation. Hardware presence alone is insufficient: WebGPU needs
 * an executable adapter; WASM SIMD needs a loaded module with a SIMD kernel.
 * This module plans where the same Core IR work may run; it does not change
 * language semantics or grant access to broker/risk side effects.
 */
import { CORE_SPIRIT_NUMERICAL_KERNEL_OPERATIONS, type CoreSpiritNumericalKernelOperation } from './numericalKernels';

export type CoreSpiritBackendKind = 'js-scalar' | 'cpu-optimized' | 'wasm-simd' | 'webgpu' | 'remote-research';
export type CoreSpiritBackendPurpose = 'live' | 'historical' | 'research-training';
export type CoreSpiritBackendWorkload = 'scalar' | 'series' | 'matrix' | 'model-training';

export type CoreSpiritBackendProfile = Readonly<{
  backend: CoreSpiritBackendKind;
  available: boolean;
  deterministic: boolean;
  vectorized: boolean;
  realtimeSafe: boolean;
  supportsStatefulSeries: boolean;
  maxInputElements: number;
  supportedOperations: readonly string[];
  reason: string;
}>;

export type CoreSpiritBackendRequest = Readonly<{
  operation: string;
  purpose: CoreSpiritBackendPurpose;
  workload: CoreSpiritBackendWorkload;
  workUnits: number;
  inputElements: number;
  stateful?: boolean;
  deterministic?: boolean;
  allowRemoteResearch?: boolean;
  allowStatefulWasm?: boolean;
  minWasmWorkUnits?: number;
  minWebGpuWorkUnits?: number;
  maxStatefulWasmElements?: number;
  /** Adapter-owned inputs/artifacts; never execute this payload in the chart hot path. */
  payload?: unknown;
}>;

export type CoreSpiritExternalBackendAdapter = Readonly<{
  /** Must report the adapter's live capability, not merely hardware existence. */
  isAvailable: () => boolean;
  deterministic: boolean;
  vectorized: boolean;
  maxInputElements: number;
  supportedOperations: readonly string[];
  supportsStatefulSeries?: boolean;
  /** A real executable adapter is mandatory for a provider to be advertised. */
  execute: (request: CoreSpiritBackendRequest) => unknown | Promise<unknown>;
}>;

export type CoreSpiritWasmBackendHandle = Readonly<{
  isLoaded: () => boolean;
  profile: () => { backend: 'wasm'; available: boolean; deterministic: boolean; vectorized: boolean } | undefined;
  hasKernel: (name: string) => boolean;
  kernelVariant: (name: string) => 'scalar' | 'simd' | undefined;
}>;

export type CoreSpiritBackendRegistryOptions = Readonly<{
  wasm?: CoreSpiritWasmBackendHandle;
  wasmKernelNames?: Readonly<Partial<Record<CoreSpiritNumericalKernelOperation, string>>>;
  webgpu?: CoreSpiritExternalBackendAdapter;
  remoteResearch?: CoreSpiritExternalBackendAdapter;
}>;

export type CoreSpiritBackendRegistry = Readonly<{
  profiles: readonly CoreSpiritBackendProfile[];
  has: (backend: CoreSpiritBackendKind) => boolean;
  get: (backend: CoreSpiritBackendKind) => CoreSpiritBackendProfile | undefined;
  getAdapter: (backend: CoreSpiritBackendKind) => CoreSpiritExternalBackendAdapter | CoreSpiritWasmBackendHandle | undefined;
}>;

/** Canonical IR/builtin lowering map; only these explicitly supported ops may offload. */
const BUILTIN_KERNEL_MAP: Readonly<Record<string, CoreSpiritNumericalKernelOperation>> = Object.freeze({
  sma: 'rollingMean',
  mean: 'rollingMean',
  rollingMean: 'rollingMean',
  variance: 'rollingVariance',
  rollingVariance: 'rollingVariance',
  stdev: 'rollingStd',
  stddev: 'rollingStd',
  standardDeviation: 'rollingStd',
  rollingStd: 'rollingStd',
  highest: 'rollingMax',
  rollingMax: 'rollingMax',
  lowest: 'rollingMin',
  rollingMin: 'rollingMin',
  ema: 'ema',
  rma: 'rma',
  wma: 'wma',
  atr: 'atr',
  rsi: 'rsi',
  linearRegression: 'linearRegression',
  linreg: 'linearRegression',
  correlation: 'correlation',
  covariance: 'covariance',
  zscore: 'zScore',
  zScore: 'zScore',
  dot: 'dotProduct',
  dotProduct: 'dotProduct',
  matmul: 'matrixMultiply',
  matrixMultiply: 'matrixMultiply',
  matrixDecomposition: 'matrixDecomposition',
  softmax: 'softmax',
  logSumExp: 'logSumExp',
});

export function coreSpiritKernelOperationForBuiltin(name: string): CoreSpiritNumericalKernelOperation | undefined {
  return BUILTIN_KERNEL_MAP[name];
}

export function isCoreSpiritStatefulKernelOperation(operation: string): boolean {
  return ['ema', 'rma', 'atr', 'rsi'].includes(operation);
}

const ALL_NUMERICAL_OPERATIONS: readonly string[] = CORE_SPIRIT_NUMERICAL_KERNEL_OPERATIONS;
const DEFAULT_MAX_ELEMENTS = 4_194_304;

function safelyAvailable(provider: CoreSpiritExternalBackendAdapter | undefined): boolean {
  if (!provider || typeof provider.execute !== 'function') return false;
  try { return provider.isAvailable() === true; } catch { return false; }
}

function externalProfile(
  backend: 'webgpu' | 'remote-research',
  provider: CoreSpiritExternalBackendAdapter | undefined,
  fallbackReason: string,
): CoreSpiritBackendProfile {
  const available = safelyAvailable(provider);
  return Object.freeze({
    backend,
    available,
    deterministic: provider?.deterministic ?? false,
    vectorized: provider?.vectorized ?? false,
    realtimeSafe: false,
    supportsStatefulSeries: provider?.supportsStatefulSeries ?? false,
    maxInputElements: provider?.maxInputElements ?? 0,
    supportedOperations: Object.freeze([...(provider?.supportedOperations ?? [])]),
    reason: available ? 'registered executable adapter reports available' : fallbackReason,
  });
}

export function createCoreSpiritBackendRegistry(options: CoreSpiritBackendRegistryOptions = {}): CoreSpiritBackendRegistry {
  const scalar: CoreSpiritBackendProfile = Object.freeze({
    backend: 'js-scalar',
    available: true,
    deterministic: true,
    vectorized: false,
    realtimeSafe: true,
    supportsStatefulSeries: true,
    maxInputElements: DEFAULT_MAX_ELEMENTS,
    supportedOperations: Object.freeze(['*']),
    reason: 'always-available semantic fallback in the CoreSpirit VM',
  });
  const cpu: CoreSpiritBackendProfile = Object.freeze({
    backend: 'cpu-optimized',
    available: true,
    deterministic: true,
    vectorized: true,
    realtimeSafe: true,
    supportsStatefulSeries: true,
    maxInputElements: DEFAULT_MAX_ELEMENTS,
    supportedOperations: ALL_NUMERICAL_OPERATIONS,
    reason: 'bounded typed-array numerical kernel library is available',
  });

  const wasmProfile = options.wasm?.profile();
  const wasmOperations = ALL_NUMERICAL_OPERATIONS.filter((operation) => {
    const kernel = options.wasmKernelNames?.[operation as CoreSpiritNumericalKernelOperation] ?? operation;
    return Boolean(options.wasm?.isLoaded() && wasmProfile?.available && wasmProfile.vectorized &&
      options.wasm.hasKernel(kernel) && options.wasm.kernelVariant(kernel) === 'simd');
  });
  const wasm: CoreSpiritBackendProfile = Object.freeze({
    backend: 'wasm-simd',
    available: wasmOperations.length > 0,
    deterministic: wasmProfile?.deterministic ?? true,
    vectorized: wasmOperations.length > 0,
    realtimeSafe: false,
    // Deliberately false by default: only a future validated manifest+planner
    // policy may opt bounded recurrent kernels into SIMD.
    supportsStatefulSeries: false,
    maxInputElements: wasmOperations.length ? DEFAULT_MAX_ELEMENTS : 0,
    supportedOperations: Object.freeze(wasmOperations),
    reason: wasmOperations.length ? 'loaded WASM module exports registered SIMD kernels' : 'no loaded WASM SIMD kernels are registered',
  });

  const profiles = Object.freeze([
    scalar,
    cpu,
    wasm,
    externalProfile('webgpu', options.webgpu, 'no executable WebGPU adapter is registered'),
    externalProfile('remote-research', options.remoteResearch, 'no executable remote research adapter is registered'),
  ]);
  const byBackend = new Map(profiles.map((profile) => [profile.backend, profile]));
  const adapters = new Map<CoreSpiritBackendKind, CoreSpiritExternalBackendAdapter | CoreSpiritWasmBackendHandle>();
  if (options.wasm) adapters.set('wasm-simd', options.wasm);
  if (options.webgpu && safelyAvailable(options.webgpu)) adapters.set('webgpu', options.webgpu);
  if (options.remoteResearch && safelyAvailable(options.remoteResearch)) adapters.set('remote-research', options.remoteResearch);
  return Object.freeze({
    profiles,
    has: (backend: CoreSpiritBackendKind) => byBackend.has(backend),
    get: (backend: CoreSpiritBackendKind) => byBackend.get(backend),
    getAdapter: (backend: CoreSpiritBackendKind) => adapters.get(backend),
  });
}

export type CoreSpiritBackendPlan = Readonly<{
  backend: CoreSpiritBackendKind;
  operation: string;
  deterministic: boolean;
  workUnits: number;
  inputElements: number;
  fallback: boolean;
  reason: string;
  registrySnapshot: readonly Readonly<Pick<CoreSpiritBackendProfile, 'backend'|'available'|'deterministic'|'vectorized'|'supportedOperations'>>[];
}>;

function supportsOperation(profile: CoreSpiritBackendProfile, operation: string): boolean {
  return profile.supportedOperations.includes('*') || profile.supportedOperations.includes(operation);
}

function eligible(
  profile: CoreSpiritBackendProfile | undefined,
  request: CoreSpiritBackendRequest,
  deterministicRequired: boolean,
): profile is CoreSpiritBackendProfile {
  return Boolean(profile && profile.available && profile.maxInputElements >= request.inputElements &&
    supportsOperation(profile, request.operation) &&
    (!deterministicRequired || profile.deterministic));
}

/**
 * Selects a backend for one operation. Live work never leaves the local CPU/VM.
 * Remote research requires an explicit opt-in and is considered only for training.
 * An absent provider always falls back to the actual local CPU/VM path.
 */
export function planCoreSpiritBackend(
  request: CoreSpiritBackendRequest,
  registry: CoreSpiritBackendRegistry = createCoreSpiritBackendRegistry(),
): CoreSpiritBackendPlan {
  if (!request.operation.trim()) throw new Error('backend planning requires a non-empty operation');
  if (!Number.isFinite(request.workUnits) || request.workUnits < 0) throw new Error('workUnits must be finite and non-negative');
  if (!Number.isInteger(request.inputElements) || request.inputElements < 0) throw new Error('inputElements must be a non-negative integer');

  const deterministicRequired = request.deterministic !== false;
  const wasmThreshold = Math.max(1, Math.floor(request.minWasmWorkUnits ?? 10_000));
  const gpuThreshold = Math.max(1, Math.floor(request.minWebGpuWorkUnits ?? 1_000_000));
  const stateful = request.stateful === true;
  const candidates: CoreSpiritBackendProfile[] = [];

  // Stateful recurrences preserve chronological state and low tail latency.
  // They remain local unless a caller explicitly authorizes bounded WASM.
  if (request.purpose === 'live') {
    candidates.push(registry.get('cpu-optimized')!, registry.get('js-scalar')!);
  } else if (request.purpose === 'research-training' && request.workload === 'model-training' && request.allowRemoteResearch === true) {
    const remote = registry.get('remote-research');
    if (eligible(remote, request, deterministicRequired)) candidates.push(remote);
  }

  if (candidates.length === 0 && request.purpose !== 'live') {
    const wasm = registry.get('wasm-simd');
    const webgpu = registry.get('webgpu');

    // Put the GPU candidate first only after it clears its much higher launch
    // threshold. Deterministic mode naturally rejects non-deterministic devices
    // and then continues to a compatible WASM/CPU path.
    if (!stateful && request.workUnits >= gpuThreshold && eligible(webgpu, request, deterministicRequired)) candidates.push(webgpu);
    if (request.workUnits >= wasmThreshold && (!stateful || (
      request.allowStatefulWasm === true &&
      request.inputElements <= Math.max(1, Math.floor(request.maxStatefulWasmElements ?? 16_384)) &&
      wasm?.supportsStatefulSeries === true
    )) && eligible(wasm, request, deterministicRequired)) candidates.push(wasm);
    candidates.push(registry.get('cpu-optimized')!, registry.get('js-scalar')!);
  }

  const chosen = candidates.find((profile) => eligible(profile, request, deterministicRequired)) ??
    registry.get('cpu-optimized')!;
  const fallback = chosen.backend === 'cpu-optimized' || chosen.backend === 'js-scalar';
  const reason = request.purpose === 'live'
    ? (stateful ? 'live stateful/realtime work stays local to preserve ordered low-latency updates' : 'live work stays local; asynchronous accelerator dispatch is not on the chart hot path')
    : chosen.backend === 'remote-research'
      ? 'explicitly opted-in model training may execute remotely; live inference remains separate'
      : chosen.backend === 'wasm-simd'
        ? 'historical workload exceeds the WASM threshold and the exact SIMD kernel is registered'
        : chosen.backend === 'webgpu'
          ? 'large stateless workload exceeds the WebGPU threshold and has an executable adapter'
          : chosen.backend === 'cpu-optimized'
            ? (stateful ? 'stateful recurrence stays chronological on the CPU kernel path' : 'local typed-array kernels avoid accelerator launch/transfer overhead')
            : 'CoreSpirit VM semantic fallback';

  return Object.freeze({
    backend: chosen.backend,
    operation: request.operation,
    deterministic: chosen.deterministic,
    workUnits: request.workUnits,
    inputElements: request.inputElements,
    fallback,
    reason,
    registrySnapshot: Object.freeze(registry.profiles.map((profile) => Object.freeze({
      backend: profile.backend,
      available: profile.available,
      deterministic: profile.deterministic,
      vectorized: profile.vectorized,
      supportedOperations: profile.supportedOperations,
    }))),
  });
}

/**
 * Runs a planned external adapter. The caller retains responsibility for
 * supplying a CPU fallback and recording the returned timing/telemetry.
 * Live requests are categorically barred from WebGPU/remote execution here.
 */
export async function executePlannedExternalCoreSpiritBackend(
  plan: CoreSpiritBackendPlan,
  request: CoreSpiritBackendRequest,
  registry: CoreSpiritBackendRegistry,
): Promise<unknown> {
  if (plan.operation !== request.operation || plan.backend === 'js-scalar' || plan.backend === 'cpu-optimized') {
    throw new Error('execution plan does not target a registered external backend for this operation');
  }
  if (request.purpose === 'live') throw new Error('external compute backends are not permitted on the live chart path');
  if (plan.backend === 'remote-research' &&
      (request.purpose !== 'research-training' || request.allowRemoteResearch !== true || request.workload !== 'model-training')) {
    throw new Error('remote research execution requires an explicit research-training opt-in');
  }
  if (plan.backend === 'webgpu' && request.stateful === true) {
    throw new Error('WebGPU dispatch is restricted to stateless numerical workloads');
  }
  const profile = registry.get(plan.backend);
  const adapter = registry.getAdapter(plan.backend);
  if (!profile?.available || !adapter || !('execute' in adapter) || typeof adapter.execute !== 'function') {
    throw new Error(`backend '${plan.backend}' is not backed by an executable adapter`);
  }
  // Capability can change after planning (WebGPU device loss, remote circuit
  // breaker). Recheck the live adapter immediately before dispatch.
  if (!safelyAvailable(adapter as CoreSpiritExternalBackendAdapter)) {
    throw new Error(`backend '${plan.backend}' became unavailable after planning`);
  }
  if (!supportsOperation(profile, request.operation) || request.inputElements > profile.maxInputElements) {
    throw new Error(`backend '${plan.backend}' no longer satisfies the planned operation/size requirements`);
  }
  if (request.deterministic !== false && !profile.deterministic) {
    throw new Error(`backend '${plan.backend}' is not deterministic enough for this request`);
  }
  return await adapter.execute(request);
}

/** Bridge capability state into the legacy CPU/WASM/GPU planners without inventing availability. */
export function toLegacyCoreSpiritBackendProfiles(registry: CoreSpiritBackendRegistry) {
  const cpu = registry.get('cpu-optimized');
  const wasm = registry.get('wasm-simd');
  const gpu = registry.get('webgpu');
  return [
    { backend: 'cpu' as const, available: cpu?.available === true, deterministic: cpu?.deterministic === true, vectorized: cpu?.vectorized === true, maxBatchSize: cpu?.maxInputElements ?? 1, sharedMemoryBytes: 0 },
    { backend: 'wasm' as const, available: wasm?.available === true, deterministic: wasm?.deterministic === true, vectorized: wasm?.vectorized === true, maxBatchSize: wasm?.maxInputElements ?? 1, sharedMemoryBytes: 64 * 1024 * 1024 },
    { backend: 'gpu' as const, available: gpu?.available === true, deterministic: gpu?.deterministic === true, vectorized: gpu?.vectorized === true, maxBatchSize: gpu?.maxInputElements ?? 1, sharedMemoryBytes: 512 * 1024 * 1024 },
  ];
}

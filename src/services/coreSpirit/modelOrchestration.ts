/**
 * CoreSpirit external-model orchestration contract — v56 / #15–18 deepening.
 *
 * CoreSpirit does not compete with Python/C++/Rust/WASM/ONNX. It orchestrates
 * them through one strict semantic model contract. The VM sees typed model
 * capability data; host adapters own processes, transports, runtimes and
 * credentials. No adapter is allowed to hand broker/network authority into
 * CoreSpirit.
 */

import {
  CORE_SPIRIT_MODEL_ABI_VERSION,
  type CoreSpiritModelExecutionContext,
  type CoreSpiritModelHost,
  type CoreSpiritModelManifest,
  type CoreSpiritModelTensor,
} from './modelAbi';
import { coreSpiritChecksum } from './artifact';
import type { CoreSpiritExecutionTarget } from './executionTarget';
import { canUseExecutionTargetCapability } from './executionTarget';

export const CORE_SPIRIT_EXTERNAL_MODEL_CONTRACT_VERSION = 2 as const;

export type CoreSpiritExternalModelImplementation =
  | 'python'
  | 'cpp'
  | 'rust'
  | 'wasm'
  | 'onnx'
  | 'remote';

export type CoreSpiritExternalModelTransport =
  | 'host'
  | 'wasm'
  | 'native-rpc'
  | 'onnx-runtime'
  | 'remote-rpc';

export type CoreSpiritModelKind = 'general' | 'ai';

export interface CoreSpiritAiOutputMapping {
  directionMetadataKey: string;
  regimeMetadataKey?: string;
  longProbabilityMetadataKey?: string;
  shortProbabilityMetadataKey?: string;
  flatProbabilityMetadataKey?: string;
}

export interface CoreSpiritModelFieldSpec {
  name: string;
  dtype: CoreSpiritModelTensor['dtype'];
  shape: readonly number[];
  required: boolean;
  semantic?: 'feature' | 'prediction' | 'confidence' | 'embedding' | 'auxiliary';
  representation?: 'tensor' | 'scalar';
}

export interface CoreSpiritModelMarketState {
  timestamp: number;
  instrument: {
    instrumentId: string;
    symbol: string;
    assetClass?: string;
    exchange?: string;
  };
  timeframe: string;
  bar?: {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
  quote?: {
    bid?: number | null;
    ask?: number | null;
    last?: number | null;
    bidSize?: number | null;
    askSize?: number | null;
  };
  depth?: {
    bids: readonly { price: number; size: number }[];
    asks: readonly { price: number; size: number }[];
  };
}

export interface CoreSpiritStrictModelManifest {
  contractVersion: typeof CORE_SPIRIT_EXTERNAL_MODEL_CONTRACT_VERSION;
  abiVersion: typeof CORE_SPIRIT_MODEL_ABI_VERSION;
  modelId: string;
  version: string;
  modelKind?: CoreSpiritModelKind;
  aiOutput?: CoreSpiritAiOutputMapping;
  implementation: CoreSpiritExternalModelImplementation;
  transport: CoreSpiritExternalModelTransport;
  deterministic: true;
  state: 'stateless' | 'stateful';
  rollbackSafe: boolean;
  inputSchema: readonly CoreSpiritModelFieldSpec[];
  outputSchema: readonly CoreSpiritModelFieldSpec[];
  primaryPredictionField: string;
  confidenceField?: string;
  metadataFields: readonly string[];
  maxMemoryBytes: number;
  maxSteps: number;
  maxInputBytes: number;
  maxOutputBytes: number;
  maxLatencyMs?: number;
  /** Expected Python ML target horizon, in candles; must match the trained artifact. */
  forecastHorizonBars?: number;
  capabilities: readonly ('read-features' | 'read-market-state' | 'write-output' | 'persistent-state')[];
}

export interface CoreSpiritStrictModelRequest {
  requestId: string;
  modelId: string;
  version: string;
  context: CoreSpiritModelExecutionContext;
  features: Readonly<Record<string, CoreSpiritModelTensor>>;
  marketState: CoreSpiritModelMarketState;
  stateToken?: string;
}

export interface CoreSpiritStrictModelPrediction {
  prediction: CoreSpiritModelTensor;
  confidence?: number;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
  outputChecksum: string;
  stateChecksum: string;
  nextStateToken?: string;
  /** Optional semantic AI view; transport tensors remain authoritative. */
  aiPrediction?: Readonly<{
    direction: 'LONG' | 'SHORT' | 'FLAT' | 'UNKNOWN';
    probability: number;
    confidence: number;
    regime?: string;
    probabilities?: Readonly<{ LONG?: number; SHORT?: number; FLAT?: number }>;
  }>;
}

export interface CoreSpiritExternalModelAdapter {
  readonly implementation: CoreSpiritExternalModelImplementation;
  readonly transport: CoreSpiritExternalModelTransport;
  execute(
    manifest: CoreSpiritStrictModelManifest,
    request: CoreSpiritStrictModelRequest,
    signal?: AbortSignal,
  ): Promise<CoreSpiritStrictModelPrediction>;
}

export type CoreSpiritExternalModelInvoke = (
  manifest: CoreSpiritStrictModelManifest,
  request: CoreSpiritStrictModelRequest,
  signal?: AbortSignal,
) => Promise<CoreSpiritStrictModelPrediction>;

/**
 * Generic host adapter. Concrete Python/C++/Rust/ONNX/remote adapters are
 * deliberately supplied by the host, not embedded in the CoreSpirit VM.
 */
export class CoreSpiritCallbackModelAdapter implements CoreSpiritExternalModelAdapter {
  constructor(
    readonly implementation: CoreSpiritExternalModelImplementation,
    readonly transport: CoreSpiritExternalModelTransport,
    private readonly invoke: CoreSpiritExternalModelInvoke,
  ) {}

  execute(
    manifest: CoreSpiritStrictModelManifest,
    request: CoreSpiritStrictModelRequest,
    signal?: AbortSignal,
  ): Promise<CoreSpiritStrictModelPrediction> {
    if (manifest.implementation !== this.implementation) {
      return Promise.reject(new Error(`model implementation mismatch: expected ${manifest.implementation}, adapter=${this.implementation}`));
    }
    if (manifest.transport !== this.transport) {
      return Promise.reject(new Error(`model transport mismatch: expected ${manifest.transport}, adapter=${this.transport}`));
    }
    return this.invoke(manifest, request, signal);
  }
}

export class CoreSpiritPythonModelAdapter extends CoreSpiritCallbackModelAdapter {
  constructor(invoke: CoreSpiritExternalModelInvoke) {
    super('python', 'host', invoke);
  }
}

export class CoreSpiritNativeRpcModelAdapter extends CoreSpiritCallbackModelAdapter {
  constructor(implementation: 'cpp' | 'rust', invoke: CoreSpiritExternalModelInvoke) {
    super(implementation, 'native-rpc', invoke);
  }
}

export class CoreSpiritWasmModelAdapter extends CoreSpiritCallbackModelAdapter {
  constructor(invoke: CoreSpiritExternalModelInvoke) {
    super('wasm', 'wasm', invoke);
  }
}

export class CoreSpiritOnnxModelAdapter extends CoreSpiritCallbackModelAdapter {
  constructor(invoke: CoreSpiritExternalModelInvoke) {
    super('onnx', 'onnx-runtime', invoke);
  }
}

export class CoreSpiritRemoteModelAdapter extends CoreSpiritCallbackModelAdapter {
  constructor(invoke: CoreSpiritExternalModelInvoke) {
    super('remote', 'remote-rpc', invoke);
  }
}

interface RegisteredStrictModel {
  manifest: CoreSpiritStrictModelManifest;
  adapter: CoreSpiritExternalModelAdapter;
}

function tensorBytes(tensor: CoreSpiritModelTensor): number {
  return tensor.data.length * (tensor.dtype === 'bool' ? 1 : 8);
}

function tensorSize(tensors: Readonly<Record<string, CoreSpiritModelTensor>>): number {
  return Object.values(tensors).reduce((total, tensor) => total + tensorBytes(tensor), 0);
}

function validateTensor(name: string, tensor: CoreSpiritModelTensor): void {
  if (!tensor || !Array.isArray(tensor.shape) || tensor.shape.length > 8 ||
      !Array.isArray(tensor.data) ||
      !tensor.shape.every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error(`model field '${name}' has invalid shape or data`);
  }
  const expected = tensor.shape.reduce((product, value) => product * value, 1);
  if (!Number.isSafeInteger(expected) || expected > 1_000_000 || expected !== tensor.data.length) {
    throw new Error(`model field '${name}' shape/data length mismatch or exceeds the tensor element limit`);
  }
  if (tensor.dtype !== 'f64' && tensor.dtype !== 'i64' && tensor.dtype !== 'bool') {
    throw new Error(`model field '${name}' has an unsupported dtype`);
  }
  if (tensor.data.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`model field '${name}' contains a non-finite value`);
  }
  if (tensor.dtype === 'i64' && tensor.data.some(value => !Number.isSafeInteger(value))) {
    throw new Error(`model field '${name}' contains an unsafe integer`);
  }
  if (tensor.dtype === 'bool' && tensor.data.some(value => value !== 0 && value !== 1)) {
    throw new Error(`model field '${name}' contains a non-boolean tensor value`);
  }
}

function validateSpecShape(name: string, tensor: CoreSpiritModelTensor, spec: CoreSpiritModelFieldSpec): void {
  if ((spec.representation ?? 'tensor') !== 'tensor') throw new Error(`model field '${name}' expects scalar representation`);
  validateTensor(name, tensor);
  if (tensor.dtype !== spec.dtype) throw new Error(`model field '${name}' dtype mismatch`);
  if (tensor.shape.length !== spec.shape.length || tensor.shape.some((value, index) => spec.shape[index] !== -1 && value !== spec.shape[index])) {
    throw new Error(`model field '${name}' shape mismatch`);
  }
}

export function validateCoreSpiritStrictModelManifest(manifest: CoreSpiritStrictModelManifest): void {
  if (!manifest || manifest.contractVersion !== CORE_SPIRIT_EXTERNAL_MODEL_CONTRACT_VERSION) throw new Error('unsupported CoreSpirit external model contract version');
  if (manifest.abiVersion !== CORE_SPIRIT_MODEL_ABI_VERSION) throw new Error('external model ABI version mismatch');
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(manifest.modelId) || typeof manifest.version !== 'string' || !manifest.version.trim() || manifest.version.length > 128) {
    throw new Error('external model id/version are invalid');
  }
  if (manifest.deterministic !== true) throw new Error('external models must declare deterministic=true');
  if (!Array.isArray(manifest.inputSchema) || !manifest.inputSchema.length || manifest.inputSchema.length > 64) throw new Error('external model inputSchema must contain 1–64 fields');
  if (!Array.isArray(manifest.outputSchema) || !manifest.outputSchema.length || manifest.outputSchema.length > 64) throw new Error('external model outputSchema must contain 1–64 fields');
  if (!Array.isArray(manifest.metadataFields) || manifest.metadataFields.length > 128 ||
      manifest.metadataFields.some(name => typeof name !== 'string' || !name.trim()) ||
      new Set(manifest.metadataFields).size !== manifest.metadataFields.length) {
    throw new Error('external model metadataFields must be unique, non-empty names');
  }
  if (manifest.modelKind === 'ai') {
    if (!manifest.aiOutput) throw new Error('AI models must declare aiOutput mapping');
    const mappingKeys = Object.values(manifest.aiOutput);
    if (mappingKeys.some(value => value !== undefined && (typeof value !== 'string' || !value.trim() || !manifest.metadataFields.includes(value)))) {
      throw new Error('AI output mappings must reference declared metadata fields');
    }
    if (!manifest.aiOutput.directionMetadataKey.trim()) throw new Error('AI directionMetadataKey is required');
  }
  if (manifest.modelKind !== 'ai' && manifest.aiOutput) throw new Error('aiOutput can only be declared for AI models');
  const inputNames = manifest.inputSchema.map(field => field.name);
  const outputNames = manifest.outputSchema.map(field => field.name);
  if (new Set(inputNames).size !== inputNames.length || new Set(outputNames).size !== outputNames.length) {
    throw new Error('external model input/output field names must be unique');
  }
  if (!manifest.outputSchema.some(field => field.name === manifest.primaryPredictionField && field.semantic === 'prediction' && (field.representation ?? 'tensor') === 'tensor')) {
    throw new Error('primaryPredictionField must reference a prediction field');
  }
  if (manifest.confidenceField && !manifest.outputSchema.some(field => field.name === manifest.confidenceField && field.semantic === 'confidence' && field.representation === 'scalar')) {
    throw new Error('confidenceField must reference a confidence output');
  }
  if (!Number.isSafeInteger(manifest.maxMemoryBytes) || manifest.maxMemoryBytes < 64 * 1024 || manifest.maxMemoryBytes > 2 * 1024 * 1024 * 1024) throw new Error('maxMemoryBytes must be between 64 KiB and 2 GiB');
  if (!Number.isSafeInteger(manifest.maxSteps) || manifest.maxSteps < 1 || manifest.maxSteps > 1_000_000_000) throw new Error('maxSteps must be a positive bounded integer');
  if (!Number.isSafeInteger(manifest.maxInputBytes) || manifest.maxInputBytes <= 0 || manifest.maxInputBytes > 64 * 1024 * 1024) throw new Error('maxInputBytes must be between 1 byte and 64 MiB');
  if (!Number.isSafeInteger(manifest.maxOutputBytes) || manifest.maxOutputBytes <= 0 || manifest.maxOutputBytes > 8 * 1024 * 1024) throw new Error('maxOutputBytes must be between 1 byte and 8 MiB');
  if (manifest.maxLatencyMs !== undefined && (!Number.isSafeInteger(manifest.maxLatencyMs) || manifest.maxLatencyMs < 50 || manifest.maxLatencyMs > 30_000)) {
    throw new Error('maxLatencyMs must be between 50 and 30000 ms');
  }
  for (const field of [...manifest.inputSchema, ...manifest.outputSchema]) {
    if (typeof field.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(field.name) ||
        !Array.isArray(field.shape) || field.shape.length > 8 ||
        !field.shape.every(dimension => Number.isSafeInteger(dimension) && (dimension >= 0 || dimension === -1)) ||
        field.shape.filter(dimension => dimension === -1).length > 1) {
      throw new Error('external model field schemas must use valid names and bounded tensor dimensions');
    }
    if (field.representation === 'scalar' && field.shape.length !== 0) throw new Error('scalar model fields must use scalar [] shape');
  }
  if (manifest.forecastHorizonBars !== undefined && (!Number.isInteger(manifest.forecastHorizonBars) || manifest.forecastHorizonBars < 1 || manifest.forecastHorizonBars > 100)) {
    throw new Error('forecastHorizonBars must be an integer from 1 to 100');
  }
  if (!Array.isArray(manifest.capabilities) || !manifest.capabilities.includes('write-output') ||
      new Set(manifest.capabilities).size !== manifest.capabilities.length) throw new Error('external model capabilities must be unique and include write-output');
  if (manifest.state !== 'stateless' && manifest.state !== 'stateful') throw new Error('external model state is invalid');
  if (manifest.state === 'stateful' && !manifest.rollbackSafe) throw new Error('stateful external models must declare rollbackSafe=true');
}

function snapshotStrictManifest(manifest: CoreSpiritStrictModelManifest): CoreSpiritStrictModelManifest {
  const copy: CoreSpiritStrictModelManifest = {
    ...manifest,
    ...(manifest.aiOutput ? { aiOutput: Object.freeze({ ...manifest.aiOutput }) } : {}),
    inputSchema: Object.freeze(manifest.inputSchema.map(field => Object.freeze({ ...field, shape: Object.freeze([...field.shape]) }))),
    outputSchema: Object.freeze(manifest.outputSchema.map(field => Object.freeze({ ...field, shape: Object.freeze([...field.shape]) }))),
    metadataFields: Object.freeze([...manifest.metadataFields]),
    capabilities: Object.freeze([...manifest.capabilities]),
  };
  return Object.freeze(copy);
}

export function coreSpiritStrictManifestToTransportManifest(manifest: CoreSpiritStrictModelManifest): CoreSpiritModelManifest {
  return {
    abiVersion: manifest.abiVersion,
    modelId: manifest.modelId,
    version: manifest.version,
    backend: manifest.transport === 'wasm' ? 'wasm' : manifest.transport === 'native-rpc' || manifest.transport === 'remote-rpc' ? 'native-rpc' : 'host',
    state: manifest.state,
    deterministic: true,
    inputNames: manifest.inputSchema.map(field => field.name),
    outputNames: manifest.outputSchema.map(field => field.name),
    maxMemoryBytes: manifest.maxMemoryBytes,
    maxSteps: manifest.maxSteps,
    capabilities: manifest.capabilities,
  };
}

export class CoreSpiritExternalModelRegistry {
  private readonly models = new Map<string, RegisteredStrictModel>();

  register(manifest: CoreSpiritStrictModelManifest, adapter: CoreSpiritExternalModelAdapter): void {
    validateCoreSpiritStrictModelManifest(manifest);
    if (!adapter || adapter.implementation !== manifest.implementation || adapter.transport !== manifest.transport) {
      throw new Error(`adapter does not match model '${manifest.modelId}@${manifest.version}'`);
    }
    const key = `${manifest.modelId}@${manifest.version}`;
    if (this.models.has(key)) throw new Error(`external model '${key}' is already registered`);
    // Snapshot the complete manifest: a caller must not be able to mutate the
    // registered ABI after its validation has completed.
    this.models.set(key, Object.freeze({ manifest: snapshotStrictManifest(manifest), adapter }));
  }

  get(modelId: string, version: string): RegisteredStrictModel {
    const value = this.models.get(`${modelId}@${version}`);
    if (!value) throw new Error(`external model '${modelId}@${version}' is not registered`);
    return value;
  }

  list(): CoreSpiritStrictModelManifest[] {
    return [...this.models.values()].map(entry => entry.manifest).sort((a, b) => `${a.modelId}@${a.version}`.localeCompare(`${b.modelId}@${b.version}`));
  }
}

export interface CoreSpiritExternalModelCallLimits {
  maxCallsPerBar: number;
  maxInputBytes: number;
  maxOutputBytes: number;
  /** Host-call deadline; a manifest may request a shorter deadline, never a longer one. */
  timeoutMs?: number;
}

export interface CoreSpiritExternalModelCallResult extends CoreSpiritStrictModelPrediction {
  modelId: string;
  version: string;
  requestChecksum: string;
}

export class CoreSpiritModelOrchestrator {
  private readonly callsPerBar = new Map<string, number>();
  private readonly maxTrackedBarKeys: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly registry: CoreSpiritExternalModelRegistry,
    private readonly limits: CoreSpiritExternalModelCallLimits & { maxTrackedBarKeys?: number },
    private readonly executionTarget?: CoreSpiritExecutionTarget,
  ) {
    for (const key of ['maxCallsPerBar', 'maxInputBytes', 'maxOutputBytes'] as const) {
      if (!Number.isSafeInteger(limits[key]) || limits[key] <= 0) throw new Error(`model orchestrator ${key} must be a positive safe integer`);
    }
    this.maxTrackedBarKeys = limits.maxTrackedBarKeys ?? 4096;
    if (!Number.isSafeInteger(this.maxTrackedBarKeys) || this.maxTrackedBarKeys < 64 || this.maxTrackedBarKeys > 65_536) {
      throw new Error('model orchestrator maxTrackedBarKeys must be between 64 and 65536');
    }
    this.timeoutMs = limits.timeoutMs ?? 8_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 50 || this.timeoutMs > 30_000) {
      throw new Error('model orchestrator timeoutMs must be between 50 and 30000 ms');
    }
  }

  private barKey(runId: string, barIndex: number): string {
    return JSON.stringify([runId, barIndex]);
  }

  private ensureBarLedgerCapacity(key: string): void {
    if (!this.callsPerBar.has(key) && this.callsPerBar.size >= this.maxTrackedBarKeys) {
      // Never evict a quota record: replaying an old run/bar must not reset its
      // call budget. Hosts release entries explicitly when a run is finalized.
      throw new Error('model call quota ledger is full; finalize an existing run before admitting more bars');
    }
  }

  resetBar(runId: string, barIndex: number): void {
    if (!runId.trim() || /[\u0000-\u001f]/.test(runId) || !Number.isSafeInteger(barIndex) || barIndex < 0) {
      throw new Error('model call quota bar identity is invalid');
    }
    const key = this.barKey(runId, barIndex);
    // Idempotent initialization only. A public reset method must never refund
    // calls for a bar that has already consumed its execution quota.
    if (this.callsPerBar.has(key)) return;
    this.ensureBarLedgerCapacity(key);
    this.callsPerBar.set(key, 0);
  }

  completeRun(runId: string): void {
    if (!runId.trim() || /[\u0000-\u001f]/.test(runId)) throw new Error('model call quota run identity is invalid');
    for (const key of this.callsPerBar.keys()) {
      try {
        const parsed = JSON.parse(key) as unknown;
        if (Array.isArray(parsed) && parsed[0] === runId) this.callsPerBar.delete(key);
      } catch {
        // Internal keys are created by barKey(); malformed entries are ignored.
      }
    }
  }

  async infer(
    request: CoreSpiritStrictModelRequest,
    options: Readonly<{ signal?: AbortSignal }> = {},
  ): Promise<CoreSpiritExternalModelCallResult> {
    if (this.executionTarget && !canUseExecutionTargetCapability(this.executionTarget, 'model-inference')) {
      throw new Error(`execution target '${this.executionTarget}' does not allow model inference`);
    }
    if (!request || typeof request.requestId !== 'string' || !request.requestId.trim() || request.requestId.length > 128) {
      throw new Error('external model requestId is invalid');
    }
    const registered = this.registry.get(request.modelId, request.version);
    const manifest = registered.manifest;
    validateCoreSpiritStrictModelManifest(manifest);
    const context = request.context;
    if (!context || !context.runId?.trim() || context.runId.length > 128 ||
        context.modelVersion !== manifest.version || !Number.isSafeInteger(context.barIndex) || context.barIndex < 0 ||
        !Number.isSafeInteger(context.timestamp) || context.timestamp < 0 ||
        !Number.isSafeInteger(context.revision) || context.revision < 0 ||
        !context.symbol?.trim() || !context.timeframe?.trim() || !context.deterministicSeed?.trim() ||
        typeof context.confirmed !== 'boolean' ||
        !['historical', 'realtime', 'replay', 'backtest', 'historicalTick'].includes(context.mode)) {
      throw new Error('external model execution context is invalid or does not match the pinned model version');
    }
    if (request.modelId !== manifest.modelId || request.version !== manifest.version) {
      throw new Error('external model request identity does not match its registered manifest');
    }
    const market = request.marketState;
    if (!market || market.timestamp !== context.timestamp ||
        market.timeframe !== context.timeframe ||
        market.instrument?.symbol !== context.symbol ||
        !market.instrument.instrumentId?.trim()) {
      throw new Error('external model market context does not match its execution context');
    }

    const allowedInputs = new Set(manifest.inputSchema.map(field => field.name));
    for (const name of Object.keys(request.features ?? {})) {
      if (!allowedInputs.has(name)) throw new Error(`undeclared model feature '${name}' is not allowed by the manifest`);
    }
    for (const field of manifest.inputSchema) {
      const tensor = request.features[field.name];
      if (!tensor && field.required) throw new Error(`required model feature '${field.name}' is missing`);
      if (tensor) validateSpecShape(field.name, tensor, field);
    }
    const inputBytes = tensorSize(request.features);
    if (inputBytes > Math.min(this.limits.maxInputBytes, manifest.maxInputBytes)) throw new Error(`external model input quota exceeded: ${inputBytes}`);

    const key = this.barKey(context.runId, context.barIndex);
    const count = this.callsPerBar.get(key) ?? 0;
    if (count >= this.limits.maxCallsPerBar) throw new Error(`external model call quota exceeded at bar ${context.barIndex}`);
    this.ensureBarLedgerCapacity(key);
    // Reserve synchronously before awaiting the remote host so concurrent calls
    // cannot all observe the same remaining quota and race past the per-bar cap.
    this.callsPerBar.set(key, count + 1);

    const requestChecksum = coreSpiritChecksum({
      contractVersion: CORE_SPIRIT_EXTERNAL_MODEL_CONTRACT_VERSION,
      modelId: request.modelId,
      version: request.version,
      requestId: request.requestId,
      context,
      features: request.features,
      marketState: request.marketState,
      stateToken: request.stateToken ?? '',
    });

    const adapterRequest: CoreSpiritStrictModelRequest = manifest.capabilities.includes('read-market-state')
      ? request
      : { ...request, marketState: { timestamp: market.timestamp, instrument: market.instrument, timeframe: market.timeframe } };

    if (options.signal?.aborted) throw new Error('external model execution was cancelled');
    const controller = new AbortController();
    let rejectCancellation: (reason: Error) => void = () => undefined;
    const cancelled = new Promise<never>((_, reject) => { rejectCancellation = reject; });
    const abort = () => {
      const reason = new Error('external model execution was cancelled');
      controller.abort(reason);
      rejectCancellation(reason);
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    const timeoutMs = Math.min(manifest.maxLatencyMs ?? this.timeoutMs, this.timeoutMs);
    let rejectTimeout: (reason: Error) => void = () => undefined;
    const timeout = new Promise<never>((_, reject) => { rejectTimeout = reject; });
    const timer = setTimeout(() => {
      const reason = new Error('external model execution exceeded its latency budget');
      controller.abort(reason);
      rejectTimeout(reason);
    }, timeoutMs);
    let result: CoreSpiritStrictModelPrediction;
    try {
      if (options.signal?.aborted) abort();
      result = await Promise.race([
        registered.adapter.execute(manifest, adapterRequest, controller.signal),
        timeout,
        cancelled,
      ]);
      if (controller.signal.aborted) throw new Error('external model execution was cancelled or timed out');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
    const predictionField = manifest.outputSchema.find(field => field.name === manifest.primaryPredictionField)!;
    validateSpecShape(manifest.primaryPredictionField, result.prediction, predictionField);
    if (manifest.confidenceField && result.confidence === undefined) {
      throw new Error('model confidence output is required by the registered manifest');
    }
    if (result.confidence !== undefined && (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1)) {
      throw new Error('model confidence must be finite and between 0 and 1');
    }
    if (!result.metadata || typeof result.metadata !== 'object' || Array.isArray(result.metadata)) {
      throw new Error('model metadata must be a structured object');
    }
    const allowedMetadata = new Set(manifest.metadataFields);
    for (const [name, value] of Object.entries(result.metadata)) {
      if (!allowedMetadata.has(name)) throw new Error(`undeclared model metadata '${name}' is not allowed by the manifest`);
      if (value !== null && typeof value !== 'string' && typeof value !== 'boolean' &&
          !(typeof value === 'number' && Number.isFinite(value))) {
        throw new Error(`model metadata '${name}' must be a finite scalar value`);
      }
    }

    const metadataBytes = new TextEncoder().encode(JSON.stringify(result.metadata)).byteLength;
    const outputBytes = tensorBytes(result.prediction) + (result.confidence === undefined ? 0 : 8) + metadataBytes;
    if (outputBytes > Math.min(this.limits.maxOutputBytes, manifest.maxOutputBytes)) throw new Error(`external model output quota exceeded: ${outputBytes}`);

    return { ...result, modelId: request.modelId, version: request.version, requestChecksum };
  }
}

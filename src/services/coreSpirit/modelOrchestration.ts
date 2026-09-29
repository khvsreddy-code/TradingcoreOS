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
  ): Promise<CoreSpiritStrictModelPrediction>;
}

export type CoreSpiritExternalModelInvoke = (
  manifest: CoreSpiritStrictModelManifest,
  request: CoreSpiritStrictModelRequest,
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
  ): Promise<CoreSpiritStrictModelPrediction> {
    if (manifest.implementation !== this.implementation) {
      return Promise.reject(new Error(`model implementation mismatch: expected ${manifest.implementation}, adapter=${this.implementation}`));
    }
    if (manifest.transport !== this.transport) {
      return Promise.reject(new Error(`model transport mismatch: expected ${manifest.transport}, adapter=${this.transport}`));
    }
    return this.invoke(manifest, request);
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
  if (!tensor.shape.every(value => Number.isInteger(value) && value >= 0)) {
    throw new Error(`model field '${name}' has invalid shape`);
  }
  const expected = tensor.shape.reduce((product, value) => product * value, 1);
  if (expected !== tensor.data.length) throw new Error(`model field '${name}' shape/data length mismatch`);
  if (tensor.dtype !== 'bool' && tensor.data.some(value => !Number.isFinite(value))) {
    throw new Error(`model field '${name}' contains a non-finite value`);
  }
}

function validateSpecShape(name: string, tensor: CoreSpiritModelTensor, spec: CoreSpiritModelFieldSpec): void {
  if ((spec.representation ?? 'tensor') !== 'tensor') throw new Error(`model field '${name}' expects scalar representation`);
  validateTensor(name, tensor);
  if (tensor.dtype !== spec.dtype) throw new Error(`model field '${name}' dtype mismatch`);
  if (tensor.shape.length !== spec.shape.length || tensor.shape.some((value, index) => value !== spec.shape[index])) {
    throw new Error(`model field '${name}' shape mismatch`);
  }
}

export function validateCoreSpiritStrictModelManifest(manifest: CoreSpiritStrictModelManifest): void {
  if (manifest.contractVersion !== CORE_SPIRIT_EXTERNAL_MODEL_CONTRACT_VERSION) throw new Error('unsupported CoreSpirit external model contract version');
  if (manifest.abiVersion !== CORE_SPIRIT_MODEL_ABI_VERSION) throw new Error('external model ABI version mismatch');
  if (!manifest.modelId || !manifest.version) throw new Error('external model id/version are required');
  if (manifest.deterministic !== true) throw new Error('external models must declare deterministic=true');
  if (!manifest.inputSchema.length) throw new Error('external model inputSchema cannot be empty');
  if (!manifest.outputSchema.length) throw new Error('external model outputSchema cannot be empty');
  if (manifest.modelKind === 'ai') {
    if (!manifest.aiOutput) throw new Error('AI models must declare aiOutput mapping');
    if (!manifest.aiOutput.directionMetadataKey.trim()) throw new Error('AI directionMetadataKey is required');
  }
  if (manifest.modelKind !== 'ai' && manifest.aiOutput) throw new Error('aiOutput can only be declared for AI models');
  if (!manifest.outputSchema.some(field => field.name === manifest.primaryPredictionField && field.semantic === 'prediction' && (field.representation ?? 'tensor') === 'tensor')) {
    throw new Error('primaryPredictionField must reference a prediction field');
  }
  if (manifest.confidenceField && !manifest.outputSchema.some(field => field.name === manifest.confidenceField && field.semantic === 'confidence' && field.representation === 'scalar')) {
    throw new Error('confidenceField must reference a confidence output');
  }
  if (!Number.isInteger(manifest.maxMemoryBytes) || manifest.maxMemoryBytes < 64 * 1024) throw new Error('maxMemoryBytes must be >= 64 KiB');
  if (!Number.isInteger(manifest.maxSteps) || manifest.maxSteps < 1) throw new Error('maxSteps must be positive');
  if (!Number.isInteger(manifest.maxInputBytes) || manifest.maxInputBytes <= 0) throw new Error('maxInputBytes must be positive');
  if (!Number.isInteger(manifest.maxOutputBytes) || manifest.maxOutputBytes <= 0) throw new Error('maxOutputBytes must be positive');
  if (!manifest.capabilities.includes('write-output')) throw new Error('external model must declare write-output capability');
  if (manifest.state === 'stateful' && !manifest.rollbackSafe) throw new Error('stateful external models must declare rollbackSafe=true');
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
    if (adapter.implementation !== manifest.implementation || adapter.transport !== manifest.transport) {
      throw new Error(`adapter does not match model '${manifest.modelId}@${manifest.version}'`);
    }


    const key = `${manifest.modelId}@${manifest.version}`;
    if (this.models.has(key)) throw new Error(`external model '${key}' is already registered`);
    this.models.set(key, { manifest, adapter });
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
}

export interface CoreSpiritExternalModelCallResult extends CoreSpiritStrictModelPrediction {
  modelId: string;
  version: string;
  requestChecksum: string;
}

export class CoreSpiritModelOrchestrator {
  private readonly callsPerBar = new Map<string, number>();

  constructor(
    private readonly registry: CoreSpiritExternalModelRegistry,
    private readonly limits: CoreSpiritExternalModelCallLimits,
    private readonly executionTarget?: CoreSpiritExecutionTarget,
  ) {}

  resetBar(runId: string, barIndex: number): void {
    this.callsPerBar.set(`${runId}:${barIndex}`, 0);
  }

  async infer(request: CoreSpiritStrictModelRequest): Promise<CoreSpiritExternalModelCallResult> {
    if (this.executionTarget && !canUseExecutionTargetCapability(this.executionTarget, 'model-inference')) {
      throw new Error(`execution target '${this.executionTarget}' does not allow model inference`);
    }
    const registered = this.registry.get(request.modelId, request.version);
    validateCoreSpiritStrictModelManifest(registered.manifest);

    const key = `${request.context.runId}:${request.context.barIndex}`;
    const count = this.callsPerBar.get(key) ?? 0;
    if (count >= this.limits.maxCallsPerBar) throw new Error(`external model call quota exceeded at bar ${request.context.barIndex}`);

    for (const field of registered.manifest.inputSchema) {
      const tensor = request.features[field.name];
      if (!tensor && field.required) throw new Error(`required model feature '${field.name}' is missing`);
      if (tensor) validateSpecShape(field.name, tensor, field);
    }
    const inputBytes = tensorSize(request.features);
    if (inputBytes > Math.min(this.limits.maxInputBytes, registered.manifest.maxInputBytes)) throw new Error(`external model input quota exceeded: ${inputBytes}`);

    const requestChecksum = coreSpiritChecksum({
      contractVersion: CORE_SPIRIT_EXTERNAL_MODEL_CONTRACT_VERSION,
      modelId: request.modelId,
      version: request.version,
      requestId: request.requestId,
      context: request.context,
      features: request.features,
      marketState: request.marketState,
      stateToken: request.stateToken ?? '',
    });

    const adapterRequest: CoreSpiritStrictModelRequest = registered.manifest.capabilities.includes('read-market-state')
      ? request
      : { ...request, marketState: { timestamp: request.marketState.timestamp, instrument: request.marketState.instrument, timeframe: request.marketState.timeframe } };

    const result = await registered.adapter.execute(registered.manifest, adapterRequest);
    validateSpecShape(registered.manifest.primaryPredictionField, result.prediction, registered.manifest.outputSchema.find(field => field.name === registered.manifest.primaryPredictionField)!);
    if (result.confidence != null && (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1)) {
      throw new Error('model confidence must be finite and between 0 and 1');
    }

    const outputBytes = tensorBytes(result.prediction);
    if (outputBytes > Math.min(this.limits.maxOutputBytes, registered.manifest.maxOutputBytes)) throw new Error(`external model output quota exceeded: ${outputBytes}`);

    this.callsPerBar.set(key, count + 1);
    return { ...result, modelId: request.modelId, version: request.version, requestChecksum };
  }
}

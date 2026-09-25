/**
 * CoreSpirit Model ABI — Stage 49.
 *
 * Models are external compute capabilities consumed by the same CoreSpirit
 * runtime. A model may be implemented in WASM, a host-native process/RPC
 * service, or another host adapter. The VM never receives arbitrary network,
 * filesystem, process, or broker capabilities through this ABI.
 */

export const CORE_SPIRIT_MODEL_ABI_VERSION = 1 as const;
export type CoreSpiritModelAbiVersion = typeof CORE_SPIRIT_MODEL_ABI_VERSION;

export type CoreSpiritModelBackend = 'wasm' | 'native-rpc' | 'host';
export type CoreSpiritModelValue = number | boolean | string | null;
export type CoreSpiritModelState = 'stateless' | 'stateful';

export interface CoreSpiritModelTensor {
  dtype: 'f64' | 'i64' | 'bool';
  shape: readonly number[];
  data: readonly number[];
}

export interface CoreSpiritModelManifest {
  abiVersion: CoreSpiritModelAbiVersion;
  modelId: string;
  version: string;
  backend: CoreSpiritModelBackend;
  state: CoreSpiritModelState;
  deterministic: true;
  inputNames: readonly string[];
  outputNames: readonly string[];
  maxMemoryBytes: number;
  maxSteps: number;
  capabilities: readonly CoreSpiritModelCapability[];
}

export type CoreSpiritModelCapability =
  | 'read-series'
  | 'read-features'
  | 'write-output'
  | 'persistent-state';

export interface CoreSpiritModelExecutionContext {
  runId: string;
  programChecksum: string;
  modelVersion: string;
  barIndex: number;
  timestamp: number;
  symbol: string;
  timeframe: string;
  mode: 'historical' | 'realtime' | 'replay' | 'backtest' | 'historicalTick';
  revision: number;
  confirmed: boolean;
  /** Stable seed supplied by the host when a model needs pseudo-randomness. */
  deterministicSeed: string;
}

export interface CoreSpiritModelExecutionRequest {
  context: CoreSpiritModelExecutionContext;
  inputs: Readonly<Record<string, CoreSpiritModelTensor>>;
  stateToken?: string;
}

export interface CoreSpiritModelExecutionResult {
  outputs: Readonly<Record<string, CoreSpiritModelTensor>>;
  nextStateToken?: string;
  outputChecksum: string;
  stateChecksum: string;
}

export interface CoreSpiritModelHost {
  readonly backend: CoreSpiritModelBackend;
  execute(
    manifest: CoreSpiritModelManifest,
    request: CoreSpiritModelExecutionRequest,
  ): Promise<CoreSpiritModelExecutionResult>;
}

/** A host-side implementation of a WASM module runner. */
export interface CoreSpiritWasmRuntime {
  instantiate(moduleBytes: Uint8Array, limits: {
    maxMemoryBytes: number;
    maxSteps: number;
  }): Promise<CoreSpiritWasmInstance>;
}

export interface CoreSpiritWasmInstance {
  execute(request: CoreSpiritModelExecutionRequest): Promise<CoreSpiritModelExecutionResult>;
  dispose(): void;
}

export class CoreSpiritWasmModelHost implements CoreSpiritModelHost {
  readonly backend = 'wasm' as const;

  constructor(
    private readonly moduleBytes: Uint8Array,
    private readonly wasmRuntime: CoreSpiritWasmRuntime,
  ) {}

  async execute(
    manifest: CoreSpiritModelManifest,
    request: CoreSpiritModelExecutionRequest,
  ): Promise<CoreSpiritModelExecutionResult> {
    if (manifest.backend !== 'wasm') throw new Error('WASM host received a non-WASM model manifest');
    const instance = await this.wasmRuntime.instantiate(this.moduleBytes, {
      maxMemoryBytes: manifest.maxMemoryBytes,
      maxSteps: manifest.maxSteps,
    });
    try {
      return await instance.execute(request);
    } finally {
      instance.dispose();
    }
  }
}

/** Host-side bridge for C/C++/Rust/etc. services; gRPC is one valid transport. */
export interface CoreSpiritNativeModelTransport {
  call(endpointKey: string, request: CoreSpiritModelExecutionRequest):
    Promise<CoreSpiritModelExecutionResult>;
}

export class CoreSpiritNativeRpcModelHost implements CoreSpiritModelHost {
  readonly backend = 'native-rpc' as const;

  constructor(
    private readonly endpointKey: string,
    private readonly transport: CoreSpiritNativeModelTransport,
  ) {}

  execute(
    manifest: CoreSpiritModelManifest,
    request: CoreSpiritModelExecutionRequest,
  ): Promise<CoreSpiritModelExecutionResult> {
    if (manifest.backend !== 'native-rpc') {
      return Promise.reject(new Error('native RPC host received a non-native model manifest'));
    }
    return this.transport.call(this.endpointKey, request);
  }
}

export interface CoreSpiritRegisteredModel {
  manifest: CoreSpiritModelManifest;
  host: CoreSpiritModelHost;
}

export class CoreSpiritModelRegistry {
  private readonly models = new Map<string, CoreSpiritRegisteredModel>();

  register(model: CoreSpiritRegisteredModel): void {
    validateCoreSpiritModelManifest(model.manifest);
    const key = `${model.manifest.modelId}@${model.manifest.version}`;
    if (this.models.has(key)) throw new Error(`model '${key}' is already registered`);
    this.models.set(key, model);
  }

  get(modelId: string, version: string): CoreSpiritRegisteredModel {
    const model = this.models.get(`${modelId}@${version}`);
    if (!model) throw new Error(`CoreSpirit model '${modelId}@${version}' is not registered`);
    return model;
  }

  list(): CoreSpiritModelManifest[] {
    return [...this.models.values()]
      .map(model => model.manifest)
      .sort((a, b) => `${a.modelId}@${a.version}`.localeCompare(`${b.modelId}@${b.version}`));
  }
}

export function validateCoreSpiritModelManifest(manifest: CoreSpiritModelManifest): void {
  if (manifest.abiVersion !== CORE_SPIRIT_MODEL_ABI_VERSION) throw new Error('unsupported CoreSpirit Model ABI version');
  if (!manifest.modelId || !manifest.version) throw new Error('modelId and version are required');
  if (manifest.deterministic !== true) throw new Error('CoreSpirit models must declare deterministic=true');
  if (!Number.isInteger(manifest.maxMemoryBytes) || manifest.maxMemoryBytes < 64 * 1024) {
    throw new Error('maxMemoryBytes must be >= 64 KiB');
  }
  if (!Number.isInteger(manifest.maxSteps) || manifest.maxSteps < 1) {
    throw new Error('maxSteps must be positive');
  }
  if (!manifest.capabilities.includes('write-output')) {
    throw new Error('a model must declare write-output capability');
  }
}

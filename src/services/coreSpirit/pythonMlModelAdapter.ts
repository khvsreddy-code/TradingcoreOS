import { coreSpiritChecksum } from './artifact';
import {
  CORE_SPIRIT_EXTERNAL_MODEL_CONTRACT_VERSION,
  CoreSpiritExternalModelRegistry,
  validateCoreSpiritStrictModelManifest,
  type CoreSpiritExternalModelAdapter,
  type CoreSpiritExternalModelTransport,
  type CoreSpiritStrictModelManifest,
  type CoreSpiritStrictModelPrediction,
  type CoreSpiritStrictModelRequest,
} from './modelOrchestration';
import {
  CoreSpiritModelRegistry,
  type CoreSpiritModelExecutionRequest,
  type CoreSpiritModelExecutionResult,
  type CoreSpiritModelHost,
  type CoreSpiritModelManifest,
  type CoreSpiritModelTensor,
} from './modelAbi';
import { coreSpiritStrictManifestToTransportManifest } from './modelOrchestration';

const MAX_CANDLES = 5_000;
const MIN_CANDLES = 80;
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,79}$/;

export type CoreSpiritPythonMlServiceConfig = {
  baseUrl: string;
  serviceSecret: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type CoreSpiritPythonMlModelSpec = {
  modelId: string;
  version: string;
  forecastHorizonBars?: number;
  maxLatencyMs?: number;
};

function tensor(
  dtype: CoreSpiritModelTensor['dtype'],
  shape: readonly number[],
  data: readonly number[],
): CoreSpiritModelTensor {
  return { dtype, shape, data };
}

/**
 * Host-side contract for the TradingCoreOS Python ML inference service.
 *
 * Input tensors are row-major: OHLCV [bars,5], timestamps_ms [bars], and
 * confirmed [bars]. Dynamic dimensions are bounded to 5,000 candles before
 * requests reach the Python service.
 */
export function createCoreSpiritPythonMlManifest(spec: CoreSpiritPythonMlModelSpec): CoreSpiritStrictModelManifest {
  const modelId = String(spec.modelId || '').trim();
  const version = String(spec.version || '').trim();
  const horizon = spec.forecastHorizonBars ?? 1;
  if (!MODEL_ID_PATTERN.test(modelId)) throw new Error('Python ML modelId must be a normalized model identifier.');
  if (!version || version.length > 200) throw new Error('Python ML model version is required.');
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 100) throw new Error('Python ML forecast horizon must be an integer from 1 to 100.');

  const manifest: CoreSpiritStrictModelManifest = {
    contractVersion: CORE_SPIRIT_EXTERNAL_MODEL_CONTRACT_VERSION,
    abiVersion: 1,
    modelId,
    version,
    implementation: 'python',
    transport: 'host',
    deterministic: true,
    state: 'stateless',
    rollbackSafe: true,
    forecastHorizonBars: horizon,
    inputSchema: [
      { name: 'ohlcv', dtype: 'f64', shape: [-1, 5], required: true, semantic: 'feature' },
      { name: 'timestamps_ms', dtype: 'f64', shape: [-1], required: true, semantic: 'feature' },
      { name: 'confirmed', dtype: 'bool', shape: [-1], required: true, semantic: 'feature' },
    ],
    outputSchema: [
      { name: 'prediction', dtype: 'f64', shape: [3], required: true, semantic: 'prediction' },
      { name: 'confidence', dtype: 'f64', shape: [], required: true, semantic: 'confidence', representation: 'scalar' },
    ],
    primaryPredictionField: 'prediction',
    confidenceField: 'confidence',
    metadataFields: [
      'direction', 'predicted_price', 'expected_return', 'expected_move',
      'lower_bound', 'upper_bound', 'return_estimate_kind', 'model_version',
      'artifact_hash', 'release_status', 'probability_calibration',
      'production_eligible', 'probability_semantics', 'forecast_horizon_bars',
    ],
    maxMemoryBytes: 64 * 1024 * 1024,
    maxSteps: 1_000_000,
    maxInputBytes: 512 * 1024,
    maxOutputBytes: 4 * 1024,
    maxLatencyMs: spec.maxLatencyMs ?? 8_000,
    capabilities: ['read-features', 'read-market-state', 'write-output'],
  };
  validateCoreSpiritStrictModelManifest(manifest);
  return manifest;
}

function requireTensor(
  name: string,
  value: CoreSpiritModelTensor | undefined,
  dtype: CoreSpiritModelTensor['dtype'],
  rows: number,
  columns?: number,
): CoreSpiritModelTensor {
  if (!value || value.dtype !== dtype) throw new Error(`Python ML input '${name}' is missing or has the wrong dtype.`);
  const expectedShape = columns === undefined ? [rows] : [rows, columns];
  if (value.shape.length !== expectedShape.length || value.shape.some((size, index) => size !== expectedShape[index])) {
    throw new Error(`Python ML input '${name}' must have shape [${expectedShape.join(', ')}].`);
  }
  const expectedLength = expectedShape.reduce((total, size) => total * size, 1);
  if (value.data.length !== expectedLength) throw new Error(`Python ML input '${name}' has an invalid data length.`);
  return value;
}

function safeJsonError(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const detail = parsed?.detail;
    if (typeof detail === 'string') return detail.slice(0, 300);
    if (detail && typeof detail === 'object' && typeof detail.message === 'string') return detail.message.slice(0, 300);
    if (typeof parsed?.error === 'string') return parsed.error.slice(0, 300);
  } catch {
    // The response may be plain text; never include an unbounded body in diagnostics.
  }
  return raw.slice(0, 300) || 'Python ML service returned an empty error response.';
}

function safeMetadataValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function finiteProbability(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

export class CoreSpiritPythonMlServiceAdapter implements CoreSpiritExternalModelAdapter {
  readonly implementation = 'python' as const;
  readonly transport: CoreSpiritExternalModelTransport = 'host';

  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: CoreSpiritPythonMlServiceConfig) {
    this.baseUrl = String(config.baseUrl || '').trim().replace(/\/+$/, '');
    this.secret = String(config.serviceSecret || '').trim();
    this.timeoutMs = Math.max(250, Math.min(30_000, Math.floor(config.timeoutMs ?? 8_000)));
    this.fetchImpl = config.fetchImpl ?? fetch;

    if (this.secret.length < 32) throw new Error('ML_SERVICE_SECRET must contain at least 32 characters.');
    let parsed: URL;
    try { parsed = new URL(this.baseUrl); }
    catch { throw new Error('Python ML service baseUrl must be an absolute HTTP(S) URL.'); }
    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && localHost)) {
      throw new Error('Python ML service must use HTTPS outside localhost development.');
    }
    if (parsed.username || parsed.password) throw new Error('Python ML service URL must not contain embedded credentials.');
    if (parsed.search || parsed.hash) throw new Error('Python ML service baseUrl must not contain a query string or fragment.');
  }

  async execute(
    manifest: CoreSpiritStrictModelManifest,
    request: CoreSpiritStrictModelRequest,
  ): Promise<CoreSpiritStrictModelPrediction> {
    validateCoreSpiritStrictModelManifest(manifest);
    if (manifest.implementation !== this.implementation || manifest.transport !== this.transport) {
      throw new Error('Python ML adapter received an incompatible model manifest.');
    }
    if (request.modelId !== manifest.modelId || request.version !== manifest.version) {
      throw new Error('Python ML request model identity does not match its registered manifest.');
    }
    if (!request.context.confirmed) throw new Error('Python ML inference accepts confirmed-bar inputs only.');

    const ohlcv = request.features.ohlcv;
    if (!ohlcv || ohlcv.dtype !== 'f64' || ohlcv.shape.length !== 2 || ohlcv.shape[1] !== 5) {
      throw new Error("Python ML 'ohlcv' input must be a row-major f64 [bars,5] tensor.");
    }
    const rows = ohlcv.shape[0]!;
    if (!Number.isInteger(rows) || rows < MIN_CANDLES || rows > MAX_CANDLES) {
      throw new Error(`Python ML inference requires ${MIN_CANDLES}-${MAX_CANDLES} candles.`);
    }
    const timestamps = requireTensor('timestamps_ms', request.features.timestamps_ms, 'f64', rows);
    const confirmed = requireTensor('confirmed', request.features.confirmed, 'bool', rows);
    if (ohlcv.data.length !== rows * 5 || ohlcv.data.some(value => !Number.isFinite(value))) {
      throw new Error("Python ML 'ohlcv' tensor contains invalid values or length.");
    }
    if (confirmed.data.some(value => value !== 1)) throw new Error('Python ML inference requires every supplied candle to be confirmed.');

    const candles: Array<Record<string, unknown>> = [];
    let previousTimestamp = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < rows; index += 1) {
      const timestamp = timestamps.data[index]!;
      if (!Number.isFinite(timestamp) || timestamp <= previousTimestamp || timestamp < 1_000_000_000_000) {
        throw new Error('Python ML timestamps_ms must be strictly increasing epoch-millisecond values.');
      }
      previousTimestamp = timestamp;
      const offset = index * 5;
      const open = ohlcv.data[offset]!;
      const high = ohlcv.data[offset + 1]!;
      const low = ohlcv.data[offset + 2]!;
      const close = ohlcv.data[offset + 3]!;
      const volume = ohlcv.data[offset + 4]!;
      if (
        ![open, high, low, close, volume].every(Number.isFinite) ||
        Math.min(open, high, low, close) <= 0 ||
        volume < 0 ||
        high < Math.max(open, close, low) ||
        low > Math.min(open, close, high)
      ) throw new Error(`Python ML candle ${index} has invalid OHLCV values.`);
      candles.push({
        timestamp: new Date(timestamp).toISOString(),
        availableAt: new Date(timestamp).toISOString(),
        open, high, low, close, volume,
        phase: 'confirmed',
        confirmed: true,
      });
    }

    const symbol = String(request.marketState.instrument.symbol || request.context.symbol || '').trim();
    const timeframe = String(request.marketState.timeframe || request.context.timeframe || '').trim();
    if (!symbol || !timeframe) throw new Error('Python ML inference requires a canonical symbol and timeframe.');

    const upstream = await this.fetchImpl(this.baseUrl + '/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TradingCore-ML-Secret': this.secret,
      },
      signal: AbortSignal.timeout(this.timeoutMs),
      body: JSON.stringify({
        symbol,
        timeframe,
        horizon: manifest.forecastHorizonBars ?? 1,
        models: [manifest.modelId],
        model_versions: { [manifest.modelId]: manifest.version },
        candles,
      }),
    });
    const responseText = await upstream.text();
    if (responseText.length > 512 * 1024) throw new Error('Python ML response exceeded the 512 KiB response limit.');
    if (!upstream.ok) throw new Error(`Python ML service rejected ${manifest.modelId}@${manifest.version}: ${safeJsonError(responseText)}`);

    let payload: any;
    try { payload = JSON.parse(responseText); }
    catch { throw new Error('Python ML service returned invalid JSON.'); }
    const result = payload?.models?.[manifest.modelId];
    if (!result || result.trained !== true || result.status === 'unavailable') {
      throw new Error(`No trained Python ML artifact is installed for ${symbol}/${timeframe}/${manifest.modelId}.`);
    }
    if (String(result.model_version || '') !== manifest.version) {
      throw new Error('Python ML artifact version does not match the registered CoreSpirit model manifest.');
    }
    const probabilities = [
      finiteProbability(result.bullish_probability),
      finiteProbability(result.neutral_probability),
      finiteProbability(result.bearish_probability),
    ];
    if (probabilities.some(value => value === null)) throw new Error('Python ML service returned invalid direction probabilities.');
    const probabilityTotal = (probabilities as number[]).reduce((total, value) => total + value, 0);
    if (Math.abs(probabilityTotal - 1) > 0.03) throw new Error('Python ML direction probabilities do not sum to one.');
    const confidence = finiteProbability(result.confidence);
    if (confidence === null) throw new Error('Python ML service did not return a valid confidence value.');
    const prediction = tensor('f64', [3], probabilities as number[]);
    const metadata: Record<string, string | number | boolean | null> = {
      direction: safeMetadataValue(result.direction),
      predicted_price: safeMetadataValue(result.predicted_price),
      expected_return: safeMetadataValue(result.expected_return),
      expected_move: safeMetadataValue(result.expected_move),
      lower_bound: safeMetadataValue(result.lower_bound),
      upper_bound: safeMetadataValue(result.upper_bound),
      return_estimate_kind: safeMetadataValue(result.return_estimate_kind),
      model_version: safeMetadataValue(result.model_version),
      artifact_hash: safeMetadataValue(result.artifact_hash),
      release_status: safeMetadataValue(result.release_status),
      probability_calibration: safeMetadataValue(result.probability_calibration),
      production_eligible: safeMetadataValue(result.production_eligible),
      probability_semantics: safeMetadataValue(result.probability_semantics),
      forecast_horizon_bars: safeMetadataValue(result.forecast_horizon_bars),
    };
    const outputChecksum = coreSpiritChecksum({ modelId: manifest.modelId, version: manifest.version, prediction, confidence, metadata });
    const stateChecksum = coreSpiritChecksum({ modelId: manifest.modelId, version: manifest.version, stateToken: request.stateToken ?? null, context: request.context });
    return {
      prediction,
      confidence,
      metadata,
      outputChecksum,
      stateChecksum,
    };
  }
}

/** Register a concrete Python ML host with the strict CoreSpirit model registry. */
export function registerCoreSpiritPythonMlModel(
  registry: CoreSpiritExternalModelRegistry,
  spec: CoreSpiritPythonMlModelSpec,
  config: CoreSpiritPythonMlServiceConfig,
): CoreSpiritStrictModelManifest {
  const manifest = createCoreSpiritPythonMlManifest(spec);
  registry.register(manifest, new CoreSpiritPythonMlServiceAdapter(config));
  return manifest;
}


/**
 * Adapts the strict Python service model to CoreSpirit's stable low-level Model
 * ABI. This makes it consumable by CoreSpiritModelRuntime while keeping HTTP,
 * credentials and transport details outside the VM.
 */
export class CoreSpiritPythonMlModelHost implements CoreSpiritModelHost {
  readonly backend = 'host' as const;

  constructor(
    private readonly strictManifest: CoreSpiritStrictModelManifest,
    private readonly adapter: CoreSpiritPythonMlServiceAdapter,
  ) {}

  async execute(
    manifest: CoreSpiritModelManifest,
    request: CoreSpiritModelExecutionRequest,
  ): Promise<CoreSpiritModelExecutionResult> {
    if (
      manifest.backend !== this.backend ||
      manifest.modelId !== this.strictManifest.modelId ||
      manifest.version !== this.strictManifest.version
    ) {
      throw new Error('CoreSpirit Python ML host received an incompatible transport manifest.');
    }
    const context = { ...request.context };
    const strictRequest: CoreSpiritStrictModelRequest = {
      requestId: coreSpiritChecksum({
        modelId: manifest.modelId,
        version: manifest.version,
        context,
        features: request.inputs,
        stateToken: request.stateToken ?? null,
      }),
      modelId: manifest.modelId,
      version: manifest.version,
      context,
      features: request.inputs,
      marketState: {
        timestamp: context.timestamp,
        instrument: { instrumentId: context.symbol, symbol: context.symbol },
        timeframe: context.timeframe,
      },
      ...(request.stateToken ? { stateToken: request.stateToken } : {}),
    };
    const result = await this.adapter.execute(this.strictManifest, strictRequest);
    if (result.confidence === undefined) {
      throw new Error('CoreSpirit Python ML output is missing its required confidence tensor.');
    }
    return {
      outputs: {
        prediction: result.prediction,
        confidence: tensor('f64', [], [result.confidence]),
      },
      outputChecksum: result.outputChecksum,
      stateChecksum: result.stateChecksum,
      ...(result.nextStateToken ? { nextStateToken: result.nextStateToken } : {}),
    };
  }
}

/** Register Python inference in the existing CoreSpirit ModelRuntime registry. */
export function registerCoreSpiritPythonMlRuntimeModel(
  registry: CoreSpiritModelRegistry,
  spec: CoreSpiritPythonMlModelSpec,
  config: CoreSpiritPythonMlServiceConfig,
): CoreSpiritModelManifest {
  const strictManifest = createCoreSpiritPythonMlManifest(spec);
  const transportManifest = coreSpiritStrictManifestToTransportManifest(strictManifest);
  registry.register({
    manifest: transportManifest,
    host: new CoreSpiritPythonMlModelHost(strictManifest, new CoreSpiritPythonMlServiceAdapter(config)),
  });
  return transportManifest;
}

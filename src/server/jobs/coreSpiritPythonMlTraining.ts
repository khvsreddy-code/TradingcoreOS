import type { ResearchFeatureRow } from '../../services/coreSpirit/researchValidation.js';

export const CORE_SPIRIT_PYTHON_XGB_MODEL_ID = 'xgb-direction';
export const CORE_SPIRIT_PYTHON_XGB_FEATURES = Object.freeze(['open', 'high', 'low', 'close', 'volume'] as const);

export type CoreSpiritPythonXgbTrainingInput = Readonly<{
  symbol: string;
  timeframe: string;
  horizon: number;
  modelVersion: string;
  datasetVersion: string;
  featureNames: readonly string[];
  rows: readonly ResearchFeatureRow[];
}>;

export type CoreSpiritPythonXgbTrainingResult = Readonly<{
  model_id: string;
  model_version: string;
  artifact_hash: string;
  dataset_hash: string;
  corespirit_dataset_version: string;
  release_status: 'candidate';
  calibration_status: 'not_calibrated';
  metrics: Readonly<Record<string, number>>;
  training_rows: number;
  validation_rows: number;
  test_rows: number;
  idempotent_reuse?: boolean;
}>;

function validSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function safeError(raw: string): string {
  try {
    const payload = JSON.parse(raw);
    const detail = payload?.detail;
    if (typeof detail === 'string') return detail.slice(0, 300);
    if (detail && typeof detail === 'object' && typeof detail.message === 'string') return detail.message.slice(0, 300);
    if (typeof payload?.error === 'string') return payload.error.slice(0, 300);
  } catch {
    // Do not leak an unbounded upstream body into job diagnostics.
  }
  return raw.slice(0, 300) || 'Python ML service returned an empty error response.';
}

function serviceEndpoint(): { url: string; secret: string } {
  const baseUrl = String(process.env.ML_SERVICE_URL || '').trim().replace(/\/+$/, '');
  const secret = String(process.env.ML_SERVICE_SECRET || '').trim();
  if (secret.length < 32) throw new Error('CoreSpirit XGBoost training requires ML_SERVICE_SECRET with at least 32 characters.');
  let parsed: URL;
  try { parsed = new URL(baseUrl); }
  catch { throw new Error('CoreSpirit XGBoost training requires an absolute ML_SERVICE_URL.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
    throw new Error('ML_SERVICE_URL must use HTTPS outside localhost development.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('ML_SERVICE_URL must not embed credentials, a query string or a fragment.');
  }
  return { url: baseUrl + '/corespirit/train', secret };
}

export async function trainCoreSpiritPythonXgboost(
  input: CoreSpiritPythonXgbTrainingInput,
): Promise<CoreSpiritPythonXgbTrainingResult> {
  const symbol = String(input.symbol || '').trim();
  const timeframe = String(input.timeframe || '').trim();
  if (!symbol || symbol.length > 128 || !timeframe || timeframe.length > 32) {
    throw new Error('CoreSpirit XGBoost requires a valid symbol and timeframe.');
  }
  if (!Number.isSafeInteger(input.horizon) || input.horizon < 1 || input.horizon > 100) {
    throw new Error('CoreSpirit XGBoost forecast horizon must be an integer from 1 to 100.');
  }
  if (!validSha256(input.modelVersion) || !validSha256(input.datasetVersion)) {
    throw new Error('CoreSpirit XGBoost model and dataset identities must be SHA-256 hashes.');
  }
  if (input.featureNames.length !== CORE_SPIRIT_PYTHON_XGB_FEATURES.length ||
      input.featureNames.some((name, index) => name !== CORE_SPIRIT_PYTHON_XGB_FEATURES[index])) {
    throw new Error('CoreSpirit Python XGBoost requires the canonical ordered OHLCV feature schema.');
  }
  if (input.rows.length < 240 || input.rows.length > 5_000) {
    throw new Error('CoreSpirit Python XGBoost training requires 240–5000 confirmed OHLCV rows.');
  }

  const candles = input.rows.map((row, index) => {
    if (row.confirmed !== true || row.availableAt > row.timestamp) {
      throw new Error('CoreSpirit XGBoost row ' + index + ' is not confirmed and available at its decision time.');
    }
    if (row.values.length !== 5 || row.values.some(value => !Number.isFinite(value))) {
      throw new Error('CoreSpirit XGBoost row ' + index + ' must contain five finite OHLCV values.');
    }
    const [open, high, low, close, volume] = row.values;
    if (open! <= 0 || high! <= 0 || low! <= 0 || close! <= 0 || volume! < 0 ||
        high! < Math.max(open!, close!, low!) || low! > Math.min(open!, close!, high!)) {
      throw new Error('CoreSpirit XGBoost row ' + index + ' contains invalid OHLCV values.');
    }
    return {
      timestamp: new Date(row.timestamp).toISOString(),
      availableAt: new Date(row.availableAt).toISOString(),
      open, high, low, close, volume,
      phase: 'historical',
      confirmed: true,
    };
  });

  const { url, secret } = serviceEndpoint();
  const body = JSON.stringify({
    symbol,
    timeframe,
    horizon: input.horizon,
    model_id: CORE_SPIRIT_PYTHON_XGB_MODEL_ID,
    model_version: input.modelVersion,
    dataset_version: input.datasetVersion,
    feature_names: [...input.featureNames],
    candles,
  });
  if (Buffer.byteLength(body, 'utf8') > 4 * 1024 * 1024) {
    throw new Error('CoreSpirit XGBoost training request exceeds the 4 MiB bounded payload.');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TradingCore-ML-Secret': secret,
        Accept: 'application/json',
      },
      body,
      signal: AbortSignal.timeout(180_000),
    });
  } catch (error) {
    throw new Error('CoreSpirit Python ML training request failed: ' + (error instanceof Error ? error.message : 'upstream request error'));
  }

  const responseText = await response.text();
  if (Buffer.byteLength(responseText, 'utf8') > 512 * 1024) {
    throw new Error('CoreSpirit Python ML training response exceeded the 512 KiB limit.');
  }
  if (!response.ok) {
    throw new Error('CoreSpirit Python ML trainer rejected the dataset: ' + safeError(responseText));
  }

  let result: unknown;
  try { result = JSON.parse(responseText); }
  catch { throw new Error('CoreSpirit Python ML trainer returned invalid JSON.'); }
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('CoreSpirit Python ML trainer returned an invalid result envelope.');
  }
  const value = result as Record<string, unknown>;
  if (value.model_id !== CORE_SPIRIT_PYTHON_XGB_MODEL_ID ||
      value.model_version !== input.modelVersion ||
      value.corespirit_dataset_version !== input.datasetVersion ||
      value.release_status !== 'candidate' ||
      value.calibration_status !== 'not_calibrated' ||
      !validSha256(value.artifact_hash) ||
      !validSha256(value.dataset_hash) ||
      !value.metrics || typeof value.metrics !== 'object' || Array.isArray(value.metrics)) {
    throw new Error('CoreSpirit Python ML trainer returned a result that does not match the requested immutable model identity.');
  }
  const metrics: Record<string, number> = {};
  for (const [name, metric] of Object.entries(value.metrics as Record<string, unknown>)) {
    if (typeof metric === 'number' && Number.isFinite(metric)) metrics[name] = metric;
  }
  if (!Number.isSafeInteger(value.training_rows) || !Number.isSafeInteger(value.validation_rows) ||
      !Number.isSafeInteger(value.test_rows) || Number(value.training_rows) < 12 ||
      Number(value.validation_rows) < 12 || Number(value.test_rows) < 12) {
    throw new Error('CoreSpirit Python ML trainer returned invalid chronological train/validation/test counts.');
  }
  if (metrics.sample_count !== Number(value.test_rows) ||
      !['accuracy', 'precision', 'recall', 'brier_score'].every(name => Number.isFinite(metrics[name]))) {
    throw new Error('CoreSpirit XGBoost trainer did not return complete held-out test metrics.');
  }

  return {
    model_id: CORE_SPIRIT_PYTHON_XGB_MODEL_ID,
    model_version: input.modelVersion,
    artifact_hash: value.artifact_hash,
    dataset_hash: value.dataset_hash,
    corespirit_dataset_version: input.datasetVersion,
    release_status: 'candidate',
    calibration_status: 'not_calibrated',
    metrics,
    training_rows: Number(value.training_rows),
    validation_rows: Number(value.validation_rows),
    test_rows: Number(value.test_rows),
    ...(value.idempotent_reuse === true ? { idempotent_reuse: true } : {}),
  };
}

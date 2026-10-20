import { API_LATENCY_BUDGET_MS, timeoutSignal } from '../latency/budgets.js';

export const MAX_PRODUCTION_PREDICTION_CANDLES = 5_000;
const DEFAULT_MODELS = ['xgb-direction', 'lstm-sequence'];

export const ALLOWED_PRODUCTION_MODELS = new Set([
  'xgb-direction','rf-direction','logistic-direction','gb-volatility','xgb-breakout','momentum-regime','mean-reversion',
  'trend-strength','range-breakout','volatility-regime','price-action','options-flow','ensemble-voting','tft-multihorizon',
  'nbeats-trend','patchtst-pattern','lstm-sequence','tcn-momentum','lightgbm-regime','catboost-direction','hmm-regime',
  'timemixer-multiscale','conformal-range','arima-direction','sarima-seasonal','ets-trend','prophet-trend','svr-direction',
  'knn-pattern','bilstm-sequence','cnn-lstm-hybrid','lstm-gru-hybrid','transformer-attention','sentiment-hybrid',
  'garch-volatility','quantile-forest-range','production-xgboost-direction','production-lstm-sequence','production-transformer',
]);

export type ProductionPredictionInput = {
  symbol: string;
  timeframe: string;
  candles: Array<Record<string, unknown>>;
  models: string[];
  horizon: number;
};

function parseCandleRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  // Bound before normalizing so untrusted input cannot drive an unbounded validation pass.
  const rows = value.slice(-MAX_PRODUCTION_PREDICTION_CANDLES);
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  return rows.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Prediction candle ' + index + ' must be an OHLCV object.');
    }
    const row = raw as Record<string, unknown>;
    const timestamp = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : Number(row.timestamp);
    const timeMs = Number.isFinite(timestamp) ? (timestamp > 1e12 ? timestamp : timestamp * 1000) : NaN;
    const values = ['open', 'high', 'low', 'close'].map(key => Number(row[key]));
    const volume = row.volume === undefined ? 0 : Number(row.volume);
    if (!Number.isFinite(timeMs) || timeMs <= 0 || timeMs <= previousTimestamp ||
        values.some(price => !Number.isFinite(price) || price <= 0) ||
        values[1]! < Math.max(values[0]!, values[3]!, values[2]!) ||
        values[2]! > Math.min(values[0]!, values[3]!, values[1]!) ||
        !Number.isFinite(volume) || volume < 0) {
      throw new Error('Prediction candles must have strictly chronological timestamps and valid finite OHLCV values.');
    }
    previousTimestamp = timeMs;
    const candle: Record<string, unknown> = {
      timestamp: new Date(timeMs).toISOString(),
      open: values[0], high: values[1], low: values[2], close: values[3], volume,
    };
    // Preserve temporal lineage if the data provider supplied it. Do not claim unknown
    // provenance is confirmed; Python inference echoes the same status in its response.
    if (typeof row.source === 'string') candle.source = row.source;
    if (typeof row.phase === 'string') candle.phase = row.phase;
    if (typeof row.confirmed === 'boolean') candle.confirmed = row.confirmed;
    if (typeof row.availableAt === 'string' || typeof row.availableAt === 'number') candle.availableAt = row.availableAt;
    if (typeof row.revision === 'number' && Number.isSafeInteger(row.revision) && row.revision >= 0) candle.revision = row.revision;
    return candle;
  });
}

export function parseProductionPredictionInput(body: any): ProductionPredictionInput {
  const symbol = String(body?.symbol || '').trim();
  const timeframe = String(body?.timeframe || '').trim();
  const candles = parseCandleRows(body?.candles);
  const requestedModels = Array.isArray(body?.models) ? body.models : DEFAULT_MODELS;
  const models = [...new Set(requestedModels.map((model: unknown) => String(model))
    .filter((model: string) => ALLOWED_PRODUCTION_MODELS.has(model)))].slice(0, 24);
  const rawHorizon = body?.horizon ?? 1;
  const horizon = Number(rawHorizon);
  if (!symbol || !timeframe || candles.length < 80) {
    throw new Error('Production prediction requires symbol, timeframe and at least 80 valid chronological candles (maximum 5000).');
  }
  if (!Number.isInteger(horizon) || horizon < 1 || horizon > 100) {
    throw new Error('Prediction horizon must be an integer from 1 to 100 bars.');
  }
  if (!models.length) throw new Error('Choose at least one supported production model.');
  return { symbol, timeframe, candles, models, horizon };
}

export async function runProductionPrediction(
  input: ProductionPredictionInput,
  timeoutMs: number = API_LATENCY_BUDGET_MS.predictionSync,
) {
  const serviceUrl = String(process.env.ML_SERVICE_URL || '').trim().replace(/\/$/, '');
  if (!serviceUrl) {
    throw new Error('Production ML service is not configured. Set ML_SERVICE_URL on the server.');
  }

  const signal = timeoutSignal(timeoutMs);
  try {
    const upstream = await fetch(serviceUrl + '/predict', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.ML_SERVICE_SECRET ? { 'X-TradingCore-ML-Secret': process.env.ML_SERVICE_SECRET } : {}),
      },
      body: JSON.stringify(input),
    });
    const text = await upstream.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { detail: text.slice(0, 300) };
    }
    if (!upstream.ok) {
      throw new Error(payload?.detail || payload?.error || 'Production ML service rejected the request (' + upstream.status + ').');
    }
    return payload;
  } catch (error: any) {
    if (error?.name === 'AbortError' || signal.aborted) {
      throw new Error('Production ML service timed out after ' + timeoutMs + 'ms.');
    }
    throw error;
  }
}

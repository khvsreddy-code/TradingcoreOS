import { API_LATENCY_BUDGET_MS, timeoutSignal } from '../latency/budgets.js';

const MAX_CANDLES = 180;
const DEFAULT_MODELS = ['xgboost', 'lstm'];

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
  candles: unknown[];
  models: string[];
};

export function parseProductionPredictionInput(body: any): ProductionPredictionInput {
  const symbol = String(body?.symbol || '').trim();
  const timeframe = String(body?.timeframe || '').trim();
  const candles = Array.isArray(body?.candles) ? body.candles.slice(-MAX_CANDLES) : [];
  const models = Array.isArray(body?.models)
    ? body.models.filter((x: unknown) => ALLOWED_PRODUCTION_MODELS.has(String(x))).slice(0, 24)
    : DEFAULT_MODELS;
  if (!symbol || !timeframe || candles.length < 80) {
    throw new Error('Production prediction requires symbol, timeframe and at least 80 candles.');
  }
  return { symbol, timeframe, candles, models };
}

export async function runProductionPrediction(
  input: ProductionPredictionInput,
  timeoutMs = API_LATENCY_BUDGET_MS.predictionSync,
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
      body: JSON.stringify({ ...input, horizon: 1 }),
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

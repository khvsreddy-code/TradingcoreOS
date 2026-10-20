import { tradingApi, readTradingApiJson } from './http/tradingApi';
import type { HistoricalCandle } from './brokers/BrokerAdapter';

export interface ProductionPrediction {
  model_version?: string;
  algorithm: string;
  direction: 'BULLISH'|'BEARISH'|'NEUTRAL';
  bullish_probability: number;
  neutral_probability: number;
  bearish_probability: number;
  confidence: number;
  /** Null when the artifact only predicts direction or volatility, not price/return. */
  predicted_price: number | null;
  lower_bound: number | null;
  upper_bound: number | null;
  expected_move: number | null;
  expected_return?: number | null;
  latest_price: number;
  feature_schema?: string[];
  feature_schema_version?: string;
  feature_schema_hash?: string;
  required_lookback_bars?: number;
  forecast_horizon_bars?: number;
  confidence_semantics?: string;
  probability_semantics?: string;
  probability_calibration?: 'calibrated' | 'validated' | 'not_calibrated' | string;
  release_status?: 'candidate' | 'approved' | 'revoked' | 'retired' | string;
  return_estimate_kind?: string;
  temporal_provenance?: { latest_bar_phase?: string; latest_bar_confirmed?: boolean | null; latest_bar_available_at?: string | number | null; training_requires_confirmed_bars?: boolean };
  execution_gate?: { entry_allowed: boolean|null; live_execution_eligible?: boolean; release_status?: string; calibration_status?: string; block_reason?: string; meta_probability: number|null; threshold: number|null; status?: string; ofi_z?: number|null; gex?: number|null; pcr?: number|null; india_vix?: number|null; cboe_vix?: number|null; checks_available?: number };
}

export type ProductionPredictionHistoryOptions = {
  /** Fetch history through the authoritative FYERS-three-sessions + TV-older-history service. */
  useCanonicalHistory?: boolean;
  historyLimit?: number;
};

export type ProductionPredictionHistorySummary = {
  symbol: string;
  timeframe: string;
  sourcePolicy: string;
  returned: number;
  oldestTimestamp: string | null;
  newestTimestamp: string | null;
  sourceStatus: Record<string, unknown>;
  degraded: boolean;
  stale: boolean;
};

function normalizedRequestModels(models: string[]): string[] {
  return models.map(id => id === 'production-xgboost-direction' ? 'production-xgboost-direction' : id === 'production-lstm-sequence' ? 'production-lstm-sequence' : id === 'production-transformer' ? 'production-transformer' : id)
    .filter((id, i, all) => all.indexOf(id) === i).slice(0, 39);
}

async function postProductionPrediction(body: Record<string, unknown>) {
  const response = await tradingApi('/api/predictions/production', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const payload = await readTradingApiJson<any>(response);
  if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Production ML service unavailable');
  return payload;
}

/** Prediction call preserving the supplied dataset (required for replay and historical simulations). */
export async function fetchProductionPredictions(
  candles: HistoricalCandle[],
  symbol: string,
  timeframe: string,
  models: string[],
  options: ProductionPredictionHistoryOptions = {},
) {
  const body: Record<string, unknown> = {
    symbol,
    timeframe,
    models: normalizedRequestModels(models),
    horizon: 1,
  };
  if (options.useCanonicalHistory) {
    body.useCanonicalHistory = true;
    body.historyLimit = Math.max(80, Math.min(5000, Math.floor(Number(options.historyLimit) || 5000)));
  } else {
    body.candles = candles.slice(-5000).map(c => ({
      timestamp: c.timestamp,
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
      volume: Number(c.volume || 0),
      ...(c.source ? { source: c.source } : {}),
      ...(c.phase ? { phase: c.phase } : {}),
      ...(typeof c.confirmed === 'boolean' ? { confirmed: c.confirmed } : {}),
      ...(c.availableAt !== undefined ? { availableAt: c.availableAt } : {}),
      ...(typeof c.revision === 'number' ? { revision: c.revision } : {}),
    }));
  }
  const payload = await postProductionPrediction(body);
  return payload.models as Record<string, ProductionPrediction>;
}

/** Use server-owned canonical history without serializing candles from the chart component. */
export async function fetchProductionPredictionsFromCanonicalHistory(
  symbol: string,
  timeframe: string,
  models: string[],
  historyLimit = 5000,
): Promise<{ models: Record<string, ProductionPrediction>; history?: ProductionPredictionHistorySummary }> {
  const payload = await postProductionPrediction({
    symbol,
    timeframe,
    models: normalizedRequestModels(models),
    horizon: 1,
    useCanonicalHistory: true,
    historyLimit: Math.max(80, Math.min(5000, Math.floor(Number(historyLimit) || 5000))),
  });
  return {
    models: payload.models as Record<string, ProductionPrediction>,
    ...(payload.history ? { history: payload.history as ProductionPredictionHistorySummary } : {}),
  };
}

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
  predicted_price: number;
  lower_bound: number;
  upper_bound: number;
  expected_move: number;
  latest_price: number;
  feature_schema?: string[];
  execution_gate?: { entry_allowed: boolean|null; meta_probability: number|null; threshold: number|null; status?: string; ofi_z?: number|null; gex?: number|null; pcr?: number|null; india_vix?: number|null; cboe_vix?: number|null; checks_available?: number };
}

export async function fetchProductionPredictions(candles: HistoricalCandle[], symbol: string, timeframe: string, models: string[]) {
  const requestModels = models.map(id => id === 'production-xgboost-direction' ? 'production-xgboost-direction' : id === 'production-lstm-sequence' ? 'production-lstm-sequence' : id === 'production-transformer' ? 'production-transformer' : id).filter((id, i, all) => all.indexOf(id) === i).slice(0, 39);
  const response = await tradingApi('/api/predictions/production', {
    method: 'POST',
    body: JSON.stringify({
      symbol,
      timeframe,
      models: requestModels,
      candles: candles.slice(-180).map(c => ({
        timestamp: c.timestamp,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume || 0),
      })),
    }),
  });
  const payload = await readTradingApiJson<any>(response);
  if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Production ML service unavailable');
  return payload.models as Record<string, ProductionPrediction>;
}

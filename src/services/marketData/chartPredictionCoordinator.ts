import type { HistoricalCandle } from '../brokers/BrokerAdapter';
import { fetchProductionPredictions, type ProductionPrediction } from '../productionPredictionService';

type ProductionPredictionSet = Record<string, ProductionPrediction>;

const MAX_CACHE_ENTRIES = 48;
const remoteCache = new Map<string, { value: ProductionPredictionSet | null; expiresAt: number }>();
const NEGATIVE_CACHE_MS = 5_000;
const remoteInflight = new Map<string, Promise<ProductionPredictionSet | null>>();

function remember<T>(cache: Map<string, T>, key: string, value: T): T {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest == null) break;
    cache.delete(oldest);
  }
  return value;
}

function predictionKey(datasetKey: string, revision: number, models: string[]): string {
  const normalizedModels = [...new Set(models.map(String).filter(Boolean))].slice(0, 24).sort();
  return `${datasetKey}|${revision}|${normalizedModels.join(',')}`;
}

/**
 * Dataset-scoped production inference cache.
 *
 * Multiple chart views of the same broker/symbol/timeframe share one actual
 * Python ML service response. There is deliberately no local heuristic path:
 * an unavailable trained artifact must remain unavailable in every chart.
 */
export class ChartPredictionCoordinator {
  async runProduction(
    datasetKey: string,
    revision: number,
    candles: HistoricalCandle[],
    symbol: string,
    timeframe: string,
    modelIds: string[],
  ): Promise<ProductionPredictionSet | null> {
    const key = predictionKey(datasetKey, revision, modelIds);
    const cached = remoteCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) remoteCache.delete(key);
    const inflight = remoteInflight.get(key);
    if (inflight) return inflight;

    const promise = fetchProductionPredictions(candles, symbol, timeframe, modelIds)
      .then(value => {
        const normalized = value || {};
        remember(remoteCache, key, { value: normalized, expiresAt: Date.now() + 60_000 });
        return normalized;
      })
      .catch(() => {
        remember(remoteCache, key, { value: null, expiresAt: Date.now() + NEGATIVE_CACHE_MS });
        return null;
      })
      .finally(() => remoteInflight.delete(key));
    remoteInflight.set(key, promise);
    return promise;
  }

  clear(): void {
    remoteCache.clear();
    remoteInflight.clear();
  }
}

export const chartPredictionCoordinator = new ChartPredictionCoordinator();

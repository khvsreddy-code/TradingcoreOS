import type { HistoricalCandle } from '../brokers/BrokerAdapter';
import { predictWithModel } from '../predictionEngine';
import { fetchProductionPredictions, type ProductionPrediction } from '../productionPredictionService';

type LocalPrediction = Record<string, any>;
type ProductionPredictionSet = Record<string, ProductionPrediction>;

const MAX_CACHE_ENTRIES = 48;
const localCache = new Map<string, LocalPrediction>();
const remoteCache = new Map<string, { value: ProductionPredictionSet | null; expiresAt: number }>();
const NEGATIVE_CACHE_MS = 5_000;
const localInflight = new Map<string, Promise<LocalPrediction>>();
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
  const normalizedModels = [...new Set(models.map(String).filter(Boolean))].slice(0, 39).sort();
  return `${datasetKey}|${revision}|${normalizedModels.join(',')}`;
}

/**
 * Dataset-scoped prediction compute/cache.
 *
 * Multiple chart views of the same broker/symbol/timeframe borrow the same
 * prediction result. Each chart still owns its own Vela NativeRenderer series
 * because the visual projection remains chart-local.
 */
export class ChartPredictionCoordinator {
  async runLocal(
    datasetKey: string,
    revision: number,
    candles: HistoricalCandle[],
    symbol: string,
    timeframe: string,
    modelIds: string[],
    localId: (id: string) => string,
  ): Promise<LocalPrediction> {
    const key = predictionKey(datasetKey, revision, modelIds);
    const cached = localCache.get(key);
    if (cached) return cached;
    const inflight = localInflight.get(key);
    if (inflight) return inflight;
    const promise = Promise.resolve().then(() => {
      const result: LocalPrediction = {};
      for (const id of [...new Set(modelIds)].slice(0, 39)) {
        try {
          const value = predictWithModel(candles, symbol, timeframe, localId(id));
          if (value) result[id] = value;
        } catch {
          // One model must not suppress the remaining fallback projections.
        }
      }
      return remember(localCache, key, result);
    }).finally(() => localInflight.delete(key));
    localInflight.set(key, promise);
    return promise;
  }

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
        remoteCache.set(key, { value: normalized, expiresAt: Date.now() + 60_000 });
        return normalized;
      })
      .catch(() => {
        remoteCache.set(key, { value: null, expiresAt: Date.now() + NEGATIVE_CACHE_MS });
        return null;
      })
      .finally(() => remoteInflight.delete(key));
    remoteInflight.set(key, promise);
    return promise;
  }

  clear(): void {
    localCache.clear();
    remoteCache.clear();
    localInflight.clear();
    remoteInflight.clear();
  }
}

export const chartPredictionCoordinator = new ChartPredictionCoordinator();

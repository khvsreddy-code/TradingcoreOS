import type { HistoricalCandle } from '../../../brokers/BrokerAdapter';
import { PREDICTION_MODELS } from '../../../predictionEngine';
import { chartPredictionCoordinator } from '../../../marketData/chartPredictionCoordinator';
import type { IChartApi } from '../velaNativeChartKernel';

type Ref<T> = { current: T };

export type ChartPredictionControllerDeps = {
  chart: Ref<IChartApi | null>;
  candles: Ref<HistoricalCandle[]>;
  predictionLines: Ref<any[]>;
  predictionJob: Ref<number>;
  predictionModelIds: string[];
  chartDatasetKey: string;
  dataRevisionRef: Ref<number>;
  resolvedInstrumentKey: string;
  timeframe: string;
};

const MODEL_COLORS = [
  '#38bdf8', '#a78bfa', '#f59e0b', '#3b82f6', '#ef4444',
  '#ec4899', '#06b6d4', '#e879f9', '#fb7185', '#c084fc',
];

const PRICE_FORECAST_KINDS = new Set([
  'trained_return_regressor',
  'trained_quantile_return_model',
  'trained_conformal_return_model',
  'trained_price_forecast',
]);
const INTERVAL_FORECAST_KINDS = new Set([
  'trained_quantile_return_model',
  'trained_conformal_return_model',
  'volatility_interval_only',
]);

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function removePredictionLevels(chart: IChartApi | null, handles: any[]): void {
  if (!chart) {
    handles.length = 0;
    return;
  }
  for (const handle of handles) {
    try {
      if (handle && typeof handle.remove === 'function') handle.remove();
      else if (handle) chart.removeSeries(handle);
    } catch {
      // A chart may already have disposed its native handles during a symbol switch.
    }
  }
  handles.length = 0;
}

/**
 * Shows only model outputs returned by a trained Python artifact.
 *
 * A single-horizon price estimate is a target level, not a future price path.
 * It is therefore rendered as a labelled horizontal Vela price level. Range
 * boundaries are displayed only when the model returned distinct bounds and
 * declared a quantile, conformal, or volatility-interval output.
 */
export function createChartPredictionController(deps: ChartPredictionControllerDeps) {
  const { chart, predictionLines, predictionJob, dataRevisionRef } = deps;
  let predictionModelIds = deps.predictionModelIds;
  let chartDatasetKey = deps.chartDatasetKey;
  let resolvedInstrumentKey = deps.resolvedInstrumentKey;
  let timeframe = deps.timeframe;

  const renderPredictionOverlay = async (data: HistoricalCandle[]) => {
    if (!chart.current) return;
    const job = ++predictionJob.current;
    removePredictionLevels(chart.current, predictionLines.current);

    // The deployed ML endpoint requires at least 80 validated bars. Do not
    // create a proxy or synthetic estimate while that history is unavailable.
    if (data.length < 80 || predictionModelIds.length === 0) return;

    const ids = [...new Set(predictionModelIds)].slice(0, 24);
    const production = await chartPredictionCoordinator.runProduction(
      chartDatasetKey,
      dataRevisionRef.current,
      data,
      resolvedInstrumentKey,
      timeframe,
      ids,
    );
    if (!chart.current || job !== predictionJob.current || !production) return;

    for (const [index, id] of ids.entries()) {
      const model = PREDICTION_MODELS.find(item => item.id === id);
      if (!model) continue;

      const source: any =
        production[id] ??
        (id === 'production-xgboost-direction' ? production.xgboost : undefined) ??
        (id === 'production-lstm-sequence' ? production.lstm : undefined) ??
        (id === 'production-transformer' ? production.transformer : undefined);

      // A model name in the catalogue is not evidence of a trained artifact.
      // Require the Python inference service's explicit trained/version fields.
      if (!source || source.trained !== true || source.status === 'unavailable') continue;
      const version = typeof source.model_version === 'string' ? source.model_version.trim() : '';
      if (!version) continue;

      const horizon = Number.isInteger(source.forecast_horizon_bars) && source.forecast_horizon_bars > 0
        ? source.forecast_horizon_bars
        : 1;
      const release = String(source.release_status || 'candidate').toLowerCase();
      const releaseLabel = release === 'approved' || release === 'production' ? 'approved' : 'research candidate';
      const color = MODEL_COLORS[index % MODEL_COLORS.length];
      const returnKind = String(source.return_estimate_kind || '');
      const predictedPrice = finiteNumber(source.predicted_price);
      const isRealPriceForecast = PRICE_FORECAST_KINDS.has(returnKind);

      if (predictedPrice !== null && isRealPriceForecast) {
        const title = `${model.name} · +${horizon} bars · ${releaseLabel}`;
        const handle = chart.current.createPriceLine({
          price: predictedPrice,
          color,
          lineWidth: 2,
          lineStyle: 1,
          axisLabelVisible: true,
          lastValueVisible: false,
          title,
        });
        predictionLines.current.push(handle);
      }

      // Never invent a confidence band around a point estimate. Only plot
      // returned, distinct bounds from a model family that produces intervals.
      if (INTERVAL_FORECAST_KINDS.has(returnKind)) {
        const lower = finiteNumber(source.lower_bound);
        const upper = finiteNumber(source.upper_bound);
        if (lower !== null && upper !== null && upper > lower) {
          predictionLines.current.push(chart.current.createPriceLine({
            price: lower,
            color: color + '88',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            lastValueVisible: false,
            title: `${model.name} lower · +${horizon} bars`,
          }));
          predictionLines.current.push(chart.current.createPriceLine({
            price: upper,
            color: color + '88',
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            lastValueVisible: false,
            title: `${model.name} upper · +${horizon} bars`,
          }));
        }
      }
    }
  };

  return {
    setInputs(next: {
      predictionModelIds: string[];
      chartDatasetKey: string;
      resolvedInstrumentKey: string;
      timeframe: string;
    }) {
      predictionModelIds = next.predictionModelIds;
      chartDatasetKey = next.chartDatasetKey;
      resolvedInstrumentKey = next.resolvedInstrumentKey;
      timeframe = next.timeframe;
    },
    renderPredictionOverlay,
    cancel() {
      predictionJob.current += 1;
      removePredictionLevels(chart.current, predictionLines.current);
    },
  };
}

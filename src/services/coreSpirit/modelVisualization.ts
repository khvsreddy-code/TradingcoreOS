/**
 * Model explanation surfaces — v56 / principle #18.
 *
 * Converts structured model output into existing renderer-neutral declarative
 * visuals. This never makes a trading decision; it exposes model state so the
 * chart/IDE/replay hosts can inspect it.
 */
import type { CoreSpiritAiStructuredPrediction } from './aiModel';
import type { CoreSpiritDeclarativeVisualSpec } from './declarativeVisual';

export interface CoreSpiritModelExplanationContext {
  modelId: string;
  version: string;
  timestamp: number;
  sourceId: string;
  requestChecksum?: string;
  instrument?: string;
  timeframe?: string;
  priceCenter?: number;
}

export interface CoreSpiritModelExplanationSurface {
  visuals: readonly CoreSpiritDeclarativeVisualSpec[];
  title: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

function probabilityPair(prediction: CoreSpiritAiStructuredPrediction): { lower: number; upper: number } {
  const probs = prediction.probabilities;
  if (prediction.direction === 'SHORT') return { lower: probs?.SHORT ?? prediction.probability, upper: probs?.LONG ?? 1 - prediction.probability };
  if (prediction.direction === 'FLAT') return { lower: probs?.FLAT ?? prediction.probability, upper: 1 - prediction.probability };
  return { lower: probs?.SHORT ?? 1 - prediction.probability, upper: probs?.LONG ?? prediction.probability };
}

export function buildCoreSpiritModelExplanationSurface(
  prediction: CoreSpiritAiStructuredPrediction,
  context: CoreSpiritModelExplanationContext,
): CoreSpiritModelExplanationSurface {
  const pair = probabilityPair(prediction);
  const metadata = Object.freeze({
    modelId: context.modelId,
    version: context.version,
    direction: prediction.direction,
    probability: prediction.probability,
    confidence: prediction.confidence,
    regime: prediction.regime ?? null,
    instrument: context.instrument ?? null,
    timeframe: context.timeframe ?? null,
    requestChecksum: context.requestChecksum ?? null,
  });
  const base = `${context.sourceId}:${context.modelId}@${context.version}:${context.timestamp}`;
  const visuals: CoreSpiritDeclarativeVisualSpec[] = [
    {
      id: `${base}:probability`,
      kind: 'probability_surface',
      pane: 'subpane',
      semanticRole: 'model_probability',
      properties: {
        timeRange: { start: context.timestamp, end: context.timestamp },
        grid: { columns: 2, rows: 1, values: [pair.lower, pair.upper], x: [0, 1], y: [0, 1], normalized: true },
        labels: ['alternative', prediction.direction],
        direction: prediction.direction,
        probability: prediction.probability,
      },
      metadata,
      interaction: { onHover: { kind: 'inspect', actionId: 'model.inspect', params: { modelId: context.modelId, timestamp: context.timestamp } } },
    },
    {
      id: `${base}:model-field`,
      kind: 'model_field',
      pane: 'floating',
      semanticRole: 'model_explanation',
      properties: {
        time: context.timestamp,
        price: context.priceCenter,
        direction: prediction.direction,
        probability: prediction.probability,
        confidence: prediction.confidence,
        regime: prediction.regime ?? '',
      },
      metadata,
      interaction: { onClick: { kind: 'openPanel', actionId: 'model.inspect', params: { modelId: context.modelId, timestamp: context.timestamp } } },
    },
  ];
  if (prediction.regime) {
    visuals.push({
      id: `${base}:regime`,
      kind: 'regime_band',
      pane: 'main',
      semanticRole: 'model_regime',
      properties: {
        timeRange: { start: context.timestamp, end: context.timestamp },
        regime: prediction.regime,
        confidence: prediction.confidence,
      },
      metadata,
      interaction: { onHover: { kind: 'inspect', actionId: 'model.inspect', params: { modelId: context.modelId, timestamp: context.timestamp } } },
    });
  }
  return Object.freeze({ visuals: Object.freeze(visuals), title: `${context.modelId} — ${prediction.direction}`, metadata });
}

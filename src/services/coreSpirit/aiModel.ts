/**
 * CoreSpirit AI model semantics — v56 / principles #17–18.
 *
 * AI is a model kind, not a second runtime. The existing strict external-model
 * ABI remains authoritative; this module adds a typed semantic view for
 * direction/probability/regime/confidence and a host-side model handle.
 */
import type { CoreSpiritAiOutputMapping } from './modelOrchestration';
import {
  CoreSpiritExternalModelRegistry,
  CoreSpiritModelOrchestrator,
  type CoreSpiritExternalModelCallResult,
  type CoreSpiritStrictModelManifest,
  type CoreSpiritStrictModelRequest,
} from './modelOrchestration';

export type CoreSpiritAiDirection = 'LONG' | 'SHORT' | 'FLAT' | 'UNKNOWN';

export interface CoreSpiritAiModelManifest extends CoreSpiritStrictModelManifest {
  modelKind: 'ai';
  aiOutput: CoreSpiritAiOutputMapping;
}

export interface CoreSpiritAiStructuredPrediction {
  direction: CoreSpiritAiDirection;
  probability: number;
  confidence: number;
  regime?: string;
  probabilities?: Readonly<{ LONG?: number; SHORT?: number; FLAT?: number }>;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

function finiteUnit(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}

function normalizeDirection(value: unknown): CoreSpiritAiDirection {
  const direction = String(value ?? '').toUpperCase();
  return direction === 'LONG' || direction === 'SHORT' || direction === 'FLAT' ? direction : 'UNKNOWN';
}

export function validateCoreSpiritAiManifest(manifest: CoreSpiritStrictModelManifest): asserts manifest is CoreSpiritAiModelManifest {
  if (manifest.modelKind !== 'ai') throw new Error(`model '${manifest.modelId}@${manifest.version}' is not declared as an AI model`);
  if (!manifest.aiOutput) throw new Error(`AI model '${manifest.modelId}@${manifest.version}' must declare aiOutput mapping`);
  if (!manifest.aiOutput.directionMetadataKey.trim()) throw new Error('AI directionMetadataKey is required');
}

export function aiPredictionFromResult(
  manifest: CoreSpiritStrictModelManifest,
  result: Pick<CoreSpiritExternalModelCallResult, 'prediction' | 'confidence' | 'metadata'>,
): CoreSpiritAiStructuredPrediction {
  validateCoreSpiritAiManifest(manifest);
  const mapping = manifest.aiOutput!;
  const direction = normalizeDirection(result.metadata[mapping.directionMetadataKey]);
  if (direction === 'UNKNOWN') throw new Error(`AI model '${manifest.modelId}@${manifest.version}' returned an invalid direction`);
  const probability = finiteUnit(result.prediction.data[0], 0);
  const confidence = finiteUnit(result.confidence, 0);
  if (!Number.isFinite(probability) || !Number.isFinite(confidence)) throw new Error('AI probability/confidence must be finite');
  const probabilities = {
    ...(mapping.longProbabilityMetadataKey ? { LONG: finiteUnit(result.metadata[mapping.longProbabilityMetadataKey]) } : {}),
    ...(mapping.shortProbabilityMetadataKey ? { SHORT: finiteUnit(result.metadata[mapping.shortProbabilityMetadataKey]) } : {}),
    ...(mapping.flatProbabilityMetadataKey ? { FLAT: finiteUnit(result.metadata[mapping.flatProbabilityMetadataKey]) } : {}),
  };
  return Object.freeze({
    direction,
    probability,
    confidence,
    regime: mapping.regimeMetadataKey ? String(result.metadata[mapping.regimeMetadataKey] ?? '') || undefined : undefined,
    probabilities: Object.keys(probabilities).length ? Object.freeze(probabilities) : undefined,
    metadata: Object.freeze({ ...result.metadata }),
  });
}

export interface CoreSpiritAiModelHandle {
  readonly modelId: string;
  readonly version: string;
  readonly manifest: CoreSpiritStrictModelManifest;
  predict(request: CoreSpiritStrictModelRequest): Promise<CoreSpiritAiStructuredPrediction>;
}

export class CoreSpiritAiModelCatalog {
  constructor(
    private readonly registry: CoreSpiritExternalModelRegistry,
    private readonly orchestrator: CoreSpiritModelOrchestrator,
  ) {}

  load(modelId: string, version?: string): CoreSpiritAiModelHandle {
    const manifest = version ? this.registry.get(modelId, version).manifest : this.resolveSingleVersion(modelId);
    validateCoreSpiritAiManifest(manifest);
    return {
      modelId: manifest.modelId,
      version: manifest.version,
      manifest,
      predict: async (request: CoreSpiritStrictModelRequest) => {
        const result = await this.orchestrator.infer({ ...request, modelId: manifest.modelId, version: manifest.version });
        return aiPredictionFromResult(manifest, result);
      },
    };
  }

  private resolveSingleVersion(modelId: string): CoreSpiritStrictModelManifest {
    const matches = this.registry.list().filter(model => model.modelId === modelId);
    if (!matches.length) throw new Error(`AI model '${modelId}' is not registered`);
    if (matches.length > 1) throw new Error(`AI model '${modelId}' has multiple versions; ai.load requires an explicit version`);
    return matches[0];
  }
}

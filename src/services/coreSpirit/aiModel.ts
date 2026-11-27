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

function requireUnitInterval(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`AI model output '${field}' must be a finite number in [0,1]; invalid values are never clamped`);
  }
  return value;
}

function normalizeDirection(value: unknown): CoreSpiritAiDirection {
  const direction = String(value ?? '').trim().toUpperCase();
  if (direction === 'LONG' || direction === 'BUY' || direction === 'BULLISH') return 'LONG';
  if (direction === 'SHORT' || direction === 'SELL' || direction === 'BEARISH') return 'SHORT';
  if (direction === 'FLAT' || direction === 'NEUTRAL' || direction === 'HOLD') return 'FLAT';
  return 'UNKNOWN';
}

export function validateCoreSpiritAiManifest(manifest: CoreSpiritStrictModelManifest): asserts manifest is CoreSpiritAiModelManifest {
  if (manifest.modelKind !== 'ai') throw new Error(`model '${manifest.modelId}@${manifest.version}' is not declared as an AI model`);
  if (!manifest.aiOutput) throw new Error(`AI model '${manifest.modelId}@${manifest.version}' must declare aiOutput mapping`);
  const mapping = manifest.aiOutput;
  const keys = Object.values(mapping).filter((value): value is string => value !== undefined);
  if (!mapping.directionMetadataKey.trim() || keys.some(key => !key.trim() || !manifest.metadataFields.includes(key))) {
    throw new Error('AI output mapping must reference non-empty, declared metadata fields');
  }
  if (new Set(keys).size !== keys.length) throw new Error('AI output metadata mapping keys must be unique');
}

export function aiPredictionFromResult(
  manifest: CoreSpiritStrictModelManifest,
  result: Pick<CoreSpiritExternalModelCallResult, 'prediction' | 'confidence' | 'metadata'>,
): CoreSpiritAiStructuredPrediction {
  validateCoreSpiritAiManifest(manifest);
  const mapping = manifest.aiOutput!;
  const direction = normalizeDirection(result.metadata[mapping.directionMetadataKey]);
  if (direction === 'UNKNOWN') throw new Error(`AI model '${manifest.modelId}@${manifest.version}' returned an invalid direction`);
  if (!result.prediction || !Array.isArray(result.prediction.data) || result.prediction.data.length < 1) {
    throw new Error('AI model must return a non-empty prediction tensor');
  }
  const confidence = requireUnitInterval(result.confidence, 'confidence');
  const probabilities = {
    ...(mapping.longProbabilityMetadataKey ? { LONG: requireUnitInterval(result.metadata[mapping.longProbabilityMetadataKey], mapping.longProbabilityMetadataKey) } : {}),
    ...(mapping.shortProbabilityMetadataKey ? { SHORT: requireUnitInterval(result.metadata[mapping.shortProbabilityMetadataKey], mapping.shortProbabilityMetadataKey) } : {}),
    ...(mapping.flatProbabilityMetadataKey ? { FLAT: requireUnitInterval(result.metadata[mapping.flatProbabilityMetadataKey], mapping.flatProbabilityMetadataKey) } : {}),
  };
  const hasAnyClassProbability = Object.keys(probabilities).length > 0;
  const hasAllClassProbabilities = probabilities.LONG !== undefined && probabilities.SHORT !== undefined && probabilities.FLAT !== undefined;
  if (hasAnyClassProbability && !hasAllClassProbabilities) {
    throw new Error('AI class-probability mapping must provide LONG, SHORT and FLAT together');
  }
  if (hasAllClassProbabilities) {
    const total = probabilities.LONG! + probabilities.SHORT! + probabilities.FLAT!;
    if (Math.abs(total - 1) > 0.03) throw new Error('AI LONG/SHORT/FLAT probabilities must sum to one within 0.03');
  }
  const directionProbability = direction === 'LONG' ? probabilities.LONG
    : direction === 'SHORT' ? probabilities.SHORT
    : probabilities.FLAT;
  const probability = directionProbability ?? requireUnitInterval(result.prediction.data[0], 'prediction[0]');
  if (mapping.regimeMetadataKey && result.metadata[mapping.regimeMetadataKey] !== null &&
      result.metadata[mapping.regimeMetadataKey] !== undefined &&
      typeof result.metadata[mapping.regimeMetadataKey] !== 'string') {
    throw new Error('AI regime metadata must be a string');
  }
  return Object.freeze({
    direction,
    probability,
    confidence,
    regime: mapping.regimeMetadataKey ? String(result.metadata[mapping.regimeMetadataKey] ?? '') || undefined : undefined,
    probabilities: hasAllClassProbabilities ? Object.freeze(probabilities) : undefined,
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

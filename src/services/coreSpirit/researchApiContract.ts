/**
 * CoreSpirit Python Research API Contract — Stage 51.
 *
 * Python is a research client/runtime, not the production VM.
 * It loads artifacts, supplies datasets, asks for replay/training work and
 * reads structured results.
 */

export const CORE_SPIRIT_RESEARCH_API_VERSION = 1 as const;

export interface CoreSpiritResearchDatasetQuery {
  symbol: string;
  timeframe: string;
  start?: number;
  end?: number;
  limit?: number;
}

export interface CoreSpiritResearchDataSet {
  datasetId: string;
  symbol: string;
  timeframe: string;
  timestamps: readonly number[];
  columns: Readonly<Record<string, readonly number[]>>;
}

export interface CoreSpiritResearchReplayRequest {
  artifactChecksum: string;
  datasetId: string;
  mode: "historical" | "replay";
}

export interface CoreSpiritResearchSignal {
  time: number;
  type: string;
  symbol: string;
  price?: number;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface CoreSpiritResearchReplayResult {
  runId: string;
  artifactChecksum: string;
  datasetId: string;
  signals: readonly CoreSpiritResearchSignal[];
  outputs: Readonly<Record<string, readonly number[]>>;
  stateChecksum: string;
  outputChecksum: string;
  traceChecksum: string;
}

export interface CoreSpiritResearchTrainingRequest {
  datasetId: string;
  modelId: string;
  featureSet: readonly string[];
  target: string;
  seed: string;
  trainStart?: number;
  trainEnd?: number;
}

export interface CoreSpiritResearchTrainingResult {
  modelId: string;
  modelVersion: string;
  artifactChecksum: string;
  metrics: Readonly<Record<string, number>>;
}

export interface CoreSpiritResearchClient {
  load(artifactChecksum: string): Promise<{ artifactChecksum: string }>;
  history(query: CoreSpiritResearchDatasetQuery): Promise<CoreSpiritResearchDataSet>;
  replay(request: CoreSpiritResearchReplayRequest): Promise<CoreSpiritResearchReplayResult>;
  train(request: CoreSpiritResearchTrainingRequest): Promise<CoreSpiritResearchTrainingResult>;
}

export interface CoreSpiritResearchModelArtifact {
  modelId: string;
  modelVersion: string;
  implementation: 'python' | 'cpp' | 'rust' | 'wasm' | 'onnx' | 'remote';
  artifactChecksum: string;
  inputFeatures: readonly string[];
  predictionField: string;
  confidenceField?: string;
}

export interface CoreSpiritResearchModelInferenceRequest {
  modelId: string;
  modelVersion: string;
  artifactChecksum: string;
  symbol: string;
  timeframe: string;
  timestamp: number;
  features: Readonly<Record<string, number | readonly number[]>>;
}

export interface CoreSpiritResearchModelInferenceResult {
  modelId: string;
  modelVersion: string;
  prediction: number | readonly number[];
  confidence?: number;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
  outputChecksum: string;
}

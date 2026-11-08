/**
 * CoreSpirit Python Research API Contract — Stage 51.
 *
 * Python is a research client/runtime, not the production VM.
 * It loads artifacts, supplies datasets, asks for replay/training work and
 * reads structured results.
 */

export const CORE_SPIRIT_RESEARCH_API_VERSION = 1 as const;

import { tradingApi, readTradingApiJson } from '../http/tradingApi';

type CanonicalHistoryColumns = {
  time: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  exchangeTime?: number[];
  ingestedAt?: number[];
  availableAt?: number[];
  revision?: number[];
};

type CanonicalHistoryResponse = {
  success: boolean;
  symbol?: string;
  timeframe?: string;
  data?: CanonicalHistoryColumns;
  error?: string;
};

function boundedHistoryLimit(value: number | undefined): number {
  const requested = Number(value);
  return Number.isFinite(requested) ? Math.max(1, Math.min(5000, Math.floor(requested))) : 5000;
}

function assertAlignedColumn(name: string, values: unknown, length: number): number[] | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values) || values.length !== length) {
    throw new Error(`CoreSpirit research history returned a misaligned ${name} column.`);
  }
  return values.map(value => {
    const number = Number(value);
    return Number.isFinite(number) ? number : Number.NaN;
  });
}

/**
 * Loads chart-independent research history through the authenticated server
 * route. The route owns provider choice, user/broker credentials, source
 * validation and the FYERS + older-history policy; this client never calls
 * market-data providers or sends chart-owned candle arrays.
 */
export async function fetchCoreSpiritResearchHistory(
  query: CoreSpiritResearchDatasetQuery,
): Promise<CoreSpiritResearchDataSet> {
  const symbol = String(query?.symbol || '').trim();
  const timeframe = String(query?.timeframe || '').trim();
  if (!symbol || !timeframe) throw new Error('A symbol and timeframe are required for CoreSpirit research history.');

  const params = new URLSearchParams({
    symbol,
    timeframe,
    limit: String(boundedHistoryLimit(query.limit)),
    format: 'columns',
  });
  if (typeof query.end === 'number' && Number.isFinite(query.end) && query.end > 0) {
    params.set('before', String(query.end));
  }

  const response = await tradingApi(`/api/corespirit/research/history?${params.toString()}`);
  const payload = await readTradingApiJson<CanonicalHistoryResponse>(response);
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error || `CoreSpirit research history unavailable (${response.status}).`);
  }

  const data = payload.data;
  if (!data || !Array.isArray(data.time)) {
    throw new Error('CoreSpirit research history returned an invalid columnar dataset.');
  }
  const length = data.time.length;
  const timestamps = data.time.map(value => Number(value));
  const required = {
    open: assertAlignedColumn('open', data.open, length),
    high: assertAlignedColumn('high', data.high, length),
    low: assertAlignedColumn('low', data.low, length),
    close: assertAlignedColumn('close', data.close, length),
    volume: assertAlignedColumn('volume', data.volume, length),
  };
  if (Object.values(required).some(column => !column)) {
    throw new Error('CoreSpirit research history is missing a required OHLCV column.');
  }

  const optional = {
    exchangeTime: assertAlignedColumn('exchangeTime', data.exchangeTime, length),
    ingestedAt: assertAlignedColumn('ingestedAt', data.ingestedAt, length),
    availableAt: assertAlignedColumn('availableAt', data.availableAt, length),
    revision: assertAlignedColumn('revision', data.revision, length),
  };
  const start = typeof query.start === 'number' && Number.isFinite(query.start) && query.start > 0
    ? (query.start < 1e12 ? query.start * 1000 : query.start)
    : Number.NEGATIVE_INFINITY;
  const end = typeof query.end === 'number' && Number.isFinite(query.end) && query.end > 0
    ? (query.end < 1e12 ? query.end * 1000 : query.end)
    : Number.POSITIVE_INFINITY;

  const indexes = timestamps.map((timestamp, index) => ({ timestamp, index }))
    .filter(item => Number.isFinite(item.timestamp) && item.timestamp >= start && item.timestamp <= end);
  const project = (values: number[] | undefined) => values
    ? indexes.map(item => values[item.index])
    : undefined;
  const selectedTimestamps = indexes.map(item => item.timestamp);
  const columns: Record<string, readonly number[]> = {
    open: project(required.open)!,
    high: project(required.high)!,
    low: project(required.low)!,
    close: project(required.close)!,
    volume: project(required.volume)!,
    ...(optional.exchangeTime ? { exchangeTime: project(optional.exchangeTime)! } : {}),
    ...(optional.ingestedAt ? { ingestedAt: project(optional.ingestedAt)! } : {}),
    ...(optional.availableAt ? { availableAt: project(optional.availableAt)! } : {}),
    ...(optional.revision ? { revision: project(optional.revision)! } : {}),
  };
  const first = selectedTimestamps[0] ?? 'empty';
  const last = selectedTimestamps[selectedTimestamps.length - 1] ?? 'empty';

  return {
    datasetId: `canonical-history:${symbol}:${timeframe}:${first}:${last}:${selectedTimestamps.length}`,
    symbol: payload.symbol || symbol,
    timeframe: payload.timeframe || timeframe,
    timestamps: selectedTimestamps,
    columns,
  };
}

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

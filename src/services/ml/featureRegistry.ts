import { HistoricalCandle } from '../brokers/BrokerAdapter';

export type FeatureDomain = 'price' | 'momentum' | 'volatility' | 'volume' | 'structure' | 'options' | 'orderbook' | 'macro' | 'sentiment';
export type FeatureRequirement = 'ohlcv' | 'structure' | 'options' | 'depth' | 'macro' | 'sentiment';
export type FeatureHorizon = 'micro' | 'intraday' | 'swing' | 'multi';

export interface FeatureDefinition {
  id: string;
  name: string;
  domain: FeatureDomain;
  requirement: FeatureRequirement;
  description: string;
  horizon: FeatureHorizon;
  version: number;
}

export interface FeatureValue {
  id: string;
  value: number;
  timestamp: string;
  source: string;
  timeframe: string;
  definitionVersion: number;
  available: boolean;
}

export interface FeatureContext {
  candles: HistoricalCandle[];
  timeframe: string;
  timestamp?: string;
  source?: string;
  options?: { pcr?: number; gex?: number; dex?: number };
  depth?: { bidVolume?: number; askVolume?: number; imbalance?: number };
  macro?: Record<string, number>;
  sentiment?: number;
}

/** Canonical Stage-13 feature definitions. Do not add a model-specific duplicate registry. */
export const FEATURE_REGISTRY: readonly FeatureDefinition[] = [
  { id: 'price.return_1', name: '1-bar return', domain: 'price', requirement: 'ohlcv', description: 'Close-to-close return over one completed bar.', horizon: 'micro', version: 1 },
  { id: 'price.return_5', name: '5-bar return', domain: 'price', requirement: 'ohlcv', description: 'Close-to-close return over five bars.', horizon: 'intraday', version: 1 },
  { id: 'price.ema9_distance', name: 'EMA9 distance', domain: 'price', requirement: 'ohlcv', description: 'Current close distance from EMA9.', horizon: 'micro', version: 1 },
  { id: 'price.ema21_distance', name: 'EMA21 distance', domain: 'price', requirement: 'ohlcv', description: 'Current close distance from EMA21.', horizon: 'intraday', version: 1 },
  { id: 'momentum.rsi14', name: 'RSI14', domain: 'momentum', requirement: 'ohlcv', description: 'Wilder RSI over fourteen bars.', horizon: 'intraday', version: 1 },
  { id: 'volatility.atr14_pct', name: 'ATR14 percent', domain: 'volatility', requirement: 'ohlcv', description: 'ATR14 normalized by close.', horizon: 'intraday', version: 1 },
  { id: 'volatility.range_pct', name: 'Bar range percent', domain: 'volatility', requirement: 'ohlcv', description: 'High-low range normalized by close.', horizon: 'micro', version: 1 },
  { id: 'volume.ratio20', name: 'Volume ratio20', domain: 'volume', requirement: 'ohlcv', description: 'Current volume divided by the trailing 20-bar average.', horizon: 'micro', version: 1 },
  { id: 'structure.breakout20', name: '20-bar breakout distance', domain: 'structure', requirement: 'structure', description: 'Close distance from the prior 20-bar high/low envelope.', horizon: 'intraday', version: 1 },
  { id: 'options.pcr', name: 'Put-call ratio', domain: 'options', requirement: 'options', description: 'Real broker/options-source PCR when supplied.', horizon: 'intraday', version: 1 },
  { id: 'options.gex', name: 'Gamma exposure', domain: 'options', requirement: 'options', description: 'Real options gamma exposure when supplied.', horizon: 'intraday', version: 1 },
  { id: 'options.dex', name: 'Delta exposure', domain: 'options', requirement: 'options', description: 'Real options delta exposure when supplied.', horizon: 'intraday', version: 1 },
  { id: 'orderbook.imbalance', name: 'Order-book imbalance', domain: 'orderbook', requirement: 'depth', description: 'Real bid/ask depth imbalance when supplied.', horizon: 'micro', version: 1 },
  { id: 'macro.context', name: 'Macro context', domain: 'macro', requirement: 'macro', description: 'Versioned macro feature supplied by an external data source.', horizon: 'swing', version: 1 },
  { id: 'sentiment.score', name: 'Sentiment score', domain: 'sentiment', requirement: 'sentiment', description: 'External news/sentiment score when available.', horizon: 'intraday', version: 1 },
] as const;

const definitions = new Map(FEATURE_REGISTRY.map(definition => [definition.id, definition]));
export function getFeatureDefinition(id: string): FeatureDefinition | undefined { return definitions.get(id); }
export function listFeatureDefinitions(): readonly FeatureDefinition[] { return FEATURE_REGISTRY; }

const finite = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i += 1) result = values[i] * k + result * (1 - k);
  return result;
}

function rsi(values: number[], period = 14): number | null {
  if (values.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  let averageGain = gain / period;
  let averageLoss = loss / period;
  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    averageGain = ((averageGain * (period - 1)) + Math.max(0, delta)) / period;
    averageLoss = ((averageLoss * (period - 1)) + Math.max(0, -delta)) / period;
  }
  if (averageLoss === 0) return 100;
  return 100 - (100 / (1 + averageGain / averageLoss));
}

function atr(candles: HistoricalCandle[], period = 14): number | null {
  if (candles.length < period) return null;
  const trueRanges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previous = candles[index - 1];
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previous.close), Math.abs(candle.low - previous.close));
  });
  let value = mean(trueRanges.slice(0, period));
  for (let index = period; index < trueRanges.length; index += 1) value = ((value * (period - 1)) + trueRanges[index]) / period;
  return value;
}

function ohlcvValue(id: string, candles: HistoricalCandle[]): number | null {
  if (!candles.length) return null;
  const closes = candles.map(candle => Number(candle.close));
  const last = closes.at(-1)!;
  if (id === 'price.return_1') return closes.length >= 2 ? last / closes.at(-2)! - 1 : null;
  if (id === 'price.return_5') return closes.length >= 6 ? last / closes.at(-6)! - 1 : null;
  if (id === 'price.ema9_distance') { const value = ema(closes, 9); return value && last ? last / value - 1 : null; }
  if (id === 'price.ema21_distance') { const value = ema(closes, 21); return value && last ? last / value - 1 : null; }
  if (id === 'momentum.rsi14') return rsi(closes, 14);
  if (id === 'volatility.atr14_pct') { const value = atr(candles, 14); return value && last ? value / last : null; }
  if (id === 'volatility.range_pct') return last ? (candles.at(-1)!.high - candles.at(-1)!.low) / last : null;
  if (id === 'volume.ratio20') {
    if (candles.length < 21) return null;
    const average = mean(candles.slice(-21, -1).map(candle => Math.max(0, Number(candle.volume) || 0)));
    return average ? Number(candles.at(-1)!.volume || 0) / average : null;
  }
  if (id === 'structure.breakout20') {
    if (candles.length < 21) return null;
    const prior = candles.slice(-21, -1);
    const high = Math.max(...prior.map(candle => candle.high));
    const low = Math.min(...prior.map(candle => candle.low));
    return (last - (last >= high ? high : low)) / Math.max(last * 0.0001, high - low);
  }
  return null;
}

export function buildFeatureVector(context: FeatureContext, requestedIds: string[] = FEATURE_REGISTRY.map(definition => definition.id)): FeatureValue[] {
  const candles = context.candles.filter(candle => Number.isFinite(new Date(candle.timestamp).getTime()) && [candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite));
  const timestamp = context.timestamp || candles.at(-1)?.timestamp || new Date(0).toISOString();
  const source = context.source || 'broker.ohlcv';

  return requestedIds.flatMap(id => {
    const definition = definitions.get(id);
    if (!definition) return [];
    let value: number | null = null;
    if (definition.requirement === 'ohlcv' || definition.requirement === 'structure') value = ohlcvValue(id, candles);
    else if (definition.requirement === 'options') value = finite(context.options?.[id === 'options.pcr' ? 'pcr' : id === 'options.gex' ? 'gex' : 'dex']);
    else if (definition.requirement === 'depth') value = finite(context.depth?.imbalance);
    else if (definition.requirement === 'sentiment') value = finite(context.sentiment);
    else if (definition.requirement === 'macro') value = finite(context.macro?.[id]);
    return [{ id, value: value ?? Number.NaN, timestamp, source, timeframe: context.timeframe, definitionVersion: definition.version, available: value != null }];
  });
}

export function validateFeatureVector(values: FeatureValue[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const feature of values) {
    if (seen.has(feature.id)) errors.push(`duplicate feature: ${feature.id}`);
    seen.add(feature.id);
    if (!definitions.has(feature.id)) errors.push(`unknown feature: ${feature.id}`);
    if (feature.available && !Number.isFinite(feature.value)) errors.push(`non-finite available feature: ${feature.id}`);
    if (!feature.timestamp || !feature.timeframe || !feature.source) errors.push(`missing provenance: ${feature.id}`);
  }
  return { valid: errors.length === 0, errors };
}

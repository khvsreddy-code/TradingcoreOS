import { HistoricalCandle } from '../brokers/BrokerAdapter';
import {
  buildCanonicalLevelAnalytics,
  CanonicalChartAnalytics,
  CanonicalCoreLevel,
  CanonicalLevelEvent,
} from './structureEngine';

export type CoreLevelState = 'ACTIVE' | 'TESTING' | 'BROKEN' | 'RETESTED' | 'FAILED';
export type CoreLevelSource =
  | 'SWING'
  | 'SESSION'
  | 'OPENING_RANGE'
  | 'EQUAL_HL'
  | 'PREVIOUS_CLOSE'
  | 'STRUCTURE';
export type CoreLevel = CanonicalCoreLevel;
export type LevelEvent = CanonicalLevelEvent;
export type ChartAnalytics = CanonicalChartAnalytics;

/**
 * Levels is a compatibility facade over the canonical quantitative structure
 * engine. It intentionally contains no independent pivot/S&R implementation.
 */
export function buildChartAnalytics(
  candles: HistoricalCandle[],
  spot: number,
  overrides?: Partial<import('./levelSettings').DynamicLevelSettings>,
): ChartAnalytics {
  return buildCanonicalLevelAnalytics(candles, spot, overrides);
}

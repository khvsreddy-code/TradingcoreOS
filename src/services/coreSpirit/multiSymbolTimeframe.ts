/**
 * CoreSpirit native multi-symbol + multi-timeframe contracts.
 *
 * These contracts define synchronization semantics without coupling the VM to
 * any broker. Hosts provide historical/current series snapshots through the
 * contextual data resolver.
 */
import type {
  CoreSpiritDataResolutionContext,
  CoreSpiritDataSnapshot,
  CoreSpiritDataAlignment,
  CoreSpiritDataRequest,
} from './types';

export const CORE_SPIRIT_MULTI_SYMBOL_TIMEFRAME_VERSION = 1 as const;

export type CoreSpiritDataField = CoreSpiritDataRequest['field'];

export interface CoreSpiritMarketReference {
  readonly kind: 'market';
  readonly symbol: string;
  readonly field: CoreSpiritDataField;
  readonly timeframe?: string;
}

export interface CoreSpiritTimeframeReference {
  readonly kind: 'timeframe';
  readonly timeframe: string;
  readonly symbol?: string;
  readonly field: CoreSpiritDataField;
  readonly alignment: CoreSpiritDataAlignment;
}

export type CoreSpiritSeriesReference = CoreSpiritMarketReference | CoreSpiritTimeframeReference;

export interface CoreSpiritSynchronizationPolicy {
  readonly alignment: CoreSpiritDataAlignment;
  readonly maxStalenessMs?: number;
  /** Higher timeframe data defaults to confirmed samples to prevent look-ahead. */
  readonly allowDeveloping?: boolean;
}

export const CORE_SPIRIT_DEFAULT_DATA_SYNC_POLICY: Readonly<CoreSpiritSynchronizationPolicy> = Object.freeze({
  alignment: 'last-confirmed',
  allowDeveloping: false,
});

export function createMarketReference(symbol: string, field: CoreSpiritDataField, timeframe?: string): CoreSpiritMarketReference {
  if (!symbol.trim()) throw new Error('market reference requires a symbol');
  return Object.freeze({ kind: 'market', symbol: symbol.trim(), field, ...(timeframe ? { timeframe: timeframe.trim() } : {}) });
}

export function createTimeframeReference(
  timeframe: string,
  field: CoreSpiritDataField,
  symbol?: string,
  policy: CoreSpiritSynchronizationPolicy = CORE_SPIRIT_DEFAULT_DATA_SYNC_POLICY,
): CoreSpiritTimeframeReference {
  if (!timeframe.trim()) throw new Error('timeframe reference requires a timeframe');
  return Object.freeze({ kind: 'timeframe', timeframe: timeframe.trim(), field, ...(symbol ? { symbol: symbol.trim() } : {}), alignment: policy.alignment });
}

export function validateSynchronizedSnapshot(
  snapshot: CoreSpiritDataSnapshot | null | undefined,
  context: Pick<CoreSpiritDataResolutionContext, 'asOfTimestamp' | 'alignment' | 'maxStalenessMs'>,
): CoreSpiritDataSnapshot | null {
  if (!snapshot) return null;
  if (snapshot.timestamp != null && Number(snapshot.timestamp) > context.asOfTimestamp) return null;
  if (context.alignment === 'last-confirmed' && snapshot.state && snapshot.state === 'developing') return null;
  if (context.maxStalenessMs != null && snapshot.timestamp != null && context.asOfTimestamp - Number(snapshot.timestamp) > context.maxStalenessMs) return null;
  return snapshot;
}

/** Pick the latest eligible sample per symbol at the same base clock. */
export function synchronizeMarketSnapshots(
  snapshots: readonly CoreSpiritDataSnapshot[],
  context: Pick<CoreSpiritDataResolutionContext, 'asOfTimestamp' | 'alignment' | 'maxStalenessMs'>,
): ReadonlyMap<string, CoreSpiritDataSnapshot> {
  const bySymbol = new Map<string, CoreSpiritDataSnapshot>();
  for (const candidate of snapshots) {
    const valid = validateSynchronizedSnapshot(candidate, context);
    if (!valid) continue;
    const existing = bySymbol.get(valid.symbol);
    if (!existing || Number(valid.timestamp ?? -Infinity) >= Number(existing.timestamp ?? -Infinity)) bySymbol.set(valid.symbol, valid);
  }
  return bySymbol;
}

/**
 * Strict higher-timeframe alignment: the sample must not be newer than the
 * base bar's clock, and developing samples are excluded by default.
 */
export function alignHigherTimeframeSnapshot(
  snapshot: CoreSpiritDataSnapshot | null | undefined,
  asOfTimestamp: number,
  policy: CoreSpiritSynchronizationPolicy = CORE_SPIRIT_DEFAULT_DATA_SYNC_POLICY,
): CoreSpiritDataSnapshot | null {
  return validateSynchronizedSnapshot(snapshot, {
    asOfTimestamp,
    alignment: policy.allowDeveloping ? policy.alignment === 'last-confirmed' ? 'latest' : policy.alignment : policy.alignment,
    maxStalenessMs: policy.maxStalenessMs,
  });
}

export function assertNoLookahead(
  snapshot: CoreSpiritDataSnapshot,
  asOfTimestamp: number,
): void {
  if (snapshot.timestamp != null && Number(snapshot.timestamp) > asOfTimestamp) {
    throw new Error(`CoreSpirit data look-ahead detected: sample ${snapshot.timestamp} is after ${asOfTimestamp}`);
  }
}

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
  /** Canonical timeframe is explicit even when the caller refers to the chart. */
  readonly timeframe: string;
}

export interface CoreSpiritTimeframeReference {
  readonly kind: 'timeframe';
  readonly timeframe: string;
  readonly symbol?: string;
  readonly field: CoreSpiritDataField;
  readonly alignment: CoreSpiritDataAlignment;
  readonly maxStalenessMs?: number;
  readonly allowDeveloping?: boolean;
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
  const normalizedTimeframe = String(timeframe ?? 'chart').trim();
  if (!normalizedTimeframe) throw new Error('market reference timeframe cannot be empty');
  return Object.freeze({ kind: 'market', symbol: symbol.trim(), field, timeframe: normalizedTimeframe });
}

export function createTimeframeReference(
  timeframe: string,
  field: CoreSpiritDataField,
  symbol?: string,
  policy: CoreSpiritSynchronizationPolicy = CORE_SPIRIT_DEFAULT_DATA_SYNC_POLICY,
): CoreSpiritTimeframeReference {
  if (!timeframe.trim()) throw new Error('timeframe reference requires a timeframe');
  if (symbol != null && !symbol.trim()) throw new Error('timeframe reference symbol cannot be empty');
  if (policy.maxStalenessMs != null && (!Number.isFinite(policy.maxStalenessMs) || policy.maxStalenessMs < 0)) {
    throw new Error('maxStalenessMs must be a non-negative finite number');
  }
  return Object.freeze({
    kind: 'timeframe', timeframe: timeframe.trim(), field,
    ...(symbol ? { symbol: symbol.trim() } : {}),
    alignment: policy.alignment,
    ...(policy.maxStalenessMs == null ? {} : { maxStalenessMs: policy.maxStalenessMs }),
    allowDeveloping: policy.allowDeveloping === true,
  });
}

type SnapshotValidationContext = Pick<CoreSpiritDataResolutionContext, 'asOfTimestamp' | 'alignment' | 'maxStalenessMs'> &
  Partial<Pick<CoreSpiritDataResolutionContext, 'executionMode'>>;

function isConfirmedSnapshot(snapshot: CoreSpiritDataSnapshot): boolean {
  if (snapshot.confirmationPhase) return snapshot.confirmationPhase === 'confirmed';
  return snapshot.state === 'confirmed' || snapshot.state === 'historical';
}

function snapshotRevision(snapshot: CoreSpiritDataSnapshot): string | number | undefined {
  return snapshot.dataRevision ?? snapshot.revision;
}

export function validateSynchronizedSnapshot(
  snapshot: CoreSpiritDataSnapshot | null | undefined,
  context: SnapshotValidationContext,
): CoreSpiritDataSnapshot | null {
  if (!snapshot) return null;
  if (!snapshot.symbol.trim() || !snapshot.timeframe.trim()) return null;
  if (snapshot.timestamp != null && !Number.isFinite(Number(snapshot.timestamp))) return null;
  if (snapshot.timestamp != null && Number(snapshot.timestamp) > context.asOfTimestamp) return null;

  const confirmedOnly = context.executionMode != null
    ? context.executionMode !== 'realtime'
    : context.alignment === 'last-confirmed' || context.alignment === 'nearest-confirmed';
  // A confirmed historical/replay decision must never consume a developing or
  // unlabelled higher-timeframe sample, even when the requested alignment is exact.
  if (confirmedOnly && !isConfirmedSnapshot(snapshot)) return null;
  if ((snapshot.confirmationPhase === 'developing' || snapshot.state === 'developing' || snapshot.state === 'realtime') &&
      context.alignment !== 'developing') return null;
  if (context.maxStalenessMs != null && snapshot.timestamp != null &&
      context.asOfTimestamp - Number(snapshot.timestamp) > context.maxStalenessMs) return null;
  // Reading a snapshot without revision metadata remains a compatibility path;
  // the graph/cache adapter emits an explicit dataRevision for canonical data.
  void snapshotRevision(snapshot);
  return snapshot;
}

/** Pick the latest eligible sample per symbol at the same base clock. */
export function synchronizeMarketSnapshots(
  snapshots: readonly CoreSpiritDataSnapshot[],
  context: SnapshotValidationContext,
): ReadonlyMap<string, CoreSpiritDataSnapshot> {
  const bySymbol = new Map<string, CoreSpiritDataSnapshot>();
  for (const candidate of snapshots) {
    const valid = validateSynchronizedSnapshot(candidate, context);
    if (!valid) continue;
    const identity = `${valid.symbol.trim().toUpperCase()}::${valid.timeframe.trim().toLowerCase()}`;
    const existing = bySymbol.get(identity);
    const time = Number(valid.timestamp ?? -Infinity);
    const oldTime = Number(existing?.timestamp ?? -Infinity);
    const revision = snapshotRevision(valid);
    const oldRevision = existing ? snapshotRevision(existing) : undefined;
    const revisionIsNewer = revision != null && oldRevision == null
      ? true
      : typeof revision === 'number' && typeof oldRevision === 'number'
        ? revision > oldRevision
        : String(revision ?? '') > String(oldRevision ?? '');
    if (!existing || time > oldTime || (time === oldTime && revisionIsNewer)) bySymbol.set(identity, valid);
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
    // allowDeveloping is effective only for explicitly realtime callers. The
    // resolver rejects it for historical/replay decisions regardless of policy.
    alignment: policy.allowDeveloping ? 'developing' : policy.alignment,
    maxStalenessMs: policy.maxStalenessMs,
    executionMode: policy.allowDeveloping ? 'realtime' : 'historical',
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

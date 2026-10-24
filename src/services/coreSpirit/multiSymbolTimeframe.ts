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
import { normalizeCoreSpiritTimeframe } from '../core/data/marketDataGraph';

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
  Partial<Pick<CoreSpiritDataResolutionContext, 'executionMode' | 'baseTimeframe'>>;

function isConfirmedSnapshot(snapshot: CoreSpiritDataSnapshot): boolean {
  // Conflicting metadata fails closed. A "confirmed" phase cannot override a
  // developing/realtime state (or vice versa).
  if (snapshot.confirmationPhase === 'developing' ||
      snapshot.state === 'developing' || snapshot.state === 'realtime') return false;
  if (snapshot.confirmationPhase === 'confirmed') {
    return snapshot.state == null || snapshot.state === 'confirmed' || snapshot.state === 'historical';
  }
  return snapshot.state === 'confirmed' || snapshot.state === 'historical';
}

/** Small dependency-free duration parser for snapshot validation only. */
function snapshotTimeframeSeconds(value: string): number {
  const raw = String(value ?? '').trim();
  if (/^\d+$/.test(raw)) return Number(raw) * 60;
  const match = /^(\d+)\s*(m|min|minute|h|hr|hour|d|day)$/i.exec(raw);
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  if (unit === 'm' || unit === 'min' || unit === 'minute') return amount * 60;
  if (unit === 'h' || unit === 'hr' || unit === 'hour') return amount * 3600;
  return amount * 86400;
}

function effectiveCloseTimestamp(
  snapshot: CoreSpiritDataSnapshot,
  context: Pick<CoreSpiritDataResolutionContext,'baseTimeframe'>,
): number | undefined {
  if (snapshot.closeTimestamp != null) return Number(snapshot.closeTimestamp);
  if (snapshot.timestamp == null) return undefined;
  const timeframe = snapshot.timeframe.trim().toLowerCase() === 'chart'
    ? context.baseTimeframe
    : snapshot.timeframe;
  const durationSeconds = snapshotTimeframeSeconds(timeframe);
  return durationSeconds > 0 ? Number(snapshot.timestamp) + durationSeconds : undefined;
}

function snapshotRevision(snapshot: CoreSpiritDataSnapshot): string | number {
  const explicit = snapshot.dataRevision ?? snapshot.revision;
  if (explicit != null) return explicit;
  // Compatibility providers may not issue an explicit revision. Derive a
  // deterministic content identity so cache keys still change when the sample
  // payload changes and result selection never depends on arrival order.
  return 'content:' + JSON.stringify([
    snapshot.symbol.trim().toUpperCase(),
    normalizeCoreSpiritTimeframe(snapshot.timeframe).toLowerCase(),
    snapshot.timestamp ?? null,
    snapshot.closeTimestamp ?? null,
    snapshot.value,
    snapshot.source,
    snapshot.state ?? null,
    snapshot.confirmationPhase ?? null,
  ]);
}

export function validateSynchronizedSnapshot(
  snapshot: CoreSpiritDataSnapshot | null | undefined,
  context: SnapshotValidationContext,
): CoreSpiritDataSnapshot | null {
  if (!snapshot) return null;
  if (typeof snapshot.symbol !== 'string' || typeof snapshot.timeframe !== 'string' ||
      !snapshot.symbol.trim() || !snapshot.timeframe.trim() || typeof snapshot.source !== 'string') return null;
  // Timestamp is mandatory. Without an open time the value cannot be causally
  // placed on the decision timeline, even if the provider labels it confirmed.
  if (snapshot.timestamp == null || !Number.isFinite(Number(snapshot.timestamp))) return null;
  if (Number(snapshot.timestamp) > context.asOfTimestamp) return null;

  const resolvedCloseTimestamp = effectiveCloseTimestamp(snapshot, {
    baseTimeframe:context.baseTimeframe ?? 'unknown',
  });
  if (snapshot.closeTimestamp != null && !Number.isFinite(Number(snapshot.closeTimestamp))) return null;
  if (resolvedCloseTimestamp != null && (!Number.isFinite(resolvedCloseTimestamp) ||
      resolvedCloseTimestamp < Number(snapshot.timestamp))) return null;

  const confirmedOnly = context.executionMode != null
    ? context.executionMode !== 'realtime'
    : context.alignment === 'last-confirmed' || context.alignment === 'nearest-confirmed';
  const requiresClosedSample = confirmedOnly ||
    context.alignment === 'last-confirmed' || context.alignment === 'nearest-confirmed';

  // If this mode requires a finalized sample, both the close boundary and
  // confirmation metadata must prove eligibility. Unknown timeframes fail closed.
  if (requiresClosedSample && resolvedCloseTimestamp == null) return null;
  if (requiresClosedSample && resolvedCloseTimestamp != null &&
      resolvedCloseTimestamp > context.asOfTimestamp) return null;
  const explicitRealtimeDeveloping = context.executionMode === 'realtime' && context.alignment === 'developing';
  if (!isConfirmedSnapshot(snapshot) && !explicitRealtimeDeveloping) return null;

  const markedDeveloping = snapshot.confirmationPhase === 'developing' ||
    snapshot.state === 'developing' || snapshot.state === 'realtime';
  if (markedDeveloping && context.alignment !== 'developing') return null;
  const closeNotReached = resolvedCloseTimestamp != null &&
    resolvedCloseTimestamp > context.asOfTimestamp;
  // A future close is usable only in an explicit realtime/developing context,
  // and is normalized to developing even if a provider mislabeled it confirmed.
  if (closeNotReached &&
      (context.executionMode !== 'realtime' || context.alignment !== 'developing')) return null;

  const freshnessTimestamp = resolvedCloseTimestamp ?? Number(snapshot.timestamp);
  if (context.maxStalenessMs != null &&
      Math.max(0, context.asOfTimestamp - freshnessTimestamp) * 1000 > context.maxStalenessMs) return null;
  const dataRevision = snapshotRevision(snapshot);
  return Object.freeze({
    ...snapshot,
    ...(resolvedCloseTimestamp == null ? {} : { closeTimestamp:resolvedCloseTimestamp }),
    ...(closeNotReached ? {state:'developing' as const,confirmationPhase:'developing' as const} : {}),
    dataRevision,
  });
}

/** Pick the latest eligible sample per canonical symbol/timeframe identity at the same base clock. */
export function synchronizeMarketSnapshots(
  snapshots: readonly CoreSpiritDataSnapshot[],
  context: SnapshotValidationContext,
): ReadonlyMap<string, CoreSpiritDataSnapshot> {
  const bySymbol = new Map<string, CoreSpiritDataSnapshot>();
  for (const candidate of snapshots) {
    const valid = validateSynchronizedSnapshot(candidate, context);
    if (!valid) continue;
    const identity = `${valid.symbol.trim().toUpperCase()}::${normalizeCoreSpiritTimeframe(valid.timeframe).toLowerCase()}`;
    const existing = bySymbol.get(identity);
    const time = Number(valid.timestamp ?? -Infinity);
    const oldTime = Number(existing?.timestamp ?? -Infinity);
    const revisionOrder = !existing ? 1 :
      typeof valid.revision === 'number' && typeof existing.revision === 'number' && valid.revision !== existing.revision
        ? valid.revision > existing.revision ? 1 : -1
        : String(snapshotRevision(valid)).localeCompare(String(snapshotRevision(existing)));
    if (!existing || time > oldTime || (time === oldTime && revisionOrder > 0)) bySymbol.set(identity, valid);
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

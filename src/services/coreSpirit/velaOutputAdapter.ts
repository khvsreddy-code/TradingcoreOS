import type { CoreSpiritMarketBar } from './marketData';
import type { CoreSpiritObject } from './types';

/** Vela's external OHLCV shape is millisecond-capable; CoreSpirit receives canonical ISO bars. */
export type CoreSpiritVelaOhlcv = Readonly<{
  time?: number;
  timestamp?: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}>;

export type CoreSpiritVelaOutputAlignment = Readonly<{
  outputIndex: number;
  kind: CoreSpiritObject['kind'];
  barIndex?: number;
  timestampMs: number;
  aligned: boolean;
}>;

export type CoreSpiritVelaOutputAdaptation = Readonly<{
  outputs: CoreSpiritObject[];
  alignment: readonly CoreSpiritVelaOutputAlignment[];
  warnings: readonly string[];
  timeUnit: 'epoch-milliseconds';
}>;

export class CoreSpiritVelaAlignmentError extends Error {
  readonly code = 'CORESPIRIT_VELA_TIME_ALIGNMENT';
  constructor(message: string, readonly outputIndex?: number) {
    super(message);
    this.name = 'CoreSpiritVelaAlignmentError';
  }
}

/**
 * Convert a timestamp at the explicit CoreSpirit↔Vela boundary. CoreSpirit's
 * market/runtime contract uses epoch seconds; Vela's native scene uses millis.
 */
export function coreSpiritTimeToVelaMillis(value: unknown): number {
  if (value == null || value === '') return Number.NaN;
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric >= 1e11 ? numeric : numeric * 1000;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number.NaN;
  return Math.abs(numeric) >= 1e11 ? numeric : numeric * 1000;
}

export function normalizeVelaBarToCoreSpirit(raw: CoreSpiritVelaOhlcv, index = 0): CoreSpiritMarketBar {
  const rawTime = raw.time ?? raw.timestamp;
  const time = coreSpiritTimeToVelaMillis(rawTime);
  const open = Number(raw.open);
  const high = Number(raw.high);
  const low = Number(raw.low);
  const close = Number(raw.close);
  const volume = raw.volume == null ? 0 : Number(raw.volume);
  if (!Number.isFinite(time) || time <= 0) {
    throw new Error(`CoreSpirit Vela data adapter rejected bar ${index}: invalid epoch timestamp.`);
  }
  for (const [name, value] of Object.entries({ open, high, low, close, volume })) {
    if (!Number.isFinite(value)) throw new Error(`CoreSpirit Vela data adapter rejected bar ${index}: ${name} is not finite.`);
  }
  if (high < Math.max(open, close, low)) throw new Error(`CoreSpirit Vela data adapter rejected bar ${index}: high is below OHLC range.`);
  if (low > Math.min(open, close, high)) throw new Error(`CoreSpirit Vela data adapter rejected bar ${index}: low is above OHLC range.`);
  if (volume < 0) throw new Error(`CoreSpirit Vela data adapter rejected bar ${index}: volume is negative.`);
  return Object.freeze({
    timestamp: new Date(Math.floor(time / 1000) * 1000).toISOString(),
    open, high, low, close, volume,
  });
}

/** Converts only the required runtime snapshot; it does not retain a second history store. */
export function normalizeVelaBarsToCoreSpirit(rows: readonly CoreSpiritVelaOhlcv[]): CoreSpiritMarketBar[] {
  const out = new Array<CoreSpiritMarketBar>(rows.length);
  let previous = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < rows.length; index += 1) {
    const row = normalizeVelaBarToCoreSpirit(rows[index]!, index);
    const time = Date.parse(row.timestamp);
    if (time <= previous) {
      throw new Error(`CoreSpirit Vela data adapter rejected non-unique or non-chronological bar sequence at index ${index}.`);
    }
    previous = time;
    out[index] = row;
  }
  return out;
}

function barTimeMillis(bar: Pick<CoreSpiritMarketBar, 'timestamp'>): number {
  return coreSpiritTimeToVelaMillis(bar.timestamp);
}

function normalizeTimeFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(item => normalizeTimeFields(item));
  if (!value || typeof value !== 'object') return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  const isViewport = input.domain === 'viewport';
  for (const [key, child] of Object.entries(input)) {
    const isTimestampKey = ['time', 'timestamp', 'startTime', 'endTime', 'fromTime', 'toTime'].includes(key);
    const isBoxTimeBoundary = (key === 'left' || key === 'right') &&
      (input.kind === 'box' || input.kind === 'zone') && !isViewport;
    // visualPoint() defaults an untagged point to chart-time coordinates, so its x must be normalized too.
    const isTimeSpaceX = key === 'x' && (input.space === 'time' || (input.space == null && (input.y != null || input.price != null)) || input.xloc === 'bar_time');
    if ((isTimestampKey || isBoxTimeBoundary || isTimeSpaceX) &&
        (typeof child === 'number' || typeof child === 'string') && child !== '') {
      const normalized = coreSpiritTimeToVelaMillis(child);
      output[key] = Number.isFinite(normalized) ? normalized : child;
    } else {
      output[key] = normalizeTimeFields(child);
    }
  }
  return output;
}

const BAR_ANCHORED_KINDS = new Set<CoreSpiritObject['kind']>([
  'series', 'marker', 'signal', 'label', 'band', 'shape', 'background',
  'barcolor', 'footprint', 'orderIntent',
]);

/**
 * Translate CoreSpirit's bar-time outputs to Vela's epoch-millisecond scene
 * contract. Series values must map to a canonical bar; silently placing a plot
 * on an unrelated timestamp can make an indicator appear one candle late.
 */
export function adaptCoreSpiritOutputsForVela(
  outputs: readonly CoreSpiritObject[],
  bars: readonly CoreSpiritMarketBar[],
): CoreSpiritVelaOutputAdaptation {
  const timeline = new Map<number, { index: number; timeMs: number }>();
  for (let index = 0; index < bars.length; index += 1) {
    const timeMs = barTimeMillis(bars[index]!);
    if (!Number.isFinite(timeMs)) throw new CoreSpiritVelaAlignmentError(`Canonical chart bar ${index} has an invalid timestamp.`);
    const second = Math.floor(timeMs / 1000);
    if (timeline.has(second)) {
      throw new CoreSpiritVelaAlignmentError(`Canonical chart timeline contains duplicate bar-opening seconds at index ${index}.`);
    }
    timeline.set(second, { index, timeMs });
  }

  const alignment: CoreSpiritVelaOutputAlignment[] = [];
  const warnings: string[] = [];
  const adapted = outputs.map((item, outputIndex): CoreSpiritObject => {
    const raw = item as unknown as Record<string, any>;
    let normalized = normalizeTimeFields(raw) as Record<string, any>;
    let found: { index: number; timeMs: number } | undefined;
    if (BAR_ANCHORED_KINDS.has(item.kind) && raw.time != null) {
      const epochMs = coreSpiritTimeToVelaMillis(raw.time);
      found = Number.isFinite(epochMs) ? timeline.get(Math.floor(epochMs / 1000)) : undefined;
      if (item.kind === 'series' && !found) {
        throw new CoreSpiritVelaAlignmentError(
          `Series output ${outputIndex} (${item.seriesId || item.name || 'unnamed'}) at ${String(raw.time)} does not match a canonical chart bar. Refusing to render a time-misaligned indicator point.`,
          outputIndex,
        );
      }
      if (found) {
        // Snap second-normalized CoreSpirit time to the exact chart-open timestamp.
        normalized = { ...normalized, time: found.timeMs };
        const claimedIndex = raw.metadata?.barIndex == null ? Number.NaN : Number(raw.metadata.barIndex);
        if (Number.isSafeInteger(claimedIndex) && claimedIndex >= 0 && claimedIndex !== found.index) {
          throw new CoreSpiritVelaAlignmentError(
            `Output ${outputIndex} claims bar index ${claimedIndex}, but its timestamp maps to canonical bar ${found.index}.`,
            outputIndex,
          );
        }
      } else if (Number.isFinite(epochMs)) {
        warnings.push(`CoreSpirit ${item.kind} output ${outputIndex} is time-normalized but not anchored to a bar in the current history window.`);
      }
      alignment.push(Object.freeze({
        outputIndex, kind: item.kind, ...(found ? { barIndex: found.index } : {}),
        timestampMs: found?.timeMs ?? epochMs, aligned: Boolean(found),
      }));
    } else if (raw.time != null && Number.isFinite(Number(raw.time))) {
      alignment.push(Object.freeze({
        outputIndex, kind: item.kind,
        timestampMs: coreSpiritTimeToVelaMillis(raw.time),
        aligned: false,
      }));
    }
    return normalized as CoreSpiritObject;
  });

  return Object.freeze({
    outputs: adapted,
    alignment: Object.freeze(alignment),
    warnings: Object.freeze(warnings),
    timeUnit: 'epoch-milliseconds' as const,
  });
}

export type CoreSpiritVelaOutputRevision = Readonly<{
  streamId: string;
  datasetRevision: number;
  outputRevision: number;
}>;

/** Latest-wins gate shared by the host-side Vela output adapter. */
export class CoreSpiritVelaOutputRevisionGate {
  private readonly latest = new Map<string, { datasetRevision: number; outputRevision: number }>();

  accept(revision: CoreSpiritVelaOutputRevision): boolean {
    if (!revision.streamId.trim() ||
        !Number.isSafeInteger(revision.datasetRevision) || revision.datasetRevision < 0 ||
        !Number.isSafeInteger(revision.outputRevision) || revision.outputRevision < 0) return false;
    const previous = this.latest.get(revision.streamId);
    if (previous && (
      revision.datasetRevision < previous.datasetRevision ||
      (revision.datasetRevision === previous.datasetRevision && revision.outputRevision <= previous.outputRevision)
    )) return false;
    this.latest.set(revision.streamId, {
      datasetRevision: revision.datasetRevision,
      outputRevision: revision.outputRevision,
    });
    return true;
  }

  isCurrent(revision: CoreSpiritVelaOutputRevision): boolean {
    const current = this.latest.get(revision.streamId);
    return Boolean(current &&
      current.datasetRevision === revision.datasetRevision &&
      current.outputRevision === revision.outputRevision);
  }

  clear(streamId?: string): void {
    if (streamId === undefined) this.latest.clear();
    else this.latest.delete(streamId);
  }
}


/**
 * Return the first safe index to re-normalize when Vela exposes a new history
 * snapshot, or null when the cached timeline cannot be reused. This deliberately
 * checks stable timestamp anchors: length alone cannot distinguish an append
 * from a prepend or an in-place historical rewrite.
 *
 * A non-null result only permits reuse of the prefix. Callers still replace the
 * forming candle and should force a full refresh for an explicit backfill event.
 */
export function safeVelaNormalizationStart(
  rows: readonly CoreSpiritVelaOhlcv[],
  normalized: readonly CoreSpiritMarketBar[],
  previousLength: number,
  forceFullNormalization = false,
): number | null {
  const length = rows.length;
  if (forceFullNormalization || previousLength < 0 || length < previousLength ||
      normalized.length !== previousLength || length === 0) return null;
  if (previousLength === 0) return 0;

  const sameOpeningTime = (raw: CoreSpiritVelaOhlcv | undefined, bar: CoreSpiritMarketBar | undefined): boolean => {
    if (!raw || !bar) return false;
    const rawMs = coreSpiritTimeToVelaMillis(raw.time ?? raw.timestamp);
    const normalizedMs = coreSpiritTimeToVelaMillis(bar.timestamp);
    return Number.isFinite(rawMs) && Number.isFinite(normalizedMs) &&
      Math.floor(rawMs / 1000) === Math.floor(normalizedMs / 1000);
  };

  // The first anchor guards against a historical prepend even if the length grew.
  if (!sameOpeningTime(rows[0], normalized[0])) return null;
  if (length === previousLength) {
    // Only the forming bar may be replaced on the same-length fast path.
    const stableIndex = Math.max(0, length - 2);
    if (!sameOpeningTime(rows[stableIndex], normalized[stableIndex])) return null;
    return Math.max(0, length - 1);
  }

  // On append, the previous tail must remain at its old absolute index. If it
  // moved, this is a prepend/insert and all absolute bar indices have shifted.
  if (!sameOpeningTime(rows[previousLength - 1], normalized[previousLength - 1])) return null;
  return Math.max(0, previousLength - 1);
}

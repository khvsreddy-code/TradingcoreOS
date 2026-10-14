import type { CanonicalMarketView } from './canonicalDataPlane';
import type { CanonicalDirtyRange, MarketDataSnapshot } from '../../../architecture/crossPlaneContracts';

/**
 * Binary transport envelope for worker compute.
 *
 * Canonical storage stays main-thread owned. A worker receives an explicit,
 * bounded typed-array copy, with exact timeline revision and absolute source
 * offsets so a clipped or stale packet cannot masquerade as another window.
 */
export const CANONICAL_MARKET_DATA_PACKET_VERSION = 1 as const;

export type CanonicalMarketDataPacket = MarketDataSnapshot & Readonly<{
  version: typeof CANONICAL_MARKET_DATA_PACKET_VERSION;
  sourceTo: number;
  time: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
}>;

function clampIndex(value: number, length: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(length, Math.floor(value)));
}

function clipDirtyBounds(from: number, to: number, start: number, length: number): { from: number; to: number } {
  const dirtyFrom = Math.max(0, Math.min(length, from - start));
  const dirtyTo = Math.max(dirtyFrom, Math.max(0, Math.min(length, to - start)));
  return { from: dirtyFrom, to: dirtyTo };
}

function assertRevisionRange(range: CanonicalDirtyRange, snapshot: MarketDataSnapshot): void {
  if (range.timelineKey !== snapshot.timelineKey || range.revision !== snapshot.revision) {
    throw new Error('Canonical dirty range does not belong to the packet timeline revision.');
  }
  if (
    !Number.isSafeInteger(range.from) ||
    !Number.isSafeInteger(range.to) ||
    range.from < 0 ||
    range.to < range.from
  ) {
    throw new Error('Canonical dirty range must be a valid half-open bar-index interval.');
  }
}

/** Slice a borrowed view without losing its absolute position in the source timeline. */
export function sliceCanonicalMarketView(view: CanonicalMarketView, from = 0, to = view.length): CanonicalMarketView {
  const start = clampIndex(from, view.length, 0);
  const end = Math.max(start, clampIndex(to, view.length, view.length));
  const length = end - start;
  const dirty = clipDirtyBounds(view.dirtyFrom, view.dirtyTo, start, length);
  return Object.freeze({
    time: view.time.subarray(start, end),
    open: view.open.subarray(start, end),
    high: view.high.subarray(start, end),
    low: view.low.subarray(start, end),
    close: view.close.subarray(start, end),
    volume: view.volume.subarray(start, end),
    oi: view.oi.subarray(start, end),
    bid: view.bid.subarray(start, end),
    ask: view.ask.subarray(start, end),
    bidVolume: view.bidVolume.subarray(start, end),
    askVolume: view.askVolume.subarray(start, end),
    trades: view.trades.subarray(start, end),
    session: view.session.subarray(start, end),
    timelineKey: view.timelineKey,
    revision: view.revision,
    sourceFrom: view.sourceFrom + start,
    length,
    timeUnit: view.timeUnit,
    dirtyRange: view.dirtyRange,
    dirtyFrom: dirty.from,
    dirtyTo: dirty.to,
  });
}

/** Copy once at the worker ownership boundary. */
export function createCanonicalMarketDataPacket(view: CanonicalMarketView, from = 0, to = view.length): CanonicalMarketDataPacket {
  const sliced = sliceCanonicalMarketView(view, from, to);
  const packet: CanonicalMarketDataPacket = Object.freeze({
    version: CANONICAL_MARKET_DATA_PACKET_VERSION,
    timelineKey: sliced.timelineKey,
    revision: sliced.revision,
    sourceFrom: sliced.sourceFrom,
    sourceTo: sliced.sourceFrom + sliced.length,
    length: sliced.length,
    timeUnit: sliced.timeUnit,
    dirtyRange: sliced.dirtyRange,
    time: new Float64Array(sliced.time),
    open: new Float64Array(sliced.open),
    high: new Float64Array(sliced.high),
    low: new Float64Array(sliced.low),
    close: new Float64Array(sliced.close),
    volume: new Float64Array(sliced.volume),
  });
  assertCanonicalMarketDataPacket(packet);
  return packet;
}

export function packetTransferables(packet: CanonicalMarketDataPacket): Transferable[] {
  return [
    packet.time.buffer,
    packet.open.buffer,
    packet.high.buffer,
    packet.low.buffer,
    packet.close.buffer,
    packet.volume.buffer,
  ];
}

/** Validate transport shape and revision metadata at the worker boundary. */
export function assertCanonicalMarketDataPacket(packet: CanonicalMarketDataPacket): void {
  if (packet.version !== CANONICAL_MARKET_DATA_PACKET_VERSION) {
    throw new Error(`Unsupported canonical market packet version: ${String(packet.version)}`);
  }
  if (typeof packet.timelineKey !== 'string' || !packet.timelineKey.trim()) {
    throw new Error('Canonical market packet requires a timeline key.');
  }
  if (!Number.isSafeInteger(packet.revision) || packet.revision < 0) {
    throw new Error('Canonical market packet revision must be a non-negative safe integer.');
  }
  if (packet.timeUnit !== 'epoch-seconds') {
    throw new Error('Canonical market packet timestamps must use epoch seconds.');
  }
  if (
    !Number.isSafeInteger(packet.length) ||
    packet.length < 0 ||
    !Number.isSafeInteger(packet.sourceFrom) ||
    !Number.isSafeInteger(packet.sourceTo) ||
    packet.sourceFrom < 0 ||
    packet.sourceTo < packet.sourceFrom ||
    packet.sourceTo - packet.sourceFrom !== packet.length
  ) {
    throw new Error('Canonical market packet source bounds do not match its column length.');
  }
  assertRevisionRange(packet.dirtyRange, packet);
  const fields = [packet.time, packet.open, packet.high, packet.low, packet.close, packet.volume];
  if (fields.some((field) => !(field instanceof Float64Array) || field.length !== packet.length)) {
    throw new Error('Canonical market packet columns must be Float64Array values of the declared length.');
  }
}

/** Transfer a canonical packet without structured-cloning numeric buffers. */
export function transferCanonicalMarketDataPacket(worker: Worker, packet: CanonicalMarketDataPacket, message: Record<string, unknown> = {}): void {
  assertCanonicalMarketDataPacket(packet);
  worker.postMessage({ ...message, market: packet }, packetTransferables(packet));
}

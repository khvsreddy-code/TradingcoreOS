import type { CanonicalMarketView } from './canonicalDataPlane';

/**
 * Binary transport envelope for worker compute.
 *
 * The canonical MarketDataStore remains owned by the main thread. A worker never
 * receives that backing store directly; it receives a bounded typed-array copy of
 * the requested window whose ArrayBuffers are transferred, not structured-cloned.
 * This makes ownership explicit and leaves SharedArrayBuffer as a later optimization.
 */
export const CANONICAL_MARKET_DATA_PACKET_VERSION = 1 as const;

export type CanonicalMarketDataPacket = Readonly<{
  version: typeof CANONICAL_MARKET_DATA_PACKET_VERSION;
  timelineKey: string;
  revision: number;
  sourceFrom: number;
  sourceTo: number;
  length: number;
  time: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
}>;

export function sliceCanonicalMarketView(view: CanonicalMarketView, from = 0, to = view.length): CanonicalMarketView {
  const start = Math.max(0, Math.min(view.length, Math.floor(from)));
  const end = Math.max(start, Math.min(view.length, Math.ceil(to)));
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
    length: end - start,
    dirtyFrom: Math.max(0, view.dirtyFrom - start),
    dirtyTo: Math.max(0, Math.min(end - start, view.dirtyTo - start)),
  });
}

/** Copy exactly once at the worker ownership boundary. */
export function createCanonicalMarketDataPacket(view: CanonicalMarketView, from = 0, to = view.length): CanonicalMarketDataPacket {
  const sliced = sliceCanonicalMarketView(view, from, to);
  return Object.freeze({
    version: CANONICAL_MARKET_DATA_PACKET_VERSION,
    timelineKey: sliced.timelineKey,
    revision: sliced.revision,
    sourceFrom: Math.max(0, Math.floor(from)),
    sourceTo: Math.max(0, Math.floor(from)) + sliced.length,
    length: sliced.length,
    time: new Float64Array(sliced.time),
    open: new Float64Array(sliced.open),
    high: new Float64Array(sliced.high),
    low: new Float64Array(sliced.low),
    close: new Float64Array(sliced.close),
    volume: new Float64Array(sliced.volume),
  });
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

export function assertCanonicalMarketDataPacket(packet: CanonicalMarketDataPacket): void {
  if (packet.version !== CANONICAL_MARKET_DATA_PACKET_VERSION) throw new Error(`Unsupported canonical market packet version: ${String(packet.version)}`);
  const fields = [packet.time, packet.open, packet.high, packet.low, packet.close, packet.volume];
  if (fields.some(field => field.length !== packet.length)) throw new Error('Canonical market packet columns have different lengths.');
}

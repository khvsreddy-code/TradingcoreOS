import type { NormalizedMarketTick } from '../../types/market';

export const TickFlags = Object.freeze({
  Price: 1,
  Quantity: 2,
  Bid: 4,
  Ask: 8,
  OI: 16,
  Depth: 32,
});

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

function epochMs(value: unknown): number {
  const n = Number(value);
  if (Number.isFinite(n)) return n > 2e12 ? n : n * 1000;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/**
 * Fixed-size market-rate buffer.
 *
 * The transport object arriving from the broker is never retained in the ring.
 * Hot fields are copied once into typed arrays and consumers can batch-read the
 * ring without allocating tick objects.
 */
export class TickRingBuffer {
  private readonly timestamp: Float64Array;
  private readonly price: Float64Array;
  private readonly quantity: Float64Array;
  private readonly bid: Float64Array;
  private readonly ask: Float64Array;
  private readonly flags: Uint8Array;
  private cursor = 0;
  private count = 0;
  private sequence = 0;

  constructor(readonly capacity = 8192) {
    const size = Math.max(256, Math.floor(capacity));
    this.timestamp = new Float64Array(size);
    this.price = new Float64Array(size);
    this.quantity = new Float64Array(size);
    this.bid = new Float64Array(size);
    this.ask = new Float64Array(size);
    this.flags = new Uint8Array(size);
    this.timestamp.fill(Number.NaN);
    this.price.fill(Number.NaN);
    this.quantity.fill(Number.NaN);
    this.bid.fill(Number.NaN);
    this.ask.fill(Number.NaN);
  }

  push(tick: NormalizedMarketTick): number {
    const index = this.cursor;
    const price = finite(tick.ltp);
    const quantity = finite(tick.volume);
    const bestBid = finite(tick.bid?.[0]?.price);
    const bestAsk = finite(tick.ask?.[0]?.price);
    let flags = 0;
    if (Number.isFinite(price)) flags |= TickFlags.Price;
    if (Number.isFinite(quantity)) flags |= TickFlags.Quantity;
    if (Number.isFinite(bestBid)) flags |= TickFlags.Bid;
    if (Number.isFinite(bestAsk)) flags |= TickFlags.Ask;
    if (Number.isFinite(Number(tick.oi))) flags |= TickFlags.OI;
    if ((tick.bid?.length || 0) > 0 || (tick.ask?.length || 0) > 0) flags |= TickFlags.Depth;

    this.timestamp[index] = epochMs(tick.lastTradeTimestamp ?? tick.receivedAt);
    this.price[index] = price;
    this.quantity[index] = quantity;
    this.bid[index] = bestBid;
    this.ask[index] = bestAsk;
    this.flags[index] = flags;

    this.cursor = (index + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
    this.sequence += 1;
    return this.sequence;
  }

  latestSequence(): number {
    return this.sequence;
  }

  size(): number {
    return this.count;
  }

  forEachSince(sequenceExclusive: number, visitor: (sequence: number, timestamp: number, price: number, quantity: number, bid: number, ask: number, flags: number) => void): number {
    if (!this.count) return 0;
    const firstSequence = Math.max(sequenceExclusive + 1, this.sequence - this.count + 1);
    const lastSequence = this.sequence;
    let visited = 0;
    for (let sequence = firstSequence; sequence <= lastSequence; sequence += 1) {
      const index = (sequence - 1) % this.capacity;
      visitor(sequence, this.timestamp[index]!, this.price[index]!, this.quantity[index]!, this.bid[index]!, this.ask[index]!, this.flags[index]!);
      visited += 1;
    }
    return visited;
  }

  toArray(): NormalizedMarketTick[] {
    // Explicit compatibility boundary for diagnostics/UI tooling only.
    const result: NormalizedMarketTick[] = [];
    const firstSequence = Math.max(1, this.sequence - this.count + 1);
    for (let sequence = firstSequence; sequence <= this.sequence; sequence += 1) {
      const index = (sequence - 1) % this.capacity;
      const flags = this.flags[index]!;
      const value: NormalizedMarketTick = {
        instrumentKey: '',
        ltp: Number.isFinite(this.price[index]!) ? this.price[index]! : undefined,
        volume: Number.isFinite(this.quantity[index]!) ? this.quantity[index]! : undefined,
        lastTradeTimestamp: Number.isFinite(this.timestamp[index]!) ? new Date(this.timestamp[index]!).toISOString() : undefined,
      };
      if (!(flags & TickFlags.Price)) delete value.ltp;
      result.push(value);
    }
    return result;
  }
}

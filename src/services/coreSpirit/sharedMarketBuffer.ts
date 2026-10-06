import type { CoreSpiritMarketBar } from './marketData';

export const CORE_SPIRIT_SHARED_MARKET_VERSION = 1 as const;
export const CORE_SPIRIT_SHARED_HEADER_BYTES = 32;
export const CORE_SPIRIT_SHARED_MAX_CHART_BARS = 250_000;

export type CoreSpiritSharedMarketDescriptor = Readonly<{
  version: typeof CORE_SPIRIT_SHARED_MARKET_VERSION;
  buffer: SharedArrayBuffer | ArrayBuffer;
  capacity: number;
  length: number;
  datasetVersion: number;
  dirtyFrom: number;
  dirtyTo: number;
  sequence: number;
  shared: boolean;
}>;

type BufferLike = SharedArrayBuffer | ArrayBuffer;

type Views = {
  header: Int32Array;
  time: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
};

function supportsSharedArrayBuffer(): boolean {
  return typeof SharedArrayBuffer !== 'undefined'
    && (typeof globalThis.crossOriginIsolated !== 'boolean' || globalThis.crossOriginIsolated);
}

function nextPowerOfTwo(value: number): number {
  let result = 1;
  while (result < value) result *= 2;
  return result;
}

function allocateBuffer(capacity: number, shared: boolean): BufferLike {
  const bytes = CORE_SPIRIT_SHARED_HEADER_BYTES + capacity * Float64Array.BYTES_PER_ELEMENT * 6;
  return shared ? new SharedArrayBuffer(bytes) : new ArrayBuffer(bytes);
}

function views(buffer: BufferLike, capacity: number): Views {
  let offset = CORE_SPIRIT_SHARED_HEADER_BYTES;
  return {
    header: new Int32Array(buffer, 0, CORE_SPIRIT_SHARED_HEADER_BYTES / Int32Array.BYTES_PER_ELEMENT),
    time: new Float64Array(buffer, offset, capacity),
    open: new Float64Array(buffer, offset += capacity * Float64Array.BYTES_PER_ELEMENT, capacity),
    high: new Float64Array(buffer, offset += capacity * Float64Array.BYTES_PER_ELEMENT, capacity),
    low: new Float64Array(buffer, offset += capacity * Float64Array.BYTES_PER_ELEMENT, capacity),
    close: new Float64Array(buffer, offset += capacity * Float64Array.BYTES_PER_ELEMENT, capacity),
    volume: new Float64Array(buffer, offset += capacity * Float64Array.BYTES_PER_ELEMENT, capacity),
  };
}

export class CoreSpiritSharedMarketBuffer {
  private readonly shared: boolean;
  private capacity: number;
  private buffer: BufferLike;
  private columns: Views;

  constructor(initialCapacity = 65_536, preferShared = true) {
    this.shared = preferShared && supportsSharedArrayBuffer();
    this.capacity = Math.max(256, nextPowerOfTwo(Math.floor(initialCapacity)));
    this.buffer = allocateBuffer(this.capacity, this.shared);
    this.columns = views(this.buffer, this.capacity);
    this.columns.header[0] = CORE_SPIRIT_SHARED_MARKET_VERSION;
    this.columns.header[2] = 0;
    this.columns.header[3] = 0;
    this.columns.header[4] = -1;
    this.columns.header[5] = 0;
  }

  getDescriptor(): CoreSpiritSharedMarketDescriptor {
    return Object.freeze({
      version: CORE_SPIRIT_SHARED_MARKET_VERSION,
      buffer: this.buffer,
      capacity: this.capacity,
      length: this.shared && typeof Atomics !== 'undefined' ? Atomics.load(this.columns.header,1) : this.columns.header[1]!,
      datasetVersion: this.shared && typeof Atomics !== 'undefined' ? Atomics.load(this.columns.header,2) : this.columns.header[2]!,
      dirtyFrom: this.shared && typeof Atomics !== 'undefined' ? Atomics.load(this.columns.header,3) : this.columns.header[3]!,
      dirtyTo: this.shared && typeof Atomics !== 'undefined' ? Atomics.load(this.columns.header,4) : this.columns.header[4]!,
      sequence: this.shared && typeof Atomics !== 'undefined' ? Atomics.load(this.columns.header,5) : this.columns.header[5]!,
      shared: this.shared,
    });
  }

  writeBars(
    bars: readonly CoreSpiritMarketBar[],
    datasetVersion: number,
    dirtyFrom = 0,
    dirtyTo = bars.length,
  ): CoreSpiritSharedMarketDescriptor {
    if (bars.length > this.capacity) {
      if (this.shared) throw new Error(
        'Shared CoreSpirit dataset exceeds fixed buffer capacity (' +
        this.capacity +
        '); use a bounded/chunked dataset transport.',
      );
      this.capacity = nextPowerOfTwo(bars.length);
      this.buffer = allocateBuffer(this.capacity, false);
      this.columns = views(this.buffer, this.capacity);
    }

    const start = Math.max(0, Math.min(bars.length, Math.floor(dirtyFrom)));
    const end = Math.max(start, Math.min(bars.length, Math.ceil(dirtyTo)));

    for (let i = start; i < end; i += 1) {
      const bar = bars[i]!;
      this.columns.time[i] = Date.parse(String(bar.timestamp)) / 1000;
      this.columns.open[i] = Number(bar.open);
      this.columns.high[i] = Number(bar.high);
      this.columns.low[i] = Number(bar.low);
      this.columns.close[i] = Number(bar.close);
      this.columns.volume[i] = Number(bar.volume) || 0;
    }

    const nextSequence=(typeof Atomics !== 'undefined' ? Atomics.load(this.columns.header,5) : this.columns.header[5]!) + 1;
    if (this.shared && typeof Atomics !== 'undefined') {
      Atomics.store(this.columns.header,1,bars.length);
      Atomics.store(this.columns.header,2,Math.max(0,Math.floor(datasetVersion)));
      Atomics.store(this.columns.header,3,start);
      Atomics.store(this.columns.header,4,end);
      Atomics.store(this.columns.header,5,nextSequence);
    } else {
      this.columns.header[1]=bars.length;
      this.columns.header[2]=Math.max(0,Math.floor(datasetVersion));
      this.columns.header[3]=start;
      this.columns.header[4]=end;
      this.columns.header[5]=nextSequence;
    }

    return this.getDescriptor();
  }
}

export function readCoreSpiritSharedMarketDescriptor(
  descriptor: CoreSpiritSharedMarketDescriptor,
): { header: Int32Array; time: Float64Array; open: Float64Array; high: Float64Array; low: Float64Array; close: Float64Array; volume: Float64Array } {
  if (descriptor.version !== CORE_SPIRIT_SHARED_MARKET_VERSION) throw new Error('Unsupported CoreSpirit shared market version');
  return views(descriptor.buffer, descriptor.capacity);
}

export function descriptorTransferables(descriptor: CoreSpiritSharedMarketDescriptor): Transferable[] {
  return descriptor.shared ? [] : [descriptor.buffer];
}

export function canUseCoreSpiritSharedMarketBuffer(length: number): boolean {
  return supportsSharedArrayBuffer() && Number.isFinite(length) && length <= CORE_SPIRIT_SHARED_MAX_CHART_BARS;
}

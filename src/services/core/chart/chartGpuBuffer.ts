import type { ChartLodIndex } from './chartLevelOfDetail';

/**
 * Retained packed candle buffer. It only grows geometrically and updates the
 * changed LOD bucket range, avoiding per-frame JS object creation and full
 * repacking on ordinary realtime updates.
 */
export class ChartGpuCandleBuffer {
  readonly stride = 6;
  data = new Float32Array(0);
  count = 0;
  capacity = 0;
  sourceRevision = -1;
  dirtyFrom = 0;
  dirtyTo = 0;

  sync(lod: ChartLodIndex): void {
    this.ensureCapacity(lod.count);
    this.count = lod.count;
    const from = Math.max(0, lod.dirtyFromBucket);
    const to = Math.min(lod.count, Math.max(from, lod.dirtyToBucket));
    for (let i = from; i < to; i += 1) this.writeBucket(lod, i);
    this.sourceRevision = lod.sourceRevision;
    this.dirtyFrom = from;
    this.dirtyTo = to;
  }

  private ensureCapacity(needed: number): void {
    if (needed <= this.capacity) return;
    let next = Math.max(64, this.capacity || 64);
    while (next < needed) next *= 2;
    const nextData = new Float32Array(next * this.stride);
    nextData.set(this.data);
    this.data = nextData;
    this.capacity = next;
  }

  private writeBucket(lod: ChartLodIndex, index: number): void {
    const base = index * this.stride;
    this.data[base] = lod.time[index];
    this.data[base + 1] = lod.open[index];
    this.data[base + 2] = lod.high[index];
    this.data[base + 3] = lod.low[index];
    this.data[base + 4] = lod.close[index];
    this.data[base + 5] = lod.volume[index];
  }
}

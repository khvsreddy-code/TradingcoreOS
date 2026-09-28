import type { ChartViewportController } from './chartViewportController';
import { ChartPriceScaleEngine, type ChartPriceScaleMode } from './chartPriceScale';
import { ChartTimeScale, type ChartTimeScaleMode, type ChartTimeScaleOptions } from './chartTimeScale';

export type { ChartPriceScaleMode } from './chartPriceScale';
export type ChartScaleDomain = Readonly<{ min: number; max: number }>;

/** Compatibility facade around the dedicated time and price scale engines. */
export class ChartScaleModel {
  readonly time = new ChartTimeScale();
  readonly price = new ChartPriceScaleEngine();
  private _volume: ChartScaleDomain = { min: 0, max: 1 };
  private _timeDomain: ChartScaleDomain = { min: 0, max: 1 };

  setTimeOptions(options: ChartTimeScaleOptions): void { this.time.configure(options); }
  bindTimeline(timeline: Float64Array): void { this.time.bindTimeline(timeline); this.setTimeDomain(timeline[0] ?? 0, timeline[timeline.length - 1] ?? 1); }
  setTimeDomain(min: number, max: number): void { this._timeDomain = normalizeDomain(min, max); }
  setPriceDomain(min: number, max: number): void { this.price.setDomain(min, max, true); }
  setVolumeDomain(min: number, max: number): void { this._volume = normalizeDomain(min, max); }
  setPriceMode(mode: ChartPriceScaleMode): void { this.price.setMode(mode); }
  setPricePolicy(policy: 'auto' | 'manual' | 'locked'): void { this.price.setPolicy(policy); }
  setPercentBase(value: number): void { this.price.setBasePrice(value); }
  setIndexedBase(value: number): void { this.price.setBasePrice(value); }
  setPricePaddingRatio(value: number): void { this.price.setPaddingRatio(value); }
  setAutoPriceScale(high: Float64Array, low: Float64Array, from = 0, to = Math.min(high.length, low.length), basePrice?: number): void { this.price.autoScaleFromColumns(high, low, from, to, basePrice); }
  setManualPriceDomain(min: number, max: number): void { this.price.setManualDomain(min, max); }
  lockPriceScale(): void { this.price.lock(); }
  unlockPriceScaleAuto(): void { this.price.unlockAuto(); }

  xFromTime(time: number, pixelWidth: number): number {
    return normalize(time, this._timeDomain.min, this._timeDomain.max) * Math.max(1, pixelWidth);
  }

  timeFromX(x: number, pixelWidth: number): number {
    return denormalize(x / Math.max(1, pixelWidth), this._timeDomain.min, this._timeDomain.max);
  }

  xFromTimestamp(time: number, viewport: ChartViewportController): number { return this.time.xFromTime(time, viewport); }
  timestampFromX(x: number, viewport: ChartViewportController): number { return this.time.timeFromX(x, viewport); }
  barIndexToX(index: number, viewport: ChartViewportController): number { return viewport.barIndexToX(index); }
  xToBarIndex(x: number, viewport: ChartViewportController): number { return viewport.xToBarIndex(x); }

  yFromPrice(price: number, pixelHeight: number): number { return this.price.yFromPrice(price, pixelHeight); }
  priceFromY(y: number, pixelHeight: number): number { return this.price.priceFromY(y, pixelHeight); }
  volumeFromY(value: number, pixelHeight: number): number { return (1 - normalize(value, this._volume.min, this._volume.max)) * Math.max(1, pixelHeight); }

  snapshot() {
    return Object.freeze({ time: this._timeDomain, volume: this._volume, timeScale: this.time.snapshot(), priceScale: this.price.snapshot() });
  }
}

export { ChartPriceScaleEngine } from './chartPriceScale';
export { ChartTimeScale } from './chartTimeScale';
export type { ChartTimeScaleMode } from './chartTimeScale';

function normalize(value: number, min: number, max: number): number {
  const range = max - min;
  return range === 0 ? 0.5 : Math.max(0, Math.min(1, (value - min) / range));
}
function denormalize(value: number, min: number, max: number): number { return min + Math.max(0, Math.min(1, value)) * (max - min); }
function normalizeDomain(min: number, max: number): ChartScaleDomain {
  const a = Number.isFinite(min) ? min : 0;
  const b = Number.isFinite(max) ? max : a + 1;
  return a <= b ? { min: a, max: b } : { min: b, max: a };
}

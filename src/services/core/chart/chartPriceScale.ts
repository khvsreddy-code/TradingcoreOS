export type ChartPriceScaleMode = 'linear' | 'log' | 'percent' | 'indexed';
export type ChartPriceScaleDomain = Readonly<{ min: number; max: number }>;
export type ChartPriceScalePolicy = 'auto' | 'manual' | 'locked';

/** Cached price transform. All hot-path methods use precomputed coefficients. */
export class ChartPriceScaleEngine {
  private _domain: ChartPriceScaleDomain = Object.freeze({ min: 0, max: 1 });
  private _mode: ChartPriceScaleMode = 'linear';
  private _policy: ChartPriceScalePolicy = 'auto';
  private _basePrice = 1;
  private _paddingRatio = 0.05;
  private _basePriceExplicit = false;

  private _a = 0;
  private _b = 1;
  private _inverseA = 0;
  private _inverseB = 1;

  get domain(): ChartPriceScaleDomain { return this._domain; }
  get mode(): ChartPriceScaleMode { return this._mode; }
  get policy(): ChartPriceScalePolicy { return this._policy; }
  get basePrice(): number { return this._basePrice; }

  setMode(mode: ChartPriceScaleMode): void { this._mode = mode; this.rebuildTransform(); }
  setPolicy(policy: ChartPriceScalePolicy): void { this._policy = policy; }
  setBasePrice(value: number): void { if (Number.isFinite(value) && value > 0) { this._basePrice = value; this._basePriceExplicit = true; this.rebuildTransform(); } }
  setPaddingRatio(value: number): void { if (Number.isFinite(value)) { this._paddingRatio = Math.max(0, Math.min(0.5, value)); } }

  setDomain(min: number, max: number, force = false): void {
    if (!force && this._policy === 'locked') return;
    this._domain = normalizeDomain(min, max, this._mode === 'log');
    if (this._policy === 'auto' && this._paddingRatio > 0) this._domain = padDomain(this._domain, this._paddingRatio, this._mode === 'log');
    this.rebuildTransform();
  }

  updateAutoDomain(min: number, max: number, basePrice?: number): void {
    if (this._policy !== 'auto') return;
    if (!this._basePriceExplicit && Number.isFinite(basePrice) && Number(basePrice) > 0) this._basePrice = Number(basePrice);
    this.setDomain(min, max, true);
  }

  autoScaleFromColumns(high: Float64Array, low: Float64Array, from = 0, to = Math.min(high.length, low.length), basePrice?: number): void {
    if (this._policy !== 'auto') return;
    const start = Math.max(0, Math.floor(from));
    const end = Math.min(Math.min(high.length, low.length), Math.ceil(to));
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = start; i < end; i += 1) {
      const lo = low[i]; const hi = high[i];
      if (Number.isFinite(lo)) min = Math.min(min, lo);
      if (Number.isFinite(hi)) max = Math.max(max, hi);
    }
    if (min !== Number.POSITIVE_INFINITY && max !== Number.NEGATIVE_INFINITY) this.updateAutoDomain(min, max, basePrice);
  }

  setManualDomain(min: number, max: number): void {
    this._policy = 'manual';
    this.setDomain(min, max, true);
  }

  lock(): void { this._policy = 'locked'; }
  unlockAuto(): void { this._policy = 'auto'; }

  priceToUnit(price: number): number { return this._a * this.transformForward(price) + this._b; }
  unitToPrice(unit: number): number { return this.transformInverse(this._inverseA * unit + this._inverseB); }

  yFromPrice(price: number, pixelHeight: number): number {
    return (1 - this.priceToUnit(price)) * Math.max(1, pixelHeight);
  }

  priceFromY(y: number, pixelHeight: number): number {
    return this.unitToPrice(1 - y / Math.max(1, pixelHeight));
  }

  displayValue(price: number): number {
    if (this._mode === 'percent') return ((price / this._basePrice) - 1) * 100;
    if (this._mode === 'indexed') return (price / this._basePrice) * 100;
    return price;
  }

  snapshot() {
    return Object.freeze({ domain: this._domain, mode: this._mode, policy: this._policy, basePrice: this._basePrice, basePriceExplicit: this._basePriceExplicit, paddingRatio: this._paddingRatio });
  }

  private transformForward(price: number): number {
    if (this._mode === 'log') return Math.log(Math.max(price, 1e-12));
    if (this._mode === 'percent') return ((price / this._basePrice) - 1) * 100;
    if (this._mode === 'indexed') return (price / this._basePrice) * 100;
    return price;
  }

  private transformInverse(value: number): number {
    if (this._mode === 'log') return Math.exp(value);
    if (this._mode === 'percent') return (1 + value / 100) * this._basePrice;
    if (this._mode === 'indexed') return (value / 100) * this._basePrice;
    return value;
  }

  private rebuildTransform(): void {
    const min = this.transformForward(this._domain.min);
    const max = this.transformForward(this._domain.max);
    const range = Math.max(1e-12, max - min);
    this._a = 1 / range;
    this._b = -min / range;
    this._inverseA = range;
    this._inverseB = min;
  }
}

function normalizeDomain(min: number, max: number, positiveOnly: boolean): ChartPriceScaleDomain {
  let a = Number.isFinite(min) ? min : 0;
  let b = Number.isFinite(max) ? max : a + 1;
  if (positiveOnly) {
    a = Math.max(1e-12, a);
    b = Math.max(1e-12, b);
  }
  if (a === b) {
    const epsilon = Math.max(Math.abs(a) * 0.0005, positiveOnly ? a * 0.0005 : 1);
    a -= epsilon;
    b += epsilon;
    if (positiveOnly) a = Math.max(1e-12, a);
  }
  return a <= b ? Object.freeze({ min: a, max: b }) : Object.freeze({ min: b, max: a });
}

function padDomain(domain: ChartPriceScaleDomain, ratio: number, positiveOnly: boolean): ChartPriceScaleDomain {
  const range = domain.max - domain.min;
  const pad = range * ratio;
  let min = domain.min - pad;
  let max = domain.max + pad;
  if (positiveOnly) min = Math.max(1e-12, min);
  return Object.freeze({ min, max });
}

/** Black–Scholes valuation helpers for European options.
 *
 * Inputs are decimal rates/volatility (0.06 = 6%). Greeks are returned in
 * trader-friendly units: theta per calendar day, vega per 1 volatility point,
 * and rho per 1 percentage-point rate move. The calculation is an estimate,
 * never a substitute for broker-provided Greeks or a live executable quote.
 */
export type OptionRight = 'CE' | 'PE';

export type BlackScholesInput = Readonly<{
  right: OptionRight;
  spot: number;
  strike: number;
  timeToExpiryYears: number;
  volatility: number;
  riskFreeRate: number;
  dividendYield?: number;
}>;

export type OptionValuation = Readonly<{
  model: 'black-scholes';
  price: number;
  delta: number;
  gamma: number;
  thetaPerDay: number;
  thetaAnnual: number;
  vegaPerVolPoint: number;
  rhoPerRatePoint: number;
  d1: number;
  d2: number;
}>;

export type ImpliedVolatilityInput = Omit<BlackScholesInput, 'volatility'> & Readonly<{
  optionPrice: number;
  maxVolatility?: number;
  tolerance?: number;
}>;

const SQRT_2_PI = Math.sqrt(2 / Math.PI);
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const DEFAULT_EXPIRY_CUTOFF = '15:30:00';

/** Abramowitz–Stegun normal CDF approximation; absolute error is below 8e-8. */
export function normalCdf(value: number): number {
  if (value === Number.POSITIVE_INFINITY) return 1;
  if (value === Number.NEGATIVE_INFINITY) return 0;
  if (!Number.isFinite(value)) return Number.NaN;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.2316419 * x);
  const polynomial = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937
    + t * (-1.821255978 + t * 1.330274429))));
  const tail = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI) * polynomial;
  return value >= 0 ? 1 - tail : tail;
}

export function normalPdf(value: number): number {
  return Number.isFinite(value) ? Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI) : 0;
}

function validateInput(input: BlackScholesInput): void {
  if (input.right !== 'CE' && input.right !== 'PE') throw new Error('Option right must be CE or PE.');
  if (!Number.isFinite(input.spot) || input.spot <= 0) throw new Error('Spot must be positive.');
  if (!Number.isFinite(input.strike) || input.strike <= 0) throw new Error('Strike must be positive.');
  if (!Number.isFinite(input.timeToExpiryYears) || input.timeToExpiryYears < 0) throw new Error('Time to expiry must be non-negative.');
  if (!Number.isFinite(input.volatility) || input.volatility < 0 || input.volatility > 10) throw new Error('Volatility must be between 0 and 10.');
  if (!Number.isFinite(input.riskFreeRate) || input.riskFreeRate < -1 || input.riskFreeRate > 2) throw new Error('Risk-free rate is outside the supported range.');
  const dividendYield = input.dividendYield ?? 0;
  if (!Number.isFinite(dividendYield) || dividendYield < -1 || dividendYield > 2) throw new Error('Dividend yield is outside the supported range.');
}

/** Price and first/second-order sensitivities for a European call (CE) or put (PE). */
export function blackScholes(input: BlackScholesInput): OptionValuation {
  validateInput(input);
  const { right, spot: s, strike: k, timeToExpiryYears: t, volatility: sigma, riskFreeRate: r } = input;
  const q = input.dividendYield ?? 0;
  if (t === 0 || sigma === 0) {
    const discountedSpot = s * Math.exp(-q * t);
    const discountedStrike = k * Math.exp(-r * t);
    const intrinsic = right === 'CE'
      ? Math.max(discountedSpot - discountedStrike, 0)
      : Math.max(discountedStrike - discountedSpot, 0);
    const atMoney = Math.abs(discountedSpot - discountedStrike) <= 1e-12;
    const delta = right === 'CE'
      ? (discountedSpot > discountedStrike ? Math.exp(-q * t) : atMoney ? 0.5 * Math.exp(-q * t) : 0)
      : (discountedSpot < discountedStrike ? -Math.exp(-q * t) : atMoney ? -0.5 * Math.exp(-q * t) : 0);
    return {
      model: 'black-scholes', price: intrinsic, delta,
      gamma: 0, thetaPerDay: 0, thetaAnnual: 0,
      vegaPerVolPoint: 0, rhoPerRatePoint: 0, d1: Number.NaN, d2: Number.NaN,
    };
  }

  const sqrtT = Math.sqrt(t);
  const sigmaSqrtT = sigma * sqrtT;
  const d1 = (Math.log(s / k) + (r - q + 0.5 * sigma * sigma) * t) / sigmaSqrtT;
  const d2 = d1 - sigmaSqrtT;
  const discountSpot = Math.exp(-q * t);
  const discountStrike = Math.exp(-r * t);
  const density = normalPdf(d1);
  const call = right === 'CE';

  const price = call
    ? s * discountSpot * normalCdf(d1) - k * discountStrike * normalCdf(d2)
    : k * discountStrike * normalCdf(-d2) - s * discountSpot * normalCdf(-d1);
  const delta = call
    ? discountSpot * normalCdf(d1)
    : discountSpot * (normalCdf(d1) - 1);
  const gamma = discountSpot * density / (s * sigmaSqrtT);
  const diffusionTheta = -(s * discountSpot * density * sigma) / (2 * sqrtT);
  const thetaAnnual = call
    ? diffusionTheta - r * k * discountStrike * normalCdf(d2) + q * s * discountSpot * normalCdf(d1)
    : diffusionTheta + r * k * discountStrike * normalCdf(-d2) - q * s * discountSpot * normalCdf(-d1);
  const vegaPerVolPoint = s * discountSpot * density * sqrtT / 100;
  const rhoPerRatePoint = call
    ? k * t * discountStrike * normalCdf(d2) / 100
    : -k * t * discountStrike * normalCdf(-d2) / 100;

  return {
    model: 'black-scholes',
    price: Math.max(0, price),
    delta,
    gamma,
    thetaPerDay: thetaAnnual / 365,
    thetaAnnual,
    vegaPerVolPoint,
    rhoPerRatePoint,
    d1,
    d2,
  };
}

/** Infer annualized volatility from a premium using bounded bisection.
 * Returns null when the premium violates European no-arbitrage bounds or cannot be
 * bracketed; it never fabricates an IV for missing/invalid market data.
 */
export function impliedVolatility(input: ImpliedVolatilityInput): number | null {
  const { optionPrice, maxVolatility = 5, tolerance = 1e-7, ...base } = input;
  if (!Number.isFinite(optionPrice) || optionPrice < 0
    || !Number.isFinite(maxVolatility) || maxVolatility <= 0 || maxVolatility > 10
    || !Number.isFinite(tolerance) || tolerance <= 0) return null;
  try { validateInput({ ...base, volatility: 0.2 }); } catch { return null; }

  const t = base.timeToExpiryYears;
  const s = base.spot;
  const k = base.strike;
  const r = base.riskFreeRate;
  const q = base.dividendYield ?? 0;
  const discS = s * Math.exp(-q * t);
  const discK = k * Math.exp(-r * t);
  const lower = base.right === 'CE' ? Math.max(discS - discK, 0) : Math.max(discK - discS, 0);
  const upper = base.right === 'CE' ? discS : discK;
  if (optionPrice < lower - tolerance || optionPrice > upper + tolerance) return null;
  if (t === 0 || Math.abs(optionPrice - lower) <= tolerance) return 0;

  const priceAt = (volatility: number) => blackScholes({ ...base, volatility }).price;
  let low = 1e-6;
  let high = Math.min(maxVolatility, 10);
  if (priceAt(high) + tolerance < optionPrice) return null;

  for (let i = 0; i < 100; i += 1) {
    const mid = (low + high) / 2;
    const modelPrice = priceAt(mid);
    if (Math.abs(modelPrice - optionPrice) <= tolerance) return mid;
    if (modelPrice < optionPrice) low = mid;
    else high = mid;
  }
  const result = (low + high) / 2;
  return Number.isFinite(result) ? result : null;
}

/** Parse exchange expiry dates without silently applying the browser's timezone.
 * ISO dates and DD-MMM-YYYY strings resolve to the requested India exchange cutoff.
 */
export function parseOptionExpiryTimestamp(value: string, cutoff = DEFAULT_EXPIRY_CUTOFF): number | null {
  const text = String(value || '').trim();
  if (!text) return null;

  if (/^\d{10,13}$/.test(text)) {
    const raw = Number(text);
    const timestamp = raw < 1e12 ? raw * 1000 : raw;
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  let datePart: string | null = null;
  const iso = /^(\d{4}-\d{2}-\d{2})$/.exec(text);
  const named = /^(\d{1,2})[- /]?(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[- /]?(\d{2,4})$/i.exec(text);
  if (iso) datePart = iso[1]!;
  else if (named) {
    const month = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(named[2]!.toUpperCase());
    const yearRaw = Number(named[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    datePart = `${year}-${String(month + 1).padStart(2,'0')}-${String(Number(named[1])).padStart(2,'0')}`;
  }

  if (datePart) {
    const timestamp = Date.parse(`${datePart}T${cutoff}+05:30`);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function optionTimeToExpiryYears(expiry: string, observedAt: string): number | null {
  const expiryAt = parseOptionExpiryTimestamp(expiry);
  const observed = Date.parse(observedAt);
  if (expiryAt == null || !Number.isFinite(observed)) return null;
  return Math.max(0, (expiryAt - observed) / YEAR_MS);
}

/** Mid-price is preferable for valuation; fall back to last traded price only when
 * bid/ask are absent or crossed. */
export function valuationPremium(quote: { ltp?: number; bidPrice?: number; askPrice?: number }): number | null {
  const bid = Number(quote.bidPrice);
  const ask = Number(quote.askPrice);
  if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask >= bid) return (bid + ask) / 2;
  const ltp = Number(quote.ltp);
  return Number.isFinite(ltp) && ltp > 0 ? ltp : null;
}

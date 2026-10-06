import { classicDescriptor, type ClassicIndicatorSpec } from './classics/define';
import { registerNativeIndicator, getNativeIndicator, type NativeIndicatorDescriptor } from './NativeIndicator';

export type ClassicIndicatorFamily =
    | 'averages'
    | 'bands'
    | 'oscillators'
    | 'trend'
    | 'volatility'
    | 'volume'
    | 'overlays';

export interface LazyNativeIndicatorCatalogEntry {
    readonly type: string;
    readonly title: string;
    readonly family: ClassicIndicatorFamily;
    readonly multiInstance: true;
}

const CATALOG: readonly LazyNativeIndicatorCatalogEntry[] = [
    ...[
        ['moving-average', 'Moving Average'],
        ['rma', 'Smoothed Moving Average'],
        ['zlema', 'Zero-Lag Exponential Moving Average'],
        ['vidya', 'Variable Index Dynamic Average'],
        ['ma-envelope', 'Moving Average Envelope'],
        ['linear-regression', 'Linear Regression Curve'],
    ].map(([type, title]) => ({ type, title, family: 'averages' as const, multiInstance: true as const })),
    ...[
        ['bollinger-bands', 'Bollinger Bands'],
        ['percent-b', 'Bollinger Bands %B'],
        ['bandwidth', 'Bollinger Bands Width'],
        ['keltner-channels', 'Keltner Channels'],
        ['donchian-channels', 'Donchian Channels'],
        ['chandelier-exit', 'Chandelier Exit'],
        ['chande-kroll-stop', 'Chande Kroll Stop'],
        ['supertrend', 'SuperTrend'],
        ['williams-alligator', 'Williams Alligator'],
        ['gator-oscillator', 'Gator Oscillator'],
    ].map(([type, title]) => ({ type, title, family: 'bands' as const, multiInstance: true as const })),
    ...[
        ['rsi', 'Relative Strength Index'],
        ['stochastic', 'Stochastic'],
        ['stochastic-rsi', 'Stochastic RSI'],
        ['macd', 'MACD'],
        ['ppo', 'Percentage Price Oscillator'],
        ['awesome-oscillator', 'Awesome Oscillator'],
        ['commodity-channel-index', 'Commodity Channel Index'],
        ['williams-percent-r', 'Williams %R'],
        ['chande-momentum-oscillator', 'Chande Momentum Oscillator'],
        ['connors-rsi', 'Connors RSI'],
        ['fisher-transform', 'Fisher Transform'],
        ['trix', 'TRIX'],
        ['true-strength-index', 'True Strength Index'],
        ['smi-ergodic', 'SMI Ergodic Oscillator'],
        ['schaff-trend-cycle', 'Schaff Trend Cycle'],
        ['know-sure-thing', 'Know Sure Thing'],
        ['coppock-curve', 'Coppock Curve'],
        ['detrended-price-oscillator', 'Detrended Price Oscillator'],
        ['rate-of-change', 'Rate of Change'],
        ['ultimate-oscillator', 'Ultimate Oscillator'],
        ['relative-vigor-index', 'Relative Vigor Index'],
        ['relative-volatility-index', 'Relative Volatility Index'],
        ['balance-of-power', 'Balance of Power'],
        ['elder-ray', 'Elder Ray'],
        ['ttm-squeeze', 'TTM Squeeze'],
    ].map(([type, title]) => ({ type, title, family: 'oscillators' as const, multiInstance: true as const })),
    ...[
        ['aroon', 'Aroon'],
        ['average-directional-index', 'Average Directional Index'],
        ['vortex-indicator', 'Vortex Indicator'],
    ].map(([type, title]) => ({ type, title, family: 'trend' as const, multiInstance: true as const })),
    ...[
        ['average-true-range', 'Average True Range'],
        ['historical-volatility', 'Historical Volatility'],
        ['chaikin-volatility', 'Chaikin Volatility'],
        ['mass-index', 'Mass Index'],
        ['standard-deviation', 'Standard Deviation'],
        ['ulcer-index', 'Ulcer Index'],
        ['choppiness-index', 'Choppiness Index'],
    ].map(([type, title]) => ({ type, title, family: 'volatility' as const, multiInstance: true as const })),
    ...[
        ['on-balance-volume', 'On Balance Volume'],
        ['accumulation-distribution', 'Accumulation / Distribution'],
        ['chaikin-money-flow', 'Chaikin Money Flow'],
        ['chaikin-oscillator', 'Chaikin Oscillator'],
        ['ease-of-movement', 'Ease of Movement'],
        ['force-index', 'Force Index'],
        ['klinger-oscillator', 'Klinger Oscillator'],
        ['money-flow-index', 'Money Flow Index'],
        ['negative-volume-index', 'Negative Volume Index'],
        ['positive-volume-index', 'Positive Volume Index'],
        ['price-volume-trend', 'Price Volume Trend'],
        ['volume-oscillator', 'Volume Oscillator'],
        ['pvo', 'Percentage Volume Oscillator'],
        ['volume-flow-indicator', 'Volume Flow Indicator'],
        ['intraday-intensity', 'Intraday Intensity'],
    ].map(([type, title]) => ({ type, title, family: 'volume' as const, multiInstance: true as const })),
    ...[
        ['parabolic-sar', 'Parabolic SAR'],
        ['vwap', 'Volume Weighted Average Price'],
        ['pivot-points', 'Pivot Points Standard'],
        ['52-week-high-low', '52 Week High/Low'],
        ['zigzag', 'ZigZag'],
        ['williams-fractal', 'Williams Fractal'],
    ].map(([type, title]) => ({ type, title, family: 'overlays' as const, multiInstance: true as const })),
] as const;

const LOADERS: Record<ClassicIndicatorFamily, () => Promise<readonly ClassicIndicatorSpec[]>> = {
    averages: async () => (await import('./classics/averages')).averageSpecs,
    bands: async () => (await import('./classics/bands')).bandSpecs,
    oscillators: async () => (await import('./classics/oscillators')).oscillatorSpecs,
    trend: async () => (await import('./classics/trend')).trendSpecs,
    volatility: async () => (await import('./classics/volatility')).volatilitySpecs,
    volume: async () => (await import('./classics/volume')).volumeSpecs,
    overlays: async () => (await import('./classics/overlays')).overlaySpecs,
};

const FAMILY_LOADS = new Map<ClassicIndicatorFamily, Promise<void>>();

function registerSpecs(specs: readonly ClassicIndicatorSpec[]): void {
    for (const spec of specs) registerNativeIndicator(classicDescriptor(spec));
}

/** Metadata-only catalog. Calling this does NOT import a classic indicator implementation. */
export function lazyNativeIndicatorCatalog(): readonly LazyNativeIndicatorCatalogEntry[] {
    return CATALOG;
}

export function isLazyNativeIndicator(type: string): boolean {
    return CATALOG.some((entry) => entry.type === type);
}

export function lazyNativeIndicatorEntry(type: string): LazyNativeIndicatorCatalogEntry | undefined {
    return CATALOG.find((entry) => entry.type === type);
}

export function isLazyNativeIndicatorLoaded(type: string): boolean {
    return getNativeIndicator(type) !== undefined;
}

export async function loadNativeIndicatorFamily(family: ClassicIndicatorFamily): Promise<void> {
    let pending = FAMILY_LOADS.get(family);
    if (!pending) {
        pending = LOADERS[family]().then((specs) => {
            registerSpecs(specs);
        });
        FAMILY_LOADS.set(family, pending);
    }
    await pending;
}

export async function loadNativeIndicatorType(type: string): Promise<NativeIndicatorDescriptor | undefined> {
    const entry = lazyNativeIndicatorEntry(type);
    if (!entry) return getNativeIndicator(type);
    await loadNativeIndicatorFamily(entry.family);
    return getNativeIndicator(type);
}

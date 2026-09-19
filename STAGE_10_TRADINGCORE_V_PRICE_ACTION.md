# Stage 10 — TradingCore V Price Action / Quantitative Structure Engine

**Date:** 2026-09-19  
**Status:** IMPLEMENTED — application build/browser validation pending

## Purpose

Stage 10 makes TradingCore V Price Action a reusable quantitative structure engine rather than a collection of chart-only heuristics.

The canonical implementation lives in:

`src/services/marketData/structureEngine.ts`

The existing chart integration continues to consume:

`tradingCoreVPriceAction(...)`

through `src/services/marketData/indicatorEngine.ts`.

## Structure pipeline

```text
Validated OHLCV candles
        │
        ├── Fractal swing candidates
        │        └── volume-weighted structural points
        │
        ├── KDE price-density candidates
        │        └── local density peaks
        │
        └── ATR-scaled 1D clustering
                 └── support/resistance structure levels
                           │
                           ├── ATR impulse detection
                           │        └── Demand / Supply zones
                           │                 └── mitigation filtering
                           │
                           └── higher-timeframe resampling
                                    └── confluence score adjustment
```

## Implemented behavior

### Quantitative S/R
- Fractal swing detection uses a configurable period.
- KDE uses volume-weighted OHLC price observations.
- Bandwidth is scaled to current ATR and observed price range.
- Density peaks are converted into candidate levels.
- Fractal and KDE candidates are merged using deterministic 1D ATR-scaled clustering.
- Level side is derived from the current spot price.
- Scores are bounded to `[0, 1]`.

### Supply / Demand
- An impulse is identified when candle body exceeds the configured ATR multiplier.
- The candle immediately preceding the impulse becomes the base zone.
- Bullish impulses produce Demand zones.
- Bearish impulses produce Supply zones.
- Forward candles are checked for mitigation.
- Mitigated zones are not returned as active zones.

### Multi-timeframe confluence
- Current candles plus configurable resampled higher-timeframe factors are evaluated with the same structure engine.
- Nearby levels receive a deterministic confluence score increment.
- Overlapping zones receive the same confluence treatment.
- No unavailable market data is fabricated.

## Validation

`src/services/marketData/structureEngine.test.ts` verifies:

1. ATR and structure levels are generated from deterministic synthetic OHLCV data.
2. Level scores remain within `[0, 1]`.
3. Active zones have valid bounds and are unmitigated.
4. MTF confluence produces the expected frame count.
5. Malformed candles are filtered rather than leaking invalid prices.

Source-level result:

`TRADINGCORE_V_STRUCTURE_TEST=PASS`

The full Vite application build and browser-level performance validation remain environment-gated because dependency installation timed out in the current extracted environment.

## Architectural rule

Stage 10 is a **shared structure engine**. Future Levels, TradingCore V overlays, ML features and CoreSpirit market primitives should consume its structured outputs rather than independently reimplementing S/R or Supply/Demand logic.

Stage 11 should extend this structure foundation for the Levels/shared-structure layer; it must not create a competing structure engine.

# TradingCoreOS v0.0.14 — TradingCore V Price Action + indicator reliability

## Added
- `TradingCore V Price Action` chart indicator.
- Fractal swing S/R detection.
- Volume-weighted Gaussian KDE-style S/R density peaks.
- ATR-scaled clustering of nearby levels (DBSCAN-style 1D grouping).
- ATR impulse Supply/Demand zones from the base candle before an impulse.
- Fresh-zone mitigation tracking.
- Multi-timeframe confluence from the current chart plus higher-timeframe resampling when enough history is available.
- Confidence/confluence scores shown in the chart level/zone titles.
- All drawing tools exposed in the Draw menu.

## Fixed
- Daily Pivot Points now aggregate the complete previous session instead of using only one candle.
- Pivot output is expanded to P/R1/R2/R3/S1/S2/S3 so the levels are independently drawable.
- Indicator settings version bumped so stale indicator state is normalized.

## Important
The KDE implementation is browser-native and does not require SciPy. S/R and S&D remain data-driven: unavailable order-flow/options inputs are not fabricated. Higher-timeframe confluence is derived from available chart candles; sufficient history is required for meaningful higher-timeframe context.

- Prediction overlay plotting limit raised from 24 to 39 selected models; each available model still uses its model/algorithm-specific path shape and line style.

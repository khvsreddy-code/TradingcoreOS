# TradingCoreOS v0.0.11 — TradingView indicator integrations

Added native TradingCoreOS equivalents for the four indicator scripts supplied in the user archive:

- HTF 3-Candle System (Zeiierman)
- Trend Target Ribbon [BOSWaves]
- Volatility Shock Half-Life Monitor
- Wyckoff [theUltimator5]

The indicators are registered in the native Indicator Library, available from the Live Trading **Indicators** menu and the Indicators page, and can be saved as part of the user's workspace.

## Implementation notes

These are independently implemented TradingCoreOS calculations based on the supplied script names and the public TradingView descriptions/behavior. They are not a claim of byte-for-byte Pine execution. The HTF system uses a configurable aggregation proxy from the current candle stream; the Trend Target Ribbon uses an ALMA/slope/deviation/ATR planning engine; the volatility monitor tracks event-based shock decay; and the Wyckoff integration maps accumulation/distribution-style events with volume and range context.

The supplied archive is retained under `reference/tradingview-indicators/` for provenance.

## Public references

- https://www.tradingview.com/script/rHOFeLwn-HTF-3-Candle-System-Zeiierman/
- https://www.tradingview.com/script/tnQ7FvvW-Trend-Target-Ribbon-BOSWaves/
- https://www.tradingview.com/script/Hnsqd4yf/
- https://www.tradingview.com/script/tJzKloJn-Wyckoff-theUltimator5/

## Pine + Python + webhook direction

Pine Script cannot itself make arbitrary server-side web requests. The planned TradingCoreOS architecture is therefore:

`Pine-compatible indicator logic -> TradingCore execution adapter -> Python analytics/web-data service -> signed webhook -> TradingCore chart/automation engine`

This keeps broker credentials and external web requests on the server side while allowing indicator calculations to consume additional permitted data sources. This bridge is intentionally not enabled in this release yet.

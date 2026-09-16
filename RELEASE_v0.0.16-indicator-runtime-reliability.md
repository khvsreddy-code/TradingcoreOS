# TradingCoreOS v0.0.16 — Indicator runtime reliability / TradingView-style behavior

## Changes
- Fixed a duplicate `tradingCoreVPriceAction` export that could break TypeScript parsing.
- Added proper chart markers for price-action and advanced indicator events instead of zero-length line series that could render invisibly.
- Marker state is reset when the chart/instrument/timeframe is recreated so signals do not attach to a stale chart instance.
- Extended oscillator-pane detection to include the advanced oscillator-style studies already implemented in the indicator engine.
- Preserved per-indicator settings, line styles, colors, and recalculation on refreshed/live candle data.
- Pivot Points continue to use the previous completed Indian session when enough session history is available; no fabricated previous-session values are introduced when the history is insufficient.

## Important parity note
TradingView indicators execute Pine Script bar-by-bar and can have realtime/repainting semantics that depend on the original Pine source. TradingCoreOS currently implements native TypeScript equivalents for the supplied indicator pack rather than executing Pine Script itself. Exact 1:1 numerical parity for every third-party script requires porting its complete Pine source and reproducing its exact inputs, `request.security()` behavior, `barstate` handling, drawing objects, and realtime semantics.

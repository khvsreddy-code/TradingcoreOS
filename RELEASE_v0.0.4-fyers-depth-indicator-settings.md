# TradingCoreOS v0.0.4 — FYERS depth + TradingView-style indicator settings

## Included

### FYERS realtime architecture
- FYERS SymbolUpdate remains the primary low-latency quote/OHLCV feed.
- Active-chart symbol can also request FYERS DepthUpdate data.
- Normalized market ticks now preserve up to 5 bid/ask levels and order counts when FYERS sends them.
- Live workspace includes an additive `L2` toggle showing 5-level bid/ask depth for the selected instrument.
- Depth is scoped to the selected chart symbol instead of every watchlist symbol.
- Reconnects re-subscribe the active depth symbol.

### Indicator settings
- Added persistent TradingView-style study settings directly to the chart's `Studies` menu.
- Source selector for source-aware indicators: Open, High, Low, Close, HL2, HLC3, OHLC4, HLCC4.
- VWAP now supports configurable source; default remains HLC3/typical price.
- EMA/SMA/HMA, RSI, MACD, Bollinger, Keltner, CCI, OBV, MFI, Stochastic, VWAP deviation bands and Anchored VWAP can use the selected source where mathematically meaningful.
- Per-indicator color, line width and line style.
- Multi-line studies expose secondary/upper/lower colors where applicable.
- Existing period, multiplier, MACD, Stochastic and Ichimoku controls remain available.
- Reset-to-default control per indicator.
- Settings persist in localStorage and are preserved across the release upgrade instead of being disabled/reset.

## Validation

- TypeScript transpile validation passed for all changed TS/TSX files.
- Full dependency-backed `tsc`/Vite build was not run because the archive does not contain installed `node_modules`.

## Scope note

This release adds the 5-level DepthUpdate path. FYERS also exposes a separate Order WebSocket for orders/trades/positions and a TBT WebSocket for 50-level depth; those are intentionally not wired into the browser workspace in this release.

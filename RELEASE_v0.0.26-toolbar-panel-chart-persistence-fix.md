# TradingCoreOS v0.0.26 — Toolbar, Chart Return, and Panel Persistence Fix

## Fixed
- Option Chain no longer unmounts the candlestick chart. The chart remains mounted underneath panels and returns immediately when a panel closes.
- The chart-type toolbar button now acts as a reliable **Return to Chart** control while any workspace panel is open.
- Added a chart-type menu with Candlestick and Close Line modes.
- Wired Fit Chart to the focused chart.
- Wired Undo and Redo toolbar buttons to the focused chart drawing store.
- Wired Replay, Alert, Recent, Object Tree, Alerts, Calendar, and Help buttons to functional workspace panels instead of inert controls.
- Kept Indicators, Levels, Option Chain, AI, Layout, Draw, Crosshair, Buy, Sell, and More actions connected to their existing runtime events.
- Chart panels no longer cover the primary toolbar or bottom workspace navigation, so return/close controls remain reachable.

## Chart implementation
- Lightweight Charts keeps the chart instance and series mounted while workspace panels are displayed.
- Close Line mode uses a synchronized LineSeries populated from the same OHLC history and live bucket updates as the candlestick series.
- This avoids destroying/recreating the chart just to move between Chart and Option Chain.

# TradingCoreOS live-feed + chart-toolbar fix

## Live feed
- FYERS browser fallback quote polling now runs at 500ms only while the stream is stale, with an in-flight guard to avoid overlapping requests.
- The server-side shared FYERS socket now detects when an existing OPEN socket has stopped delivering real market ticks and forces a fresh socket when a subscriber reconnects.
- Actual tick arrival, not the socket handshake, is used as the server's live-data timestamp.
- The existing browser watchdog/reconnect path remains in place.
- Candle updates continue to use the incoming last-trade timestamp and update the forming candle immediately through Lightweight Charts `series.update()`.

## Chart toolbar
- The duplicate embedded chart-control row is hidden for the V4 terminal, which already has the canonical top toolbar.
- Only controls that were present in the embedded row but missing from the top toolbar were added to the top toolbar: `OI`, `L2`, and `Volume`.
- The new top controls dispatch chart-scoped toggle events, so they affect the currently focused chart only.
- Existing top-toolbar controls (timeframes, Indicators, Levels, Option Chain, AI, Layout, Replay, Alert, Draw, fit, undo/redo, etc.) were not duplicated.

## Validation
- TypeScript/TSX syntax transpilation was checked successfully for all four modified source files.
- A full project type-check still requires the project's npm dependencies (`vite/client` was not installed in the provided environment).

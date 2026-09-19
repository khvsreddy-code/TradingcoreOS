# Release v0.0.23 — NIFTY history recovery, TradingView-style initial fit, watchlist quote persistence

## Fixes

- FYERS historical requests now use `cont_flag=0` for non-continuous instruments and index symbols, while retaining `cont_flag=1` for FUT/CE/PE contracts. This avoids the NIFTY index `no_data` / invalid-symbol behavior seen when quotes were live but history was empty.
- The first chart paint no longer calls `fitContent()` across the entire 10,000-candle cache. The full history remains available for indicators and left-edge pagination, while the visible range starts on a recent logical window: approximately three NSE sessions for 1m/3m/5m/15m and a slightly wider window for 30m/1H/1D.
- Watchlist ticks are merged field-by-field instead of replacing the previous tick with a partial reconnect/poll packet. Valid Last, Chg and Chg% therefore remain visible until a newer valid value arrives instead of blinking to `—`.
- Broker symbol aliases are normalized before storing incoming ticks so a feed key variant cannot orphan a quote from its watchlist row.

## Validation

- `node --experimental-strip-types --check src/server/routes/fyers-history.routes.ts` passes.
- Source-level TypeScript parsing was checked with the globally installed TypeScript compiler; full project typecheck/build could not run because this extracted source tree has no installed project dependencies in the build environment.

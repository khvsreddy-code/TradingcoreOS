# TradingCoreOS v0.0.21 — Blank live chart history recovery

## Root cause found in Stage 13

The active progressive FYERS history route had changed the first intraday History API request from the older working 30-day window to a 100-day window. That larger first request can be rejected or return no usable candles depending on the broker-side history window/quota behavior, leaving the new chart lifecycle waiting on an empty history path.

There was also a startup race in `TradingCoreRuntime.getHistoricalData()`: if the chart mounted before broker session restoration completed, it could return an empty array or discard a result when the active broker generation changed.

## Fix

- Restore the conservative 30-day intraday FYERS history window for first paint.
- Keep progressive `before` pagination for older history.
- If the initial FYERS history request fails or returns no candles, recover from the current FYERS quote as a live seed instead of leaving an empty chart.
- Wait for broker-session restoration before deciding that historical data is unavailable.
- Retry historical loading once if the active broker changes during the request.
- Keep OHLC validation/deduplication and the existing 30,000-candle runtime cap.

The live seed is not synthetic historical data; it is the broker's current quote and is immediately updated by the live market stream.

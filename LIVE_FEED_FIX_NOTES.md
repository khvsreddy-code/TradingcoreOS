# TradingCoreOS — Live Feed / Fast Candle Fix

## What was fixed

- Added a silent-feed watchdog to the browser FYERS stream. A socket that remains connected but stops delivering ticks is force-reconnected instead of staying frozen indefinitely.
- Tightened the REST quote fallback from a 2.2s stale threshold / 1.5s poll cadence to ~1.2s stale threshold / 1.0s retry cadence. REST is still only used when the WebSocket is stale.
- Disabled browser caching on fallback quote requests.
- Normalized numeric quote timestamps (seconds vs milliseconds) before sending fallback ticks to the chart.
- Fixed runtime tick ordering to use `lastTradeTimestamp` / `receivedAt` instead of a non-existent `timestamp` field.
- Fixed live candle timestamp parsing for numeric Unix timestamps.
- Fixed candle bucket alignment so intraday/hour/day candles inherit the broker history's existing time grid instead of flooring everything against UTC epoch. This prevents 1H/1D live bars from being created at the wrong boundary.
- Live candle rendering now updates the actual candle timestamp produced by the reconciler, rather than recomputing a potentially different UTC bucket.
- Stopped copying cumulative session volume into each developing candle.

## Expected behavior

1. WebSocket remains the primary low-latency feed.
2. If the WebSocket silently freezes, the fallback quote path starts updating the chart within about a second when the broker quote endpoint is responsive.
3. If both the stream and fallback are stale, the client watchdog forces a fresh stream connection.
4. The current candle is updated directly with `lightweight-charts` on each received tick, so the visual candle does not wait for a historical REST candle refresh.
5. A new candle is created immediately when the live tick crosses the next timeframe bucket.

## Validation

- TypeScript/TSX syntax was parsed successfully for all four changed files.
- Full `npm run lint` could not be completed in this environment because dependency installation timed out and the local `vite/client` type package was incomplete.

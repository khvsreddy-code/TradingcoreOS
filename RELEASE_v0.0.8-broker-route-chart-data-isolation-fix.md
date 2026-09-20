# RELEASE v0.0.8 — Broker Route + Chart Data Isolation Fix

## Fixed

- FYERS live-feed reconnect/error handling now preserves the real server error instead of hiding it behind a generic reconnect state.
- FYERS and Upstox market-feed connection races are guarded so stale sockets cannot overwrite a newer broker route.
- Upstox reconnect timers are cancelled correctly during route/watchlist changes.
- Upstox market-stream failures now surface the actual API error.
- Chart candles are normalized, validated, sorted, and deduplicated by chart-second before being passed to Lightweight Charts.
- Live ticks older than the latest loaded candle are ignored, preventing Lightweight Charts ordering/update assertions.
- The chart is explicitly keyed by `brokerId + instrumentKey`, so switching brokers fully rebuilds the chart.
- Broker switching clears market snapshots, historical caches, and tick timestamps so old-broker data cannot leak into the new broker.
- Late ticks from the previous broker are ignored after a broker switch.
- Portfolio synchronization remains broker-scoped and is re-run for the newly selected primary broker.

## Broker switching contract

When the user changes FYERS ↔ Upstox:

1. Stop the previous broker's market feed.
2. Clear old broker market/cache state.
3. Rebuild the selected instrument/watchlist context for the new broker.
4. Reload historical candles from the new broker.
5. Start the new broker's live feed.
6. Recompute chart analytics/indicators from the new broker's data.
7. Sync funds, holdings, positions, orders, and trades from the new broker.
8. Reject late data from the previous broker.

## Verification note

The uploaded project was patched and statically inspected. A full dependency install/typecheck could not complete in the execution environment because `npm ci` timed out; therefore production Vercel deployment should still run the repository's normal `npm run lint` and `npm run build` checks.

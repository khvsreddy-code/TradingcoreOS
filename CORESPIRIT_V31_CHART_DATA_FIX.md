# TradingCoreOS v31 — Chart Data Fix

## Why the latest chart was worse than the old version

The old TradingCoreOS history path accumulated candles backward in broker-safe windows until it reached the requested target (25k by default). The v30 path changed that behavior to a single ~100-day intraday window and moved the remainder into client-side background requests.

That created a mathematical timeframe regression:

- 5m: roughly 7,500 candles can fit in 100 calendar days.
- 15m: roughly 2,500 candles.
- 30m: roughly 1,250 candles.
- 1H: roughly 625 candles.

Therefore the higher the timeframe, the fewer candles were initially available. The chart was not necessarily missing data; the loader was returning a smaller history set by design.

## What v31 changes

1. Target-based history construction is back.
2. FYERS requests are split into safe calendar windows and merged/deduplicated.
3. The loader continues until 25k candles are reached or older broker data is exhausted.
4. NIFTY50 keeps the epoch/date-format fallback that was added for its symbol-specific behavior.
5. `cont_flag=1` is preserved.
6. Canonical index and derivative symbols are preserved.
7. HistoryStore remains capped at 50k.
8. Client-side older-page sizes are increased for higher timeframes.
9. Shared in-flight requests receive a short grace period before aborting, improving rapid-switch reuse.
10. Generation/lifecycle guards still prevent stale responses from painting the wrong chart.

## Performance philosophy

The goal is now:

**cache hit → immediate paint**

**cold request → dense target history → immediate paint**

**partial broker history → valid available candles → no fabricated candles**

The loader must not sacrifice data density merely because the chart timeframe is higher.

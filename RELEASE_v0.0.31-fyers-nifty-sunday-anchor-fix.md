# TradingCoreOS v0.0.31 — FYERS NIFTY Sunday anchor regression fix

## Exact root cause

The v0.0.30 `latestTradingDate()` implementation subtracted only one UTC day for both Saturday and Sunday. On Sunday that produced Saturday, not Friday. The FYERS History API therefore still received a weekend `range_to` for the NIFTY 50 first-page request. NIFTY 50 can return `no_data` for that weekend endpoint even though live LTP works and another index may appear healthy from cache/series behavior.

## Fix

- Walk backward until the India-local weekday is Monday-Friday.
- Keep the 500-candle first page.
- Keep progressive `before` pagination.
- Keep real FYERS OHLCV only; no synthetic candles.
- Do not reintroduce the `cont_flag` permutation storm.

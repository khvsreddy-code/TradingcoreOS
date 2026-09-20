# Release v0.0.30 — FYERS index history exact root fix

## Root cause
The chart was correctly requesting 500 candles, but the FYERS history request was anchored to the current wall-clock calendar date. On non-trading days this can produce `no_data` for some index series (notably NIFTY 50) while another index may still be served from cache/series behavior. The UI then had no valid historical page to paint.

## Fix
- Anchor FYERS intraday history to the latest completed Indian market weekday.
- For left-pagination, anchor strictly before the requested candle and skip weekends.
- Keep the first page at 500 candles.
- Keep the request inside the broker request gate.
- Allow only one bounded previous-session retry when the initial page contains no candles.
- Remove the legacy route's cont_flag permutation storm.
- Preserve real OHLCV only; no synthetic candles.

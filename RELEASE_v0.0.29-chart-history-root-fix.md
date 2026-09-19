# TradingCoreOS Stage 13 — v0.0.29 Chart History Root Fix

## Root causes addressed

1. FYERS CM pipe symbols such as `NSE_CM|RELIANCE` were being converted to `NSE:RELIANCE`. FYERS history expects the broker symbol, commonly `NSE:RELIANCE-EQ` for an equity contract. CM pipe conversion now preserves an existing suffix or adds `-EQ`.
2. The FYERS history route used a fallback live quote candle when History API failed. This hid the actual history failure and could leave the chart visually empty because the fallback path did not establish a visible range. Synthetic history has been removed.
3. Initial FYERS history now fills the requested page using deterministic broker-safe date windows instead of stopping after the first two candles. Intraday uses 90-day windows; daily uses 366-day windows, within the FYERS documented intraday/daily history availability.
4. The chart now clears invalid data and displays the exact broker/symbol/timeframe history error when real history cannot be loaded.
5. Runtime history cache key was bumped so old results cannot mask the new canonicalization.
6. Progressive pagination remains enabled: initial 10,000 candles, older pages 1,500 candles, application maximum 30,000.

## Data integrity

No synthetic candle is presented as historical data. FYERS History API OHLCV is the only source used for historical chart candles.

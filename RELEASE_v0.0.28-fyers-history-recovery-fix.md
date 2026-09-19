# Release v0.0.28 — FYERS History Recovery / All-Tickers Candle Fix

## Problem
After the previous history patch, live LTP continued to work but the chart stopped receiving usable historical candles across symbols.

## Fix
- Reworked the authoritative `/api/trading/fyers/historical` route to use small broker-safe date windows.
- Tries the documented `yyyy-mm-dd` and epoch date formats.
- Uses no `cont_flag` first for indexes/equities and specific active derivatives.
- Uses `cont_flag=0` only as a compatibility fallback.
- Uses `cont_flag=1` only for derivative symbols as a final fallback.
- Searches backward across multiple windows instead of treating one empty range as no history.
- Retains exact FYERS symbols and existing pipe-form normalization.
- Keeps quote-seed fallback only after genuine history attempts are exhausted.
- Does not fabricate historical series.

FYERS documents the History API as a date-range OHLCV endpoint and distinguishes it from the Quotes API used for real-time data.

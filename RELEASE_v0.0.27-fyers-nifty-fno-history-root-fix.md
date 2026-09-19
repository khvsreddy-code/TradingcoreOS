# Release v0.0.27 — FYERS NIFTY / F&O zero-candle root fix

## Root cause
The FYERS v3 History API treats `cont_flag` as optional; `1` is specifically for continuous futures. The previous TradingCoreOS history route always sent `cont_flag`, and tried `cont_flag=1` first for indexes and specific active F&O contracts. FYERS can respond with `s: "no_data"` for that request even though the same symbol/range has valid history without the flag.

## Fix
- History request order is now: **no `cont_flag` -> `cont_flag=0` -> `cont_flag=1`**.
- Documented `date_format=1` (YYYY-MM-DD) is tried before epoch format.
- Exact FYERS symbols remain unchanged.
- Pipe-form workspace keys such as `NSE_FO|NIFTY26SEPFUT` still normalize to `NSE:NIFTY26SEPFUT`.
- The legacy broker market-data history helper was patched to use the same safe request order.
- No historical candles are fabricated to hide an API failure.

## Validation
- `fyers-history.routes.ts` syntax check passed.
- `broker-market-data.routes.ts` syntax check passed.

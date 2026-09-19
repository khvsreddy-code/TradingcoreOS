# TradingCoreOS v0.0.24 — FYERS Index & Active Derivative History Fix

## Fixed

- Corrected FYERS derivative detection for symbols such as `NSE:NIFTY26SEPFUT` and `NSE:NIFTY...CE/PE` that do not contain a hyphen before `FUT`, `CE`, or `PE`.
- Normalized persisted FYERS pipe-form instrument keys such as `NSE_FO|NIFTY26SEPFUT` into API symbols such as `NSE:NIFTY26SEPFUT`.
- Normalized bare active NIFTY-family futures/options tickers by adding the NSE exchange prefix when required.
- FYERS History requests now try both supported `cont_flag` values before declaring an index/derivative history request empty. This covers the observed FYERS behavior where index history has worked with `cont_flag=1` and active derivative examples use `cont_flag=1`.
- Kept the existing date-format fallback and previous-session probing for weekends/market-closed days.
- No synthetic historical candles are created.

## Validation

- `fyers-history.routes.ts` passes Node TypeScript syntax checking with Node's type-stripping checker.
- The extracted release tree does not include `node_modules`, so a full Vite/TypeScript project build was not run in this archive environment.

## FYERS reference

FYERS documents the History API as the source for OHLCV candles and states that the symbol master is the authoritative way to validate current symbols. FYERS also documents active derivatives as supported historical-data instruments.

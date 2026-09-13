# TradingCoreOS v0.0.0 — broker/history/persistence/performance+ fix

## Fixed in this package
- TypeScript errors reported by Vercel:
  - `Request.tradingCoreUserId` route typing
  - required OAuth parameters after optional parameters
  - numeric option-strike inference in broker adapters
- FYERS market-stream route now uses the FYERS server transport instead of rejecting every FYERS stream request.
- Historical data requests target up to 25,000 candles and the returned client dataset is capped to the newest 25,000 candles. Actual exchange/broker retention limits still apply.
- Removed the globally fixed Studies dock from the app root; Studies now lives in the chart toolbar.
- Added instrument search/suggestions and persistent user watchlists.
- Added custom broker instrument-key entry.
- Added global suggestions for indices, equities, commodity futures and common index futures; the search UI is structured for broker-specific symbol expansion.
- Added an Option Chain workspace mode that replaces the chart and includes a Chart return button.
- Option Chain mode reduces the left-side controls to Option Chain, Orders and Signals.

## Important deployment note
Run a clean install (`npm ci`) before deploying so Vercel compiles against the complete dependency tree. The previous deployment log showed TypeScript diagnostics even though Vercel proceeded to output/deployment.

# TradingCoreOS v0.0.6 — Upstox Vercel Build Fix

## Fixed
- Removed the runtime patch side-effect import from `src/main.tsx` that caused Vercel/Rollup to fail resolving `./services/runtime/brokerRuntimeMarketDataPatch` when the deployment source did not contain that auxiliary file.
- Folded the broker-routing, broker-restore race protection, historical-data cache/dedupe, primary-account switching invalidation, and live-feed routing logic directly into `TradingCoreRuntime.ts`.
- The runtime no longer depends on a separate patch module for production builds.
- Upstox remains routed through the broker-aware market-data client with `full` depth mode.
- FYERS routing remains supported through the same broker-aware runtime.
- Existing UI and indicator/instrument functionality are unchanged.

## Deployment note
The archive is packaged with the project files at the archive root so the `src/` tree is directly visible when the project is extracted/uploaded.

## Validation
- Verified the removed import is absent from the source tree.
- Verified `TradingCoreRuntime.ts` brace/parenthesis balance.
- A full Vite build could not be executed in this environment because dependency installation did not complete before the execution timeout.

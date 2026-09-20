# TradingCoreOS v32 — Chart History Fix

## Root cause isolated
The blank-chart regression was in the new historical-candle path, not the Lightweight Charts renderer or live LTP feed. The v32 path had three conflicting behaviors compared with the working legacy path:

1. `BaseBrokerAdapter` requested a smaller/changed history window (`limit=10000`) and did not expose the legacy abort/older-history contract.
2. `TradingCoreRuntime.getHistoricalData()` could return an empty result during broker rehydration/switch races and had no shared legacy history store.
3. `historyRequestGuard.ts` monkey-patched `getHistoricalData()` on top of the runtime, adding a second request/cache/queue implementation. This could conflict with chart lifecycle and broker switching.
4. Fyers instrument keys were not canonicalized in the v32 `LiveChart` before the history request, while the working legacy chart normalized aliases such as `NSE_INDEX|Nifty 50`, `NSE_INDEX|Nifty Bank`, `NSE_CM|...`, etc.

## Fix
The project remains the v32 codebase. Only chart-history plumbing was changed:

- Restored the legacy `HistoryStore` model and candle request lifecycle.
- Restored the working 20,000-candle initial history request contract.
- Added broker-switch retry and broker-session rehydration handling to the history request.
- Added the legacy Fyers instrument-key canonicalization before requesting candles.
- Added abort-safe chart history requests.
- Added legacy `getHistoricalDataBefore()` support for future/incremental history loading.
- Removed the conflicting `historyRequestGuard` monkey-patch and its imports.
- Kept the v32 chart UI, indicators, OI, L2, live tick handling, and the rest of the application intact.

## Verification
The environment did not have the project's npm dependencies cached, so a full Vite production build could not be executed here. The modified source was checked structurally and the conflicting history guard imports were removed.

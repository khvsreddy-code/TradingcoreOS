# TradingCoreOS — FYERS State

Last updated: 2026-09-21

## Current stage
**v32.7 — FYERS intraday epoch-range candle recovery**

## UI status
**FROZEN.** FYERS work must not change React layout, styling, chart appearance, navigation, or user-facing component structure unless explicitly requested.

## Production incident
The production deployment was using a history route that acquired the FYERS request gate and then called `FyersApiClient`, which acquired the same gate again. This was a self-deadlock. The production main branch is now fixed in commit `111085cb6d399c0242c8a96797f0c95b9dbcc561`.

## Multi-user architecture confirmed
- Supabase is the production broker-session source of truth.
- FYERS sessions are loaded using authenticated `tradingCoreUserId` plus broker ID.
- History cache/in-flight keys are user-scoped.
- No global FYERS access token is used by the dedicated history route.
- The REST gate is keyed by the authenticated FYERS token, isolating broker credentials between users; future scheduler work should preserve this isolation.

## Completed
- FYERS OAuth/session storage
- Dedicated FYERS historical route precedence
- History chunking/normalization/deduplication
- Shared authenticated FYERS REST client
- Quotes/Depth/Market Status
- Full Option Chain v3 preservation
- Symbol masters
- Futures Chain
- Expired F&O
- Market WebSocket SymbolUpdate/DepthUpdate transport
- Order WebSocket transport
- Account read services and margin preflight

## Pending — next order
1. **P0:** Deploy and verify the history deadlock fix with a real authenticated user.
2. **P0:** Verify NIFTY 50 and BANK NIFTY candles across core timeframes.
3. **P0:** Verify live candle updates after historical load.
4. **P0:** Verify left-scroll older-history loading.
5. **P1:** Runtime-smoke-test market and order WebSockets.
6. **P2:** Verify futures/expired-F&O.
7. **P3:** Add option-chain analytics without UI changes.
8. **P4:** Continue GTT/Smart Orders/reports.
9. **P5:** Isolate TBT and later build the unified market-data bus.

## Do not mark complete without verification
- Full build requires complete dependency install and actual build/typecheck.
- Live WebSocket requires authenticated runtime smoke test.
- Candle recovery requires a non-empty production history response.
- Multi-user safety requires user-isolated session/cache testing.

- v32.6: first-paint history target is now one FYERS history window; older candles remain lazy/background.


## v32.7 incident update
- v32.6 is deployed and the history request is executing, but production logs at 11:22:25 UTC showed FYERS returning 0 candles for NSE:NIFTY50-INDEX / 5 without an HTTP error.
- Therefore the previous deadlock and first-paint multi-page diagnosis are no longer sufficient explanations for the current blank chart.
- v32.7 switches intraday history to epoch-second ranges and keeps the range end before the current/resolution candle, while keeping each window below the official 100-day limit. citeturn4search0
- UI remains frozen.
- Runtime verification is pending the new deployment.


## v32.8 deep audit
- `LiveChart.tsx` was inspected through the complete history-to-render path. It calls `getHistoricalData`, normalizes valid OHLC rows, then calls `CandlestickSeries.setData`; no renderer-side condition explains the blank chart when history is empty.
- Production runtime evidence shows the history API itself is returning zero rows.
- v32.8 uses completed-day yyyy-mm-dd backfill ranges and records raw FYERS response metadata for definitive diagnosis.

# TradingCoreOS — FYERS State

Last updated: 2026-09-21

## Current stage
**v32.5 — multi-user FYERS history deadlock fix**

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

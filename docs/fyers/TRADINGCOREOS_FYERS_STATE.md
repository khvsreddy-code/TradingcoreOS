# TradingCoreOS — FYERS State

Last updated: 2026-09-21

## Current stage
**v32.4 — FYERS account + symbol infrastructure**

## UI status
**FROZEN.** FYERS work must not change React layout, styling, chart appearance, navigation, or user-facing component structure unless explicitly requested.

## Completed
- FYERS OAuth/session storage already exists.
- FYERS historical route has dedicated precedence before generic market routes.
- History is chunked according to FYERS broker-safe windows.
- History normalization/deduplication exists.
- History now uses shared `FyersApiClient` + `FyersMarketDataService`.
- Per-user FYERS REST requests share `BrokerRequestGate`.
- Symbol-master download/search exists for NSE/BSE/MCX segments.
- Shared FYERS market transport exists for SymbolUpdate/DepthUpdate, with heartbeat/reconnect and no quote-polling fallback.
- FYERS Order WebSocket transport exists for Orders/Trades/Positions; runtime verification pending.
- Backend-only Quotes endpoint added.
- Backend-only Depth endpoint added.
- Backend-only Market Status endpoint added.
- Backend-only full Option Chain v3 endpoint added.
- Futures Chain backend endpoint added.
- Expired F&O expiry/contracts/historical endpoints added.
- Full option-chain response is preserved for future analytics.
- Dedicated FYERS symbol-master service covers the documented NSE/BSE/MCX masters with daily caching and lookup/search.
- Shared account service now exposes profile, funds, holdings, orders, trades, positions and multi-order margin preflight through the authenticated FYERS client.

## Pending — next order
1. Runtime-smoke-test FYERS market WebSocket SymbolUpdate/DepthUpdate.
2. Runtime-smoke-test FYERS order WebSocket and reconcile with REST snapshots.
3. Verify futures-chain and expired-F&O responses against a connected account.
4. Add option-chain analytics service (expiry selection, PCR/OI/IV/Greeks) without changing UI.
5. Runtime-smoke-test the newly extracted account endpoints and margin preflight.
6. Add GTT and Smart Order services.
7. Add reports.
8. Add screener/price-alert services.
9. Add TBT as an isolated optional service for 50-level depth.
10. Add unified market-data bus only after the current chart feed is verified.

## Do not mark complete without verification
- “Full build passes” requires a complete dependency install and actual build/typecheck.
- “Live WebSocket works” requires an authenticated runtime smoke test.
- “Option chain works” requires a real connected FYERS account and valid index symbol/expiry.
- “Orders work” requires dry-run/preflight tests before any live placement.

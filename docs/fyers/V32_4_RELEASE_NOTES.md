# TradingCoreOS v32.4 — FYERS Account + Symbol Infrastructure

Date: 2026-09-21

## Scope
Backend-only FYERS expansion. UI is frozen.

## Added
- Shared FyersAccountService
- Profile/Funds/Holdings/Orders/Trades/Positions read routes
- Multi-order margin preflight
- Daily FYERS symbol-master service for all documented exchange masters
- Symbol-master search route
- POST capability in shared FYERS REST client for future authenticated operations

## Not added
- Live order placement
- GTT/Smart Orders
- UI changes

## Verification
Changed files pass TypeScript transpilation diagnostics. Full project typecheck remains blocked by incomplete dependency/type packages in the supplied archive. Live broker verification remains pending until a connected FYERS account is available.

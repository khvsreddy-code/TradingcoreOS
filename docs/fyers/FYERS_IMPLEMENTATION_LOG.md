# FYERS Implementation Log

## v32.4 — FYERS account + symbol infrastructure (2026-09-21)

### Completed in this stage
- Added `FyersAccountService` on the shared authenticated FYERS client.
- Added read-only Profile, Funds, Holdings, Orders, Trades and Positions routes.
- Added multi-order margin preflight route; this stage does not enable live order placement.
- Added dedicated daily FYERS symbol-master service covering NSE_CM, NSE_FO, NSE_CD, NSE_COM, BSE_CM, BSE_FO and MCX_COM.
- Added authenticated symbol-master search route.
- Extended the shared FYERS REST client with POST support for future broker operations while keeping the existing GET path unchanged.
- Updated checklist, TODO and state tracking so v32.4 is the recorded current stage.

### Verification state
- Changed TypeScript files pass TypeScript transpilation/syntax diagnostics.
- Full project `tsc --noEmit` remains blocked by the supplied archive dependency set (`vite/client` and related missing type packages).
- Runtime calls requiring a real FYERS account remain unverified.
- Symbol-master network smoke test could not be performed from the build container because outbound DNS/network access is unavailable; official FYERS documentation was verified separately via web.

### Safety
- UI unchanged.
- No live order placement was introduced.
- Margin endpoint is preflight/read-only from TradingCoreOS perspective.
- Existing chart/history route contract and precedence remain unchanged.

## v32.3 — FYERS realtime + derivatives backend (2026-09-21)

### Completed in this stage
- Added Futures Chain service and route.
- Added Expired F&O expiry-date, underlying-contract and historical-data services/routes.
- Added shared FYERS Order WebSocket transport for orders/trades/positions.
- Added NDJSON order-stream route.
- Removed Quotes REST polling from the live market-stream fallback.
- Added data-stream heartbeat and reconnect handling.
- Preserved OHLC fields from SymbolUpdate in normalized market ticks.
- Added FYERS checklist, TODO queue and v32.3 release notes.

### Verification state
- Source-level implementation complete.
- Runtime WebSocket authentication/smoke testing remains pending.
- Full TypeScript/build verification remains blocked by incomplete archive dependencies.

## v32.2 — FYERS backend foundation (2026-09-21)

### Completed in this stage
- Added `src/server/fyers/core/FyersApiClient.ts` as the shared authenticated FYERS REST client.
- Centralized FYERS REST scheduling through the existing per-user `BrokerRequestGate`.
- Added FYERS 429/5xx retry handling with `Retry-After` / `X-Retry-After-Ms` support.
- Added `src/server/fyers/market/FyersMarketDataService.ts` for History, Quotes, Depth, Option Chain v3 and Market Status.
- Moved the active FYERS history implementation onto the shared FYERS client; UI and route contract remain unchanged.
- Added backend-only FYERS endpoints for Quotes, Depth, Market Status and full Option Chain v3.
- Option Chain v3 now preserves the complete FYERS payload instead of collapsing it to a small UI-oriented strike subset.
- Added strikecount (1–50), timestamp and Greeks handling at the backend boundary.
- Kept existing symbol-master search and chart route precedence intact.

### Explicitly NOT done yet
- No React/UI redesign or visual changes.
- No TBT implementation yet.
- No FYERS funds/holdings/positions/margin/GTT/smart-order service extraction yet.
- No screeners/price-alert service extraction yet.
- No replacement of the existing market-stream transport yet.

### Validation
- Full project `tsc --noEmit` could not run cleanly because the supplied archive's `node_modules` is incomplete (`vite/client` and `@types/node` are missing).
- Targeted TypeScript invocation was also blocked by the missing `@types/node` package.
- Therefore this stage is recorded as **source-level implemented / dependency validation blocked**, not “full build verified”.

## Safety constraints
- UI remains frozen.
- Existing `/api/trading/:brokerId/historical` contract remains unchanged.
- FYERS route precedence remains before generic broker market routes.
- No live-order behavior was changed in this stage.

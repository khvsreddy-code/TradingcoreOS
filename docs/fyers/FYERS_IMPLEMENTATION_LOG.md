# FYERS Implementation Log

## v32.5 — Multi-user FYERS history deadlock fix (2026-09-21)

### Incident
- Production deployment `dpl_6SZGKqjyJtPb6xkt11m7v2JpP4Hu` was built from GitHub commit `529d21be295061f093409dac6a40c4d716e393b8`.
- The deployed `fyers-history.routes.ts` acquired `withBrokerRequestGate('fyers', accessToken, ...)`.
- The inner `FyersApiClient` also acquires the same gate before calling FYERS.
- The outer route task therefore waited for a gate that the inner client could not acquire until the outer task released it.
- Production symptoms matched this exactly: blank chart with live LTP/stream still working and repeated Vercel 300-second runtime timeouts.

### Multi-user/Supabase verification
- Production code resolves the FYERS session through `BrokerRepository.getSession('fyers', req.tradingCoreUserId)`.
- `BrokerRepository` reads the Supabase `broker_sessions` row by both `user_id` and `broker_id`.
- History cache/in-flight keys include `userId`, preventing cross-user history sharing.
- The Supabase project connected through the current tool session has the expected `broker_sessions` schema; no session rows were exposed during this diagnostic query. This was treated as a separate environment/configuration observation and not used as evidence to bypass user-scoped session lookup.

### Fix
- Removed the history route's outer `withBrokerRequestGate` acquisition.
- Kept `FyersApiClient` as the single FYERS REST scheduler owner.
- Added explicit user-scoped comments/logging around history requests.
- Kept UI and chart component contracts unchanged.
- Fix committed to `main` as `111085cb6d399c0242c8a96797f0c95b9dbcc561`.

### Verification state
- Source-level fix verified against the actual production main source.
- Runtime deployment verification is still pending.
- Do not mark candle recovery complete until production returns a non-empty candle array for an authenticated user.

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
- Full project `tsc --noEmit` remains blocked by the supplied archive dependency set.
- Runtime calls requiring a real FYERS account remain unverified.
- Symbol-master network smoke test could not be performed from the build container because outbound DNS/network access is unavailable.

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

## v32.2 — FYERS backend foundation (2026-09-21)

### Completed in this stage
- Added `src/server/fyers/core/FyersApiClient.ts` as the shared authenticated FYERS REST client.
- Centralized FYERS REST scheduling through the existing per-user `BrokerRequestGate`.
- Added FYERS 429/5xx retry handling.
- Added History, Quotes, Depth, Option Chain v3 and Market Status services.
- Moved the active FYERS history implementation onto the shared FYERS client.
- Preserved complete option-chain payload.
- Kept existing symbol-master search and chart route precedence intact.

## Safety constraints
- UI remains frozen.
- Existing `/api/trading/:brokerId/historical` contract remains unchanged.
- No live-order behavior was changed in this incident fix.

## v32.6 — FYERS first-paint timeout/root-cause fix (2026-09-21)

### Production evidence
- After v32.5, production `/api/trading/fyers/historical` still returned **502** while `/api/trading/fyers/market-stream`, `/api/trading/fyers/market-data`, `/api/trading/fyers/option-chain`, and broker-session restoration returned 200.
- The chart therefore was not failing inside Lightweight Charts; the historical transport was failing before candles reached the chart.
- Source inspection showed the initial 5m request still targeted **25,000 candles**. FYERS permits at most 100 calendar days per minute-history request, so 25,000 5m candles necessarily requires multiple sequential history calls before first paint. This is incompatible with a fast first-paint path and can exhaust the serverless request window/abort the request under queue/network latency.
- FYERS's official market-data documentation confirms minute resolutions are capped at 100 days/request and that longer ranges must be chunked. citeturn0search0

### Fix
- Initial history target is now bounded to one FYERS minute-history window per resolution: 1m 25k, 3m 12k, 5m 7k, 15m 2.4k, 30m 1.2k, 1H 600, 2H 300, 4H 180, D 300.
- Older history remains lazy/background and can still build toward the 50,000-candle chart cache.
- Added server-side structured FYERS history failure logging (user-scoped, no access token logging) so any upstream FYERS rejection is now directly identifiable.
- UI remains unchanged.

### Verification state
- Fix committed to `main` as `8e0d2298c9c3b4aabbbcf35a54c0a5e301e9ea6c`.
- Runtime verification pending deployment and one chart refresh.

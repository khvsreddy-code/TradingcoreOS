# FYERS LEGACY NOTES

> Consolidated legacy material. The active source of truth is now the four canonical documents in `docs/01-04_*.md` plus `docs/CORESPIRIT_BUILD_TRACKER.md`.

---

# SOURCE: docs/fyers/FYERS_API_COVERAGE.md

# FYERS API Coverage Map

Source basis: official FYERS v3 documentation / FYERSDev `fyers-skills` references reviewed 2026-09-21.

## Market data
| Capability | Status | TradingCoreOS |
|---|---|---|
| Historical candles | Implemented | Dedicated history route + shared client |
| Quotes | Backend endpoint added | `/api/trading/fyers/quotes` |
| 5-level depth | Backend endpoint added | `/api/trading/fyers/depth` |
| Option Chain v3 | Backend endpoint added | `/api/trading/fyers/option-chain-v3` |
| Market status | Backend endpoint added | `/api/trading/fyers/market-status` |
| Futures chain | Backend endpoint added | `/api/trading/fyers/futures-chain` |
| Expired F&O | Backend endpoints added | `/api/trading/fyers/expired-fno/*` |
| Symbol masters | Existing | Daily cached masters/search |

## Realtime
| Capability | Status |
|---|---|
| SymbolUpdate | Hardened; runtime verification pending |
| DepthUpdate | Hardened; runtime verification pending |
| Order socket | Backend transport added; runtime verification pending |
| TBT 50-level | Pending |

## Trading/account
| Capability | Status |
|---|---|
| Orders | Existing broker layer; FYERS full-service extraction pending |
| Multi-order | Pending |
| Async orders | Pending |
| Positions | Existing broker layer; FYERS service extraction pending |
| Funds | Pending |
| Holdings | Pending |
| Margin | Pending |
| GTT/OCO | Pending |
| Smart Orders | Pending |
| Smart Exit / TP-SL | Pending |
| Reports | Pending |
| EDIS | Pending / jurisdiction/API-dependent |

## Intelligence
| Capability | Status |
|---|---|
| Option Greeks | Preserved by full Option Chain response |
| OI / OI change | Preserved by full Option Chain response |
| India VIX | Preserved by full Option Chain response |
| PCR analytics | Pending |
| IV analytics | Pending |
| Screeners | Pending |
| Price alerts | Pending |

## Rules
- Use the official symbol master rather than constructing derivative symbols blindly.
- Use WebSockets for live prices rather than quote polling loops.
- Respect FYERS documented 10 requests/sec, 200 requests/minute and 100,000/day limits.
- Respect order operation limits separately.
- Keep chart/history failure isolated from optional analytics/features.
- Never change UI while completing backend FYERS coverage unless explicitly instructed.


## v32.4 additions
- Account read services: profile, funds, holdings, orders, trades, positions.
- Multi-order margin preflight.
- Dedicated daily symbol-master service across all documented exchange segments.

---

# SOURCE: docs/fyers/FYERS_CHECKLIST.md

# TradingCoreOS — FYERS Implementation Checklist

Last updated: 2026-09-21

Current implementation stage: **v32.7 — FYERS intraday epoch-range candle recovery**

Legend: `[x]` implemented in source, `[~]` implemented but runtime verification pending, `[ ]` not implemented.

## Chart-safe market foundation
- [x] Shared authenticated FYERS REST client
- [x] Per-user REST request gate
- [x] Supabase-backed per-user broker sessions
- [x] User-scoped history cache/in-flight keys
- [x] 429 / Retry-After handling
- [x] 5xx retry/backoff
- [x] History chunking / normalization / deduplication
- [x] Dedicated authoritative FYERS symbol-master service (all 7 documented masters)
- [x] Backend symbol-master search route
- [x] Quotes REST endpoint
- [x] 5-level Depth REST endpoint
- [x] Option Chain v3 raw-preserving endpoint
- [x] Market Status endpoint
- [~] Data WebSocket SymbolUpdate
- [~] Data WebSocket DepthUpdate
- [x] Data WebSocket no longer falls back to quote polling
- [x] Data WebSocket heartbeat + reconnect handling
- [x] **History route does not acquire the FYERS gate before FyersApiClient**
- [x] **Nested FYERS history gate deadlock removed from production main**
- [ ] Production candle regression verified after deployment

## Derivatives data
- [x] Futures Chain REST service/route
- [x] Expired F&O expiry-date service/route
- [x] Expired F&O underlying-contract service/route
- [x] Expired F&O historical-data service/route
- [ ] Expired-F&O chart integration
- [ ] Futures analytics

## Realtime account/trading
- [~] FYERS Order WebSocket transport
- [ ] Order-stream runtime smoke test with connected FYERS account
- [x] Funds service extraction
- [x] Profile service extraction
- [x] Holdings service extraction
- [x] Orders read service extraction
- [x] Trades read service extraction
- [x] Positions read service extraction
- [x] Margin preflight endpoint
- [ ] Live order placement
- [ ] Multi-order service
- [ ] Multi-leg order service
- [ ] GTT/OCO service
- [ ] Smart Order service
- [ ] Smart Exit / TP-SL service
- [ ] Reports service
- [ ] EDIS service

## Analytics / intelligence
- [ ] Option expiry resolver
- [ ] PCR analytics
- [ ] OI / ΔOI analytics
- [ ] IV analytics
- [ ] Greeks analytics
- [ ] India VIX analytics
- [ ] Futures basis analytics
- [ ] Screeners service
- [ ] Price alerts service

## Advanced realtime
- [ ] TBT 50-level isolated service
- [ ] TBT protobuf snapshot/diff state engine
- [ ] Unified market-data event bus
- [ ] Chart/live-candle verification after bus integration

## Release verification
- [ ] Complete dependency install
- [ ] `tsc --noEmit` passes
- [ ] Production build passes
- [ ] FYERS authenticated market-stream smoke test
- [ ] FYERS authenticated order-stream smoke test
- [ ] Candle regression test: selected symbol displays candles
- [ ] Candle regression test: watchlist symbols do not blank
- [ ] Option-chain regression test
- [ ] No UI diff / UI freeze maintained

## v32.5 incident record
- Production deployment commit `529d21be295061f093409dac6a40c4d716e393b8` still wrapped the history route in `withBrokerRequestGate`.
- `FyersApiClient.dataGet()` also acquires that same FYERS gate.
- This creates a self-deadlock for the history request.
- Fix committed to `main` as `111085cb6d399c0242c8a96797f0c95b9dbcc561`.
- Runtime verification is intentionally still pending until the new deployment serves candles.

- [x] Initial history target bounded to one FYERS minute-history window per timeframe
- [~] Structured history failure logging added; runtime cause verification pending


## v32.7 evidence
- [x] Production runtime log captured: history request reaches FYERS and returns 0 candles rather than deadlocking.
- [x] Intraday FYERS history switched to epoch-second range parameters.
- [x] Intraday history window reduced to 99 calendar days to stay below the broker cap.
- [~] Production candle regression verified after v32.7 deployment


## v32.8 — history response/range correction
- [x] Deep code audit traced blank candles to FYERS History returning zero rows before chart paint.
- [x] Removed intraday epoch-range dependency for backfill; use completed trading-day yyyy-mm-dd ranges.
- [x] Added broker response telemetry: status/code/message/candleCount/nextTime (no token data).
- [~] Production verification pending.

---

# SOURCE: docs/fyers/FYERS_IMPLEMENTATION_LOG.md

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
- The chart therefore was not failing inside Vela NativeRenderer; the historical transport was failing before candles reached the chart.
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


## v32.7 — FYERS intraday epoch-range candle recovery (2026-09-21)

### Runtime evidence
- Latest production deployment dpl_Az2EkDPm186eUrEcJAW5oXygJ7CJ is READY and contains the v32.6 main-branch changes.
- At 11:22:25 UTC, authenticated /api/trading/fyers/historical returned 502 for NSE:NIFTY50-INDEX, resolution 5.
- The structured log proved the request was not deadlocked and did not receive an HTTP/broker error: FYERS returned a successful response with 0 candles, producing the route error for zero candles.
- This rules out the chart renderer as the immediate failure and also rules out the earlier nested-gate deadlock as the current cause.
- Official FYERS v3 documentation defines date_format=0 as epoch seconds and date_format=1 as YYYY-MM-DD; intraday requests are capped at 100 days/request. FYERS documents the completed-candle range requirement. citeturn4search0

### Fix
- Added dateFormat support to the shared FyersMarketDataService.history method.
- Changed intraday history requests to use date_format=0 with exact epoch-second range_from/range_to values.
- The first intraday range now ends at least one full requested resolution before the current time, avoiding a date-only midnight boundary.
- Intraday page windows are capped at 99 calendar days, safely below the FYERS 100-day limit.
- Added explicit s=no_data runtime logging with symbol, resolution, date format, range and FYERS nextTime, without logging access tokens.
- UI remains unchanged.

### Commits
- 89620b4223063229422eb24dbce933f5f4ec8035 — add FYERS history date-format support.
- d51803d1f03630a92d61455e142e2fa616bd2289 — use epoch ranges for intraday history.

### Verification state
- Source fix committed to main.
- Deployment and runtime candle verification are still pending.


## v32.8 — Deep blank-chart audit (2026-09-21)

### Finding
- Production logs at 11:32 UTC show the authenticated history route returning 502 because FYERS returned zero candles for `NSE:NIFTY50-INDEX` at `D` and previously at `5`.
- A source audit of `LiveChart.tsx` confirms candle rendering is correctly wired: non-empty normalized history is passed directly to `CandlestickSeries.setData()` and the live tick reconciler only augments that dataset. The blank chart therefore originates upstream of the chart renderer.
- FYERS official documentation supports `date_format=1` yyyy-mm-dd history ranges and identifies `NSE:NIFTY50-INDEX` as a valid index symbol. citeturn4search0turn1search1

### v32.8 fix
- Changed history backfill to documented yyyy-mm-dd ranges ending on the last completed trading day instead of relying on epoch-second ranges during the live session.
- Added broker response telemetry for `s`, `code`, `message`, candle count and `nextTime` without logging tokens.
- UI unchanged.

### Important unresolved discriminator
- If v32.8 still returns `candleCount: 0`, the next runtime log will distinguish FYERS `no_data` from an actual permission/auth response. FYERS support has documented cases where historical data requires the Historical Data permission and a regenerated access token; those cases normally return `code: -403`, so we should not assume permissions until the new response telemetry proves it. citeturn3search0turn3search1

### Commit
- `fb0cf18c4f4739a7fee58ae30f81e69696765e29`


## v121 — 5k request optimization

The Fyers history endpoint continues to expose a 5,000-candle page for the chart. The server now derives its request lookback from the selected resolution and requested page size, with a market-session safety multiplier. This avoids requesting an unnecessarily large 30/50/90/180-day window and trimming it after the broker response. Older pages remain keyed by the exact oldest candle boundary, deduplicated in flight, and cached briefly in memory.

---

# SOURCE: docs/fyers/FYERS_TODO.md

# TradingCoreOS — FYERS TODO / Execution Queue

Last updated: 2026-09-21

## Current stage — v32.7 FYERS intraday epoch-range candle recovery

### P0 — restore and verify candles
1. **DONE:** Confirm v32.6 deployed to production.
2. **DONE:** Capture runtime evidence showing the history route reaches FYERS but receives 0 candles with no broker error.
3. **DONE:** Change intraday history requests to FYERS epoch-second ranges so range_to is before the current/resolution candle instead of a date-only boundary.
4. **DONE:** Keep intraday windows below the 100-day broker boundary.
5. **NEXT:** Deploy and reproduce one authenticated 5m request.
6. **NEXT:** Verify returned candle count and oldest/newest timestamps in Vercel runtime logs.
7. **NEXT:** Verify BANK NIFTY, then NIFTY 50, across 1m/3m/5m/15m/30m/1H/1D.
8. **NEXT:** Verify live candle updates after historical candles render.
9. **NEXT:** Verify left-scroll older-history pagination.
10. Do not add new FYERS feature work until candle recovery is cleared.

## Multi-user safety
1. Broker sessions must always resolve from `broker_sessions.user_id = req.tradingCoreUserId`.
2. Never use a global FYERS access token for chart/history/account requests.
3. History cache and in-flight request keys must include user ID.
4. Broker request scheduling must not allow one user's token/session state to be reused by another user.
5. Keep Supabase as the production broker-session source of truth.
6. Runtime tests must cover two authenticated users using different FYERS sessions.

### P1 — realtime
1. Runtime-smoke-test SymbolUpdate.
2. Runtime-smoke-test DepthUpdate.
3. Runtime-smoke-test Order WebSocket.
4. Reconcile order/trade/position events against REST snapshots.
5. Do not treat a socket event as the permanent source of truth without reconciliation.

### P2 — derivatives
1. Verify Futures Chain against a live index/underlying.
2. Verify expired-F&O expiry dates.
3. Verify expired-F&O contract lookup.
4. Verify expired-F&O historical candles with OI/Greeks.
5. Preserve raw payload first; add typed normalization after observing live payloads.

### P3 — analytics
1. Build expiry resolver from FYERS expiryData.
2. Build PCR/OI/ΔOI calculations.
3. Build IV/Greeks aggregation.
4. Build futures basis analytics.

### P4 — account/trading
1. Runtime-smoke-test profile/funds/holdings/positions/orders/trades.
2. Runtime-smoke-test margin preflight.
3. Add strict symbol/lot/tick preflight before any future live order path.
4. Add multi-order / multi-leg.
5. Add GTT/OCO.
6. Add Smart Orders / Smart Exit / TP-SL.
7. Add reports.
8. Add EDIS only where required and supported.

### P5 — advanced
1. Isolate TBT behind a separate service.
2. Implement protobuf snapshot + diff state correctly.
3. Respect TBT limits: 3 connections/user, 5 symbols/connection.
4. Build unified market-data bus only after chart regression passes.

## Stop conditions
- If candles disappear, stop feature work and restore chart path first.
- If FYERS returns 401/invalid token, do not retry indefinitely; require broker re-authentication.
- If 429 occurs, honor broker retry headers and reduce background work.
- If a new feature requires a UI change, stop and ask the user before changing UI.
- Never mark runtime functionality as verified from source inspection alone.

### New P0 evidence
- Production history returned 502 after the deadlock fix.
- 5m first paint was still asking for 25k candles, requiring multiple FYERS 100-day chunks.
- v32.6 now keeps first paint within one history window; verify production response next.


## v32.8 — P0 candle recovery
1. **DONE:** Audit browser chart path and confirm `LiveChart` paints candles when history rows exist.
2. **DONE:** Audit runtime path and confirm `/api/trading/fyers/historical` reaches FYERS and returns 0 rows.
3. **DONE:** Switch backfill to FYERS documented yyyy-mm-dd ranges ending on completed trading days.
4. **DONE:** Add raw broker-response metadata logging to distinguish `no_data`, permission/auth, and valid empty responses.
5. **NEXT:** Verify production 5m and 1D requests return candleCount > 0.
6. **NEXT:** Verify BANK NIFTY and NIFTY 50, then all supported timeframes.
7. **NEXT:** Verify today's live candle joins historical data.
8. **NEXT:** Verify older-history pagination.

---

# SOURCE: docs/fyers/FYERS_UI_FREEZE.md

# FYERS UI Freeze

The TradingCoreOS UI is frozen during FYERS backend expansion.

Backend work may add services, routes, schedulers, caches, WebSocket handling and analytics infrastructure.

Do not:
- redesign the terminal
- alter chart styling/layout
- move panels
- change watchlist layout
- change navigation
- replace existing UI components
- change visible labels solely to fit backend architecture

Only change UI when the user explicitly requests a UI change.

The chart is a protected subsystem. Optional FYERS features must fail independently and must not blank or replace an otherwise working chart.

## Explicit terminal UI exceptions — v99–v101

The freeze remains the default rule for unrequested UI changes. The terminal changes recorded in v99, v100 and v101 are explicit user-requested exceptions and therefore do not authorize unrelated FYERS UI redesign outside the requested terminal scope.

## v102 UI ownership boundary — 2026-09-29

v102 changes only terminal presentation/lifecycle ownership. FYERS transport, authorization, quote heartbeat, historical data, option-chain and execution contracts remain behind the existing service/runtime boundaries.

The right dock is a UI consumer of normalized runtime state; it is not a FYERS API client. The terminal is mounted through the existing React application root rather than a separate DOM/bootstrap host.

## v104 demand-driven history + multi-chart budget — 2026-09-29

The v103 shared chart data plane is now refined so history initialization, older-page acquisition and compute inputs scale by actual user demand. Initial chart paint is bounded to 300–1,500 candles by timeframe; visible-range movement requests one bounded older page; only the active chart is eligible for a single low-priority warm page. A global `ChartHistoryCoordinator` limits browser history requests to two concurrent operations.

The `HistoryStore` remains reusable retention up to 50,000 candles, but `ChartDataPlane` materializes only its active demanded window. Cached older data is reused through binary-search `getBefore()` before issuing a broker request.

The client/runtime/server history contract now forwards and validates an explicit `limit`, removing the old fixed-size initial request path. The chart compute coordinator also protects pathological deep-history states with a 10,000-candle worker input ceiling while preserving the v103 bounded worker pools and dataset/revision cache identity.

For older-history prepends, logical viewport state is restored with the logical-range API so user navigation does not jump.

**Non-interference:** CoreSpirit language/compiler/IR/VM, execution/risk authority, terminal dock ownership, drawing semantics, and shared realtime symbol-feed ownership remain unchanged.

---

# SOURCE: docs/fyers/TRADINGCOREOS_FYERS_STATE.md

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

---

# SOURCE: docs/fyers/V32_2_RELEASE_NOTES.md

# TradingCoreOS v32.2 — FYERS Backend Foundation

Date: 2026-09-21

This release expands FYERS support without changing the UI.

### Added
- Shared FYERS REST client with authentication, retry and rate-limit handling.
- Shared market-data service.
- Quotes endpoint.
- Depth endpoint.
- Market Status endpoint.
- Full Option Chain v3 endpoint with expiry timestamp, strike count and Greeks controls.

### Changed
- Existing FYERS history route now uses the shared FYERS client/scheduler.
- Full option-chain payload is retained instead of trimming it to a UI-specific subset.

### Not changed
- React UI.
- Existing chart visual design.
- Existing route contract for historical candles.
- Live order behavior.

### Verification limitation
The archive's dependency tree is incomplete, so full TypeScript/build verification is not claimed.

---

# SOURCE: docs/fyers/V32_3_RELEASE_NOTES.md

# TradingCoreOS v32.3 — FYERS Realtime + Derivatives Backend Stage

Date: 2026-09-21

## Added
- FYERS Futures Chain backend service and route.
- FYERS Expired F&O expiry-date route.
- FYERS Expired F&O underlying-contract route.
- FYERS Expired F&O historical-data route with optional OI and Greeks.
- Shared FYERS Order WebSocket transport for Orders, Trades and Positions.
- NDJSON order-stream route for backend consumers.

## Realtime hardening
- Removed authenticated `/quotes` polling as the live market-stream fallback.
- Added market WebSocket heartbeat and reconnect handling.
- Preserved the existing market-stream route contract.
- Added OHLC fields from FYERS SymbolUpdate payloads to normalized market ticks.

## UI
- No React/UI files intentionally changed.
- Chart layout and visual contract remain frozen.

## Source verification basis
Official FYERS references reviewed for this stage document:
- Data WebSocket: `wss://api.fyers.in/socket/v2/data/`, SymbolUpdate/DepthUpdate, dynamic subscriptions and 5000-symbol connection limit.
- Order WebSocket: `wss://socket.fyers.in/trade/v3`, Orders/Trades/Positions, 10-second ping guidance.
- Futures Chain: `/data/futures-chain`.
- Expired F&O: `/data/history/fno/expired/expiry-dates`, `/underlying-symbols`, `/historical-data`.

## Verification status
Source-level changes completed. Runtime authentication/smoke testing is still required before marking the WebSocket features fully verified.

---

# SOURCE: docs/fyers/V32_4_RELEASE_NOTES.md

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

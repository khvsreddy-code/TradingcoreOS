# TradingCore Repair Tracker

Updated: 2026-10-04
Source build: `TradingcoreOS-main new updates(2).zip`

## Purpose

This file tracks the current repair pass across the market-data pipeline. Each defect is fixed and verified separately so a later repair does not silently undo an earlier one.

## Current overall status

- Repair pass: **ACTIVE**
- Patched: **4**
- Parser-verified: **4**
- Runtime-verified: **0**
- Confirmed pending defects: **4**
- Verification rule: a repair is only marked complete after static/type/build verification and, where broker credentials permit, runtime verification.

## Repair queue

| ID | Area | Severity | Defect | Status | Evidence / file |
|---|---|---:|---|---|---|
| TC-R01 | FYERS historical data | Critical | Client sends `before`, but the FYERS history route ignored it and always requested a window ending at current time. Older-history pagination therefore returned the same recent dataset and the chart filtered it away. | **FIXED — VERIFY RUNTIME** | `src/server/routes/fyers-history.routes.ts` |
| TC-R02 | Live subscriptions | Critical | FYERS/Upstox shared broker transports remove an instrument from the broker subscription when one consumer unsubscribes, without checking whether another consumer still needs it. | **FIXED — STATIC VERIFY** | `src/server/marketData/FyersMarketDataTransport.ts`, `src/server/marketData/UpstoxMarketDataTransport.ts` |
| TC-R03 | FYERS REST fallback | High | Stale-tick fallback can trigger REST quote polling at a very short cadence, competing with history/other broker requests. | **FIXED — STATIC VERIFY** | `src/services/marketData/BrokerMarketDataClient.ts` |
| TC-R04 | Chart diagnostics | Medium | There are numerous local cleanup/optional-feature catches, but the main historical-load path already logs the real error and sets chart error state. This is now treated as diagnostic debt rather than a confirmed chart-data blocker. | **DEFERRED / RECLASSIFIED** | `src/components/workspace/LiveChart.tsx` |
| TC-R05 | Upstox live feed | High | No equivalent silent-feed watchdog/recovery path. A stream can remain connected while ticks stop arriving. | **PATCHED — STATIC VERIFY** | `src/services/marketData/UpstoxMarketDataClient.ts` |
| TC-R06 | Option chain | Medium | Some option-chain UI paths read `changeOi`, while normalized contracts expose `previousOi` / `oiChange` / derived deltas. This creates zero/missing ΔOI in affected UI paths. | **FIXED — STATIC VERIFY** | `src/components/workspace/FullWorkspaceView.tsx` |
| TC-R07 | History architecture | Medium | Initial history is bounded to 10k while the runtime target is higher; progressive backfill must be reliable before the larger history target is meaningful. | **PENDING / depends on R01** | `BaseBrokerAdapter.ts`, `TradingCoreRuntime.ts`, `LiveChart.tsx` |
| TC-R08 | Route duplication | Medium | Multiple broker/history/option-chain routes and legacy/generic paths increase the chance that a fix is applied to one route while another route handles the request. | **PENDING — AUDIT AFTER HIGHER PRIORITY FIXES** | `server.ts`, `src/server/routes/*`, broker adapters |

## Renderer/language boundary cutover — 2026-09-29

This repair pass now includes the chart backend cutover as a protected boundary. The existing market-data fixes remain in force; this section tracks the renderer/language change separately so it cannot regress history, live-feed or broker behavior.

- [x] Production chart backend locked to `vela-native`.
- [x] External scripting compatibility translator/runtime/catalog removed from application source.
- [x] Existing TCO chart controller/navigation contracts preserved.
- [x] Vela vendored with `LICENSE` + `NOTICE`; native attribution remains enabled.
- [x] `/live` and oscillator chart switched to the Vela-backed facade.
- [x] CoreSpirit community catalog now uses versioned TCO publications.
- [ ] Full browser smoke verification against the live deployment.
- [~] D1 typed-array Vela ingestion — canonical worker transport is patched; direct Vela typed ingestion remains next.
- [ ] D2 viewport-aware Vela LOD binding.

## TC-R01 — Detailed repair

### Root cause

`BaseBrokerAdapter.getHistoricalDataBefore()` already sent:

`before=<oldest candle timestamp>`

but `fyers-history.routes.ts` did not consume that query parameter. It always used `now` as the history end date.

### Repair

The FYERS route now:

1. Parses and validates `before` as an ISO timestamp.
2. Includes the `before` value in the cache/in-flight key.
3. Sets the broker history end timestamp to **one second before `before`**.
4. Uses epoch (`date_format=0`) so the boundary is exact instead of being truncated to an India calendar date.
5. Keeps the existing bounded lookback window based on resolution.
6. Does **not** fall back to the current live quote when processing a paged `before` request.
7. Returns `before`, `oldestTimestamp`, and `newestTimestamp` metadata for diagnostics.

FYERS documents the History API as date-range based and supports epoch or date-string ranges; FYERS also documents that history candle timestamps represent the start of each candle interval. citeturn180028search0turn180028search6

### Verification status

- [x] Client already passes `before`.
- [x] Server now parses `before`.
- [x] Server now builds an older date window from `before`.
- [x] Cache key separates paged requests from latest-history requests.
- [x] Current-quote seed is disabled for paged requests.
- [ ] Runtime call against a connected FYERS account.

## TC-R02 — Detailed repair

### Root cause

The shared FYERS and Upstox server transports stored broker subscriptions as one global `Set`. When one HTTP consumer disconnected, its symbols were removed from that global set even when another active consumer still used them.

### Repair

Each server transport now records a per-listener symbol ownership map and recomputes the broker-level union after a consumer disconnects. A broker unsubscribe is sent only for symbols that no remaining listener owns. FYERS depth requests are tracked separately as well.

### Verification status

- [x] Per-listener ownership map added to FYERS transport.
- [x] Per-listener ownership map added to Upstox transport.
- [x] Broker unsubscribe now uses remaining-consumer union.
- [ ] Runtime two-consumer test with one subscriber disconnecting.

## TC-R03 — Detailed repair

### Root cause

The browser FYERS fallback checked staleness every 350 ms and could issue another REST quote request as soon as the previous request finished. A stale stream could therefore create repeated quote traffic while history and option-chain requests were competing for broker quota.

### Repair

The fallback now considers a stream stale after 3 seconds and limits quote fallback requests to one attempt every 3 seconds per shared stream. The scheduler itself runs at a 1-second cadence without sending REST traffic while the stream is healthy.

### Verification status

- [x] Added `lastQuotePollAt` throttle.
- [x] Increased stale threshold from 650 ms to 3 seconds.
- [x] Reduced scheduler frequency from 350 ms to 1 second.
- [ ] Runtime request-volume verification during a real stale-feed condition.

## TC-R06 — Detailed repair

### Root cause

`FullWorkspaceView` rendered `changeOi`, while current normalized option contracts expose `oiChange` or `previousOi`. This made affected rows/aggregates read as zero even when OI deltas existed.

### Repair

Added one display-boundary `oiChange()` normalizer with this precedence:

`oiChange` → `changeInOI` → legacy `changeOi` → `oi - previousOi` → `0`

The aggregate and row-level ΔOI values now both use that canonical calculation.

### Verification status

- [x] Aggregate Call ΔOI fixed.
- [x] Aggregate Put ΔOI fixed.
- [x] Row-level Call ΔOI fixed.
- [x] Row-level Put ΔOI fixed.
- [ ] Live option-chain payload verification for both brokers.

## TC-R05 — Detailed repair

### Root cause

The browser-side Upstox normalized stream relied on the HTTP stream closing to trigger recovery. A connected-but-silent stream had no health check.

### Repair

Added a 2-second watchdog that only activates recovery after the shared stream has previously delivered at least one tick and then produces no stream event for 15 seconds. This avoids reconnect loops for symbols that are simply illiquid or have not traded yet.

### Verification status

- [x] Watchdog lifecycle tied to the shared stream.
- [x] Silent-stream timeout set to 15 seconds after proven activity.
- [x] No watchdog churn before the first tick.
- [ ] Runtime stale-stream simulation.

## Next repair order

1. **TC-R01 runtime verification**
2. **TC-R02 runtime two-consumer subscription test**
3. **TC-R03 runtime fallback request-volume verification**
4. **TC-R05 runtime stale-stream simulation**
5. **TC-R06 live option-chain payload verification**
6. **TC-R07 end-to-end history target behavior**
7. **TC-R08 route consolidation/audit**


## Validation run — 2026-09-24

- TypeScript/TSX parser transpilation check: **PASS** for all 6 modified source files.
- Full `tsc --noEmit`: **NOT RUN TO COMPLETION** because the supplied ZIP does not include dependencies and the attempted dependency install was interrupted by the execution environment timeout.
- Full Vite production build: **NOT VERIFIED** for the same dependency reason.
- Broker runtime verification: **NOT YET AVAILABLE** from this offline source audit because no connected broker session is exposed in the archive.

The repair pass therefore distinguishes **patched/parser-verified** from **runtime-verified**.

## Repair discipline

- Do not rewrite unrelated UI while repairing the market-data pipeline.
- Do not mark a defect fixed because a build passes alone.
- Preserve previously repaired behavior while changing the next layer.
- Record the exact root cause, code location, fix, and verification state here after every repair.


## Repair pass — 2026-09-24 (FYERS feed stall + top toolbar)

- **TC-R09 — FYERS long-lived stream lifecycle**: PATCHED — runtime pending. Browser stream now rotates before the Vercel function ceiling and server listeners clean up on response close. Files: `src/services/marketData/BrokerMarketDataClient.ts`, `src/server/routes/broker-market-data.routes.ts`.
- **TC-R10 — stale feed fallback request pressure**: PATCHED — runtime pending. REST quote fallback waits for 3s of tick silence and is throttled to one attempt per second per shared stream. File: `src/services/marketData/BrokerMarketDataClient.ts`.
- **TC-R11 — top toolbar menus disconnected from chart UI**: PATCHED — deployment/runtime pending. AI opens model selection, Indicators opens its chooser, and Draw opens drawing tools even when the embedded chart toolbar is hidden. Files: `src/components/workspace/LiveChart.tsx`, `src/LiveTradingTerminalV4.tsx`.
- **Validation**: GitHub main updated; Vercel deployment for the toolbar patch was building and the subsequent feed-throttle deployment was queued at last check. No successful production build or connected-FYERS runtime test is claimed yet.
- **Reliability limitation**: continuous feed is best-effort; no client can guarantee ticks during broker outages, network loss, market closure, expired authorization, or symbol/subscription errors. UI should communicate stale/disconnected status rather than imply fresh prices.

- **TC-R12 — candle heartbeat**: PATCHED 2026-09-24. FYERS Quotes API now runs every ~3.5s as an explicit chart recovery heartbeat rather than only after detected staleness. Each request has a ~2.5s broker timeout; the next heartbeat retries.
- **TC-R13 — browser tab recovery**: PATCHED 2026-09-24. Returning to the TradingCore browser tab/focus immediately triggers a quote refresh and stale-stream reconnect instead of waiting for throttled background timers.
- **TC-R14 — quote starvation**: PATCHED 2026-09-24. The fast FYERS quote heartbeat no longer waits behind the heavier shared REST queue; this prevents historical/portfolio/options calls from starving chart price refreshes. The heartbeat remains low-frequency (~17 requests/minute per connected terminal), far below the documented Quotes batch size of 50 symbols/request.
- **TC-R15 — long-lived Vercel stream**: The WebSocket relay remains an acceleration/depth path, but chart correctness no longer depends on it staying alive for five minutes. Production timeout logs still exist for older live-stream requests and will be checked against the new deployment after rollout.


- **TC-R16 — focus-driven market-stream churn**: PATCHED 2026-09-24. Removed `focused` from the `LiveTradingTerminalV4` market-data subscription effect so changing chart focus no longer unsubscribes/resubscribes the terminal feed. File: `src/LiveTradingTerminalV4.tsx`.
- **TC-R17 — React/remount stream teardown churn**: PATCHED 2026-09-24. Added a 4s terminal-stream unsubscribe grace period plus centralized FYERS stream disposal, so transient chart/layout remounts can reuse the existing transport instead of opening another HTTP stream. File: `src/services/marketData/BrokerMarketDataClient.ts`.
- **TC-R18 — single-symbol watchdog false reconnects**: PATCHED 2026-09-24. Watchdog now uses shared feed activity (WebSocket tick or quote-heartbeat activity) instead of treating any quiet instrument as a dead terminal stream. This prevents one inactive/illiquid symbol from restarting the entire feed. File: `src/services/marketData/BrokerMarketDataClient.ts`.


## Terminal shell consolidation — 2026-09-28

This UI pass is intentionally outside the market-data repair queue. The chart/feed runtime remains the existing repaired path; the change is limited to the live terminal composition and workspace chrome.

- **TC-UI-99 — canonical terminal shell:** PATCHED. `/live` now has one shell owner (`LiveTradingTerminal` → `LiveTradingWorkspace`) instead of a terminal host plus a second modal/controller layer.
- **TC-UI-100 — chart-first layout:** PATCHED. The persistent left-side watchlist/drawing rail is no longer mounted by the live workspace. The chart occupies the central work area.
- **TC-UI-101 — right dock consolidation:** PATCHED. Watchlist, Level 2, and alerts share one resizable/collapsible right dock.
- **TC-UI-102 — bottom terminal dock:** PATCHED. Positions, orders, trades, activity, strategy log, and order ticket are docked beneath the chart rather than opened as separate workspace modals.
- **TC-UI-103 — duplicate Pro workspace:** PATCHED. `src/TradingCoreProWorkspace.tsx` was removed because no source imports it and the canonical workspace already owns `/live`.
- **TC-UI-104 — workspace persistence:** PATCHED. Right-dock tab and bottom-dock tab are now snapshot-compatible.

### UI-shell validation

- [x] Source/TSX parser validation for all modified TS/TSX files.
- [x] Existing architecture, route, hardening, CoreSpirit, and indicator community contract tests pass.
- [x] New `terminalShellContract.test.mjs` passes.
- [ ] Full `tsc --noEmit` in this archive environment; npm dependency installation could not complete because registry access/install execution timed out.
- [ ] Full Vite production build in this archive environment for the same dependency limitation.
- [ ] Browser/runtime visual verification after deployment.

**Non-interference rule:** no feed subscription, history pagination, quote fallback, chart-data, or CoreSpirit runtime path was intentionally altered in TC-UI-99 through TC-UI-104.


## Terminal visual-density pass — 2026-09-29

This UI pass follows the v99 terminal-shell consolidation and changes presentation only. The intent is to remove the SaaS-style “card everywhere” treatment from `/live` while preserving the terminal hierarchy and all existing functional contracts.

- **TC-UI-105 — terminal surface flattening:** PATCHED. Chart infrastructure, right dock, bottom dock and workspace chrome no longer use decorative cards, large radii or drop shadows.
- **TC-UI-106 — radius policy:** PATCHED. Infrastructure is 0–2px; controls are 0–4px; popovers are capped at 6px; major dialogs retain their existing higher-level allowance outside the live terminal.
- **TC-UI-107 — separator-first density:** PATCHED. Information grouping now relies on thin dividers, typography and spacing instead of nested bordered cards.
- **TC-UI-108 — terminal-only scope:** PATCHED. The visual layer is scoped to `.tc4` / live terminal surfaces so the landing page retains its premium/glow design.
- **TC-UI-109 — visual regression guard:** PATCHED. Added `src/terminalVisualDensityContract.test.mjs` to guard the terminal radius/shadow contract.

### v100 UI validation

- [x] v100 visual-density CSS contract added to the canonical live workspace.
- [x] Standalone terminal polish stylesheet aligned with the same rules.
- [x] Terminal-only scope verified; no landing-page selectors were rewritten.
- [x] `terminalVisualDensityContract.test.mjs` passes with Node-level static assertions.
- [ ] Full dependency-backed typecheck/build in this archive environment.
- [ ] Browser/runtime visual verification after deployment.

**Non-interference rule:** v100 does not alter broker transport, history pagination, quote fallback, chart data-plane logic, CoreSpirit compiler/IR/VM, or execution behavior.

## Terminal hierarchy + right dock system — 2026-09-29

This is the requested continuation of the v99/v100 live-terminal work. It is deliberately isolated from the market-data repair queue.

- **TC-UI-110 — two-level chrome still read as separate dashboard containers:** PATCHED. Terminal command chrome and chart-tool chrome now form a continuous compact infrastructure stack with reduced height, minimal borders, and no decorative surface treatment.
- **TC-UI-111 — chart grid retained card semantics:** PATCHED. Chart cells no longer use outer borders/radius; multi-chart layouts use a 1px separator field and a shared canvas background.
- **TC-UI-112 — floating drawing rail visual language:** PATCHED. Drawing infrastructure is now integrated into the chart edge with no shadow/backdrop blur and a thin separator.
- **TC-UI-113 — right dock state was component-local:** PATCHED. `rightDockOpen`, `rightDockTab`, and `rightDockWidth` are now workspace-owned and snapshot/cloud persisted.
- **TC-UI-114 — right dock was still named around watchlist:** PATCHED. Canonical implementation is now `RightTerminalDock`; `WatchlistDock` remains a compatibility export so existing imports do not break.
- **TC-UI-115 — dock interaction contract was implicit:** PATCHED. Added a right-dock tab registry, ARIA tab/tabpanel wiring, shortcut labels, and Alt+1/2/3 + Alt+0 keyboard controls.
- **TC-UI-116 — dock lifecycle/status was visually ambiguous:** PATCHED. Added a compact status footer and kept panel content within one dock surface rather than modal windows.

### v101 non-interference assertions

- [x] No new market-data subscription is created per right-dock panel.
- [x] Watchlist, Order Book and Alerts consume existing selected-instrument/tick context.
- [x] Historical candle request ownership remains in the chart/data plane.
- [x] CoreSpirit/compiler/IR/VM execution boundaries are unchanged.
- [x] Broker execution remains behind the existing runtime contracts.

### v101 validation

- [x] Node-level terminal shell contract passes.
- [x] Node-level visual density contract passes.
- [x] Node-level right dock system contract passes.
- [ ] Dependency-backed TypeScript/Vite build in the offline archive environment.
- [ ] Connected FYERS runtime smoke test after deployment.
- [ ] Browser visual verification at desktop/tablet/mobile widths.

## Terminal dock subsystem + React-root consolidation — 2026-09-29

This is the direct continuation of TC-UI-110 through TC-UI-116. The work is UI/lifecycle architecture only and remains outside the market-data repair queue.

- **TC-UI-117 — right dock internals were monolithic:** PATCHED. `RightTerminalDock` is now the canonical shell with independently renderable `WatchlistSurface`, `OrderBookSurface`, and `AlertsSurface` surfaces.
- **TC-UI-118 — compatibility naming obscured canonical ownership:** PATCHED. `LiveTradingWorkspace` imports `RightTerminalDock` directly; `WatchlistDock` is reduced to a compatibility re-export.
- **TC-UI-119 — dock keyboard model was shallow:** PATCHED. Added roving tab focus plus Arrow/Home/End tab navigation while preserving Alt+1/2/3 and Alt+0 terminal shortcuts.
- **TC-UI-120 — dock width bounds were duplicated in event/UI paths:** PATCHED. Width clamping is centralized in the canonical dock shell and the workspace remains the persistence authority.
- **TC-UI-121 — terminal still exposed legacy HTML bootstrap bridges:** PATCHED. Removed the index-loaded `workspaceRuntimeBridge`, `workspaceChromeStyle`, and `workspaceOrderBridge`; also retired the remaining unused hotfix files.
- **TC-UI-122 — route had an extra live-only error lifecycle:** PATCHED. Removed `LiveModuleBoundary`; the canonical workspace `RouteErrorBoundary` remains the route-level failure boundary.
- **TC-UI-123 — single React-root rule was implicit:** PATCHED. Added `terminalReactRootContract.test.mjs` asserting one `createRoot(...)`, owned by `src/main.tsx`, and a single module entrypoint from `index.html`.
- **TC-UI-124 — right-dock architecture was not independently guarded:** PATCHED. Added `terminalDockArchitectureContract.test.mjs` for surface isolation, ARIA relationships, canonical file ownership and the compatibility adapter.

### v102 validation

- [x] `TRADINGCORE_V101_RIGHT_DOCK_SYSTEM_CONTRACT_OK`
- [x] `TRADINGCORE_V102_RIGHT_DOCK_ARCHITECTURE_CONTRACT_OK`
- [x] `TRADINGCORE_V102_SINGLE_REACT_ROOT_CONTRACT_OK`
- [x] Existing terminal shell and visual-density contracts remain passing.
- [x] Modified TS/TSX files syntax-transpiled successfully with TypeScript 5.8.x.
- [ ] Dependency-backed `tsc --noEmit` in the archive environment.
- [ ] Vite production build in the archive environment.
- [ ] Connected-broker browser smoke verification after deployment.

**Non-interference rule:** TC-UI-117 through TC-UI-124 do not intentionally modify broker transport, historical candle request ownership, canonical chart data-plane storage, CoreSpirit compiler/runtime, or broker execution semantics.

- **TC-UI-125 — dock resize could update workspace state at raw pointer frequency:** PATCHED. Right-dock resizing is requestAnimationFrame-coalesced before calling the workspace width setter.
- **TC-UI-126 — global dock shortcuts could steal form focus:** PATCHED. Alt+1/2/3/0 now yield to input/select/textarea/contenteditable targets.


## Multi-chart performance + shared chart data plane — 2026-09-29

This repair pass addresses the chart-runtime multiplication problem identified after the terminal shell/dock consolidation. The goal is to make multi-chart layouts scale expensive resources by unique dataset and symbol rather than by chart count.

- **TC-PERF-01 — per-chart analytics workers:** PATCHED. `LiveChart` no longer constructs an analytics worker; `ChartComputeCoordinator` owns a lazy pool capped at 2 workers.
- **TC-PERF-02 — per-chart indicator workers:** PATCHED. Indicator execution now uses the same bounded coordinator with a maximum of 2 workers.
- **TC-PERF-03 — per-chart realtime subscriptions:** PATCHED. `ChartDataPlane` acquires one shared broker/symbol feed and fans ticks into the shared `chartMarketStore`.
- **TC-PERF-04 — per-chart history lifecycle:** PATCHED. History and older-history requests are single-flight per `broker:symbol:timeframe` dataset.
- **TC-PERF-05 — eager background history multiplication:** PATCHED. The shared data plane does not start a multi-page crawl for every chart; pagination begins from the left-edge demand signal.
- **TC-PERF-06 — duplicate indicator computation:** PATCHED. Result cache identity excludes presentation-only indicator fields and is keyed by dataset revision plus computational configuration.
- **TC-PERF-07 — duplicate analytics computation:** PATCHED. Analytics are deduplicated by dataset revision and current spot.
- **TC-PERF-08 — duplicate prediction work:** PATCHED. Local fallback compute and production prediction requests are dataset-scoped through `ChartPredictionCoordinator`.
- **TC-PERF-09 — forming-candle allocation churn:** PATCHED. Shared reconciliation can update the current candle in place; `HistoryStore.upsertLatest()` avoids rebuilding the entire 50k-candle map for ordinary latest updates.
- **TC-PERF-10 — canonical-store disposal hazard:** PATCHED. Chart-controller disposal detaches only its named consumer and does not clear the shared canonical dataset.
- **TC-PERF-11 — regression guard:** PATCHED. Added `chartMultiChartDataPlaneContract.test.mjs` and registered it in `test:contracts`.

### v103 resource-scaling contract

For `N` chart cells, `D` unique broker/symbol/timeframe datasets and `S` unique broker/symbol feeds:

```text
renderer instances        ≈ N
canonical datasets         ≈ D
history lifecycles         ≈ D
realtime symbol feeds      ≈ S
analytics workers          ≤ 2
indicator workers          ≤ 2
prediction compute         ≈ unique dataset revision/model set
```

### v103 validation

- [x] `TRADINGCORE_V103_MULTI_CHART_SHARED_DATA_PLANE_CONTRACT_OK`
- [x] Modified market-data helpers transpile/parser-check without new source errors; missing installed dependencies still prevent a dependency-backed full project typecheck.
- [ ] Full `tsc --noEmit` after dependency installation.
- [ ] Full Vite production build after dependency installation.
- [ ] Connected FYERS multi-chart runtime test.
- [ ] Browser stress test with 16 chart cells across repeated symbol/timeframe changes.
- [ ] Verify worker count, history request count and subscription count from production telemetry.

**Non-interference rule:** CoreSpirit language/compiler/IR/VM, broker execution/risk authority, terminal dock ownership and drawing semantics were not intentionally changed by TC-PERF-01 through TC-PERF-11.

## v104 demand-driven history + deeper multi-chart budget — 2026-09-29

This pass is the direct continuation of TC-PERF-01 through TC-PERF-11. It focuses on the remaining fixed-history and concurrent-request costs without changing the shared realtime feed or CoreSpirit execution boundaries.

- **TC-PERF-12 — large initial history windows still scaled by chart cell:** PATCHED. Each timeframe now starts from a bounded 300–1,500 candle request instead of a 25k-style target.
- **TC-PERF-13 — large cached histories were materialized into the active chart on mount:** PATCHED. `ChartDataPlane` slices cached retention to the recent active window while `HistoryStore` keeps reusable retention.
- **TC-PERF-14 — unique chart datasets could burst history requests concurrently:** PATCHED. `ChartHistoryCoordinator` limits browser history requests to two concurrent operations and prioritizes initial > visible > warm.
- **TC-PERF-15 — older pages were unnecessarily network-bound:** PATCHED. `HistoryStore.getBefore()` serves cached older ranges via binary search before the broker is contacted.
- **TC-PERF-16 — fixed 1,000-bar left-edge trigger did not scale with viewport:** PATCHED. `shouldLoadOlderHistory()` derives the trigger from visible logical range and page size.
- **TC-PERF-17 — warm history could reintroduce an eager crawl:** PATCHED. Only one low-priority warm page is permitted, and only the active chart is eligible. Deep history remains user-scroll driven.
- **TC-PERF-18 — initial history limit was not propagated end-to-end:** PATCHED. Client adapter, runtime, HTTP route and server Fyers adapter now honor a bounded request limit.
- **TC-PERF-19 — deep history could force renderer/viewport jumps:** PATCHED. Logical ranges are restored through `setVisibleLogicalRange` after older pages are prepended.
- **TC-PERF-20 — deep-history compute can become expensive after genuine deep scrolling:** TRACKED. No semantic truncation was introduced; the next optimization is viewport-aware incremental indicator/analytics computation so correctness is preserved while only visible/warm ranges are processed.
- **TC-PERF-21 — demand-driven history contract was not independently guarded:** PATCHED. Added `chartHistoryDemandContract.test.mjs`.

### v104 resource contract

```text
N chart cells
  ↓
D dataset planes
  ↓
S broker:symbol feeds
  ↓
initial candles/chart ≤ 1500
active history requests ≤ 2
analytics workers ≤ 2
indicator workers ≤ 2
```

### v104 validation

- [x] `TRADINGCORE_V104_DEMAND_DRIVEN_HISTORY_CONTRACT_OK`
- [x] v103 shared-data-plane contract remains present and was extended with v104 guards.
- [x] Parser/static contract checks pass for the modified history/data-plane files.
- [ ] Dependency-backed full TypeScript typecheck.
- [ ] Vite production build with installed dependencies.
- [ ] Connected-broker 16-chart browser test with request/worker telemetry.
- [ ] Verify active-chart warm behavior under real focus/symbol switching.

**Non-interference rule:** TC-PERF-12 through TC-PERF-21 do not intentionally modify CoreSpirit grammar/compiler/IR/VM, broker order/risk authority, right-dock ownership, or realtime symbol subscription architecture.


## Chart performance + indicator graph depth pass — 2026-09-29 (v105)

- **TC-PERF-22 — viewport-sized older-history demand:** PATCHED. Older-page size now derives from visible logical bars and remains bounded by timeframe policy.
- **TC-PERF-23 — prepend viewport jump:** PATCHED. `olderAdded` is carried with the data-plane event and the chart shifts the prior logical range before restoring it.
- **TC-PERF-24 — repeated left-edge request burst:** PATCHED. Same dataset/oldest-anchor/page tuple receives a short cooldown in addition to existing single-flight behavior.
- **TC-PERF-25 — worker compute residency:** PATCHED. Indicator worker input is selected from a viewport-centered compute window with warmup and a 10,000-candle hard ceiling. The retained history store is not truncated.
- **TC-PERF-26 — indicator worker cache/window correctness:** PATCHED. Compute-window identity is part of indicator cache identity and worker dataset affinity, preventing partial-window reuse across viewports.
- **TC-PERF-27 — explicit indicator dependency graph:** PATCHED. Shared graph planner now covers EMA/SMA/WMA/HMA/VWAP/TR/ATR/Bollinger/Keltner/RSI/MACD/Supertrend/Donchian paths.
- **TC-PERF-28 — reusable ATR/TR primitives:** PATCHED. True range is one dataset-level primitive and ATR is reused by Keltner/Supertrend/ATR requests.
- **TC-PERF-29 — appearance-only indicator edits:** PATCHED. Color, component colors, line width, line style and opacity are excluded from mathematical compute signatures.
- **TC-PERF-30 — first-class chart indicator style editor:** PATCHED. The terminal indicator menu now exposes the shared `IndicatorSettingsPanel` so styling is available without leaving `/live`.
- **TC-PERF-31 — dependency-graph contract guard:** PATCHED. Added `indicatorDependencyGraphContract.test.mjs`.
- **TC-PERF-32 — history-depth contract guard:** PATCHED. Added `chartHistoryDemandDeepContract.test.mjs`.

### v105 validation

- [x] Static contract checks for deeper history demand, compute-window safety, dependency graph and indicator settings.
- [x] Selected TypeScript/TSX transpilation check.
- [ ] Full dependency-backed `tsc --noEmit` and Vite production build in this archive environment.
- [ ] Connected FYERS 16-chart runtime stress test with telemetry.

**Non-interference:** this pass does not alter CoreSpirit language/runtime authority, execution/risk boundaries, shared broker:symbol feed ownership or terminal dock ownership.

## v106 deeper demand history + indicator dependency execution — 2026-09-29

- **TC-PERF-33 — retained history cache growth across many datasets:** PATCHED. `HistoryStore` now maintains LRU ordering with a 32-dataset bucket ceiling.
- **TC-PERF-34 — warm history used a generic page instead of current viewport demand:** PATCHED. Active-chart warm requests accept visible bar count and use the bounded demand page policy.
- **TC-PERF-35 — failed warm request could permanently suppress future warm attempts:** PATCHED. Warm failures clear the request latch.
- **TC-PERF-36 — older prepend count could exaggerate viewport shift:** PATCHED. `ChartDataPlane.mergeOlder()` reports actual net dataset growth after normalization/retention.
- **TC-PERF-37 — dependency planner omitted transitive source/base edges:** PATCHED. Composite graph nodes now include explicit source → primitive → composite paths.
- **TC-PERF-38 — dependency planner did not expose an execution order:** PATCHED. `buildIndicatorDependencyGraph()` now returns deterministic topological order and rejects cycles.
- **TC-PERF-39 — rolling WMA/Bollinger/Donchian math rescanned windows:** PATCHED. Shared kernels now use rolling recurrences/deques for linear-pass behavior.
- **TC-PERF-40 — indicator presentation and computation could become coupled:** PATCHED. Appearance fields remain outside mathematical cache identity; style changes update renderer options only.
- **TC-PERF-41 — v106 regression guard:** PATCHED. Added history-cache/dependency-plan/style-boundary checks.

### v106 validation

- [x] v103/v104/v105 contracts remain in `test:contracts`.
- [x] v106 history/dependency/style contract passed.
- [x] Selected TypeScript/TSX transpilation/parser validation passed for changed files.
- [ ] Dependency-backed full `tsc --noEmit`.
- [ ] Vite production build with installed dependencies.
- [ ] Connected FYERS 16-chart browser stress test with request, worker and retained-bucket telemetry.

**Non-interference:** CoreSpirit v98 semantics, broker execution/risk authority, realtime symbol feed ownership, terminal dock ownership, and chart-local drawing semantics remain unchanged.

## v107 incremental indicator execution — 2026-09-29

- **TC-PERF-42 — same-bar revision cache reuse could serve stale indicator values:** PATCHED. Indicator snapshot cache identity now includes the active tail OHLCV tuple; forming-bar updates use a separate incremental path.
- **TC-PERF-43 — repeated period-window scans remained in hot indicator math:** PATCHED. Added reusable rolling mean/variance/min-max/sum/absolute-deviation/EMA/Wilder/ATR/WMA/VWAP session states and refactored the named batch paths.
- **TC-PERF-44 — CCI exact deviation required an O(period) rescan:** PATCHED. Exact rolling absolute deviation now uses an ordered multiset with expected O(log period) insert/delete/rank work.
- **TC-PERF-45 — forming ticks could not update worker-resident indicator state:** PATCHED. Worker supports `snapshot`, `replace`, and `append` execution modes with explicit seed/resync semantics.
- **TC-PERF-46 — snapshot priming and tick updates could land on different indicator workers:** PATCHED. Incremental chart requests use a stable worker affinity key shared by the priming snapshot and later updates.
- **TC-PERF-47 — incremental results could still replace whole chart series:** PATCHED. Supported line/channel/MACD/Stochastic/Supertrend/Ichimoku/Ribbon outputs use tail `series.update()`.
- **TC-PERF-48 — indicator dialogue did not expose compact gear/code affordances:** PATCHED. Live chart indicator rows now have settings and `Code` actions; settings panels expose the source action; a read-only source viewer was added.
- **TC-PERF-49 — v107 incremental contract coverage:** PATCHED. Added `indicatorIncrementalContract.test.mjs` and included it in the contract suite.

### v107 validation

- [x] Standard-indicator numerical parity and same-bar replacement checks completed.
- [x] v107 static contract executed.
- [x] Architecture/tracker/docs updated after the v106 baseline review.
- [ ] Dependency-backed full `tsc --noEmit`.
- [ ] Vite production build with a complete dependency install.
- [ ] Connected-broker/browser performance stress test with tick-rate and FPS telemetry.

**Non-interference:** v107 does not alter CoreSpirit v98 language/runtime authority, order/risk authority, shared broker:symbol subscriptions, terminal dock ownership, or drawing semantics.


## Indicator presentation plane — v110 — 2026-09-29

The indicator settings/renderer work is tracked separately from broker/data defects so appearance hardening cannot regress the existing market-data repairs.

| ID | Area | Severity | Defect / hardening | Status | Evidence |
|---|---|---:|---|---|---|
| TC-PERF-50 | Indicator schema | High | Appearance was only partially declarative and could not express rich fills, markers, level styling or pane/scale presentation. | **FIXED — STATIC VERIFY** | `src/services/coreSpirit/indicatorSettingsSchema.ts`, `src/services/coreSpirit/indicatorAppearance.ts` |
| TC-PERF-51 | Compute invalidation | Critical | Appearance settings must never participate in mathematical indicator invalidation. | **FIXED — STATIC CONTRACT** | `buildIndicatorComputationSignature`, `LiveChart` compute/appearance effect split, `incrementalIndicatorEngine.ts` |
| TC-PERF-52 | Worker payload | Medium | Rich appearance metadata should not be structured-cloned into indicator workers when only calculation inputs are required. | **FIXED — STATIC VERIFY** | `chartComputeCoordinator.ts` |
| TC-PERF-53 | Vela renderer | High | Fill and pane presentation needed native adapter paths that mutate renderer state without re-running indicator math. | **FIXED — STATIC VERIFY** | `velaChartFacade.ts`, `NativeRenderer.ts` |
| TC-PERF-54 | Compatibility | Medium | Published v1 custom indicator schemas must remain loadable after the v2 appearance contract. | **FIXED — STATIC VERIFY** | `indicatorSettingsSchema.ts` v1→v2 envelope migration |
| TC-PERF-55 | Marker presentation | Medium | Marker identity was not associated with the originating indicator, making universal appearance application unreliable. | **FIXED — STATIC VERIFY** | `LiveChart.tsx` marker grouping / schema appearance |
| TC-PERF-56 | Regression guard | High | Rich appearance paths need a contract proving they remain outside calculation invalidation. | **FIXED — STATIC CONTRACT** | `src/indicatorAppearanceContract.test.mjs` |

### v110 verification note

Node-based contracts can run from the extracted tree. A dependency-backed full TypeScript/Vite build and live WebGL2/Canvas2D browser smoke test remain explicitly unclaimed until a complete dependency environment is available.


## v111 — CoreSpirit programmable indicators + Vela build repair — 2026-09-30

### Production build defect

- **TC-BUILD-01 — `LineStyle` runtime export:** **PATCHED.** `ShowcaseChart.tsx` imported `LineStyle` from the TCO Vela facade and used it as a runtime object. The facade had only `export type LineStyle`, so Rollup could not find a runtime export. It now exposes `LineStyle` as an immutable runtime object with `Solid`, `Dashed`, and `Dotted`, plus the separate `LineStyleValue` type.
- **TC-BUILD-02 — runtime export regression guard:** **PATCHED.** Added `src/velaFacadeRuntimeExportContract.test.mjs` and added it to `test:contracts`.

### CoreSpirit indicator model

| ID | Area | Severity | Defect / hardening | Status | Evidence |
|---|---|---:|---|---|---|
| TC-CS-01 | Indicator artifact | Critical | Indicators were still primarily a native-indicator concept rather than an explicit first-class programmable CoreSpirit component artifact. | **FIXED — STATIC VERIFY** | `src/services/coreSpirit/coreSpiritIndicatorComponent.ts` |
| TC-CS-02 | Typed ports | High | Indicator composition needed stable typed public inputs/outputs instead of indicator-specific plumbing. | **FIXED — STATIC VERIFY** | first-class indicator component contract |
| TC-CS-03 | Lifecycle | High | Inputs/calculation/state/events/plots/visuals/alerts/metadata needed one self-describing contract. | **FIXED — STATIC VERIFY** | `CoreSpiritIndicatorComponent` |
| TC-CS-04 | Execution | High | Planner-facing determinism/state/backend/caching metadata needed to travel with programmable indicators. | **FIXED — STATIC VERIFY** | component execution/state profiles |
| TC-CS-05 | Composition | High | Indicator outputs needed to reuse the existing component graph instead of a separate indicator invocation system. | **FIXED — STATIC VERIFY** | component registry integration + existing member composition |
| TC-CS-06 | Security | Critical | Public authored source must not become host/broker authority merely because it is represented as an indicator component. | **FIXED — STATIC VERIFY** | validation/registration boundary + publication docs |
| TC-CS-07 | Language surface | Medium | Future `indicator "Name"` syntax must remain sugar over the existing artifact/component model rather than adding a second language. | **ROADMAP / CONTRACTED** | CoreSpirit roadmap stage 152 |

### v111 verification

- [x] Vela runtime export regression contract passes.
- [x] First-class indicator component contract passes.
- [x] Existing appearance/computation isolation remains intact.
- [x] Roadmap now validates at 154 stages.
- [ ] Dependency-complete Vite build in this extracted environment; npm installation timed out.
- [ ] Post-push GitHub Actions and Vercel production build confirmation.

## v111.1 — CoreSpirit indicator component depth

| Item | Status | Implementation boundary |
|---|---|---|
| First-class indicator declaration envelope | **PATCHED** | `CoreSpiritIndicatorDeclaration` projects one compiled artifact |
| Explicit typed public inputs | **PATCHED** | canonical data + parameter/component ports |
| Explicit public output selection | **PATCHED** | authoring option rejects unknown output names |
| Historical indicator execution | **PATCHED** | existing `CoreSpiritHistoricalExecutionHost` |
| Realtime indicator host | **PATCHED** | existing `CoreSpiritRealtimeExecutionHost` |
| No second indicator runtime | **LOCKED** | compiler → IR → artifact → existing hosts |
| Registry unregister / alias cleanup | **PATCHED** | indicator registry + component registry |
| Declaration/component consistency | **PATCHED** | validator checks identity, ports and calculation reference |
| Scoped community install/uninstall | **NEXT** | capability/dependency lease lifecycle |
| Zero-copy component output views | **NEXT** | shared canonical series references |
| Stateful checkpoint manifests | **NEXT** | replayable component state ABI |

### v111.1 non-interference rule

Indicator declaration metadata, public port metadata and execution host helpers must not alter the v105/v106/v110 appearance-vs-computation invalidation rule. A style-only setting remains renderer-only; a mathematical input change is the only kind of setting change allowed to enter the computation invalidation path.


## v112 — Universal parameter system + conditional settings — 2026-09-30

| ID | Area | Severity | Defect / hardening | Status | Evidence |
|---|---|---:|---|---|---|
| TC-CS-08 | Parameter ABI | Critical | Indicator configuration lacked an explicit universal typed parameter contract independent of UI implementation. | **FIXED — CONTRACT** | `indicatorSettingsSchema.ts`, `CoreSpiritIndicatorComponent` |
| TC-CS-09 | Parameter types | High | Settings controls were limited to legacy control kinds and could not express trading-specific source/timeframe/symbol/session/price/duration semantics. | **FIXED — CONTRACT** | `IndicatorSettingFieldKind` v3 |
| TC-CS-10 | Parameter metadata | High | Parameter constraints and editor guidance were fragmented across field constructors. | **FIXED — CONTRACT** | min/max/step/group/tooltip/validation fields |
| TC-CS-11 | Conditional settings | Critical | Conditional settings were limited to simple equality visibility metadata. | **FIXED — CONTRACT** | `IndicatorSettingCondition`, canonical evaluator |
| TC-CS-12 | Dependency safety | High | Complex visibility relationships needed safe path validation, bounded nesting and self-dependency rejection. | **FIXED — CONTRACT** | `validateCondition` |
| TC-CS-13 | Resolved parameter state | High | Editor, workspace and publication paths could otherwise resolve defaults/visibility independently. | **FIXED — CONTRACT** | `resolveIndicatorParameterState` |
| TC-CS-14 | Component ABI | High | First-class programmable indicators did not explicitly carry the canonical parameter projection. | **FIXED — CONTRACT** | `CoreSpiritIndicatorComponent.parameters` |
| TC-CS-15 | Migration | High | Existing v1/v2 custom schemas needed a forward-compatible parameter projection. | **FIXED — STATIC VERIFY** | in-memory v1/v2 → v3 migration |
| TC-CS-16 | Computation isolation | Critical | Universal parameter work must not reintroduce appearance-driven mathematical recomputation. | **LOCKED — CONTRACT** | `buildIndicatorComputationSnapshot`, appearance/computation separation |
| TC-CS-17 | Default-resolved dependencies | High | Conditional visibility could otherwise evaluate against sparse persisted state and ignore schema defaults on first load. | **FIXED — CONTRACT** | `resolveIndicatorParameterState` default hydration + runtime test |

### v112 verification

- [x] `TCO_V112_UNIVERSAL_PARAMETER_SYSTEM_CONTRACT_OK`
- [x] `TCO_V112_CONDITIONAL_SETTINGS_CONTRACT_OK`
- [x] `TCO_V112_INDICATOR_SCHEMA_CONTRACT_OK`
- [x] `TCO_V112_CORESPIRIT_INDICATOR_COMPONENT_CONTRACT_OK`
- [x] `TCO_V112_INDICATOR_DECLARATIVE_EXECUTION_CONTRACT_OK`
- [x] Existing v110 appearance isolation contracts remain green.
- [ ] Dependency-complete Vite build in extracted environment; dependency tree is not installed.
- [ ] Browser validation of dynamic conditional control transitions.

## CoreSpirit v113 — build annotation repair + presets + semantic series typing — 2026-10-01

### Build blockers repaired from GitHub/Vercel annotation set

| ID | Severity | Status | Repair |
|---|---:|---|---|
| TC-BUILD-03 | High | **FIXED** | `LiveChart` indicator-series helper moved into component scope. |
| TC-BUILD-04 | High | **FIXED** | `LevelSettingsDock` now imports `ReactNode` explicitly. |
| TC-BUILD-05 | High | **FIXED** | `IndicatorSourceEditor` imports the canonical settings schema accessor. |
| TC-BUILD-06 | High | **FIXED** | Universal panel consumes typed HTML option values and resolved parameter state. |
| TC-BUILD-07 | High | **FIXED** | `RouteErrorBoundary` declares explicit React component props. |
| TC-BUILD-08 | High | **FIXED** | Generated `dist` excluded from source/repo; stale worker modules cannot be compiler inputs. |
| TC-BUILD-09 | Medium | **FIXED** | Node engine and GitHub Actions aligned to 24.x to match hosted Vercel configuration. |

### Universal parameter / conditional system

- [x] Conditional operator validation is target-field aware.
- [x] Dependency graphs reject cycles and unsafe paths.
- [x] Visibility and enabled state are separate resolved maps.
- [x] Defaults are hydrated before condition evaluation.
- [x] Hidden fields do not produce active validation errors.

### Preset/profile architecture

- [x] Factory Default, Script Defaults and built-in templates remain schema-derived.
- [x] Artifact-declared `presetTemplates` are serializable parameter override definitions.
- [x] Personal, workspace and community presets carry explicit scope/provenance.
- [x] Local writes are limited to personal/workspace scope.
- [x] Effective layer resolution is deterministic and observable.
- [x] Active user/workspace profile persistence is isolated and bounded.
- [x] Profiles can carry `activePresetByIndicator` metadata without adding a second configuration format.

### Semantic series architecture

- [x] `series<price>`, `series<volume>`, `series<time>` and related semantic domains are compiler-visible.
- [x] Semantic metadata supports symbol/timeframe/unit/currency/precision/scale.
- [x] Domain-invalid arithmetic produces stable compiler diagnostics.
- [x] Domain-invalid ordered comparisons produce stable compiler diagnostics.
- [x] Semantic declarations are checked against inferred values.
- [x] Standard-library return domains are specialized where meaning is known.
- [x] Editor completion/type information advertises domain-aware series values.

### Validation status

- [x] Dependency-free Node contract inventory for the new v113 contracts.
- [ ] Full dependency-backed TypeScript check.
- [ ] Full Vite production build.
- [ ] Post-push GitHub Actions and Vercel confirmation.
- [ ] Browser smoke for conditional parameter transitions and preset application.



## v113 depth pass — parameter dependencies, presets and semantic series

The current contract is no longer a flat parameter form. Universal parameters are typed, constrained and serializable; dependency conditions are validated against declared target fields and resolved from fully hydrated defaults. The parameter schema compiles into a dependency graph with deterministic evaluation order and reverse dependents for incremental UI updates.

Preset configuration is layered and profile-aware: Factory → Script → Workspace → Personal. Profiles persist selected preset IDs per indicator, while community presets remain read-only. Preset/profile data is JSON-safe and validated against the current parameter schema.

CoreSpirit semantic series types distinguish `series<price>`, `series<volume>`, `series<time>`, `series<number>` and related domains while retaining the structural VM type system. Explicit `toNumber`/`toPrice`/`toVolume`/`toTime`/`toDuration`/`toCurrency` conversions are the intentional escape hatch; implicit cross-domain arithmetic remains rejected.

Appearance stays outside computation identity, so changing parameter UI state or presentation settings does not trigger indicator mathematical recomputation.


## Parameter / preset / semantic-type depth — v113 — 2026-10-01

| ID | Area | Severity | Hardening | Status | Evidence |
|---|---|---:|---|---|---|
| TC-PARAM-01 | Universal parameter ABI | Critical | Parameter fields validate domain, constraints, options and format before persistence/application. | **FIXED — CONTRACT** | `indicatorSettingsSchema.ts`, `indicatorParameterSystemContract.test.mjs` |
| TC-PARAM-02 | Conditional dependency graph | Critical | Dependency/visibility/enabled conditions compile into dependencies + reverse dependents with cycle/depth/group safety. | **FIXED — CONTRACT** | `buildIndicatorParameterDependencyGraph`, `getIndicatorParameterDependents`, conditional contracts |
| TC-PARAM-03 | Preset layers | High | Factory/script/workspace/personal layers resolve deterministically; active profile selections override latest fallback. | **FIXED — STATIC VERIFY** | `indicatorPresetSystem.ts`, `indicatorPresetSystemContract.test.mjs` |
| TC-PARAM-04 | Profile persistence | High | Profiles are bounded, user/workspace scoped, JSON-safe and fingerprintable for reconciliation. | **FIXED — STATIC VERIFY** | `createIndicatorPresetProfile`, `indicatorPresetProfileFingerprint` |
| TC-TYPE-10 | Semantic series | Critical | CoreSpirit rejects implicit domain mixing while preserving symbol/timeframe metadata and semantic output domains. | **FIXED — RUNTIME CONTRACT** | `semanticTypeSystem.ts`, `semanticSeriesTypeRuntime.test.ts` |
| TC-TYPE-11 | Explicit conversions | High | Pure `toNumber/toPrice/toVolume/toTime/toDuration/toCurrency` conversions provide the intentional semantic escape hatch. | **FIXED — RUNTIME/STATIC** | `semanticAnalyzer.ts`, `standardLibrary.ts`, `standardLibraryNamespaces.ts` |
| TC-BUILD-01 | Build annotations | Critical | Ten reported source/generated errors are addressed; generated `dist` is excluded; Node 24 is aligned in package/CI. | **FIXED — STATIC CONTRACT** | `v113AnnotationRegressionContract.test.mjs`, `.gitignore`, `package.json`, CI workflow |


## v114 depth pass

The universal configuration architecture is now compiled rather than merely described. Parameter kinds validate their own value domains; conditions compile to dependencies and reverse dependents; preset profiles can select explicit active presets; and semantic conversions are explicit, pure and capability-neutral.

The current configuration flow is:

```text
CoreSpirit indicator/component
        ↓
parameter schema v3
        ↓
validated parameter state + dependency graph
        ↓
preset/profile resolution
        ↓
universal editor / runtime configuration
```

Semantic series typing remains separate from VM structural typing:

```text
series<price> + series<volume>  → compile-time error
toNumber(series<price>)        → explicit domain conversion
price * volume                 → currency/notional
time - time                   → duration
```

These systems do not grant host authority and remain outside appearance-driven invalidation.


## v114 universal configuration and semantic typing — 2026-10-01

| ID | Area | Severity | Hardening | Status | Evidence |
|---|---|---:|---|---|---|
| TC-PARAM-05 | Parameter domain validation | Critical | Universal kinds enforce their own runtime value shape before persistence/preset application. | **FIXED — CONTRACT** | `validateIndicatorSettingValue`, `indicatorParameterSystemContract.test.mjs` |
| TC-PARAM-06 | Dependency compilation | Critical | Schema dependencies compile into deterministic order + reverse dependents for targeted updates. | **FIXED — CONTRACT** | `buildIndicatorParameterDependencyGraph`, `getIndicatorParameterDependents` |
| TC-PRESET-05 | Profile selection | High | `activePresetByIndicator` now participates in workspace/personal preset resolution. | **FIXED — STATIC VERIFY** | `resolveIndicatorPresetLayers`, `setActiveIndicatorPreset` |
| TC-PRESET-06 | Reconciliation | Medium | Canonical profile fingerprint is stable across JSON object key ordering. | **FIXED — STATIC VERIFY** | `indicatorPresetProfileFingerprint` |
| TC-TYPE-12 | Semantic dimensional algebra | Critical | Domain rules cover arithmetic, comparison, metadata and derived domains without collapsing everything to number. | **FIXED — RUNTIME CONTRACT** | `semanticTypeSystem.ts`, `semanticSeriesTypeRuntime.test.ts` |
| TC-TYPE-13 | Explicit conversion ABI | High | Domain-changing operations are explicit pure conversions rather than implicit coercions. | **FIXED — RUNTIME/STATIC** | `semanticAnalyzer.ts`, `standardLibrary.ts`, `standardLibraryNamespaces.ts` |
| TC-BUILD-02 | Release gate | High | Roadmap now ends at v114 stage 184 with parameter/preset/conditional/semantic-type and build-boundary contracts. | **FIXED — STATIC** | `coreSpiritRoadmap.ts`, v114 release manifest |


## v114 release gate — 2026-10-01

| ID | Area | Severity | Gate | Status | Evidence |
|---|---|---:|---|---|---|
| TC-REL-114-01 | Build | Critical | Ten reported source/generated annotations are covered by source-level regressions; generated `dist` is excluded. | **FIXED — STATIC** | `v113AnnotationRegressionContract.test.mjs`, `.gitignore` |
| TC-REL-114-02 | Parameter ABI | Critical | Typed value-domain validation and compiled dependency graph are shared by editor, workspace and presets. | **FIXED — CONTRACT** | `indicatorSettingsSchema.ts`, parameter/conditional contracts |
| TC-REL-114-03 | Presets | High | Explicit active profile selection and portable JSON bundles share one canonical preset validator. | **FIXED — STATIC VERIFY** | `indicatorPresetSystem.ts`, preset contract |
| TC-REL-114-04 | Semantic typing | Critical | Domain arithmetic, comparison, metadata and explicit conversion ABI are compiler-visible and capability-neutral. | **FIXED — RUNTIME CONTRACT** | `semanticTypeSystem.ts`, `semanticSeriesTypeRuntime.test.ts` |


## v115 validator repair — 2026-10-03

The indicator parameter validator had a two-step regression: an earlier repair introduced the fieldByPath declaration but left the original allSchemaFields declaration below it. The result was either a runtime ReferenceError in validateCondition(...) or, after the partial fix, an esbuild duplicate-const transform failure. v115 collapses dependency validation onto one canonical schema-field collection and one fieldByPath index reused by target/type validation and cycle detection.

| ID | Area | Severity | Hardening | Status | Evidence |
|---|---|---:|---|---|---|
| TC-BUILD-10 | Indicator dependency validator | Critical | The validator now constructs allSchemaFields and fieldByPath exactly once before validating dependency/visibility/enabled conditions. | **FIXED — SOURCE** | src/services/coreSpirit/indicatorSettingsSchema.ts |
| TC-BUILD-11 | Regression prevention | Critical | Conditional-settings contract asserts exactly one canonical allSchemaFields declaration, one fieldByPath map declaration, and cycle detection reuse. | **FIXED — CONTRACT** | src/indicatorConditionalSettingsContract.test.mjs |
| TC-BUILD-12 | CI gate | Critical | v115 must pass contracts before build/typecheck; no next architecture stage proceeds while this validator gate is red. | **IN PROGRESS — CI RUN 84** | GitHub Actions run 84 |
## v115 — canonical market transport + Vela multi-chart activation — 2026-10-04

| ID | Area | Severity | Defect / hardening | Status | Evidence |
|---|---|---:|---|---|---|
| TC-PERF-57 | Worker transport | Critical | Indicator/analytics workers received object-based candle arrays across the `postMessage()` boundary, forcing structured cloning and repeated object-graph traversal. | **FIXED — STATIC CONTRACT** | `src/services/core/data/canonicalMarketDataTransport.ts`, `src/services/marketData/chartComputeCoordinator.ts` |
| TC-PERF-58 | Worker ownership | Critical | Worker ownership of market windows was implicit, leaving the eventual shared-memory design without a clean transfer boundary. | **FIXED — TRANSFER ABI** | versioned packet + transferable `ArrayBuffer`s; SAB intentionally deferred |
| TC-PERF-59 | Canonical ingress | High | `ChartDataPlane` built a second `MarketDataPoint[]` representation before populating the canonical typed store. | **FIXED — DIRECT TYPED WRITE** | `MarketDataStore.replaceHistoricalCandleRows()`, `CanonicalDataPlane.replaceHistoricalCandleRows()` |
| TC-PERF-60 | Realtime tail | High | Realtime canonical-tail checks called `MarketDataStore.get()`, allocating a temporary market row on every tick. | **FIXED** | typed `market.time[last]` access in `ChartDataPlane.onTick()` |
| TC-PERF-61 | Vela provider | Critical | Vela could reopen broker history outside the shared chart data lifecycle. | **FIXED — SHARED PLANE** | `TcoVelaDataProvider` resolves `getChartDataPlane()` and reads `readCanonical()` |
| TC-PERF-62 | Vela multi-chart | Critical | Production live workspace was explicitly pinned to `layout: false`, leaving Vela's multi-chart architecture dormant. | **FIXED** | `src/LiveTradingWorkspace.tsx` uses layout `4`, four seeds, runtime layout/sync shell |
| TC-UI-63 | Indicator UX | High | Fast indicator insertion was available through the standard picker but had no TCO radial quick action. | **FIXED — HOST UX** | Alt-held indicator wheel in `LiveTradingWorkspace.tsx` |
| TC-PERF-64 | Contract protection | High | The v115 transport/workspace invariants could regress without an aggregate node-only guard. | **FIXED** | `src/canonicalMarketDataTransportContract.test.mjs`, package `test:contracts` entry |
| TC-PERF-65 | End-to-end typed CoreSpirit ingress | Critical | Existing indicator kernels still require compatibility candle objects inside the worker. | **NEXT** | migrate CoreSpirit/indicator kernel input ABI to `CanonicalMarketView`/typed series |
| TC-PERF-66 | Broker columnar ABI | High | Broker adapters still expose `HistoricalCandle[]` as their external history contract. | **NEXT** | add native columnar history transport without breaking compatibility callers |
| TC-PERF-67 | Vela typed ingestion | High | Provider-side `OHLCV[]` allocation remains a Vela compatibility boundary. | **NEXT** | direct typed/retained-buffer Vela data adapter |
| TC-PERF-68 | SAB | Medium | SharedArrayBuffer is not yet justified because ownership/revision/reclamation semantics need to be explicit first. | **DEFERRED BY DESIGN** | revisit after typed CoreSpirit ingress and worker lifecycle hardening |

### v115 verification

- [x] `TRADINGCORE_V115_CANONICAL_MARKET_TRANSPORT_CONTRACT_OK`
- [x] `TRADINGCORE_V99_TERMINAL_SHELL_CONTRACT_OK` updated for multi-chart workspace expectations.
- [x] `TRADINGCORE_V100_TERMINAL_VISUAL_DENSITY_CONTRACT_OK` updated for multi-chart workspace expectations.
- [x] Existing node-only contract suite reaches the dependency-backed TypeScript boundary without a v115 static-contract failure.
- [x] Global TypeScript parser/compiler invocation reaches the missing dependency declaration boundary only: `Cannot find type definition file for 'vite/client'` in this extracted environment.
- [ ] Full `npm run typecheck` after `npm install` / dependency restoration.
- [ ] Full Vite production build after dependency restoration.
- [ ] Browser validation of the four-cell workspace, active-cell switching and Alt indicator wheel.
- [ ] Connected FYERS four-cell stress test measuring duplicate history fetches, worker update cost, dropped updates and frame time.

### v115 architectural rule

`HistoricalCandle[]` is now an **edge representation**, not a cross-thread or cross-stage transport representation. New compute/data APIs must prefer typed canonical views, typed packet transport or renderer-neutral packets. Any new object-array API must be justified as an explicit compatibility boundary and must not silently become the canonical store again.


## v116 — genuine columnar Vela consumption + native shell integration

v116 closes the next representation-churn boundary instead of merely adding another adapter method. The production TCO Vela path now has three explicit numeric stages:

```text
CanonicalMarketView
    ↓ typed views
TCO Vela provider
    ↓ ColumnarBars
Vela feed/orchestrator
    ↓ ColumnarBars
NativeRenderer.setBarsColumns()
    ↓ typed channels
Canvas2D / WebGL2 candle geometry
```

### History path

`TcoVelaDataProvider.getBarsColumns()` returns subarray views over the canonical `Float64Array` channels. The Vela registry/feed and `EngineOrchestrator` prefer `loadColumns()` for bounded identity-bar loads. The renderer stores those channels in a Vela-owned mutable typed buffer with spare capacity. This is intentionally **zero-object at the render/data boundary**, but it is not described as mathematical zero-copy: the renderer establishes ownership with one numeric buffer copy so later forming-bar updates can remain O(1) and safe.

The native canvas and WebGL candle painters read `time/open/high/low/close` directly from those arrays. They do not allocate one `OHLCV` object per candle in the render loop. Vela retains a single internal `OHLCV[]` compatibility mirror because legacy scripting, data-window and some non-candle features still read that model. The mirror is created on series replacement, not used as the candle render transport.

### Live path

The same rule now continues through the forming-candle stream. `subscribeColumns()` is an optional provider/feed capability. TradingCoreOS emits a compact `ColumnarBarUpdate` from the canonical tail, and `LiveSession` selects that path when the chart is an identity series and the renderer exposes `updateBarColumns()`.

The live sequence is therefore:

```text
canonical tail
    ↓
ColumnarBarUpdate
    ↓
LiveSession
    ↓
EngineOrchestrator.onColumnarBar()
    ├── native renderer.updateBarColumns()
    └── one compatibility OHLCV for legacy bar/session consumers
```

This removes the previous provider → engine object allocation for every live packet while retaining the existing compatibility ABI for consumers that have not yet migrated.

### LOD and viewport contract

`setLodIndex()` now carries the renderer-neutral `ChartLodIndex` into Vela as typed bucket arrays. The native candle renderer uses those buckets when its density tier reaches aggregate mode; it does not rebuild reduced candle objects on every frame. `setVisibleRange()` remains the stable renderer contract for viewport changes, so TCO does not reach into Vela's coordinate or viewport internals.

The old `setReducedCandles()` path remains only as a compatibility route for renderers that have not adopted the typed LOD contract. It is no longer the preferred TCO/native path.

### Ownership and mutation rules

1. TCO canonical arrays remain owned by `CanonicalDataPlane` and are never mutated by Vela.
2. Vela takes ownership of its own mutable capacity buffers at the renderer boundary.
3. Forming-bar updates mutate only the Vela-owned numeric tail and the required legacy mirror entry.
4. LOD arrays are treated as immutable snapshots until the next explicit `setLodIndex()` call.
5. Viewport operations remain contract-level calls (`setVisibleRange`) rather than Vela-internal calls.
6. `SharedArrayBuffer` remains deferred until buffer ownership, revisioning and reclamation are explicit.

### Vendor boundary

TradingCoreOS still exposes Vela only through `velaChartFacade.ts` and the TCO adapter. TCO feature code does not import `NativeRenderer`, `SceneGraph`, renderer backends or other Vela implementation classes. The vendored fork can therefore change without leaking its internal representation across the TradingCoreOS application boundary.

### Shell chrome changes

The former React/floating watchlist and floating broker controls have been removed from the chart workspace. The Vela topbar now owns the chrome:

```text
Vela topbar
  ├── Watchlist  ← Vela side-panel toggle, renamed from TCO's old watchlist control
  ├── Journal    ← Vela side-panel toggle
  └── Broker Connection  ← contributed topbar action, inside the actual topbar flow
```

The Watchlist and Journal are registered through Vela's contribution API and therefore use the same panel docking/exclusivity/persistence mechanism as native Vela panels. Broker Connection is a contributed topbar action rather than an absolutely positioned TCO overlay, so it moves/reflows with the actual Vela topbar and stays inside its chrome.

### What remains

The columnar boundary is now real for identity OHLCV history, native candle rendering, typed LOD and forming-bar updates. The next conversion is deliberately downstream: migrate CoreSpirit and native indicator kernels from the Vela compatibility `OHLCV[]` mirror to typed `CanonicalMarketView`/series inputs, then migrate deep/backfill/transformed chart paths to columnar range operations. Only after those steps should the remaining Vela compatibility mirror be retired and SAB be reconsidered.


## v117 — Vela retained/incremental rendering

**Completed:** explicit series patch operations; previous-model/cause-aware engine diffing; style-only patches; incremental markers; incremental fill anchors/state; typed coordinate time; mutable columnar renderer ownership; v116 null-column dereference fix; workspace cleanup declaration; OHLCV import fix; regression contract.

**Next:** direct CoreSpirit typed-series kernel input and multi-chart/multi-pane benchmark coverage.

### v117 deep patch ABI + verification

The retained-scene contract is now explicit: `append`, `replace-last`, `prepend`, and `replace-range` mutate only affected data; `seriesStyles` handles appearance without touching values; marker updates diff their changed interval; fill updates use a separate value/style channel. The engine only selects a tail delta when the previous/current series identity and timestamp continuity prove the live operation; otherwise it falls back to a full replacement.

The full Vela source audit also confirmed that candle rendering is the correct place to keep the columnar representation: the renderer may keep an internal `OHLCV[]` compatibility mirror for legacy scripting/data-window paths, but that mirror is not the render transport. Supabase broker/session/workspace persistence remains outside this hot path; the database advisor currently reports RLS-policy evaluation and duplicate-policy/index cleanup opportunities, which are separate persistence optimizations.


## v118 — history, animation and typecheck repair

Resolved the remaining reported blockers in the current Vela head: workspace listener disposer now has lexical ownership, and the TCO Vela native adapter uses Vela's inferred legacy-bar type rather than an unresolved OHLCV import. The MutableColumnarBars typing fix is already present in the retained-scene head.

History is now standardized on 5,000-bar initial and older pages, and the Vela animation defaults are intentionally slower for a more professional terminal feel.


## v119 — CoreSpirit true series fusion

Completed:
- Replaced the `seriesVector` fake-fusion executor that allocated one full series per operation.
- Added a single-pass `CoreSpiritFusedSeriesCursor` with bounded ring/deque/ordered-window state.
- Enabled deterministic local EMA/RMA fusion.
- Integrated fusion into historical/replay VM execution; realtime remains on its rollback-safe incremental state path.
- Added numerical equivalence and zero-intermediate allocation contracts.

Remaining:
- Direct CoreSpirit runtime ingestion from `CanonicalMarketView` without candle-object materialization.
- Fused-cursor checkpoint/rollback for realtime revision evaluation.
- Dirty-span propagation from CoreSpirit kernels into Vela RenderPacket so compute and render invalidation share exact ranges.

## v120 — UI/Fyers/CoreSpirit consolidation

Verified/fixed in this pass:
- CoreSpirit EMA chain fusion failure in CI: semantic graph previously classified `pure:false` EMA as nondeterministic/effectful even though the kernel is deterministic and local; this is now separated correctly.
- Realtime fusion cursor rollback state is snapshotable.
- Fyers older-history calls are bounded/deduplicated.
- Vela viewport left-edge history demand now grows depth in 5,000-bar pages.
- Workspace broker restoration is skipped when a broker is already connected, and defaults load concurrently with broker restoration.
- Vela workspace uses Supabase-backed storage with local fallback.
- Terminal/nav/dashboard hardcoded blue accents are aligned to the indigo-violet brand token.
- Vela chart motion is intentionally slower than the original snappy defaults while fast-mode remains a separate explicit performance mode.

Known Supabase advisor items (RLS initplan warnings, duplicate permissive policies, unused indexes/unindexed FKs) are left unchanged in this renderer-focused pass so security behavior is not altered casually.

## v121 — true retained incremental rendering

The Vela update contract is now enforced all the way from the public TCO facade to the retained native scene. A live setData call that differs only by one new tail point is converted to append; a forming-bar update becomes replace-last. The renderer applies those mutations in-place.

Indicator renderer collections now have an explicit delta channel. Backgrounds, price lines, drawings, tables and trade collections can use a tail append/replace-last delta when the new state is provably tail-local; structural/reorder changes still use the explicit full-replacement path.

The native indicator-drawing raster cache is keyed by drawing-content revision plus viewport, pane geometry and scale signature. A market tick therefore does not force unchanged labels, boxes or tables to be repainted.

This is the intended rule:

history -> setData once -> live tail patches -> style state patches -> affected overlay patches -> repaint only invalidated surfaces.

No live tick should reconstruct a 20k-point series merely because the chart has 20k loaded bars.

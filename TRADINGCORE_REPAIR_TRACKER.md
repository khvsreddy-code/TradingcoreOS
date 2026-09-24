# TradingCore Repair Tracker

Updated: 2026-09-24
Source build: `TradingcoreOS-fast-reactive-live-price-v4-10k-LIVE-CANDLE-HARD-FIXED.zip`

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

# TradingCoreOS / CoreSpirit Build Tracker

**Last updated:** 2026-10-05  
**Architecture lock:** CoreSpirit-first scripting + Vela chart engine + TCO-owned data/compute/broker systems. PineScript/PineTS compatibility is not part of the product architecture.

## Current performance path

```
FYERS compact columns
 → TCO canonical typed data
 → Vela ColumnarHistoryTape
 → CoreSpirit stateful kernels
 → causal dirty range
 → renderer/model range patch
 → retained Vela scene
 → frame/backend telemetry
```

## v131 — canonical incremental kernel pass

### 1. O(N × period) indicator elimination

- [x] Canonical bounded kernel family is shared by CoreSpirit and incremental market-data consumers.
- [x] Rolling sum/mean/variance use running state.
- [x] Min/max state supports bounded history plus forming-bar replacement without advancing the cursor.
- [x] Median/percentile/MAD use ordered state rather than sorting every period window.
- [x] EMA/Wilder/ATR/WMA/VWAP use persistent state.
- [x] Bollinger, Donchian, Stochastic, CCI and MFI use stateful primitives.
- [x] Scalar `coreIndicatorKernel.ts` delegates standard math to canonical stateful kernels without period-window rescans.
- [x] Existing deep parity tests cover append and forming-bar replacement.
- [x] Structural fractal detection uses centered monotonic-extrema traversal instead of an inner period loop.
- [x] Structural zone mitigation uses one ATR pass plus threshold heaps instead of repeated historical ATR/future-candle scans.
- [x] `seriesVector.ts` fused execution now delegates to the canonical stateful kernel classes; its duplicate private rolling/heap implementation is removed.
- [x] `coreIndicatorKernel.ts` delegates standard scalar math to the canonical CoreSpirit kernel.
- [x] CI contract guards against reintroducing private fused kernels and per-window rescans in the primary standard indicators.

### 2. Vela true columnar history ABI

- [x] `ColumnarHistoryTape` is the retained identity-chart source of truth.
- [x] First-load and deep-backfill paths can ingest typed columns.
- [x] Binary time lookup and bounded prepend/append/replace operations exist.
- [x] Native Vela rendering consumes typed columns.
- [~] Complete removal of the `OHLCV[]` compatibility mirror is **not** complete. Replay/session/drawing/transformed-chart consumers still have selected object seams.
- [ ] Remove those final compatibility projections without changing semantics or breaking replay/drawing contracts.

### 3. Exact dirty-span execution

- [x] Primary history backfill computes a causal dirty range with lookback warmup.
- [x] CoreSpirit can evaluate the affected range instead of blindly rerunning all retained bars.
- [x] Vela supports localized range patches.
- [~] Dirty spans are not yet universal across every RenderPacket/ScenePatch collection and renderer-owned overlay category.
- [ ] Make every supported overlay consume the same exact causal `[from,to]` range, with full replacement only as a proven fallback.

### 4. Telemetry and runtime verification

- [x] Vela reports frame/FPS/p95/frame-budget/backend statistics.
- [x] TCO aggregates transport/compute/patch/renderer/frame stage buckets.
- [x] Browser verifier exists and checks Vela mount, framework errors and p95 frame budget.
- [ ] Authenticated browser evidence for 1-chart layout.
- [ ] Authenticated browser evidence for 4-chart layout.
- [ ] Authenticated browser evidence for 8-chart layout.
- [ ] 5,000-candle first-load measurement.
- [ ] 5,000-candle backward-prepend measurement.
- [ ] Live forming-bar replacement measurement.
- [ ] GPU vendor/utilization counters where actually exposed by the browser/backend.

## Explicit remaining deep phases — intentionally not finished

These are intentionally **not falsely marked as finished**:

1. **True columnar history ABI completion** — migrate the remaining Vela compatibility consumers and remove the final OHLCV mirror.
2. **Exact dirty-span completion** — propagate one proven causal range through CoreSpirit → renderer/model packet collections → Vela invalidation end-to-end.
3. **GPU/frame runtime verification** — collect real browser measurements for 1/4/8 charts, 5k initial load, 5k prepend and live ticks; then add GPU counters where meaningful.


## v132 — hot VM, copy-on-write realtime state and terminal product pass

### 5. Runtime architecture — smaller hot VM

- [x] Extracted CoreSpiritExecutionVM as the dedicated instruction-dispatch hot loop.
- [x] Runtime-specific operations are supplied through a narrow VM host instead of embedding orchestration into the dispatch loop.
- [x] Added CoreSpiritOutputCollector, CoreSpiritEventRouter, CoreSpiritCapabilityHost and CoreSpiritDebugHost.
- [x] CoreSpiritRuntime remains the orchestration facade; the VM is broker/network/DOM free.
- [x] Added a CI contract preventing regression to the old monolithic hot loop.

### 6. Realtime state — checkpoint + mutation journal

- [x] Removed full seriesState / localSeries / crossState clones from forming-bar rollback.
- [x] Added per-key mutation journals for bounded numeric/value series and cross-state.
- [x] Forming-bar replacements rollback only touched state and then start a fresh journal for the replacement evaluation.
- [x] Historical checkpoint export/import remains clone-safe because it is a cold recovery path.
- [x] Realtime execution results use the non-cloning state view; explicit snapshot callers retain the cloned API.
- [x] Added CI coverage for the hot VM and copy-on-write invariants.
- [x] Realtime event/order/signal emissions are buffered by CoreSpiritEventRouter and committed only with the forming-bar transaction.

### 7. Vela workspace and data-path hardening

- [x] Default workspace layout changed from 4 charts to 1 chart; persisted state key bumped to avoid legacy-grid contamination.
- [x] Added TCO-owned Watchlist, Journal and Panels topbar actions plus a TradingCoreOS × Vela brand action.
- [x] Quant UI is not included.
- [x] Alt drawing wheel selection highlight is royal purple.
- [x] Non-live application accent moved to #d3ebf4; live terminal keeps its trading palette.
- [x] Live trading animations are disabled so feed updates are never visually delayed by decorative easing.
- [x] Empty FYERS column history now falls through to the ordinary history path instead of producing a successful blank dataset.
- [x] Vela topbar exposes stable action ids so TCO can style contributed chrome without reaching into widget internals.
- [x] Added CI contracts for workspace composition, candle fallback and FYERS order latency.

### 8. FYERS order hot path

- [x] Fixed-IP FYERS execution gateway remains the preferred execution route when configured.
- [x] Order responses no longer wait on non-critical audit-log writes after the safety ledger is finalized.
- [x] Order transport explicitly uses cache: no-store.
- [~] Broker-session lookup/decryption still occurs per order; a multi-instance-safe short-lived session fast path is a future optimization and must not weaken credential revocation semantics.

## Retained product baseline

- [x] Initial chart load: 5,000 candles.
- [x] Backward paging: 5,000 older candles at the loaded left edge.
- [x] Maximum retained history: 50,000 candles.
- [x] Compact FYERS history ingress.
- [x] Vela-owned Alt drawing wheel with Panels action.
- [x] Supabase workspace persistence + 15-minute autosave.
- [x] Black/graphite live-terminal visual system; non-live application chrome uses #d3ebf4, while the Alt drawing wheel keeps royal-purple selection highlight.
- [x] Public CoreSpirit indicator/strategy scripts, Models and Automations surfaces.
- [x] CI contract suite is configured to enforce the architecture.

## Documentation consolidation

The active architecture is intentionally limited to the five root documents plus this tracker. Superseded stage notes remain chronological under `docs/archive/history/`; legacy/reference material is not an active source of truth.

Clearly redundant legacy repair/one-off performance notes are removed from the active/archive browsing surface rather than copied into another architecture document.

## Verification truth rule

CI contracts prove source-level invariants. They do not prove browser FPS, network latency, GPU utilization, authenticated broker behavior or visual quality. Those remain open until runtime evidence exists.


| 70 | Progressive authoring depth without language forks | ✅ |


## v130 — hot VM, realtime journal and terminal product pass

### CoreSpirit runtime
- [x] ExecutionVM remains the instruction-dispatch boundary; Runtime is the orchestration facade.
- [x] Forming-bar rollback uses StateStore/SeriesStore mutation journals rather than retained-history clones.
- [x] Realtime event effects are transaction-buffered with the forming-bar lifecycle.
- [x] Runtime RSI/ATR/session VWAP use canonical incremental kernels with bounded copy/restore state.
- [x] Output collection has explicit per-bar clear semantics.

### Live terminal and Vela
- [x] Default workspace is one chart with a fresh v4 persistence key.
- [x] TCO is the explicit Vela primary provider and initial history target is 5,000 candles.
- [x] Panels opens the TCO watchlist; Journal has its own topbar action.
- [x] TradingCoreOS × Vela is the host wordmark; Quant UI is not included.
- [x] Alt drawing-wheel selection highlight is royal purple.
- [x] Empty direct columnar history now falls through to the normal history path instead of returning a blank successful result.

### Product UI
- [x] Non-live application accent is #d3ebf4.
- [x] Non-live surfaces use slower, smoother motion; live trading remains chart-native/motion-light.
- [x] Historical legacy tracker assertions were removed from CI rather than resurrecting obsolete Markdown.

### FYERS
- [x] Client transport defaults to cache: no-store for broker/API actions.
- [x] Fixed-IP FYERS execution gateway remains preferred when configured.
- [~] Broker session lookup/decryption remains per order pending measured, revocation-safe server-side caching.

### Verification truth
- [ ] Authenticated browser candle-render evidence.
- [ ] Measured FYERS order round-trip latency.


## v94 implementation record

The chart data plane established the zero-copy canonical chart data plane at the Vela boundary, with typed column transport and retained GPU-buffer reuse for identity-chart rendering.

## v135 — Vela capability splitting and eager-import removal

### 14. Vela renderer capability graph
- [x] Audited the Vela fork: 384 source files with large renderer, engine, workspace, drawing and settings modules.
- [x] Confirmed the native renderer statically pulled `UserDrawingController` and therefore the full drawing implementation graph.
- [x] `UserDrawingController` is now type-only from `NativeRenderer`; concrete drawing implementation is loaded with a dynamic import.
- [x] Added a lazy proxy so Vela's drawing port remains synchronous to callers while the capability loads on first use.
- [x] Removed runtime `VelaWorkspace` re-export from the chart facade.
- [x] Added `velaWorkspaceLoader.ts` as the explicit on-demand workspace capability.
- [x] Added CI/source contracts protecting these capability boundaries.
- [~] Advanced drawing families are still grouped inside `vendor/vela/src/core/drawings/registry.ts`.
- [ ] Split the drawing registry into lean-core and advanced family chunks (Fibonacci, Gann, harmonic/Elliott/pattern, volume-profile/measurements, etc.).
- [ ] Lazy-load optional renderer modules such as VPVR/settings/other heavyweight chrome where runtime semantics permit.

### 15. Evidence gate
- [ ] Capture the post-split landing/dashboard/live gzip graph from a successful Vercel or local production build.
- [ ] Capture a browser network trace proving drawing-capability JS is absent before Draw/drawing UI is opened.
- [ ] Capture a second trace proving only the requested drawing family chunk loads when advanced tools are opened.
## v134 — regional topology lock and frontend startup split

### 12. Vercel / Supabase regional placement
- [x] Vercel Function region remains locked to `bom1` (Mumbai).
- [x] Connected Supabase project is confirmed in `ap-south-1` (Mumbai).
- [x] Documentation explicitly rejects an indiscriminate Edge migration for database-bound trading APIs.
- [x] Realtime gateway deployment target is Mumbai/lowest-latency Indian region, subject to measured gateway↔FYERS performance.
- [ ] Capture measured browser→gateway→FYERS and gateway→Redis latency from the production Indian network path.

### 13. Frontend bundle architecture
- [x] `TradingCoreRuntime` is removed from the static `App.tsx` dependency graph.
- [x] Landing page is isolated behind a lazy route root.
- [x] Below-fold landing sections are deferred instead of downloaded with the first viewport.
- [x] Auth modal and broker/legal callback surfaces are on-demand chunks.
- [x] Vite manifest and explicit vendor chunk groups are enabled.
- [x] Graph-aware gzip budgets cover landing, login, dashboard and live route roots.
- [~] Strategic target is **150–250 KB gzip** for initial startup and **<300 KB gzip** for live workspace critical JS; current CI ceilings are staged above target pending measured build output.
- [ ] Tighten staged ceilings to the strategic targets after the next build report proves the new graph.
- [ ] Add authenticated browser evidence for route startup, route-to-route loading and live workspace JS transfer.

## v133 — request/realtime plane separation and distributed coordination

### 9. Vercel request-plane hardening
- [x] Catch-all `api/index.ts` max duration reduced from 300s to 15s.
- [x] P0 broker/API calls carry explicit absolute deadlines.
- [x] Authentication validation has a bounded upstream deadline.
- [x] Long-running production prediction supports durable asynchronous execution.
- [x] HTTP market/order stream fallback has a bounded lease.

### 10. Distributed coordination
- [x] Upstash Redis REST coordination client added without blocking the hot path on a long-lived TCP connection.
- [x] Broker request admission/rate budgeting can coordinate across Vercel instances.
- [x] Broker-session short cache can be shared across instances while Supabase remains the durable source of truth.
- [x] Realtime ownership/subscription metadata uses Redis.
- [x] Realtime cross-instance event fanout uses Redis Pub/Sub.

### 11. Dedicated realtime plane
- [x] Signed, short-lived browser realtime tickets.
- [x] Dedicated Node WebSocket gateway with Redis owner election.
- [x] One FYERS broker socket owner per user across gateway instances.
- [x] Browser market feed prefers the dedicated gateway and falls back to the bounded legacy stream.
- [~] Production realtime gateway is not yet provisioned/connected to the Vercel project; environment variables are intentionally not fabricated.

### Remaining rollout gates
1. Provision a Redis/Upstash database and populate the request-plane Redis credentials in Vercel.
2. Deploy `realtime-gateway/server.ts` as a long-lived service with the same Redis and shared ticket secret.
3. Set `REALTIME_GATEWAY_URL` in Vercel, validate the browser gateway path, and only then set `TRADINGCORE_DISTRIBUTED_COORDINATION_REQUIRED=true`.
4. After cutover, disable the legacy `/market-stream` and `/order-stream` HTTP bridges rather than retaining two competing realtime topologies.


# TradingCoreOS / CoreSpirit Build Tracker

**Last updated:** 2026-10-04  
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
3. **GPU/frame runtime verification** — collect real browser measurements for 1/4/8 charts, 5k initial load, 5k prepend and live ticks; add GPU counters where meaningful.

## Retained product baseline

- [x] Initial chart load: 5,000 candles.
- [x] Backward paging: 5,000 older candles at the loaded left edge.
- [x] Maximum retained history: 50,000 candles.
- [x] Compact FYERS history ingress.
- [x] Vela-owned Alt drawing wheel with Panels action.
- [x] Supabase workspace persistence + 15-minute autosave.
- [x] Black/graphite + royal-purple visual system.
- [x] Public CoreSpirit indicator/strategy scripts, Models and Automations surfaces.
- [x] CI contract suite is configured to enforce the architecture.

## Documentation consolidation

The active architecture is intentionally limited to the five root documents plus this tracker. Superseded stage notes remain chronological under `docs/archive/history/`; legacy/reference material is not an active source of truth.

Clearly redundant legacy repair/one-off performance notes are removed from the active/archive browsing surface rather than copied into another architecture document.

## Verification truth rule

CI contracts prove source-level invariants. They do not prove browser FPS, network latency, GPU utilization, authenticated broker behavior or visual quality. Those remain open until runtime evidence exists.

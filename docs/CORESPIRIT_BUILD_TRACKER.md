# TradingCoreOS / CoreSpirit Build Tracker

**Last updated:** 2026-10-04
**Architecture lock:** CoreSpirit-first scripting + Vela chart engine + TCO-owned data/compute/broker systems. PineScript/PineTS compatibility is not part of the product architecture.

## Performance path

FYERS compact columns → TCO canonical data plane → Vela ColumnarHistoryTape → retained renderer → CoreSpirit stateful kernels → causal dirty span → retained RenderPacket/ScenePatch → Vela repaint → frame/backend telemetry.

**Hot-path rule:** do not reconstruct history-sized arrays or scan a period-sized window for every historical bar when bounded state can carry the result forward.

## v129 — deep performance pass

### 1. Stateful indicator mathematics
- [x] Canonical bounded kernels: RollingSum, RollingMean, RollingVariance, RollingMinMax, RollingMedian, RollingPercentile, MAD, EMA, Wilder, ATR, WMA, VWAP.
- [x] `coreIndicatorKernel.ts` removed repeated EMA/RMA seed scans and RSI `slice().reduce()` seeding; VWAP reuses one timezone formatter.
- [x] Bollinger, Donchian, Stochastic, CCI and MFI use bounded state.
- [x] `indicatorKernel.ts` no longer uses per-bar rolling `slice`, repeated `reduce`, sort or spread max/min implementations.
- [x] Full-history `*Series` helpers perform one chronological pass.
- [~] `seriesVector.ts` still contains private fused-state copies; deduplication remains open.

### 2. Vela columnar history
- [x] Columnar OHLCV is the canonical retained tape.
- [x] Deep backfill uses `prependColumns()` without per-candle OHLCV materialization.
- [x] Common viewport/depth/replay decisions use direct tape length/time/range primitives and binary edge search.
- [~] Full removal of the OHLCV compatibility mirror is **not** claimed; replay/session/drawing/transform consumers still have selected object seams.

### 3. Dirty-span execution
- [x] Backfill recomputation starts at `dirty.start - maxLookback` and merges only the invalidated range.
- [x] Partial backfill no longer clears unrelated retained plots before ranged merge.
- [x] Ranged signal markers are constrained to the dirty interval.
- [~] Dirty-span propagation is not yet universal across every RenderPacket collection and renderer-owned overlay type.

### 4. Telemetry and validation
- [x] Native Vela exposes frame/FPS/p95/frame-budget/backend statistics.
- [x] TCO telemetry aggregates transport/compute/patch/renderer/frame stage buckets.
- [x] `tools/verify-chart-performance.mjs` exists for browser measurement.
- [ ] Authenticated browser measurements for 1/4/8 charts, 5k initial load, 5k prepend and live forming ticks.
- [ ] GPU vendor-specific counters; WebGL backend availability is not treated as utilization telemetry.

## Explicitly open deep phases
1. **True columnar ABI completion:** migrate remaining session/replay/drawing/transform consumers from `OHLCV[]` where direct column access preserves semantics, then remove the compatibility mirror.
2. **Exact dirty-span completion:** carry one causal dirty range through CoreSpirit state, RenderPacket/ScenePatch collections and Vela invalidation without broad replacement fallback.
3. **Runtime browser/GPU verification:** capture real deployed measurements rather than inferring performance from source contracts.
4. **Kernel deduplication:** remove duplicate fused-state algorithms from `seriesVector.ts` and make the canonical stateful kernel layer the sole algorithm source.

## Retained baseline
- [x] Initial chart load: 5,000 candles.
- [x] Backward paging: 5,000 older candles at the loaded left edge.
- [x] Maximum retained history: 50,000 candles.
- [x] Compact FYERS columns + typed ingress.
- [x] Vela-owned Alt drawing wheel with Panels action.
- [x] Supabase workspace persistence + 15-minute autosave.
- [x] Black/graphite visual system + royal purple accent.
- [x] Public CoreSpirit indicators/strategies, Models and Automations surfaces.

## Verification truth rule

CI contracts prove source-level invariants. They do not prove browser FPS, network latency, GPU utilization or visual quality. Those stay open until actual runtime evidence is captured.

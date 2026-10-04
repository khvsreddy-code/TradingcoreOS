# Vela and charting

The **canonical columnar data plane** is the authoritative OHLCV transport between TradingCoreOS market data and Vela. Compatibility object projections are downstream only.

## Vendor boundary

```
TradingCoreOS
 ↓
velaChartFacade
 ↓
TCO Vela adapter
 ↓
modified Vela
 ↓
native renderer
```

Application code should not import Vela renderer internals directly.

## Columnar candle API

The native path exposes:

```
setBarsColumns(columns)
updateBarColumns(update)
setLodIndex(index)
setVisibleRange(range)
```

The renderer owns its mutable numeric capacity after the boundary. Forming-bar updates and finalized-bar appends are O(1) mutations.

A legacy OHLCV mirror remains for Vela compatibility consumers, but it is not the preferred candle painting transport. **object materialization** is an explicit compatibility boundary and is never the canonical render transport.

## Incremental contract

```
history       → setData once
new bar       → append
forming bar   → replace-last
style change  → style patch
marker change → marker range patch
fill change   → fill patch
```

A full replacement is allowed only when identity/order/continuity cannot prove a smaller patch.

## Deep history

```
Vela range request
 → TCO provider
 → ChartDataPlane
 → local cache
 → Fyers only if missing
 → prepend 5,000
 → preserve viewport
```

Retention remains bounded at 50,000 bars.

## LOD

LOD uses typed bucket arrays and source ranges. The target is **zero-object LOD** on the native path; legacy reduced-candle object input is compatibility-only.

## Motion

Current Vela defaults are intentionally restrained:

- zoom 260ms
- pan inertia 360ms
- scroll 320ms
- autoscale 260ms
- live-bar easing 180ms

Motion is spatial continuity, not decoration. Motion remains the DOM/UI animation layer; Vela owns chart motion.

## Viewport rule

History prepend must preserve the user's logical/time anchor. Data growth must not automatically refit the chart to the newest candle.

## v126 — Vela interaction and history ingress

Vela now owns the complete Alt quick-tool interaction. Holding **Alt** on the chart opens a radial wheel sourced from the Vela drawing registry. The wheel exposes common line, Fibonacci, shape, text and anchored-VWAP tools, while the center action opens the active Vela panel dock. Editable fields are excluded so Alt remains safe during text entry.

The live workspace no longer mounts a competing React Alt indicator wheel. This keeps input ownership inside the chart engine and avoids duplicate overlays.

The first native Vela history paint uses compact broker columns when available. Vela still exposes `setBarsColumns()`/`updateBarColumns()` to the native renderer, while older compatibility consumers may still receive `OHLCV[]`.

### TCO chrome model

The production chart chrome uses a graphite-black base with royal purple/indigo accents. The duplicate watchlist control is replaced by the **Bookmarks** side panel, and the topbar provides explicit **Panels** and profile/account actions. Workspace state continues through the Vela persistence adapter, with TCO exposing `saveNow()` for scheduled autosave.

## v127 — columnar retained history

The retained RAW Vela history is now backed by `ColumnarHistoryTape`. It stores OHLCV in typed numeric columns with a 50,000-bar capacity and performs prepend/append/replace-last mutations directly against the tape.

`OHLCV[]` remains available as a compatibility projection for session/replay/script consumers that have not yet moved to the columnar ABI. This distinction is explicit; the tape is the source of truth.

## v127 — range patching

Vela's `ValuePatch` ABI already supports `replace-range`. CoreSpirit now supplies `IndicatorModel.dirty`, and the orchestrator converts dirty models into range deltas using binary time bounds. Untouched historical values are not rewritten.

This is the intended bridge from reactive CoreSpirit execution to renderer work: semantic dirty span → model dirty span → RenderPacket/ValuePatch dirty span → retained Vela scene update.

## v127 — rendering telemetry

The native renderer exposes frame-paint counters through `getPerformanceStats()`. Workspace aggregation reports per-cell backend, frame count, average/worst frame time and long-frame count. TCO polls these samples and publishes them to the performance telemetry store plus `window.__TCO_PERF__` for browser instrumentation.

The backend field identifies the active rendering backend; it is not presented as a direct GPU timer measurement.

## Deep-history interaction invariant

```
5,000 initial candles
→ visible immediately
→ left-edge trigger
→ one older 5,000 page
→ preserve logical viewport
→ repeat
→ hard 50,000 retention cap
```

This remains independent from indicator calculation: history transport, CoreSpirit dirty execution and Vela rendering are separate layers.

## Motion boundary

Motion remains intentionally restrained. UI/DOM motion uses the existing Motion/CSS layer; Vela owns chart navigation animation. Three.js is not used for routine DOM transitions because it would introduce an unnecessary rendering subsystem.

## v128 — columnar deep backfill

The `ColumnarHistoryTape` is now used for both initial data and deep backward paging. `loadRangeColumns` carries a bounded older-history page from the TCO provider into `prependColumns`, avoiding a retained-series OHLCV object rebuild on every 5,000-bar prepend.

The identity-chart path updates the renderer from the retained columnar snapshot and materializes only the new compatibility head page when legacy consumers need objects. Transformed price styles retain their compatibility projection because they genuinely require derived candle values.

## v128 — dirty-range/render closure

History backfill supplies a causal dirty interval based on the new head plus indicator `maxLookback`. CoreSpirit computes that bounded span and Vela converts the resulting model into a binary-bounded `replace-range` value patch. Unchanged series tails remain intact.

## v128 — frame budget telemetry

Per-cell Vela performance now includes `p95FrameMs`, `fps`, `frameBudgetMs`, `frameBudgetMisses` and `frameBudgetMissRate` in addition to average/worst/long-frame counters. The frame sample buffer is fixed at 240 entries, keeping telemetry overhead bounded.

The browser verification harness can exercise one, four and eight-cell deployments by supplying matching URL/cell-count pairs. It also fails when observed p95 frame time exceeds the configured threshold.

## Archived renderer migration reference

The historical renderer migration material has been consolidated here. The important durable rule is that Vela is the sole chart/rendering engine and TradingCoreOS talks to it through TCO-owned facades/adapters. Renderer-specific compatibility belongs behind that boundary; new chart capabilities should extend Vela's headless interfaces, columnar data path and retained patch model rather than reintroducing a second chart stack.

## Stage 94 retained zero-copy contract

The canonical columnar data plane feeds the `Vela NativeRenderer` without object materialization in the hot LOD/GPU path. The active chart boundary retains the historical `canonical columnar data plane`, `Vela NativeRenderer`, `object materialization`, and `zero-object LOD` terminology so the retired standalone renderer-migration document is no longer needed.


## v130 — performance ABI boundaries remain explicit

Vela's retained `ColumnarHistoryTape`, range patching and frame telemetry are now treated as separate measurable boundaries. The next ABI step is still to eliminate remaining `OHLCV[]` projections from session/replay/drawing/transform consumers wherever direct column access can preserve semantics. Dirty-range handling also remains open until every relevant RenderPacket collection and Vela overlay can consume the same exact causal interval without broad replacement fallback.

No source-level claim substitutes for runtime evidence: authenticated browser measurements for 1/4/8 charts, 5k initial load, 5k prepend and live ticks, plus GPU-specific counters, remain explicit validation gates.

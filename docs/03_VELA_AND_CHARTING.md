# Vela and charting

Vela is TradingCoreOS's sole charting/rendering engine. Application code crosses into it through TCO-owned facades/adapters.

## Vendor boundary

## Vela capability architecture — v135

The vendored Vela fork currently contains **384 source files**. The bundle risk is not just file count; the renderer composition root can make optional chart capabilities part of the same JavaScript graph.

The audited hotspots include:

| Capability | Largest module | Approx. source size |
| --- | --- | ---: |
| Native renderer | `renderers/native/NativeRenderer.ts` | 258 KB |
| Engine orchestration | `core/engine/EngineOrchestrator.ts` | 181 KB |
| Multi-chart workspace | `workspace/VelaWorkspace.ts` | 135 KB |
| Drawing paint | `renderers/native/drawings/DrawingPainter.ts` | 83 KB |
| Chart-cell workspace | `workspace/ChartCell.ts` | 82 KB |
| Settings UI | `renderers/native/chrome/SettingsDialog.ts` | 78 KB |
| WebGL2 backend | `renderers/native/backend/WebGL2Backend.ts` | 64 KB |

### Critical import leak found

```
basic chart
  → NativeRenderer
  → UserDrawingController
  → DrawingPainter / Interaction / Toolbar / Settings
  → drawing registry
  → dozens of drawing implementations
```

The drawing registry statically imports Fibonacci, Gann, harmonic, Elliott, geometry, markup and volume-profile implementations. A trader opening a basic candle chart should not pay for those classes.

The renderer boundary has therefore been changed:

- `NativeRenderer` uses a **type-only** `UserDrawingController` reference.
- The concrete controller is loaded with a **dynamic import** when `userDrawingsPort` is first requested.
- A lazy proxy preserves the existing synchronous drawing-port contract while the implementation chunk loads.
- `velaChartFacade.ts` no longer re-exports `VelaWorkspace` as a runtime value.
- `velaWorkspaceLoader.ts` exposes the multi-chart workspace as an explicit on-demand capability.

### Locked capability layers

```
CORE
  auth / routing / theme / lightweight shell

TRADING
  chart renderer / Vela native core / broker / realtime

RESEARCH
  CoreSpirit editor / models / backtest-replay

ADVANCED
  drawing registry / workspace layouts / automation / scanners / ML
```

The production TCO chart path is intentionally built through `velaChartFacade` + `NativeRenderer`, not through the Vela SDK composition root, so the application does not eagerly import Vela's multi-provider SDK catalog or multi-chart workspace just to display a single chart.

### Remaining Vela split

The current change removes the highest-confidence eager drawing/workspace edges. It does **not** yet claim that all advanced Vela code is independently chunked.

Next gates:

```
drawing capability
  ├─ lean-core tools
  ├─ Fibonacci
  ├─ Gann
  ├─ harmonics / Elliott / patterns
  └─ volume-profile / measurement

renderer optional capabilities
  ├─ VPVR
  ├─ settings/chrome
  └─ other feature-specific UI
```

Advanced families should be independently loaded only when their UI or drawing type is requested. The acceptance criterion is network evidence: a basic chart has no drawing-family JavaScript request until the user opens the relevant capability.

TCO feature code crosses into the vendored Vela fork only through the TCO chart facade/provider boundary. Vela renderer internals stay behind that seam.

## Boundary

```
TradingCoreOS
 → velaChartFacade
 → TCO Vela adapter/provider
 → modified Vela
 → native renderer
```

TCO feature code should not depend directly on Vela renderer implementation classes.

## Canonical columnar data plane

The **canonical columnar data plane** is the numeric OHLCV boundary from TCO into Vela. The production identity-chart path feeds the **Vela NativeRenderer** from typed columns rather than using object rows as the render transport.

**Object materialization** remains an explicit compatibility operation for consumers that have not migrated to the columnar ABI. The native LOD path targets **zero-object LOD**: reduced geometry is represented as typed bucket/index data instead of repeatedly constructing reduced candle objects.

## Columnar candle API

The columnar candle API is the renderer-facing typed time/open/high/low/close/volume contract. It is the preferred ingestion path for identity OHLCV charts and avoids per-candle object allocation in the native renderer.

## Columnar retained history

`ColumnarHistoryTape` is the retained raw-history source of truth for identity OHLCV charts.

It supports:

- typed time/open/high/low/close/volume columns
- binary time lookup
- append
- replace-last
- prepend
- bounded trim
- 50,000-bar retention

The native renderer consumes typed columns. The user-visible history flow is:

```
5,000 initial
 → left-edge trigger
 → 5,000 older
 → preserve logical viewport
 → repeat
 → 50,000 maximum
```

### Important status

This is **not yet a zero-object end-to-end Vela tape**.

Selected Vela consumers still use explicit `OHLCV[]` projections for compatibility, especially where existing replay/session/drawing/transformed-price APIs have not migrated to a columnar ABI. The native candle renderer is not dependent on those objects, but the compatibility mirror cannot be removed until those consumers are converted.

## Rendering patch model

The preferred mutation classes are:

```
initial history → set data
new bar        → append
forming bar    → replace-last
older page     → prepend
style change   → style patch
localized data → replace-range
```

A full replacement is only valid when identity/order/continuity or a dependency contract prevents a smaller patch.

## Dirty-range bridge

The primary CoreSpirit/Vela history path can produce a causal dirty range and convert it into a binary-bounded range delta.

**Current status: partial completion.** The bridge is real, but not all renderer-owned collections and overlay categories are guaranteed to preserve one exact dirty span end-to-end. This is one of the three remaining deep architecture phases.

## Motion

Chart motion belongs to Vela. Current restrained defaults are:

- zoom: 260ms
- pan inertia: 360ms
- scroll: 320ms
- autoscale: 260ms
- forming-bar easing: 180ms

DOM/UI motion remains with Motion/CSS. Three.js is not used for ordinary DOM animation because it would create an unnecessary rendering subsystem for the terminal.

## Alt drawing wheel

Holding Alt on the chart opens the Vela-owned drawing wheel. It is populated from the Vela drawing registry and includes common line, Fibonacci, shape, text and anchored-VWAP tools. The center action opens the active panel dock.

The React workspace does not mount a competing Alt wheel.

## Workspace persistence

Vela workspace state is persisted through the TCO Supabase adapter with a local fallback. The live workspace schedules a 15-minute autosave.

Persisted state includes the chart/layout state used for the user experience: symbol/timeframe, drawings, indicators, panels, layout and related Vela workspace state.

## Performance telemetry

Vela exposes frame/backend statistics and TCO aggregates stage-level telemetry. The browser verifier reads `window.__TCO_PERF__`.

**Runtime browser verification is still open.** Source contracts do not claim that authenticated browser or GPU measurements have been captured.

## v131 boundary cleanup

The canonical stateful mathematical path is shared by CoreSpirit, scalar indicator execution and fused execution. Vela's retained history remains columnar by default, while compatibility object materialization stays explicit and tracked.

## Three remaining deep phases

1. **True columnar history ABI completion** — migrate the remaining Vela session/replay/drawing/transform consumers and remove the compatibility mirror.
2. **Exact dirty-span completion** — carry one proven causal range through CoreSpirit → renderer/model packets → Vela invalidation for every supported overlay collection.
3. **GPU/frame runtime verification** — capture actual browser measurements for 1/4/8 charts, 5k load, 5k prepend and live ticks; add GPU telemetry only where the browser/backend can provide meaningful counters.

## Historical renderer migration notes

The old standalone renderer migration document has been retired. Durable renderer-boundary information lives here; superseded implementation notes remain in `docs/archive/history/`.

## Workspace chrome and product composition (v132)

TradingCoreOS owns the application chrome around Vela while Vela remains the chart engine.

The live workspace now composes explicit TCO actions for:

- **TradingCoreOS × Vela** brand identity
- **Watchlist**
- **Journal**
- **Panels**
- Account / broker controls

Vela attribution remains visible through the chart. TCO does not silently remove the Vela attribution required by the vendored project's license.

The old Quant entry is intentionally absent because TradingCoreOS does not expose LuxAlgo Quant access.

The default live layout is now **1 chart**. A previous persisted 4-chart default is treated as legacy and the workspace state key is versioned so the new default is not contaminated by the old persisted grid. Users can still select a multi-chart layout afterwards.

### Live-terminal motion policy

The live trading surface is intentionally motion-light:

```text
animations = false
live forming bar = snap to feed
```

This keeps market state visually truthful and avoids decorative easing competing with realtime price updates.

Non-live TradingCoreOS pages use the application's normal motion system for professional transitions and reduced-motion accessibility.

## Candle bootstrap failure guard

An empty typed FYERS column response is no longer treated as a valid successful history load.

The boundary now falls back:

```text
empty column response
 → ordinary historical path
 → canonical ChartDataPlane
 → Vela
```

This closes the failure mode where the quote stream could be alive while Vela received zero candles and rendered a blank chart.

The canonical path still prefers typed columns and zero-object rendering whenever actual history is available.


## v130 Vela product chrome
- Default live workspace is one chart and uses a v4 persistence key to isolate legacy four-chart layouts.
- Host-owned topbar brand: TradingCoreOS × Vela.
- Panels opens the TCO watchlist; Journal is a first-class topbar action.
- Alt drawing-wheel selection is royal purple; non-live product accent is #d3ebf4.
- Vela provider registry, columnar feed, retained tape, panel dock, persistence and telemetry remain the preferred seams.


## v136 — drawing registry capability split

The first drawing boundary made `UserDrawingController` lazy, but its registry was still one static catalog. The deeper split is now explicit:

```text
basic chart
  → NativeRenderer
      → no drawing controller at startup

drawing capability
  → UserDrawingController
      → core registry (common lines / annotations)
      → optional family chunks
           ↳ channels / pitchforks
           ↳ Fibonacci / Gann
           ↳ patterns / Elliott / harmonics
           ↳ shapes / stamps
           ↳ measurement / position / magnifier
           ↳ anchored VWAP / fixed-range volume profile
```

`vendor/vela/src/core/drawings/registry.ts` no longer statically imports advanced drawing implementations. `loadAdvancedDrawingCatalog()` dynamically loads the family registries only when the drawings toolbar capability is shown. Custom toolbar definitions remain authoritative.

This is a dependency-graph boundary, not a claim that every individual drawing is independently requested. The family chunks are all optional; a later refinement can load an individual family only when that flyout is opened.

### Evidence gate

- [x] Core registry has no static Fibonacci/Gann/pattern/volume-profile imports.
- [x] Channels, Fibonacci/Gann and patterns/measurement/volume tools are separated into dynamic modules.
- [x] Toolbar visibility is the capability trigger.
- [x] Source contract protects the lazy boundary.
- [ ] Browser trace proving no advanced drawing JS request on chart startup and family requests only after drawings UI.
- [ ] Load only the family whose flyout is opened.

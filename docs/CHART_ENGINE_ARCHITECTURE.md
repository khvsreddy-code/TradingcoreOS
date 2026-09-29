# TradingCoreOS Chart Engine Architecture

## Goal

Build a renderer-independent chart engine with terminal-grade interaction and visual density while using Vela NativeRenderer as the sole production renderer.

## Layers

```text
Market Data
  ↓
ColumnarCandleStore
  ↓
ChartCore
  ├── viewport / panes / scales
  ├── retained Scene
  ├── LOD reduction
  └── render plan
        ↓
ChartRenderer ABI
   └── Vela Native adapter (production)
          ├── WebGL2 geometry backend
          └── Canvas2D fallback
```

## Performance rules

1. React does not own tick-rate chart state.
2. Realtime updates use `update()`/incremental writes; full `setData()` is reserved for genuine history replacement.
3. Visual objects are retained by ID and updated in place.
4. Market data is columnar for reuse by indicators, CoreSpirit and rendering.
5. Dense history uses pixel-aware LOD that preserves high/low extremes.
6. Renderers batch candles, lines, markers, zones and text instead of creating one GPU/UI object per visual item.
7. Worker pools are long-lived and bounded.
8. Chart interaction is imperative and frame-coalesced.

## Indicator authoring integration

Indicators are chart consumers, not independent history owners. A configured native study may expose editable CoreSpirit starter source; its settings and source metadata are kept renderer-neutral and can be published through the community layer.

```text
Canonical Data Plane
      ↓
Indicator Engine / CoreSpirit
      ↓
Indicator Output Store
      ↓
Chart Scene
      ↓
Vela Native renderer backend
```

This keeps the public indicator catalog independent from Vela NativeRenderer and preserves the future native renderer migration path.

## Production renderer policy

The renderer stack is deliberately single-backend at the application boundary:

```text
TCO Chart API
     ↓
TCO Vela adapter
     ↓
Vela NativeRenderer
     ├── WebGL2
     └── Canvas2D fallback
```

CoreSpirit, React components, indicators and broker/data services do not import Vela renderer internals. The only application-level Vela integration point is `src/services/core/chart/velaChartFacade.ts` plus the renderer-port implementation in `velaNativeChartRenderer.ts`.

This keeps vendor churn localized and makes the TCO chart contract the compatibility boundary. Vela is used as the chart/rendering backend only; market-data ownership, indicator computation, CoreSpirit execution, automation and broker authorization remain TCO-owned.

## Vela integration rules

1. **No external scripting engine is enabled by TradingCoreOS.** CoreSpirit is the only user-facing chart language.
2. **No vendor API crosses the TCO chart boundary.** React and CoreSpirit consume TCO types/facades.
3. **Canonical data remains TCO-owned.** Vela receives chart bars and rendered indicator models, never broker credentials or order capabilities.
4. **Realtime stays incremental.** Forming bars use the Vela `updateBar` path; history replacement uses `setBars`.
5. **Renderer semantics remain declarative.** CoreSpirit emits plots, signals, drawings and levels; the adapter translates those into Vela-native models.
6. **Attribution stays enabled.** The bundled Vela `NOTICE` requires a visible attribution mark on screens containing charts; the native renderer's default attribution is retained.

## Do not do

- Do not make React the chart renderer.
- Do not let CoreSpirit depend on Vela APIs.
- Do not introduce another chart vendor as an application-level fallback. Vela already owns WebGL2 → Canvas2D backend selection internally.
- Do not allocate one browser/GPU object per prediction, drawing or signal when a retained/batched primitive is possible.
- Do not remove historical data merely to improve rendering; use viewport-aware LOD instead.

## Current implementation status

- `ChartCore`, `ChartDataEngine`, `ChartViewport`, `ChartTimeScale`, `ChartPriceScale` and `ChartScene` remain the TCO-owned architecture.
- `ChartController` now exposes the same renderer-neutral navigation surface over the Vela facade.
- `/live` and the oscillator chart use the same Vela-backed facade, so there is no second production chart library.
- The legacy `WebGL2ChartRenderer` / `Canvas2DChartRenderer` files remain as internal architectural references/tests, but are not selectable production backends.
- The next optimization boundary is **typed-array → Vela native data plumbing**, reducing the current adapter's temporary bar-object materialization for very large history loads.

## v94 — canonical zero-copy data plane

The native chart path now treats `MarketDataStore` as the canonical columnar data plane. `ColumnarCandleStore` remains as a compatibility name over that same storage model.

```text
Market Feed / History
        ↓
Canonical MarketDataStore
        │
        ├── time
        ├── OHLCV
        ├── OI
        ├── bid / ask
        ├── bidVolume / askVolume
        ├── trades
        ├── session
        └── metadata
        ↓
Viewport
        ↓
Retained LOD index
        ↓
Packed GPU candle buffer
        ↓
Native renderer
```

The native path does not require the repeated conversion:

```text
Typed arrays → JS candle objects → new typed arrays → GPU geometry
```

Instead, the hot path retains typed-array views and an incremental LOD index. Only the explicitly required compatibility boundary materializes ordinary objects, currently for Vela NativeRenderer.

### Incremental LOD contract

LOD storage is capacity-backed. Realtime candle updates recompute only the affected bucket range when topology is unchanged. Capacity grows geometrically, so ordinary updates do not allocate a new bucket array on every tick.

The LOD representation stores bucket boundaries and OHLCV values in typed arrays. The legacy object reducer remains only for compatibility tests/callers and is not used by `ChartCore`'s native path.

### Retained GPU data

The native WebGL2 foundation uses a retained `ChartGpuCandleBuffer` and instanced rendering. The chart data buffer is uploaded only when its source revision changes, with `bufferSubData` for the affected region when capacity is stable. Shader transforms perform candle placement from packed OHLC data instead of rebuilding CPU-side candle geometry on every frame.

This is a zero-object native rendering contract, not a claim that the current experimental WebGL2 backend is production-ready.

### Derived stores

Indicator/model/structure/liquidity/order-flow values can be stored in timeline-aligned derived stores that borrow the canonical market timeline rather than maintaining duplicate timestamp columns:

```text
MarketDataStore timeline
        │
        ├── IndicatorStore
        ├── ModelStore
        ├── StructureStore
        ├── LiquidityStore
        └── OrderFlowStore
```

This establishes one canonical time axis for future unified chart, CoreSpirit, model and visual execution.

### Vela adapter boundary

The production workspace uses Vela through the TCO facade. Vela currently accepts normalized OHLCV objects at its public `setBars` / `updateBar` renderer seam, so the adapter contains the temporary materialization cost while the canonical TCO data plane remains columnar. The long-term optimization is a typed-array-aware Vela ingestion seam so large history loads can avoid per-bar objects entirely.

The TCO path still maintains a **zero-object LOD** representation and retained typed arrays upstream of the renderer.

## v95 — full chart engine decomposition — #13/#14

The native chart foundation is now organized as a platform-style engine rather than a single renderer abstraction.

```text
                         TradingCore Chart
                                │
             ┌──────────────────┼──────────────────┐
             ↓                  ↓                  ↓
        Chart Data Engine   Interaction Engine  Rendering Engine
             │                  │                  │
             ↓                  ↓                  ↓
      CanonicalDataPlane     gestures           renderer
      MarketDataStore        pan/zoom           WebGL2
      IndicatorStore         hit testing         Canvas2D
      ModelStore             pointer state       Lightweight bridge
      StructureStore         wheel/pinch         WebGPU later
      LiquidityStore
      OrderFlowStore
             │                  │                  │
             └──────────────────┼──────────────────┘
                                ↓
                           Chart Core
                                │
            ┌───────────────────┼───────────────────┐
            ↓                   ↓                   ↓
        Viewport             Scales              Scene
            │                   │                   │
         X range          time / price /       retained nodes
         pan/zoom         volume / percent      layers
         pixel width      / log                 hit-test metadata
            │                   │                   │
            └───────────────────┼───────────────────┘
                                ↓
                           render passes
```

### Data engine

`ChartDataEngine` owns no duplicate history. It resolves the canonical timeline and exposes:

```text
replace
append
updateLast
read typed views
indicator binding
model feature binding
consumer registry
```

### Interaction engine

`ChartInteractionEngine` owns user-gesture state without depending on React. It normalizes:

- pointer down/move/up
- wheel zoom
- pinch zoom
- retained hit testing against scene bounds

This is deliberately separate from rendering so interaction can later run at pointer frequency while rendering remains frame-coalesced.

### Scale system

`ChartScaleModel` defines renderer-neutral transforms for:

```text
time → x
x → time
price → y
y → price
volume coordinates
linear price
log price
percent price
```

These transforms are chart semantics, not Vela NativeRenderer APIs.

### Scene system

The retained scene is now intended to represent the chart as semantic layers:

```text
background
↓
grid
↓
data
↓
indicator
↓
structure
↓
liquidity
↓
drawing
↓
marker
↓
interaction
↓
overlay
↓
ui
```

Stable node identity is required so realtime updates become retained updates instead of delete/recreate cycles.

### Pane system

The engine has an explicit pane registry with price and volume as the initial fixed panes and custom/oscillator panes available through the same model. Each pane owns its own scene and scale model while the time axis remains a shared chart coordinate concept.

Future panes include:

```text
volume profile
order flow
MACD/oscillators
footprint
depth / heatmap
model probability
```

### Rendering coordinator

`ChartRenderingEngine` is the retained host coordinator. It owns renderer-neutral scene/scales/panes and delegates actual pixels to the selected renderer.

Current production:

```text
ChartController → Vela NativeRenderer
```

Experimental native:

```text
ChartRenderingEngine
        ↓
WebGL2 / Canvas2D
```

WebGPU remains a future backend option, not a current production dependency.

## v95 migration rule

Native chart development must improve semantic parity before replacing the production renderer. The renderer is the last layer to become authoritative.

The target sequence is:

```text
canonical data
      ↓
viewport + scales
      ↓
scene/layers
      ↓
interaction + hit testing
      ↓
render passes
      ↓
WebGL2 parity
      ↓
production migration gate
```

The production workspace continues to use Vela NativeRenderer during this period.


## v96 — viewport is the chart coordinate authority

Before rendering, the engine resolves one explicit viewport state:

```text
Viewport
├── firstVisibleBar
├── lastVisibleBar
├── pixelsPerBar
├── priceMin
├── priceMax
├── zoom
├── scroll
├── pixelWidth
└── devicePixelRatio
```

`from/to` remain compatibility aliases for the half-open visible-bar range. Rendering, LOD selection, pan/zoom math and coordinate conversion derive from this state rather than from Vela NativeRenderer objects.

### Fast horizontal transforms

The hot path uses a cached affine transform:

```text
barIndex → x
x → fractional barIndex
```

```text
x = (barIndex - firstVisibleBar - scroll) × pixelsPerBar
barIndex = firstVisibleBar + scroll + x / pixelsPerBar
```

The transform object is updated only when viewport state changes. Calls do not allocate arrays, candle objects or coordinate objects.

### Interaction invariants

Pan may move by whole or fractional bars. Zoom changes pixels-per-bar while preserving the requested anchor location. Resize recomputes pixels-per-bar from the current logical visible range instead of reinterpreting the market timeline.

## v96 — dedicated time scale engine

`ChartTimeScale` owns timestamp ↔ display-coordinate semantics and consumes the canonical `Float64Array` timeline.

Supported modes:

```text
continuous
compressed
session-compressed
```

Continuous mode preserves wall-clock gaps. Compressed mode treats supplied market bars as the horizontal sequence and removes weekends/holidays/non-trading gaps. Session-compressed mode can retain a deterministic configured inter-session gap without allocating wall-clock weekend space.

Time behavior is parameterized by:

```text
timezone
calendar
session windows
holiday dates
special sessions
timeframe
```

Timezone uses an explicit IANA identifier; the browser's local timezone is not an implicit chart dependency.

`ChartTimeScale` uses ordered binary search for timestamp lookup and only interpolates across neighboring bars when the gap is compatible with the configured timeframe. Large gaps snap to a neighboring bar rather than inventing missing market data.

### Multi-timeframe rule

The scale accepts a timeframe contract but does not aggregate raw bars. Aggregation belongs in the market/data plane. This keeps coordinate semantics independent from data construction.

## v96 — dedicated price scale engine

`ChartPriceScaleEngine` owns:

```text
linear
logarithmic
percent
indexed
```

and separates scale policy from transform math:

```text
auto
manual
locked
```

Forward and inverse mappings use cached coefficients, so hot-path calls are arithmetic rather than repeated domain setup.

### Auto-scale

Auto-scale scans only the active visible range and applies deterministic padding. Percent/indexed modes may use a visible-base price until the user supplies an explicit base. Manual domains remain stable. Locked domains reject ordinary updates.

### Pane rule

All horizontal panes share one viewport/time coordinate authority. Price, volume, oscillator and future order-flow panes retain independent vertical domains.

## v96 target architecture

```text
                     TradingCore Chart
                            │
          ┌─────────────────┼──────────────────┐
          ↓                 ↓                  ↓
     Canonical Data     Interaction       Rendering
          │                 │                  │
          ↓                 ↓                  ↓
 Market/Indicator/       Input/Gesture      WebGL2
 Model/Structure/        Hit testing        Canvas2D
 Liquidity/OrderFlow                         Lightweight bridge
          │                 │                  │
          └──────────┬──────┴──────────────────┘
                     ↓
                Chart Core
                     │
          ┌──────────┼───────────┐
          ↓          ↓           ↓
      Viewport     Scales       Scene
          │          │           │
          ↓          ↓           ↓
      x / bar      time/y      retained
      pan/zoom     price       layers
                    volume      nodes
```

## Production boundary

Vela NativeRenderer remains the production renderer. It receives compatibility materializations only at its bridge. The viewport/time/price mathematics above must remain reusable by the eventual native renderer, replay, screenshot/export and non-UI chart consumers.


## v97 — drawing and interaction architecture

The chart now has a renderer-neutral public interaction contract. Drawing creation/control and navigation are no longer expected to depend directly on a renderer.

```text
                  TradingCoreChartApi
                     /           \
                drawings       navigation
                   │               │
              CoreDrawingStore   ChartNavigationApi
                   │               │
              tool/session     ChartGestureController
                   │               │
              hit testing      ViewportController
                   │               │
                   └───────┬───────┘
                           ↓
                      Chart Scene
                           ↓
                 renderer adapter/backend
```

The production Vela NativeRenderer adapter is allowed to translate navigation calls. Native WebGL/Canvas renderers use the same contracts directly.

Drawing geometry is deliberately separated from drawing state. A drawing can exist before a renderer knows how to paint every advanced geometry family.


## v99 terminal-shell composition boundary

The chart engine remains the central visual/runtime surface inside `/live`. The v99 shell supplies surrounding terminal chrome (instrument command bar, right information dock, and bottom operational dock) but does not move chart data, viewport state, drawing state, or renderer semantics into those UI docks.

The intended ownership remains:

```text
market data → canonical chart data plane → chart engine → renderer
                                      ↑
                               terminal shell
```

Terminal controls may dispatch existing chart-scoped commands; they are not a second chart implementation.

## v100 terminal presentation contract

The live terminal is a chart-first host surface. Its visual shell is deliberately separate from renderer semantics: chart data, retained scene state, navigation and drawing APIs remain unchanged while the host uses a flatter, denser presentation. Live chart infrastructure should not depend on decorative card primitives, large radii or drop shadows.


## v103 multi-chart runtime rule

A chart renderer is a visual consumer, not a private market-data runtime. `LiveChart` resolves a dataset through `ChartDataPlane` and receives shared snapshots/ticks. Renderer lifecycle remains per chart cell because viewport, drawings and series projections are inherently chart-local.

```text
                 shared data/compute
                       │
       ┌───────────────┼────────────────┐
       ↓               ↓                ↓
   chart renderer   chart renderer   chart renderer
   viewport A       viewport B       viewport C
```

Analytics, indicators and predictions are dataset/revision-scoped and are not recomputed independently merely because another chart cell renders the same data.

The target scaling relation is:

```text
renderers ∝ chart cells
shared data/compute ∝ unique datasets
broker symbols ∝ unique broker/symbol pairs
```

## v104 demand-driven history + multi-chart budget — 2026-09-29

The v103 shared chart data plane is now refined so history initialization, older-page acquisition and compute inputs scale by actual user demand. Initial chart paint is bounded to 300–1,500 candles by timeframe; visible-range movement requests one bounded older page; only the active chart is eligible for a single low-priority warm page. A global `ChartHistoryCoordinator` limits browser history requests to two concurrent operations.

The `HistoryStore` remains reusable retention up to 50,000 candles, but `ChartDataPlane` materializes only its active demanded window. Cached older data is reused through binary-search `getBefore()` before issuing a broker request.

The client/runtime/server history contract now forwards and validates an explicit `limit`, removing the old fixed-size initial request path. The chart compute coordinator also protects pathological deep-history states with a 10,000-candle worker input ceiling while preserving the v103 bounded worker pools and dataset/revision cache identity.

For older-history prepends, logical viewport state is restored with the logical-range API so user navigation does not jump.

**Non-interference:** CoreSpirit language/compiler/IR/VM, execution/risk authority, terminal dock ownership, drawing semantics, and shared realtime symbol-feed ownership remain unchanged.

## v106 compute/render separation — 2026-09-29

The chart engine continues to own renderer-local state while indicator computation remains shared. The renderer receives computed series plus presentation metadata and is not permitted to own a second mathematical dependency graph.

Viewport changes may change compute-window residency, while appearance changes may change series options. Neither operation should create a new worker, history transport, or broker subscription.

## v107 incremental series consumption — 2026-09-29

The chart engine now has an explicit distinction between full indicator snapshots and tail patches:

```text
full result       → series.setData(...)
incremental point → series.update(...)
```

The renderer remains chart-local and owns only presentation state. Indicator math remains worker-side. Supported multi-output studies update their affected output series together so the chart does not display a partially advanced indicator set.

When a legacy/non-incremental study is enabled alongside incremental studies, its renderer path may still recompute as before, but it must not destroy the worker-resident incremental series on every forming tick.

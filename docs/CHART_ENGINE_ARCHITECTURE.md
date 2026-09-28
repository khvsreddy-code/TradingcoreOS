# TradingCoreOS Chart Engine Architecture

## Goal

Build a renderer-independent chart engine with TradingView-class interaction and visual density while keeping the current Lightweight Charts path stable during migration.

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
   ├── Lightweight bridge (current)
   ├── Lightweight Charts bridge (production now)
  ├── WebGL2 renderer (future target)
  └── WebGPU renderer (optional later)
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
Renderer backend
```

This keeps the public indicator catalog independent from Lightweight Charts and preserves the future native renderer migration path.

## Migration path

### Phase 1 — complete in v88+

- `ChartCore`
- `ColumnarCandleStore`
- `ChartScene`
- `ChartRenderer` ABI
- pixel-aware candle reduction
- redundant history redraw removal

### Phase 2 — after the Lightweight Charts production period

Implement a retained WebGL2 renderer around `OffscreenCanvas` and worker-friendly rendering. Keep the Lightweight Charts bridge as the production fallback until feature parity, interaction parity, drawing parity and performance validation are complete.

The native backend is explicitly disabled by production policy during this phase. Switching renderers is a deliberate migration gate, not an automatic capability fallback.

### Phase 3

Add GPU-native drawing batches, text atlas rendering, multi-pane scales, advanced profiles/heatmaps/footprints and high-volume annotations.

### Phase 4

Add optional WebGPU compute/rendering for very large visual workloads. WebGL2 remains the compatibility baseline until the WebGPU backend is proven in production.

## Do not do

- Do not make React the chart renderer.
- Do not let CoreSpirit depend on Lightweight Charts APIs.
- Do not allocate one series/object for every prediction or drawing when a batched primitive is possible.
- Do not remove historical data merely to improve rendering; use LOD/viewport reduction instead.

## Renderer implementation status

The repository contains a real `WebGL2ChartRenderer` and a `Canvas2DChartRenderer` foundation behind the renderer ABI. These are not production backends yet. The workspace intentionally remains on Lightweight Charts through `ChartController`.

The production policy is explicit:

- `lightweight-charts` is the active workspace backend.
- Native WebGL2/Canvas2D backends are experimental and disabled.
- Columnar data, retained scene state and LOD continue to mature underneath the production chart.
- No renderer migration is considered complete until interaction, drawings, indicators, overlays, multi-pane behavior and realtime behavior have parity.

This lets TradingCoreOS keep the mature TradingView-style chart experience now while building the native engine without coupling CoreSpirit or the workspace to Lightweight Charts APIs.

The next renderer stages are viewport navigation, axes/text, retained interaction/drawing primitives, batched study layers, volume profile/footprint primitives, and optional WebGPU acceleration.

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

Instead, the hot path retains typed-array views and an incremental LOD index. Only the explicitly required compatibility boundary materializes ordinary objects, currently for Lightweight Charts.

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

### Lightweight Charts boundary

The production workspace still uses Lightweight Charts. Its API requires ordinary row objects, so object materialization is intentionally isolated inside `ChartController.setHistory()` and the incremental realtime adapter. That boundary is an adapter cost, not the internal chart data model.

The native path uses a **zero-object LOD** representation and retained typed arrays.

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

These transforms are chart semantics, not Lightweight Charts APIs.

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
ChartController → Lightweight Charts
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

The production workspace continues to use Lightweight Charts during this period.


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

`from/to` remain compatibility aliases for the half-open visible-bar range. Rendering, LOD selection, pan/zoom math and coordinate conversion derive from this state rather than from Lightweight Charts objects.

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

Lightweight Charts remains the production renderer. It receives compatibility materializations only at its bridge. The viewport/time/price mathematics above must remain reusable by the eventual native renderer, replay, screenshot/export and non-UI chart consumers.


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

The production Lightweight Charts adapter is allowed to translate navigation calls. Native WebGL/Canvas renderers use the same contracts directly.

Drawing geometry is deliberately separated from drawing state. A drawing can exist before a renderer knows how to paint every advanced geometry family.

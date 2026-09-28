# Chart Renderer Migration Policy

## Current production choice

TradingCoreOS uses **Lightweight Charts** for the main workspace chart for the current production period.

This is intentional. The native chart engine is being built underneath the production path rather than replacing a mature renderer before feature parity.

## Current flow

```text
Broker / market data
        ↓
chartMarketStore / HistoryStore
        ↓
LiveChart orchestration
        ↓
ChartController
        ↓
Lightweight Charts
```

In parallel:

```text
Historical / realtime OHLCV
        ↓
ColumnarCandleStore
        ↓
ChartCore
        ↓
ChartScene + LOD
        ↓
future native renderer
```

The two paths share data concepts but the production renderer remains isolated.

## Why Lightweight Charts stays

For now it provides the mature interaction surface needed by the workspace:

- realtime candle updates
- time/price scales
- crosshair
- zoom and pan
- series management
- existing indicator overlays
- existing drawing integration
- production-tested chart UX

Replacing it before the native engine has parity would turn renderer development into a workspace regression project.

## Migration gates

The native renderer should only become production-capable after these gates are met:

1. candle rendering and LOD
2. realtime incremental updates
3. zoom/pan/scroll/scale behavior
4. crosshair and coordinate conversion
5. indicators and overlays
6. drawing tools and hit testing
7. prediction/model overlays
8. volume and multi-pane rendering
9. theme switching
10. worker/off-main-thread rendering where beneficial
11. sustained high-history performance
12. build, typecheck and production deployment validation

Until these gates are satisfied, Lightweight Charts remains the production fallback.

## Future target

The eventual architecture is:

```text
CoreSpirit / indicators / models
             ↓
       chart data contracts
             ↓
       ChartCore + Scene
             ↓
       renderer interface
          ↙       ↘
 Lightweight      Native WebGL2
   Charts          renderer
   fallback        ↓
                 optional WebGPU
```

The important constraint is that CoreSpirit and chart features must depend on TradingCoreOS chart contracts, not on Lightweight Charts APIs.

## Rule

**Do not prematurely activate the native renderer.**

Build the native engine beside the production renderer, prove parity, then migrate deliberately.

## v94 zero-copy migration boundary

The migration strategy is now explicitly data-first:

```text
                    canonical data plane
                           │
                MarketDataStore / views
                           │
              ┌────────────┴────────────┐
              ↓                         ↓
       production bridge          native renderer
              ↓                         ↓
     Lightweight Charts         LOD index / GPU buffer
```

### Native-path rule

Native chart code must prefer:

- `MarketDataStore` typed-array views
- `ChartLodIndex`
- retained GPU buffers
- viewport indices
- incremental dirty ranges

and must not use `toArray()` for routine rendering.

### Compatibility rule

`ChartController` may materialize JavaScript objects only at the Lightweight Charts API boundary. This remains necessary while Lightweight Charts is the production backend.

### Realtime rule

A developing candle should update the canonical columnar store in place. The LOD index should recompute only the affected bucket(s), and the native GPU buffer should update only the affected packed range where capacity and topology permit it.

### Future shared-memory direction

The next stage can move the canonical store into `SharedArrayBuffer`/worker-owned memory where browser and security constraints make that useful. That is intentionally a future transport/storage optimization. v94 first establishes the ownership and zero-object boundaries so shared memory can be introduced without redesigning the chart API again.

### Production gate remains unchanged

Lightweight Charts stays production. Native WebGL2 remains experimental until renderer parity, interaction parity, drawing parity, multi-pane behavior, sustained history performance and full production validation are proven.

## v95 data/engine parity policy

The migration is no longer only a renderer swap. The native engine must share the same chart semantics below the renderer boundary.

```text
canonical data plane
        ↓
viewport
        ↓
scales
        ↓
scene
        ↓
interaction
        ↓
renderer adapter
```

Lightweight Charts may implement the final rendering/interaction bridge for now, but chart feature contracts should live above it.

### Native parity gates added in v95

1. Canonical market history is shared with indicator/model consumers.
2. Chart viewport is renderer-neutral.
3. Price/time/volume/percent/log transforms are renderer-neutral.
4. Scene layers and stable node identities are renderer-neutral.
5. Hit testing uses semantic scene bounds rather than renderer-specific objects.
6. Price and volume panes use one chart-engine model.
7. Rendering is a host backend concern.
8. Lightweight Charts remains the production implementation until the feature gates are satisfied.

### Non-goals

- replacing Lightweight Charts in v95
- claiming TradingView feature parity
- requiring WebGPU
- forcing every worker path onto SharedArrayBuffer before browser/security validation


## v96 coordinate migration rule

Native renderer work must consume the renderer-neutral viewport and scale contracts rather than reimplementing coordinate math inside WebGL/Canvas code.

```text
canonical timeline
      ↓
ChartViewportController
      ↓
ChartTimeScale / ChartPriceScaleEngine
      ↓
retained scene
      ↓
renderer adapter
```

This prevents renderer-specific zoom, session-gap, logarithmic-scale or percent/indexed-scale behavior from becoming a second source of truth.

### v96 migration gate additions

- viewport state parity
- bar-index/pixel transform parity
- continuous/compressed/session-compressed time parity
- timezone/calendar behavior parity
- linear/log/percent/indexed price parity
- auto/manual/locked scale parity
- multi-pane horizontal coordinate parity


## v97 drawing/interaction migration boundary

Drawing and navigation are now explicit migration seams.

```text
Feature code
    ↓
TradingCore chart contract
    ├── drawings
    └── navigation
    ↓
production adapter → Lightweight Charts
native adapter     → WebGL2 / Canvas2D / future WebGPU
```

### Drawing parity requirement

Native activation must not happen until canonical drawing semantics match the production experience for creation, editing, selection, locking, visibility, z-order, deletion, persistence and supported tool geometry.

### Navigation parity requirement

Native activation must not happen until time spacing, horizontal offset, visible range, pan/zoom anchoring, time/X and price/Y conversions, and pan/zoom gating behave consistently with the production adapter.

### Vendor boundary

No TradingView/Lightweight Charts drawing implementation is copied into Core Chart. The project implements its own drawing store, tool contracts, geometry and interaction state machine.

# CHARTING LEGACY ARCHITECTURE

> Consolidated legacy material. The active source of truth is now the four canonical documents in `docs/01-04_*.md` plus `docs/CORESPIRIT_BUILD_TRACKER.md`.

---

# SOURCE: docs/CHART_DATA_PLANE_ARCHITECTURE.md

# TradingCoreOS Canonical Chart Data Plane

## Purpose

Define one canonical, columnar data plane for chart candles and timeline-aligned derived data while keeping renderer details behind a single Vela-backed chart boundary.

## Canonical store

`MarketDataStore` owns the primary timeline and market columns:

```text
MarketDataStore
├── time
├── open
├── high
├── low
├── close
├── volume
├── oi
├── bid
├── ask
├── bidVolume
├── askVolume
├── trades
├── session
└── metadata
```

All numeric columns use dense typed storage. Missing optional fields use `NaN` inside dense buffers instead of allocating per-row option objects.

## Derived plane

Derived stores borrow the canonical timeline:

```text
MarketDataStore
      │
      ├── IndicatorStore
      ├── ModelStore
      ├── StructureStore
      ├── LiquidityStore
      └── OrderFlowStore
```

No derived store needs to duplicate the timestamp column just to stay aligned.

## Native rendering flow

```text
canonical columns
      ↓
viewport range
      ↓
retained LOD index
      ↓
packed Float32 GPU buffer
      ↓
instanced native renderer
```

The renderer sees typed numeric state, not a collection of candle objects.

## Allocation policy

Allowed allocations:

- capacity growth when storage genuinely needs to expand
- first creation of a new LOD topology
- explicit compatibility materialization
- initial GPU buffer creation

Avoided allocations:

- per-candle row objects on native rendering
- complete LOD object arrays on every frame
- complete GPU repacking for ordinary realtime updates
- duplicate timestamp arrays across derived domains

## Vela NativeRenderer boundary

The current production renderer still requires JavaScript objects. `ChartController` is the only intended conversion boundary for that path. The columnar store remains canonical underneath it.

## Zero-copy terminology

In v94, zero-copy means **no repeated application-level object/array conversion on the native hot path** and stable typed-array ownership across storage, viewport/LOD planning and GPU staging. A browser GPU driver may still copy data into implementation-managed GPU memory when an API upload occurs; that is below the application data model and cannot be eliminated by a TypeScript storage abstraction alone.

## Future extensions

The same plane can later support:

```text
shared worker memory
multi-symbol timelines
multi-timeframe alignment
incremental indicators
model feature tensors
order-flow matrices
volume profile
footprints
GPU compute
WebGPU storage buffers
```

Those are extensions of the canonical plane, not reasons to create parallel chart data models.

## v95 shared consumer ownership — #12

The canonical data plane is now the ownership point for market history. Chart, indicators, models, structure, liquidity, order flow, replay and scanner services should resolve the same timeline key and borrow the same typed-array market views.

```text
                    CanonicalDataPlane
                           │
                  MarketDataStore
                           │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
     indicators          models              chart
        │                  │                  │
   IndicatorStore       ModelStore       ChartDataEngine
        │                  │                  │
        └──────────────┬───┴──────────────────┘
                       ↓
                 same timeline
                 same backing data
```

### Ownership rule

Consumers may own:

- derived output columns
- incremental algorithm state
- model tensors created from derived features
- visual metadata and scene nodes

Consumers must not own another copy of the canonical OHLCV/history columns merely because they are an indicator, model or chart.

### Canonical binding

New consumers should use the shared data-plane bindings rather than accepting `HistoricalCandle[]` as their primary execution input:

```text
canonical plane
      ↓
read-only typed view
      ↓
indicator/model execution
      ↓
derived output store
```

Object arrays remain compatibility inputs at legacy UI/worker boundaries. They are not the canonical ownership model.

### Revision semantics

Every canonical timeline has one revision and dirty range. Derived consumers can decide whether a revision requires:

```text
full recompute
incremental tail update
bucket-local update
no work
```

This is the foundation for replay, scanners, multi-symbol execution and optimization without multiplying history storage.

## v95 multi-consumer invariant

```text
one symbol + timeframe timeline
            ↓
      one canonical store
            ↓
  many read-only consumers
            ↓
  independent derived outputs/state
```

The invariant is semantic single ownership, not a claim that every worker transport is already physically shared-memory. Worker/SAB transport remains a later transport optimization.


## v96 viewport/scale consumption

The canonical data plane remains renderer-neutral. v96 adds a viewport/time/price layer above it:

```text
MarketDataStore
      ↓
viewport range
      ↓
ChartTimeScale + ChartPriceScaleEngine
      ↓
LOD / scene / renderer
```

The scale engines consume typed timeline/market columns directly. They do not materialize candle objects. Visible-range autoscaling reads high/low columns from the canonical store and produces only the current scale domain.

This establishes a clean boundary for future viewport-only residency, SharedArrayBuffer transport and GPU storage-buffer paths without changing the ownership model.


## Indicator authoring / community

User-authored indicators never receive a private copy of canonical history. Settings and CoreSpirit source are metadata/artifact state; runtime data continues to flow from `MarketDataStore`. Public publication stores source metadata and an immutable source snapshot in Supabase, not a duplicate market dataset.

## v100 UI boundary

The chart data plane remains isolated from terminal presentation. Dense terminal layout changes should consume existing chart/store outputs without introducing React-owned copies, alternate data stores or presentation-specific feed subscriptions.


## v101 terminal consumption rule

Right-dock surfaces are presentation consumers of existing market-data state. Watchlist rows consume the workspace tick map; Order Book reads normalized bid/ask depth from the selected tick; Alerts consume the selected instrument as UI context. The terminal must not create one market-data subscription per panel or materialize a second canonical OHLCV store.

## v102 right dock consumption boundary

Right-dock surfaces remain consumers of existing market-data state. v102 makes that boundary explicit by separating the dock shell from independent React panel surfaces:

```text
workspace tick map
       ↓
┌───────────────────────────────┐
│ RightTerminalDock             │
│  ├ WatchlistSurface           │
│  ├ OrderBookSurface           │
│  └ AlertsSurface              │
└───────────────────────────────┘
```

Only the active surface is mounted. The dock does not create a second canonical OHLCV/Level-2 store or a per-panel market-data subscription. Instrument-search and option-chain caching remain in the canonical market-data/runtime services.

## v103 — shared multi-chart data-plane boundary

v103 turns the existing canonical data-plane work into the ownership boundary for multi-chart layouts. `ChartDataPlane` is now the shared lifecycle for one `broker:symbol:timeframe` dataset. It owns history requests, realtime candle reconciliation and the connection to the canonical typed-array store.

The realtime transport is intentionally one level above timeframe:

```text
broker:symbol
      ↓
shared chart feed
      ↓
chartMarketStore
      ├── broker:symbol:1m
      ├── broker:symbol:3m
      ├── broker:symbol:5m
      └── broker:symbol:15m
```

This prevents a multi-timeframe workspace from creating one broker subscription for every chart cell.

### v103 single-flight history

For a dataset, history acquisition is represented by one in-flight promise. Multiple chart consumers attach to the same result instead of issuing independent history requests. Older-history loading is also single-flight and occurs on demand from the shared left-edge trigger.

### v103 compute plane

`ChartComputeCoordinator` provides bounded worker pools and revision-keyed caches. Worker count is independent of visible chart count. Analytics and indicator work is reused when charts consume the same dataset revision and computational configuration.

`ChartPredictionCoordinator` applies the same rule to local fallback prediction computation and production-model requests. Visual prediction series remain chart-local.

### v103 lifecycle invariant

```text
N chart cells
    ↓
D dataset planes
    ↓
S symbol feeds
    ↓
≤2 analytics workers + ≤2 indicator workers
```

The chart renderer remains a presentation consumer. It does not own history transport, broker subscription multiplicity or shared compute-worker creation.

### v103 incremental update rule

The forming candle is updated through `updateLast()` and the next candle through `append()` whenever the canonical timeline remains aligned. Full canonical replacement is reserved for timeline/history reconciliation. `HistoryStore.upsertLatest()` avoids rebuilding the complete history map for ordinary latest-candle updates.

## v104 demand-driven history + multi-chart budget — 2026-09-29

The v103 shared chart data plane is now refined so history initialization, older-page acquisition and compute inputs scale by actual user demand. Initial chart paint is bounded to 300–1,500 candles by timeframe; visible-range movement requests one bounded older page; only the active chart is eligible for a single low-priority warm page. A global `ChartHistoryCoordinator` limits browser history requests to two concurrent operations.

The `HistoryStore` remains reusable retention up to 50,000 candles, but `ChartDataPlane` materializes only its active demanded window. Cached older data is reused through binary-search `getBefore()` before issuing a broker request.

The client/runtime/server history contract now forwards and validates an explicit `limit`, removing the old fixed-size initial request path. The chart compute coordinator also protects pathological deep-history states with a 10,000-candle worker input ceiling while preserving the v103 bounded worker pools and dataset/revision cache identity.

For older-history prepends, logical viewport state is restored with the logical-range API so user navigation does not jump.

**Non-interference:** CoreSpirit language/compiler/IR/VM, execution/risk authority, terminal dock ownership, drawing semantics, and shared realtime symbol-feed ownership remain unchanged.


## v105 history/compute separation

The shared chart plane now separates three concerns:

```text
retention          → HistoryStore (up to 50k)
demand             → ChartHistoryPolicy / ChartHistoryCoordinator
compute residency  → selectIndicatorComputeWindow()
render residency   → current chart viewport
```

A larger retained dataset therefore does not imply a larger worker payload. Renderer consumers remain free to maintain chart-local visual state while the shared data plane controls market-data ownership and request amplification.

## v106 shared history residency — 2026-09-29

The shared data plane now treats the history cache as a bounded reusable resource rather than an unlimited browser cache. `HistoryStore` maintains LRU ordering across `broker:symbol:timeframe` buckets and evicts the least-recently-used dataset only after the configured bucket ceiling is exceeded.

This complements the v103 dataset registry and v104 demand-driven loading:

```text
N chart cells
   ↓
D active dataset planes
   ↓
bounded shared history retention
   ↓
≤2 history requests
```

A cache eviction can cause a later network refill, but it cannot detach a mounted chart or invalidate another chart's canonical realtime feed.

`ChartDataPlane` remains the owner of active chart state. `HistoryStore` remains the reusable retention layer. The two responsibilities must not collapse into one mutable singleton because live forming-candle updates and cache eviction have different lifecycle requirements.

## v107 forming-candle indicator execution — 2026-09-29

The v103/v104/v106 data-plane rules are preserved, but indicator calculation now distinguishes the canonical dataset revision from the mutable forming-candle state.

A forming-candle tick may leave the dataset revision unchanged while changing the latest OHLCV values. Indicator cache correctness therefore uses both revision/window identity and the tail OHLCV tuple for snapshot calls.

Preferred live flow:

```text
shared ChartDataPlane snapshot
        ↓
indicator snapshot seed (once)
        ↓
worker-resident indicator state
        ↓
bar-only replace/append updates
```

The market-data plane still owns history and realtime candle materialization. The indicator worker does not become a second source of market truth; it consumes the latest canonical bar and its resident mathematical state.

Worker affinity is chart-specific for the incremental state. Multiple charts may share the same canonical dataset plane while each chart keeps its own renderer-visible indicator runtime key where independent configuration/timing requires it.

## v115 — canonical worker transport + direct typed-array ingress — 2026-10-04

The v115 pass makes the existing columnar architecture an execution boundary rather than a documentation-only target.

### Actual hot path after v115

```text
Broker/history API
      │
      ▼
HistoricalCandle[]                 ← compatibility input from current broker ABI
      │
      ├── normalizeHistory()        ← one required validation/canonicalization pass
      │
      ▼
ChartDataPlane.state.candles       ← legacy/UI compatibility cache
      │
      └── direct typed write
            ▼
CanonicalDataPlane
      │
      ├── Float64Array time/open/high/low/close/volume
      ├── Float64Array OI/bid/ask/... optional columns
      │
      ├───────────────┬────────────────┬────────────────┐
      ▼               ▼                ▼                ▼
Core/indicator     analytics       chart adapter      other consumers
compute worker       worker             │
      │               │                 ▼
      │               │             Vela OHLCV
      │               │                 │
      └──── transferred typed packets  ▼
                              NativeRenderer
```

The important change is what **does not** happen between the main-thread canonical store and compute workers: there is no `HistoricalCandle[]` structured-cloned through `postMessage()`.

### Worker packet ABI

`src/services/core/data/canonicalMarketDataTransport.ts` defines a versioned `CanonicalMarketDataPacket` containing bounded `Float64Array` channels for time, OHLC and volume. `createCanonicalMarketDataPacket()` is the explicit ownership boundary: it copies the requested canonical window once, then `packetTransferables()` transfers the six `ArrayBuffer`s to the worker.

The packet is therefore **transfer-based, not zero-copy in the mathematical sense**. The canonical store remains owned by the main thread; the worker receives ownership of the bounded packet buffers. This is intentional. It gives us deterministic ownership and avoids aliasing before a later `SharedArrayBuffer` design is justified.

### Why this matters

The old worker path could look like:

```text
HistoricalCandle[]
  → structured clone
  → worker object graph
  → indicator arrays
```

A busy chart grid multiplies that cost by the number of compute requests. v115 changes the transport to:

```text
canonical typed arrays
  → bounded packet
  → transferable buffers
  → worker compatibility materialization
  → existing kernels
```

The remaining `HistoricalCandle[]` materialization happens **inside the worker** because the current legacy indicator and analytics kernels still accept candle objects. That is now an isolated compatibility seam rather than the transport ABI.

### Realtime path

For a forming bar, the indicator coordinator transfers only a one-row typed packet once the incremental runtime is primed. A full history packet is used only for snapshot computation, first-time incremental seeding, or an explicit reset/resynchronization. This avoids re-cloning the complete dataset on every tick.

`ChartDataPlane` also stopped calling `MarketDataStore.get()` merely to inspect the canonical tail on each tick; it reads the typed `time` view directly.

### Vela boundary

The Vela provider resolves `broker:symbol:timeframe` through the shared `ChartDataPlane` and can expose the canonical typed views through `getBarsColumns()`. The ordinary `getBars()` object API remains only for compatibility consumers; the native renderer path now prefers the columnar ABI.

### Ownership rules

1. `CanonicalDataPlane` owns canonical numeric storage.
2. `ChartDataPlane` owns broker/history lifecycle and realtime candle reconciliation.
3. Workers own transferred compute-window buffers after `postMessage()`.
4. Indicator/analytics kernels own their derived result arrays/state, not market-data copies.
5. Vela owns its rendering-side `OHLCV` compatibility objects.
6. No consumer may mutate canonical backing arrays in place.
7. `SharedArrayBuffer` is deferred until the worker lifecycle, mutation discipline, revision protocol and reclamation model are explicit.

### Remaining representation-churn work

v115 intentionally does **not** pretend the whole system is finished. The next high-value seam is the CoreSpirit/indicator-kernel input ABI itself. The desired end state is:

```text
CanonicalMarketView
      ↓
CoreSpirit typed series / execution input
      ↓
incremental kernels / VM
      ↓
renderer-neutral RenderPacket
      ↓
Vela adapter
```

The existing worker compatibility materializer can then be retired for kernels that have been converted to typed-series inputs. That is the point at which a true zero-object hot path becomes achievable end to end.


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


## v117 — retained incremental render path

Vela native rendering now consumes the TCO columnar OHLCV plane and owns a mutable typed capacity store. Its X-axis coordinate time store is also typed. Live value updates use retained append/replace-last/replace-range operations and style/fill state deltas; full-series replacement is limited to history/recompute/structural paths.

### v117 deep patch ABI + verification

The retained-scene contract is now explicit: `append`, `replace-last`, `prepend`, and `replace-range` mutate only affected data; `seriesStyles` handles appearance without touching values; marker updates diff their changed interval; fill updates use a separate value/style channel. The engine only selects a tail delta when the previous/current series identity and timestamp continuity prove the live operation; otherwise it falls back to a full replacement.

The full Vela source audit also confirmed that candle rendering is the correct place to keep the columnar representation: the renderer may keep an internal `OHLCV[]` compatibility mirror for legacy scripting/data-window paths, but that mirror is not the render transport. Supabase broker/session/workspace persistence remains outside this hot path; the database advisor currently reports RLS-policy evaluation and duplicate-policy/index cleanup opportunities, which are separate persistence optimizations.


## v118 — Fyers 5k window + Vela transport tuning

TradingCoreOS now requests a 5,000-candle initial chart window and 5,000-candle older-history pages. The Vela ranged cache and deep-history chunk size are aligned to the same 5k unit. The TCO Vela provider now honors a ranged `to` boundary by hydrating the older page before slicing, preventing left-edge scrolls from returning the newest 5k candles again.

The Fyers history route caps chart requests at 5,000 candles, adds the 10-minute interval mapping, and uses timeframe-aware lookback windows to give the broker a realistic opportunity to return the requested page.

## v120 — Vela/Fyers demand paging and fused-runtime boundary

The Vela base chart now treats 5,000 candles as the initial hot window and grows history in 5,000-candle pages when the viewport approaches the left edge. This uses the existing Vela depth/backfill mechanism rather than a second TCO history implementation. TCO's canonical chart plane remains the market-data authority.

The Fyers runtime also deduplicates identical older-history requests and consults the existing history store before opening another broker round trip. Initial/older requests are capped at 5,000 at the Vela adapter boundary.

The native Vela render path continues to consume the canonical typed market plane; the remaining OHLCV representation is explicitly compatibility-only.

Realtime CoreSpirit fusion now keeps deterministic stateful kernel cursors active in realtime and snapshots/restores their bounded state around forming-bar revisions, instead of disabling fusion for every realtime execution.

## v121 — true retained incremental rendering

The Vela update contract is now enforced all the way from the public TCO facade to the retained native scene. A live setData call that differs only by one new tail point is converted to append; a forming-bar update becomes replace-last. The renderer applies those mutations in-place.

Indicator renderer collections now have an explicit delta channel. Backgrounds, price lines, drawings, tables and trade collections can use a tail append/replace-last delta when the new state is provably tail-local; structural/reorder changes still use the explicit full-replacement path.

The native indicator-drawing raster cache is keyed by drawing-content revision plus viewport, pane geometry and scale signature. A market tick therefore does not force unchanged labels, boxes or tables to be repainted.

This is the intended rule:

history -> setData once -> live tail patches -> style state patches -> affected overlay patches -> repaint only invalidated surfaces.

No live tick should reconstruct a 20k-point series merely because the chart has 20k loaded bars.

## v122 — 5k Fyers chart path and hot-window behavior

The production Fyers chart path is bounded around a 5,000-candle hot window. Initial history is capped at 5k; older history is fetched only as the user approaches the loaded tape's left edge, in another 5k page. Requests are cached/deduplicated and older pages are merged into the shared chart data plane before the Vela columnar view is exposed.

This is intentionally broker-first for time-to-first-candle: Supabase is used for user/workspace persistence, not as a latency-sensitive candle database. Canonical typed market data remains the hot chart transport.

---

# SOURCE: docs/CHART_DRAWING_INTERACTION_ARCHITECTURE.md

# Chart Drawing + Interaction Architecture

## v97 intent

TradingCoreOS adopts the **behavioral model** of a mature charting platform without copying vendor source code or binding Core Chart to vendor APIs. The reusable ideas are: single-point/multipoint/anchored creation, post-create object control, semantic events, visible-range navigation, spacing/offset control, and coordinate conversion.

Our implementation stays renderer-neutral. Vela NativeRenderer is still the production renderer and is reached only through an adapter.

## Public drawing model

```text
TradingCoreChartApi
        │
        └── drawings
              ├── createPointDrawing(point, options)
              ├── createDataDrawing(points, options)
              ├── createAnchoredDrawing(anchor, options)
              ├── getDrawingById(id)
              ├── getAllDrawings()
              ├── setProperties(id, ...)
              ├── setPoints(id, ...)
              ├── setVisible(id, ...)
              ├── setSelectionEnabled(id, ...)
              ├── bringToFront(id) / sendToBack(id)
              ├── removeEntity(id) / removeAllDrawings()
              ├── createGroupFromSelection(ids)
              └── onDrawingEvent(listener)
```

The names are TradingCoreOS concepts. They are not wrappers around vendor shape objects.

### Coordinate spaces

Data drawings use:

```text
{ time, price }
```

Viewport-anchored drawings use:

```text
{ x: 0..1, y: 0..1 }
```

Anchored annotations therefore remain attached to the pane instead of being fabricated from market timestamps.

### Drawing state

Every canonical drawing carries explicit:

- lifecycle
- visibility
- selectionEnabled
- locked
- zIndex
- groupId
- owner/source identity
- pane/series ownership

This prevents the UI or renderer from becoming the source of truth.

## Tool model

Drawing tools are declarative contracts containing:

```text
category
interaction type
coordinate space
minimum / maximum points
extension behavior
measurement semantics
description
```

Current catalog covers the core families expected from a full chart platform: trend, geometry, Fibonacci, Gann, pitchforks, measurement, freehand, annotation and prediction/planning tools. Geometry renderers can be added independently.

## Interaction state machine

```text
none
  ↓ activate tool
draft
  ↓ pointer/click anchors
validated draft
  ↓ finish
canonical drawing
  ↓ edit
updated drawing
```

`CoreDrawingToolSession` handles point collection and validation. React is not required for the state machine.

## Hit testing and snapping

Hit testing operates in screen space after data/viewport coordinates are converted through the chart scale contract. Handles, visibility, selection and lock state are respected before a move is accepted.

Snapping consumes renderer-neutral candidates such as OHLC/candle anchors and chooses the closest candidate inside a screen tolerance.

## Navigation model

```text
TradingCoreChartApi
      │
      └── navigation
            ├── time spacing
            ├── horizontal offset
            ├── visible bar range
            ├── time ↔ X
            ├── price ↔ Y
            ├── pan enabled
            ├── zoom enabled
            ├── price mode
            └── visible price range
```

The core methods are deliberately independent from DOM and renderer APIs.

## Gesture flow

```text
pointer / wheel / pinch
          ↓
 ChartGestureController
          ↓
   ChartNavigationApi
          ↓
 ChartViewportController
          ↓
 retained scene / renderer
```

Drag uses viewport pan. Wheel and pinch use anchor-preserving zoom. Pan/zoom gating happens before viewport mutation.

## Production adapter

The current production chart exposes the same navigation concepts through `ChartController`. That controller may call Vela NativeRenderer internally, but feature code should not.

```text
feature code
    ↓
TradingCore navigation/drawing contract
    ↓
ChartController (production adapter)
    ↓
Vela NativeRenderer
```

The native renderer can use the same contract directly.

## Explicit non-goal

Do not copy or mirror vendor internals. The project only adopts proven **method-level interaction concepts** and implements its own data model, state, geometry, interaction, persistence and rendering contracts.

## v100 terminal presentation boundary

Drawing tools may be presented from compact terminal controls or a flat side rail, but drawing state remains renderer-neutral. The live terminal visual system uses thin separators and near-zero-radius infrastructure; this does not change drawing lifecycles, hit testing, snapping or the canonical drawing store.


## v101 flat terminal integration

The drawing rail is treated as chart infrastructure rather than a floating card. It uses the same renderer-neutral drawing tool session and drawing store; the visual pass only changes placement and presentation. Drawing state, snapping, hit testing and navigation semantics remain unchanged.

---

# SOURCE: docs/CHART_ENGINE_ARCHITECTURE.md

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

---

# SOURCE: docs/CHART_HISTORY_DEMAND_ARCHITECTURE.md

# TradingCore Chart History Demand Architecture

## Purpose

History loading is a viewport/data-demand problem, not a fixed 25k-candle initialization problem. A visible chart should paint recent data immediately, obtain older data only as the viewport approaches the loaded left edge, and use a bounded warm cache for the currently active chart rather than starting a multi-page crawl for every chart cell.

## v104 staged history model — 2026-09-29

```text
recent window
    ↓
paint immediately
    ↓
visible-range demand
    ↓
bounded older page
    ↓
optional active-chart warm page
    ↓
deep history only when scrolled
```

Initial history is explicitly bounded to 300–1,500 candles depending on timeframe. The active window is intentionally independent from the 50,000-candle absolute retention ceiling. A large pre-existing cache is sliced to the recent active window so a chart does not materialize every cached candle into its renderer on mount.

## Canonical timeframe policy

```text
1m   1500 initial / 1200 page
3m   1200 initial / 1000 page
5m    900 initial /  900 page
15m   600 initial /  750 page
30m   450 initial /  600 page
1H    360 initial /  450 page
1D    300 initial /  300 page
```

The numbers are starting budgets, not promises about the broker's returned row count. The client, runtime and broker route all enforce an upper request limit.

## Visible-range demand

`LiveChart` listens to the renderer's logical range. The trigger scales with viewport density and page size rather than using the former fixed 1,000-bar threshold. This means a chart with a small recent window requests the next page only when the user actually approaches the left edge.

The data plane performs at most one older-page load for its dataset at a time. A failed or empty page does not start an autonomous retry crawl. Empty responses mark the dataset's current history boundary exhausted until a new lifecycle is established.

## Warm cache stage

Warm history is deliberately limited to the active chart. The first registered/activated chart may request one low-priority warm page after initial paint, and pointer activation of another chart can make that chart eligible. Warm work is single-page only and never expands toward a 25k target.

This preserves a useful indicator warmup region without forcing all 16 chart cells to populate deep history. When the user scrolls, the same page path is reused for visible demand.

## Global history request budget

Per-dataset single-flight is insufficient when many unique datasets mount at once. `ChartHistoryCoordinator` therefore imposes a global browser history request budget of two concurrent requests. Queue priority is:

```text
initial  >  visible  >  warm
```

A 16-chart workspace may therefore have many dataset consumers, but only two history REST operations are active at once. This protects broker rate limits and keeps the main application responsive during workspace construction.

## Cache reuse

`HistoryStore.getBefore()` uses the sorted cached timeline and binary search to serve an older page without touching the network when the data is already warm. This matters when other runtime paths have already populated history or when a warm page was fetched earlier.

The active `ChartDataPlane` window and the persistent `HistoryStore` retention are intentionally separate:

```text
HistoryStore       → reusable retention up to 50k
ChartDataPlane     → recently demanded active window
Renderer           → chart-local projection of active data
```

## Broker request contract

The initial history limit is propagated through every layer:

```text
LiveChart
  ↓
ChartDataPlane
  ↓
TradingCoreRuntime.getHistoricalData(..., limit)
  ↓
BaseBrokerAdapter / broker API route
  ↓
server broker adapter
```

The server route validates the requested limit to a bounded 100–5,000 range. This prevents an old client or a custom caller from reintroducing a 25k initial request through the normal history endpoint.

## Viewport stability

Older history is prepended while preserving the renderer's logical range. A logical range must be restored through `setVisibleLogicalRange`; it must never be passed to a time-range API. This avoids viewport jumps after loading older candles.

## Indicators and compute

Initial indicators now receive the bounded active window. This is enough to provide a meaningful warmup for common studies without processing 25k–50k bars on first paint. When older history is genuinely requested, the dataset revision changes and the shared compute coordinator can recompute the affected dataset.

The compute coordinator retains the v103 full-dataset correctness contract; demand-driven history keeps the active dataset small during normal use rather than truncating indicator/analytics inputs.

## Multi-chart scaling invariant

For `N` visible chart cells, `D` unique datasets and `S` unique broker/symbol feeds:

```text
renderer instances        ≈ N
dataset history lifecycles ≈ D
realtime symbol feeds      ≈ S
active history requests    ≤ 2
analytics workers          ≤ 2
indicator workers          ≤ 2
initial candles/chart      ≤ 1500
```

The system therefore scales expensive transport and initialization by demand instead of by a fixed per-chart history target.

## Non-interference

This history pass does not change CoreSpirit grammar, compiler normalization, IR, VM authority, risk/execution boundaries, drawing semantics, or terminal dock ownership.


## v105 deeper demand control

History demand is now two-dimensional: the chart asks for history from the user's logical viewport, and the page size is derived from the visible bar count rather than always consuming the timeframe's maximum page budget. A small viewport requests a smaller bounded page; a wider viewport is capped by the timeframe page policy.

```text
visible logical range
      ↓
visibleBars
      ↓
lead-bar trigger + bounded page size
      ↓
HistoryStore.getBefore()
      ↓
single-flight network fallback
```

The prepend event carries `olderAdded`. The chart shifts the saved logical range by exactly that count before restoring it, preserving the user's screen position while avoiding a time-range conversion.

Duplicate left-edge requests for the same oldest timestamp/page-size tuple are suppressed briefly after completion. This is a guard against scroll-event bursts rather than a replacement for the per-dataset single-flight promise.

The retained `HistoryStore` ceiling is still a storage limit, not a chart-loading target. There is no multi-page target crawl for a mounted workspace.

## v105 compute residency boundary

Demand-driven history and demand-driven compute are distinct. A dataset may retain deep history while indicator workers consume only a bounded viewport-centered compute window with warmup bars. This allows a user to scroll through cached history without sending the entire retained dataset to a worker on every viewport change.

## v106 deeper history residency and demand control — 2026-09-29

The demand-driven history model now separates **what is retained**, **what is requested**, and **what is computed** more aggressively:

```text
HistoryStore retention
      ↓
recent active window
      ↓
visible-range demand
      ↓
bounded older page
      ↓
optional active-chart warm page
      ↓
user-driven deep history
```

The `HistoryStore` is now an LRU-bounded cache with a maximum of 32 dataset buckets. Bucket recency is updated on fresh, stale, and older-range reads. This prevents a long session that cycles through many symbols/timeframes from growing the browser's history cache without a bound. Eviction affects reusable cache retention only; it does not alter the currently mounted chart dataset.

The warm stage is viewport-aware. The active chart can pass its current visible bar count to the warm request so an opportunistic page does not automatically consume the full timeframe page budget. Failed warm requests clear the warm latch and may be retried on a later active interaction.

Older-history events report the **actual net number of newly prepended candles**, not the raw response row count. This matters when the broker returns overlap or when the 50k retention ceiling trims the merge; viewport restoration therefore shifts by the number of bars that actually entered the chart dataset.

Deep-history loading remains bounded per request. There is still no mounted-chart loop that walks through dozens of pages merely because a chart exists.

## v106 history invariant

```text
max history request concurrency     ≤ 2
max retained buckets                = 32
max retained candles / bucket       = 50,000
initial request / chart             ≤ 1,500
visible older request               = viewport-demand bounded
warm request                        = active-chart + one low-priority page
unbounded background crawl          = forbidden
```

## v107 interaction with incremental indicators — 2026-09-29

Demand-driven history and incremental indicators are complementary layers:

```text
history retention → demand window → snapshot seed → incremental tail
```

Loading older history remains a structural data-plane event and causes a new snapshot/seed because the active historical prefix changed. Ordinary forming-candle ticks do not request older history and do not need a historical replay.

This distinction prevents a fast realtime stream from amplifying history requests merely because an indicator changed value on the current bar.

---

# SOURCE: docs/CHART_INTERACTION_API.md

# TradingCore Chart Interaction API

## Navigation

```text
setTimeSpacing(pixels)
timeSpacing()
setHorizontalOffset(bars)
horizontalOffset()
setVisibleBarRange({ from, to })
getVisibleBarRange()
timeToX(time)
xToTime(x)
priceToY(price)
yToPrice(y)
setZoomEnabled(enabled)
setPanEnabled(enabled)
setAutoScale(enabled)
setPriceMode(mode)
setVisiblePriceRange({ from, to })
resetTimeView()
```

Compatibility aliases `setBarSpacing`, `barSpacing`, `setScrollOffset`, `scrollOffset`, `setVisibleRange` and the coordinate-named methods remain available for migration, but new code should prefer the TradingCore names above.

## Drawing

```text
createPointDrawing(point, options)
createDataDrawing(points, options)
createAnchoredDrawing(anchor, options)
getDrawingById(id)
getAllDrawings()
setProperties(id, properties)
setPoints(id, points)
setVisible(id, visible)
setSelectionEnabled(id, enabled)
setLocked(id, locked)
bringToFront(id)
sendToBack(id)
removeEntity(id)
removeAllDrawings()
createGroupFromSelection(ids)
onDrawingEvent(listener)
```

## Design rules

1. Feature code depends on these contracts, not on Vela NativeRenderer.
2. Data drawings are stored as time/price anchors.
3. Viewport drawings are normalized to the pane.
4. Pan/zoom state belongs to the viewport controller.
5. Coordinate conversion belongs to the time/price scale engines.
6. Drawing state belongs to `CoreDrawingStore`.
7. Renderers consume projections and do not own chart semantics.

## Production status

Vela NativeRenderer remains the current production renderer. The interaction API is the migration seam for the future native renderer.


## v99 terminal command boundary

The `/live` terminal command bar and chart toolbar remain UI adapters over the existing chart interaction contracts. Fit, crosshair, drawing, chart-type, level, OI, depth, volume, indicator, and navigation actions continue to dispatch chart-scoped commands rather than owning renderer state inside the terminal shell.

## v100 terminal chrome

The `/live` terminal exposes chart actions through dense command chrome rather than rounded dashboard cards. This is only a host presentation change. Existing fit, crosshair, drawing, chart-type, navigation and viewport events continue to target the same renderer-neutral chart APIs.


## v101 terminal-system boundary

The terminal is a host of chart actions, not the owner of chart semantics. The right dock and bottom dock may open workspace surfaces, but chart commands still route through the existing chart-scoped events and renderer-neutral interaction contracts.

Right-dock selection changes the focused workspace instrument through the workspace binding. It does not create a second chart controller or a second market-data subscription.

## v102 terminal dock interaction boundary

The right dock is a workspace presentation subsystem, not a chart-runtime layer. `WatchlistSurface` changes the focused workspace symbol through the existing workspace callback. `OrderBookSurface` reads the selected normalized tick's Level-2 fields. `AlertsSurface` maintains UI-local alert state.

The dock shell owns panel navigation and sizing; chart semantics continue to route through the existing renderer-neutral chart events.

The `/live` terminal is rendered directly from the existing React application tree. No body-mounted React root or HTML bootstrap terminal controller participates in the chart interaction lifecycle.

## v103 chart consumer boundary

The interaction API remains chart-local, but its data source is now dataset-shared. A `chartController` attaches to the canonical data plane with a unique consumer id and must not clear the shared plane on disposal.

```text
ChartDataPlane
      │
      ├── canonical market timeline
      ├── shared revision
      └── shared realtime state
             │
      ┌──────┴────────┐
      ↓               ↓
chart controller A  chart controller B
viewport/drawings   viewport/drawings
```

Interaction commands may mutate only the chart-local viewport, drawings or renderer projection. They must not create a new market-data transport or replace the canonical dataset for other consumers.

## v104 demand-driven history + multi-chart budget — 2026-09-29

The v103 shared chart data plane is now refined so history initialization, older-page acquisition and compute inputs scale by actual user demand. Initial chart paint is bounded to 300–1,500 candles by timeframe; visible-range movement requests one bounded older page; only the active chart is eligible for a single low-priority warm page. A global `ChartHistoryCoordinator` limits browser history requests to two concurrent operations.

The `HistoryStore` remains reusable retention up to 50,000 candles, but `ChartDataPlane` materializes only its active demanded window. Cached older data is reused through binary-search `getBefore()` before issuing a broker request.

The client/runtime/server history contract now forwards and validates an explicit `limit`, removing the old fixed-size initial request path. The chart compute coordinator also protects pathological deep-history states with a 10,000-candle worker input ceiling while preserving the v103 bounded worker pools and dataset/revision cache identity.

For older-history prepends, logical viewport state is restored with the logical-range API so user navigation does not jump.

**Non-interference:** CoreSpirit language/compiler/IR/VM, execution/risk authority, terminal dock ownership, drawing semantics, and shared realtime symbol-feed ownership remain unchanged.

## v106 indicator styling — 2026-09-29

Indicator style edits are renderer-side interaction state persisted through the existing workspace indicator store. The supported style surface includes primary/signal/upper/lower colors, 1–6 line width, solid/dotted/dashed line style and opacity. Style mutations must not alter the mathematical cache key or cause a new history/worker lifecycle.

---

# SOURCE: docs/CHART_MULTI_CHART_ARCHITECTURE.md

# TradingCore Multi-Chart Architecture

## Purpose

TradingCoreOS must support multi-chart layouts without multiplying market-data transport, historical request lifecycles, compute workers, or expensive derived calculations with every chart cell.

A chart cell is a **rendering consumer**. It is not a private market-data application.

## v103 ownership model — 2026-09-29

The canonical structure is:

```text
                         broker transport
                               │
                               ▼
                    BrokerMarketDataClient
                               │
                               ▼
                 shared broker:symbol feed
                               │
                    chartMarketStore
                               │
             ┌─────────────────┼─────────────────┐
             ▼                 ▼                 ▼
      dataset A 5m       dataset A 15m     dataset B 5m
             │                 │                 │
             └───────┬─────────┴─────────┬───────┘
                     ▼                   ▼
                ChartDataPlane     ChartDataPlane
                     │                   │
                     ▼                   ▼
              canonical timeline   canonical timeline
                     │                   │
              ┌──────┴───────┐    ┌────┴────────┐
              ▼              ▼    ▼             ▼
           charts        compute          charts/compute
```

The dataset identity is:

```text
broker : symbol : timeframe
```

The market feed identity is deliberately coarser:

```text
broker : symbol
```

That distinction allows all chart timeframes for the same instrument to share one realtime tick stream while keeping independent candle aggregation and canonical timelines.

## Chart instance versus dataset

A **chart instance** owns presentation state:

- renderer instance
- viewport and visible range
- drawing state and hit-testing
- series projections
- chart-local UI state
- chart lifecycle/registry identity

A **dataset plane** owns reusable data state:

- historical candles
- forming candle reconciliation
- latest normalized tick
- history loading state
- older-history pagination
- canonical typed-array timeline
- dataset revision

The dataset plane is independent of the number of chart instances consuming it.

## v103 history rules

For each `broker:symbol:timeframe` dataset, `ChartDataPlane` provides single-flight history loading:

```text
chart A ─┐
chart B ─┼─→ same ChartDataPlane → one history promise
chart C ─┘
```

A fresh `HistoryStore` result paints immediately. A stale result can paint immediately and then be refreshed. Older history is loaded only when the shared plane receives a left-edge request.

The plane deliberately does **not** start an eager multi-page background crawl for every mounted chart. This prevents a 16-chart workspace from turning an initial mount into dozens of parallel REST requests.

## Realtime rules

Realtime is shared at the symbol level:

```text
broker:symbol
      ↓
PersistentMarketSubscriptionManager
      ↓
BrokerMarketDataClient
      ↓
one normalized event fan-out
      ↓
chartMarketStore
      ↓
all timeframe planes for that symbol
```

A chart timeframe converts the tick into its own forming candle. No chart subscribes directly to the broker runtime on the hot path.

The shared feed has a short idle hold after the last consumer so route/chart remounts do not immediately tear down and recreate transport.

## Compute worker topology

Chart computation is also shared. v103 replaces a per-chart worker topology with bounded pools:

```text
analytics pool   → max 2 workers
indicator pool   → max 2 workers
```

Therefore a 16-chart layout has a bounded worker budget rather than:

```text
16 analytics workers + 16 indicator workers
```

The queues are lazy: no worker is created until there is actual work, and workers are reused across datasets.

## Compute deduplication

Analytics are cached by:

```text
broker:symbol:timeframe + revision + spot
```

Indicator computation is cached by:

```text
broker:symbol:timeframe + revision + computational-config-signature
```

Display-only indicator attributes such as id, line color and line width are intentionally excluded from the computational signature. Results are remapped back to the chart-local indicator ids after shared computation.

This allows identical indicator configurations across multiple chart cells to share one result while still preserving independent visual settings.

## Prediction deduplication

Prediction computation and production-model requests follow the same dataset-scoped principle:

```text
chart A ─┐
chart B ─┼─→ ChartPredictionCoordinator → one local compute / one production request
chart C ─┘
```

The chart still creates its own Vela NativeRenderer series because visual projection is chart-local. Only the computation/result is shared.

## Forming-candle hot path

The forming candle is updated in place where the data plane can safely preserve object identity. `HistoryStore.upsertLatest()` updates the shared cache in O(1) for the current/next candle instead of rebuilding the full 50k-candle history map on every bucket event.

Canonical chart storage uses append/update-last operations when possible and falls back to a full replacement only when timeline shape cannot be reconciled incrementally.

This keeps the per-tick hot path approximately:

```text
normalized tick
    ↓
chartMarketStore publish
    ↓
per-symbol fan-out
    ↓
per-timeframe candle reconcile
    ↓
canonical updateLast / append
    ↓
renderer frame scheduling
```

Expensive indicator/analytics/prediction work is gated to structural candle changes rather than every intra-bar tick.

## Renderer boundary

Vela NativeRenderer remains one renderer instance per visible chart cell. That is an intentional presentation cost; it is not a market-data duplication boundary.

The renderer receives compatibility object materializations only at the chart-controller bridge. Canonical data remains in the shared typed-array plane.

Each chart controller attaches with a unique consumer id:

```text
chart-controller:<chart-id>
```

Disposal detaches only that consumer and does not clear the shared canonical dataset.

## Resource scaling target

For `N` chart cells sharing `D` unique datasets and `S` unique broker/symbol feeds:

```text
renderer instances       ≈ N
CoreSpirit registry ids  ≈ N
canonical datasets       ≈ D
history lifecycles       ≈ D
symbol feed subscriptions≈ S
analytics workers        ≤ 2
indicator workers        ≤ 2
```

This is the central v103 scaling invariant.

## v115 worker transport hardening

The worker transport is no longer a future-only design. v115 adds a versioned `CanonicalMarketDataPacket` made of bounded typed-array channels and transfers its six `ArrayBuffer`s through the worker boundary.

```text
CanonicalDataPlane
      ↓
bounded typed packet
      ↓
Transferable ArrayBuffers
      ↓
worker compute pool
```

This is an explicit ownership transfer, not a SharedArrayBuffer alias. `SharedArrayBuffer` remains deferred until mutation, revision, worker lifetime and reclamation semantics are strong enough to make shared memory safer than transfer-based packets. The multi-chart scaling rule therefore remains the same: chart count may increase renderer instances, but it must not multiply canonical dataset ownership or full-history object cloning.

## Non-interference invariant

The multi-chart pass must not alter:

- CoreSpirit language grammar
- compiler normalization/AST/IR contracts
- VM execution authority
- broker order authority
- risk/execution boundaries
- chart drawing semantics
- terminal right-dock ownership

Only the chart host's data/compute ownership and lifecycle are consolidated.

## v104 demand-driven history + multi-chart budget — 2026-09-29

The v103 shared chart data plane is now refined so history initialization, older-page acquisition and compute inputs scale by actual user demand. Initial chart paint is bounded to 300–1,500 candles by timeframe; visible-range movement requests one bounded older page; only the active chart is eligible for a single low-priority warm page. A global `ChartHistoryCoordinator` limits browser history requests to two concurrent operations.

The `HistoryStore` remains reusable retention up to 50,000 candles, but `ChartDataPlane` materializes only its active demanded window. Cached older data is reused through binary-search `getBefore()` before issuing a broker request.

The client/runtime/server history contract now forwards and validates an explicit `limit`, removing the old fixed-size initial request path. The chart compute coordinator also protects pathological deep-history states with a 10,000-candle worker input ceiling while preserving the v103 bounded worker pools and dataset/revision cache identity.

For older-history prepends, logical viewport state is restored with the logical-range API so user navigation does not jump.

**Non-interference:** CoreSpirit language/compiler/IR/VM, execution/risk authority, terminal dock ownership, drawing semantics, and shared realtime symbol-feed ownership remain unchanged.

### v104 multi-chart cost model

The important scaling correction is now two-dimensional: chart renderers scale with visible chart count, while history/network work scales with actual dataset demand. A 16-chart layout can therefore mount 16 renderer instances without asking each chart to fetch 25k bars.

```text
16 chart cells
   ↓
D unique broker:symbol:timeframe datasets
   ↓
≤2 history requests active at once
   ↓
300–1500 initial candles per dataset
   ↓
older pages only on visible left-edge demand
```

The shared compute pools remain bounded at two analytics workers and two indicator workers. Dataset/revision deduplication remains the reuse mechanism; v104 intentionally does not truncate worker inputs because that would change indicator semantics for deep-history users. The next safe performance step is viewport-aware incremental compute, not a correctness-changing hard bar cutoff.


## v105 multi-chart demand amplification guard

Multi-chart scaling is measured as shared work plus visible demand, not as `chart count × maximum history`. When several charts approach their left edge simultaneously, their older-page requests enter the global two-slot history scheduler and deduplicate when their dataset/anchor/page tuple is identical.

Indicator computation follows the same principle: charts can share dataset revisions and compute results, but a viewport-specific compute window is part of the result identity so one chart's deep scroll cannot incorrectly reuse another chart's partial series.

## v106 multi-chart demand amplification guard — 2026-09-29

The multi-chart budget now covers retained history as well as workers and transport. A grid may contain many chart renderers, but history requests and cache residency are bounded independently of renderer count.

```text
16 chart renderers
       ↓
≤16 active dataset planes
       ↓
≤2 concurrent history requests
       ↓
32 retained history buckets maximum
```

Shared dataset affinity remains the primary deduplication boundary. History cache eviction is deliberately independent from realtime feed lifetime: evicting an inactive bucket must never terminate a live `broker:symbol` subscription used by another consumer.

## v115 — Vela workspace activation + canonical worker transport — 2026-10-04

The multi-chart architecture is now wired to the production Vela workspace rather than remaining a dormant capability in the vendored engine.

### Live workspace configuration

`src/LiveTradingWorkspace.tsx` now boots Vela with:

- initial `4`-cell layout;
- four seeded chart identities for NIFTY 50, NIFTY BANK, SENSEX and FINNIFTY;
- Vela layout switching retained for the standard registered layouts;
- indicator picker enabled;
- object-tree/panel/bottom-bar/screenshot/action surfaces retained through Vela's shared shell;
- drawing toolbar and drawing persistence enabled;
- crosshair synchronization enabled as the initial multi-chart sync policy, with Vela's runtime sync controls still available;
- `maxWebglCells: 8`, so the 4/8-cell modes can stay inside a predictable WebGL budget;
- a new persistence key so a pre-v115 single-chart document cannot pin the production workspace back to `layout: false`.

The dataset layer remains shared: cells referring to the same `broker:symbol:timeframe` key resolve to the same `ChartDataPlane`/canonical dataset rather than creating independent broker history lifecycles.

### Active-cell rule

The Vela workspace has one active cell at a time. Shared chrome acts on that cell, while the other cells remain rendering consumers. TradingCoreOS therefore keeps symbol selection/watchlist actions targeted to the active cell instead of introducing another parallel terminal/chart state model.

### Indicator interaction

Vela already provides its standard indicator picker and object tree. TCO v115 adds an application-level **Alt-held indicator wheel** for rapid native-indicator insertion:

```text
Hold Alt
   ↓
query active cell's supported native indicators
   ↓
show up to 8 supported quick choices around the pointer-space center
   ↓
release Alt
   ↓
active Vela chart.addNativeIndicator(type)
```

The wheel is deliberately a host feature. It does not modify Vela's indicator registry or scripting engine and it acts only on the currently active chart cell.

### Sync semantics

Multi-chart sync must remain explicit rather than forcing every chart to mirror every state. Vela exposes independent symbol/timeframe/crosshair/style/drawing groups; TCO starts with crosshair synchronization while leaving symbol, timeframe, style and drawings available as deliberate user-controlled sync modes.

### Performance consequence

A four-chart grid is not four copies of the worker market-data message. Each cell may render independently, but the compute/data layers are keyed by dataset identity and worker packets carry bounded typed windows. Identical dataset requests also share the existing history/data-plane ownership.

### Known limit

The current broker ABI still returns `HistoricalCandle[]`. Until broker adapters can expose a native columnar history response, one object array exists at the external broker boundary. v115 removes the additional object-array churn between canonical storage, workers and Vela; it does not claim to have eliminated the broker API's compatibility representation.

---

# SOURCE: docs/VELA_INTEGRATION.md

# Vela Chart Integration

Date: 2026-10-04

## Architecture lock

TradingCoreOS is now locked to this production chart direction:

```text
TradingCoreOS
 ├── CoreSpirit (user language)
 ├── TCO data plane / compute / broker systems
 └── TCO Chart API
       ↓
   Vela NativeRenderer
       ├── WebGL2
       └── Canvas2D fallback
```

Vela is a rendering backend, not a replacement for TradingCoreOS domain ownership. TCO continues to own canonical market data, indicator/model execution, CoreSpirit compilation/runtime, risk, automation and broker authorization.

## Dependency decision

`lightweight-charts` is removed from `package.json` and `package-lock.json`. No PineScript/PineTS compatibility package, translator, runtime helper, public-script catalog or TradingView import path is part of the application architecture.

Community indicators remain a first-class feature, but their unit of distribution is a versioned **CoreSpirit Community Indicator** containing CoreSpirit source, immutable version metadata, settings schema, author/license metadata, documentation and a compiled-artifact identity.

## Vendor boundary

Vela source is vendored under `vendor/vela` with its Apache-2.0 `LICENSE` and `NOTICE`. Application code reaches Vela through:

- `src/services/core/chart/velaChartFacade.ts` — stable chart vocabulary used by the workspace.
- `src/services/core/chart/velaNativeChartRenderer.ts` — implementation of the TCO `ChartRenderer` port.
- `src/services/core/chart/chartRendererFactory.ts` — production renderer selection.

No React component or CoreSpirit module should import Vela directly.

## Data path

```text
Broker/history/live feed
        ↓
Canonical MarketDataStore
        ↓
ChartCore / ChartController
        ↓
TCO Vela adapter
        ↓
NativeRenderer
        ↓
WebGL2 / Canvas2D
```

Realtime forming-bar updates use Vela's incremental `updateBar` seam. Complete history replacement uses `setBars`. The canonical store remains the source for indicators, models and chart rendering.

## Rendering path

CoreSpirit output remains renderer-neutral:

```text
CoreSpirit source
   ↓ compile / IR / VM
Declarative visual output
   ↓
TCO chart output controller
   ↓
Vela series / markers / price lines
```

High-cardinality visuals should remain batched or retained at the TCO layer instead of becoming thousands of DOM nodes or independent browser series.

## Attribution

Vela's bundled `NOTICE` requires visible attribution wherever a chart is displayed. TradingCoreOS therefore keeps Vela's native attribution enabled rather than hiding it. Any future host-level attribution change must provide an equivalent visible notice/link on the same screen before disabling the renderer's built-in mark.

## Deepening roadmap

### D1 — Typed-array ingestion — partial v115
The canonical-to-worker side of typed ingress is now implemented through versioned transferable packets. Direct Vela-native ingestion remains the next seam: the current `DataProvider` API still requires `OHLCV[]`, so `TcoVelaDataProvider` materializes ordinary bars only at that explicit renderer/provider boundary.

### D2 — Renderer-owned LOD
Connect the existing TCO `ChartLodIndex` to Vela viewport changes so the renderer can select the smallest safe representation for the current pixel density without copying the entire dataset.

### D3 — CoreSpirit render packets
Convert CoreSpirit output into stable render packets keyed by series/visual IDs, allowing plot style changes and point-tail updates without remounting an indicator.

### D4 — Drawings in the native scene
Move TCO drawing primitives into the Vela/TCO retained scene boundary rather than maintaining separate browser overlays for production chart visuals where Vela has an equivalent primitive.

### D5 — Multi-chart synchronization — partial v115
VelaWorkspace now exposes the production multi-chart shell, active-cell projection and independent sync controls. TCO still needs to connect its renderer-neutral visible-range contract so synchronization logic remains portable beyond Vela.

### D6 — GPU budget enforcement
Introduce a chart frame budget and allocation counters: visible bars, active series, draw calls, typed-buffer bytes, overlay nodes and long-task duration. Regression gates should be attached to the contracts rather than manual observation alone.

## v109 indicator-schema bridge

Indicator metadata reaches Vela only after passing through TCO-owned contracts:

```text
IndicatorSettingsSchema
       ↓
resolved values + output metadata
       ↓
TCO chart/render packet
       ↓
velaChartFacade / NativeRenderer
```

The schema is intentionally renderer-neutral. `pane`, `scale`, output names, colors, line widths and display flags describe intent; they do not contain Vela series instances or Vela API callbacks.

The live chart now fingerprints the complete schema-derived snapshot when deciding whether indicator rendering must refresh. This matters for nested settings such as `display.opacity` and `display.precision`; a dependency list that only watches legacy top-level fields would miss those changes.

The universal settings editor is shared by the Indicators workspace and live terminal. That removes the last production UI path where MACD/Bollinger/Ichimoku/etc. settings were manually enumerated.

## Schema-to-render deepening

The next renderer work should consume stable output IDs and style patches rather than recreating series for every edit. Calculation state, schema state and render state remain separate:

```text
calculation identity  → incremental indicator engine
settings identity     → schema + resolved values
render identity       → stable output IDs / render packets
```

A style-only change must therefore update renderer state without invalidating indicator history; an input-period change may invalidate the appropriate computation graph while still reusing the same render identities.

## Explicit non-goals

- No PineScript compatibility mode.
- No PineTS execution layer.
- No TradingView script importer/catalog dependency.
- No broker capability exposed through Vela.
- No renderer-specific language keywords in CoreSpirit.
- No second production chart vendor.


## v110 indicator presentation bridge

The Vela adapter now consumes the same renderer-neutral appearance contract used by the universal indicator editor.

```text
IndicatorAppearanceConfig
├── line → Vela series style + visibility
├── fill → Vela Fill primitive between hidden anchor series
├── marker → renderer-neutral marker projection
├── levels → level line presentation
└── pane → pane ownership + scale presentation
```

Appearance-only changes invalidate the native renderer at Light/Full presentation levels as required by the affected operation, but they never invoke the indicator worker.

### Fill ownership

Band fills are mounted as renderer-owned indicator models. Their source series are hidden anchor series containing existing computed points. A fill update can therefore swap color, opacity, gradient or conditional coloring without rebuilding the source indicator.

### Pane ownership

Separate panes are keyed by `tco-indicator-pane:<indicatorId>` and shared by all outputs belonging to one indicator. `auto` retains the indicator's current host pane; `overlay` explicitly returns to the price pane.

### Worker isolation

The chart compute coordinator strips appearance-only fields before worker dispatch. This both enforces the architectural invariant and reduces structured-clone payload size as appearance schemas become richer.

## v111 build-boundary repair — 2026-09-30

`ShowcaseChart.tsx` exposed a renderer migration defect: it used `LineStyle.Dashed`, `LineStyle.Solid` and `LineStyle.Dotted` as runtime values while `velaChartFacade.ts` exported `LineStyle` only as a type alias. TypeScript erased the type export, so Vite/Rollup correctly reported that `LineStyle` was not an exported runtime symbol.

The facade now exposes a runtime-safe `LineStyle` object and a separate `LineStyleValue` type:

```ts
export const LineStyle = Object.freeze({
  Solid: 0,
  Dashed: 1,
  Dotted: 2,
});
```

The chart contract remains TCO-owned; this is not a reintroduction of a legacy renderer API. A dedicated contract test prevents another type-only/runtime export mismatch.

## v111.1 — Vela remains a renderer projection, never indicator truth

First-class indicator components deliberately stop before the Vela boundary. Their plot/visual declarations are renderer-neutral. The TCO chart API decides how those outputs become Vela series, fills, markers, levels and pane projections.

```text
CoreSpirit indicator declaration
        ↓
renderer-neutral visual outputs
        ↓
TCO Chart API
        ↓
Vela adapter
        ↓
Vela NativeRenderer
```

This is important for portability: an indicator can run in historical, replay or realtime hosts without knowing which renderer is currently presenting it. Vela is a production rendering backend, not the source of indicator semantics.


## v115 production workspace + canonical transport — 2026-10-04

The Vela integration has moved from “renderer cutover” to “production workspace mode.”

### Workspace capabilities now exposed in TradingCoreOS

The live chart now boots the vendored `VelaWorkspace` in a four-cell layout instead of `layout: false`. Vela's shared workspace shell therefore becomes the primary multi-chart surface: layout switching, active-cell projection, indicator picker, object tree/panels, drawings, bottom bar, screenshot/action surfaces and the workspace keymap remain in one host rather than being rebuilt in React.

The workspace is seeded with four index cells and uses a new persistence key so previous one-chart saved state cannot force the new workspace back into single-chart mode.

### TCO indicator wheel

TradingCoreOS adds an application-level radial quick picker triggered by holding `Alt`. It asks the active Vela chart for its supported native-indicator catalog, selects up to eight quick entries, highlights the sector under the pointer and adds the selected native indicator on `Alt` release.

This is intentionally separate from CoreSpirit scripting. Native Vela indicators remain Vela-native; CoreSpirit scripts continue through `CoreSpiritVelaEngine`. No Pine/PineTS compatibility path is introduced.

The current public Vela platform documentation describes the standard `Alt` radial wheel as a **drawing-tool** wheel, while the indicator picker is the separate indicator UI. TradingCoreOS's Alt indicator wheel is therefore a TCO host extension, not a claim that the upstream Vela indicator picker itself is radial. citeturn954793search3turn954793search1

### Data provider boundary

`TcoVelaDataProvider` no longer reopens broker history independently. It obtains the shared `ChartDataPlane`, waits for the canonical dataset, binary-searches its typed `time` column, and materializes only the bars requested by Vela. Live subscriptions read the current canonical tail and allocate one Vela bar at the provider boundary.

### Compute boundary

The TCO compute coordinator now transfers versioned typed-array market packets to workers. Existing legacy kernels still receive a compatibility `HistoricalCandle[]` only after the message reaches the worker. That makes worker compatibility materialization an explicit migration seam rather than the cross-thread data format.

### Upstream Vela feature alignment

The vendored workspace already supports standard multi-chart layouts (including 1, 2-horizontal, 2-vertical, 4 and 8-cell modes), active-cell behavior and independent synchronization controls. TCO now exposes that capability instead of suppressing it with single-chart mode. citeturn954793search0turn954793search2

### Next Vela performance seam

The next step is direct typed-array/retained-buffer ingestion into the Vela-facing data adapter, followed by viewport-driven LOD selection and stable CoreSpirit RenderPackets. The current provider compatibility objects should be treated as an adapter boundary to be reduced, not as the canonical chart representation.


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


## v117 — true incremental Vela updates

Historical candle data uses setBarsColumns once. Forming bars use updateBarColumns/replace-last semantics. New finalized bars append. Indicator styles are patched independently of data. Markers and fill anchors are range-aware. The TCO facade remains the only production-facing integration boundary.

### v117 deep patch ABI + verification

The retained-scene contract is now explicit: `append`, `replace-last`, `prepend`, and `replace-range` mutate only affected data; `seriesStyles` handles appearance without touching values; marker updates diff their changed interval; fill updates use a separate value/style channel. The engine only selects a tail delta when the previous/current series identity and timestamp continuity prove the live operation; otherwise it falls back to a full replacement.

The full Vela source audit also confirmed that candle rendering is the correct place to keep the columnar representation: the renderer may keep an internal `OHLCV[]` compatibility mirror for legacy scripting/data-window paths, but that mirror is not the render transport. Supabase broker/session/workspace persistence remains outside this hot path; the database advisor currently reports RLS-policy evaluation and duplicate-policy/index cleanup opportunities, which are separate persistence optimizations.


## v118 — terminal visual/motion polish

The production terminal uses a near-black graphite base with a restrained indigo-violet accent. Native Vela motion constants were slowed from the previous ultra-snappy defaults so zoom, pan, autoscale, live-bar glide and first-paint reveal settle more naturally. UI DOM transitions use the existing Motion stack; the chart renderer itself remains on Vela's native scheduler.

## v120 — production Vela shell integration

Vela remains isolated behind the TCO chart facade while TCO injects the provider, CoreSpirit engine, and VelaStorage implementation. The workspace uses existing Supabase persistence surfaces for workspace state, preferences, and Journal rather than coupling the Vela vendor tree directly to Supabase.

The workspace now uses a custom near-black graphite Vela theme with restrained indigo-violet branding and deliberately slower chart motion. DOM chrome continues to use the existing Motion dependency for polished layout/menu transitions.

Viewport-driven history depth is handled by Vela's own engine with a 5,000-bar page size and a small left-edge lead. This keeps the chart interactive while older history arrives behind the current viewport.

## v121 — true retained incremental rendering

The Vela update contract is now enforced all the way from the public TCO facade to the retained native scene. A live setData call that differs only by one new tail point is converted to append; a forming-bar update becomes replace-last. The renderer applies those mutations in-place.

Indicator renderer collections now have an explicit delta channel. Backgrounds, price lines, drawings, tables and trade collections can use a tail append/replace-last delta when the new state is provably tail-local; structural/reorder changes still use the explicit full-replacement path.

The native indicator-drawing raster cache is keyed by drawing-content revision plus viewport, pane geometry and scale signature. A market tick therefore does not force unchanged labels, boxes or tables to be repainted.

This is the intended rule:

history -> setData once -> live tail patches -> style state patches -> affected overlay patches -> repaint only invalidated surfaces.

No live tick should reconstruct a 20k-point series merely because the chart has 20k loaded bars.

## v122 — Vela typecheck and history-demand hardening

The Vela engine's 5,000-bar left-edge demand path now has explicit trigger/cap constants in the engine module, preventing undefined-symbol regressions while preserving the 5k page contract.

The retained collection diff path is typed against heterogeneous renderer collections through an explicit `unknown[]` delta boundary. This keeps the patch ABI renderer-neutral while retaining concrete collection types at their source.

The native latest-price chrome now reads the current candle through SceneGraph scalar accessors and no longer references an out-of-scope legacy bar variable.


## v121 — deeper runtime/performance boundary

Vela remains the render owner and TCO remains the data owner. The current chart path is 5,000-candle first load, 5,000-candle left-edge pages, canonical columnar transport, retained-scene deltas, and Vela-native rendering. UI motion is intentionally slower than the terminal's previous fast-mode defaults; Vela chart animation remains on the native renderer scheduler. Supabase is used for workspace/default/journal persistence, not as a market-tick transport.

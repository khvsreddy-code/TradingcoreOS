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

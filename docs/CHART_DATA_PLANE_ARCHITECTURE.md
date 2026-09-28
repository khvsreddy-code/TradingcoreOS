# TradingCoreOS Canonical Chart Data Plane

## Purpose

Define one canonical, columnar data plane for chart candles and timeline-aligned derived data while keeping the current Lightweight Charts workspace stable during renderer migration.

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

## Lightweight Charts boundary

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

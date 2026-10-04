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

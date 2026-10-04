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

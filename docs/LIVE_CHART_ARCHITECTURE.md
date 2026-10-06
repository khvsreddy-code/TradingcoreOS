# LiveChart Architecture: Controllers + Imperative Stores

LiveChart.tsx is now an orchestration root rather than the owner of every chart concern.

## Runtime shape

```text
Broker / realtime transport
        |
        v
ChartDataPlane
        |
        v
MarketDataStore  <---- shared per dataset key
        |
        v
ChartDataController
        |
        +----------------------+
        |                      |
        v                      v
ChartRealtimeController    ChartStore
        |                      |
        v                      +--> imperative consumers
Vela native renderer          |
        |                      +--> rAF-coalesced UI snapshot
        |
        +--> ChartIndicatorController
        +--> ChartDrawingController
        +--> ChartPredictionController
        +--> ChartCoreSpiritController

React
  |
  +--> ChartShell
  +--> ChartOverlay
  +--> ChartToolbar
  +--> ChartDepthPanel
```

## Responsibility boundaries

| Layer | Owns | Must not own |
| --- | --- | --- |
| LiveChart | low-frequency UI state, controller wiring, render composition | Vela lifecycle, indicator algorithms, drawing storage, prediction execution, analytics, viewport events, broker subscriptions |
| ChartDataController | data-plane subscription and history requests | React state, chart rendering |
| ChartRealtimeController | high-frequency tick fan-out and Vela update scheduling | React rendering |
| ChartIndicatorController | indicator compute/render lifecycle and series management | broker transport, UI menus |
| ChartDrawingController | CoreDrawing store, draw/commit/undo/render | market-data transport |
| ChartPredictionController | prediction overlay jobs and cancellation | React state |
| ChartCoreSpiritController | CoreSpirit compile/run/output projection | general chart UI |
| ChartAnalyticsController | analytics/OI compute, rendering, throttled UI projection | React state, broker UI |
| ChartInteractionController | viewport/history demand, pointer/drawing interaction, resize | React market-data bus |
| ChartRuntimeController | Vela bootstrap, controller wiring, snapshot fan-out, runtime cleanup | UI menus/settings |
| ChartStore | per-chart imperative state and subscriptions | owning Vela series |
| MarketDataStore | shared chart-data subscriptions and history access | React UI |
| CoreSpiritStore | editor/source/status state | market ticks |
| ChartShell | layout and DOM hosts | business logic |
| ChartOverlay | controls/dialogs/settings | candle rendering |

## #27 high-frequency rule

A realtime market tick must not become a React state update.

```text
tick
 -> ChartDataPlane snapshot
 -> MarketDataStore listener
 -> ChartDataController
 -> ChartRealtimeController
 -> ChartUpdateScheduler
 -> Vela imperative series update
```

`ChartStore.publishMarketSnapshot()` keeps that state available to imperative consumers. UI subscribers use `subscribeUi()`, which coalesces notifications to animation frames.

Analytics and OI values follow the same model: the imperative store is updated immediately, while React-facing state is throttled to a bounded UI cadence.

## Vela boundary

Vela owns:

- candle buffers
- realtime candle patching
- viewport/range changes
- crosshair and pointer coordinates
- drawing projection
- indicator series
- prediction overlays
- CoreSpirit visual output
- high-frequency renderer scheduling

React owns:

- menus
- settings
- watchlist/panel UI
- dialogs
- toolbar state
- CoreSpirit source/status UI

This prevents a high-frequency market stream from invalidating the whole LiveChart React subtree.

## Shared-market lifecycle

MarketDataStore reference-counts consumers for a dataset key. Multiple chart capabilities can attach to one ChartDataPlane without creating duplicate upstream subscriptions. The underlying plane is released only after the last consumer detaches.

## Extension rule

New chart features should enter through a controller/store boundary:

1. Data acquisition -> MarketDataStore / ChartDataController
2. High-frequency renderer behavior -> controller + Vela
3. Persistent imperative state -> store
4. UI-only state -> React
5. Expensive calculation -> worker/coordinator
6. Compiler/editor behavior -> CoreSpirit capability boundary

Do not add a new market-data setState(...) call inside a tick handler.
Do not make LiveChart a second event bus.
Do not place indicator algorithms back into the React component.

## Runtime boundary (#26)

The runtime/bootstrap layer is now isolated in `ChartRuntimeController`. `LiveChart.tsx` no longer constructs the Vela chart, subscribes to Vela viewport/click events, or owns the runtime fan-out loop. The React component supplies low-frequency UI state and dependencies, while the runtime controller owns imperative chart lifetime and cleanup.

The target dependency direction is:

```text
LiveChart
   |
   +--> ChartRuntimeController
           +--> ChartDataController
           +--> ChartRealtimeController
           +--> ChartIndicatorController
           +--> ChartDrawingController
           +--> ChartPredictionController
           +--> ChartAnalyticsController
           +--> ChartInteractionController
           +--> Vela renderer
```

This is deliberately a controller graph rather than another React hook graph: market ticks remain imperative all the way to Vela, and React receives only bounded UI projections.

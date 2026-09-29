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

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

1. Feature code depends on these contracts, not on Lightweight Charts.
2. Data drawings are stored as time/price anchors.
3. Viewport drawings are normalized to the pane.
4. Pan/zoom state belongs to the viewport controller.
5. Coordinate conversion belongs to the time/price scale engines.
6. Drawing state belongs to `CoreDrawingStore`.
7. Renderers consume projections and do not own chart semantics.

## Production status

Lightweight Charts remains the current production renderer. The interaction API is the migration seam for the future native renderer.

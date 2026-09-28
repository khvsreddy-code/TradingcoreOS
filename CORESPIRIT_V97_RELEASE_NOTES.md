# CoreSpirit v97 — renderer-neutral drawings and chart interaction

## Scope

v97 adds the method-level interaction model needed for a full chart platform without copying vendor source code. It deepens drawing tools and pan/zoom before the native renderer migration.

## Drawing system

The canonical API supports:

```text
createPointDrawing
createDataDrawing
createAnchoredDrawing
getDrawingById
getAllDrawings
setProperties
setPoints
setVisible
setSelectionEnabled
setLocked
bringToFront / sendToBack
removeEntity / removeAllDrawings
createGroupFromSelection
onDrawingEvent
```

Drawings are renderer-neutral objects with explicit lifecycle, visibility, selection, lock, z-order, group, owner and source metadata. Data-coordinate and normalized viewport-coordinate spaces are distinct.

## Tool system

The tool catalog is declarative. Each tool declares its family, interaction model, coordinate space and point requirements. This allows the catalog to grow without embedding renderer-specific behavior in the API.

`CoreDrawingToolSession` owns interactive draft collection and validation. Geometry rendering remains a separate concern.

## Navigation

The chart exposes a renderer-neutral navigation contract covering:

```text
time spacing
horizontal offset
visible bar range
time ↔ X
price ↔ Y
pan enable/disable
zoom enable/disable
auto/manual/locked price scale
```

`ChartGestureController` translates pointer drag, wheel and pinch gestures into this contract.

## Production renderer

Lightweight Charts remains the production renderer. `ChartController` exposes a TradingCore navigation facade over it. Native WebGL/Canvas code can consume the same chart contracts directly.

## Vendor boundary

The uploaded TradingView chart project was used only to inspect the **behavioral/method categories** that a mature charting system exposes. No vendor implementation code is copied into TradingCoreOS. The CoreDrawing model, tool registry, interaction state machine, navigation contract and renderer adapter are TradingCoreOS implementations.

## Roadmap

Stages 101–112 cover renderer-neutral drawing creation/control, tool semantics, drawing interaction/hit testing, navigation, gesture translation, production bridging, scene projection and parity gates.

## Validation

```text
STAGE97_DRAWING_API_METHODS_OK
STAGE97_DRAWING_TOOL_CATALOG_OK
STAGE97_NAVIGATION_METHODS_OK
STAGE97_PAN_ZOOM_GATING_OK
STAGE97_ANCHORED_DRAWING_OK
STAGE97_PRODUCTION_DRAWING_API_INTEGRATION_OK
```

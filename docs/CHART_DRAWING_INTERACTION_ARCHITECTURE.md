# Chart Drawing + Interaction Architecture

## v97 intent

TradingCoreOS adopts the **behavioral model** of a mature charting platform without copying vendor source code or binding Core Chart to vendor APIs. The reusable ideas are: single-point/multipoint/anchored creation, post-create object control, semantic events, visible-range navigation, spacing/offset control, and coordinate conversion.

Our implementation stays renderer-neutral. Lightweight Charts is still the production renderer and is reached only through an adapter.

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

The current production chart exposes the same navigation concepts through `ChartController`. That controller may call Lightweight Charts internally, but feature code should not.

```text
feature code
    ↓
TradingCore navigation/drawing contract
    ↓
ChartController (production adapter)
    ↓
Lightweight Charts
```

The native renderer can use the same contract directly.

## Explicit non-goal

Do not copy or mirror vendor internals. The project only adopts proven **method-level interaction concepts** and implements its own data model, state, geometry, interaction, persistence and rendering contracts.

# Stage 5 — Core Chart Workspace UI / Drawing Rail

## Scope
Stage 5 hardens the Core Chart workspace around the requested TradingView-class layout while preserving CoreSpirit as a separate engine.

### Implemented
- Canonical watchlist remains a right-side workspace panel.
- Removed the legacy injected/cloned left watchlist rail.
- Added a right-edge watchlist open tab when the panel is closed.
- Added a dedicated minimal Core Chart drawing toolbar component:
  `src/components/workspace/CoreDrawingToolbar.tsx`
- Drawing toolbar exposes the canonical individual drawing tool catalog.
- Drawing tool events are scoped to the focused chart in multi-chart layouts.
- Added undo/clear event routing for the focused chart.
- LiveChart can disable its embedded drawing rail when hosted by the workspace.
- Strengthened chart container sizing and responsive layout so the chart viewport retains usable height/width.
- Responsive watchlist behavior keeps the panel on the right on narrower screens.
- Preserved event bus, CoreDrawing, calculation, lifecycle, symbol normalization and AI reliability boundaries.

## Architecture
```text
Core Chart Workspace
  ├── Left Drawing Rail
  │     └── CoreDrawing tool intents
  ├── Chart Grid / Viewport
  │     └── LiveChart instances
  └── Right Watchlist Panel
        └── Market selection / quotes

CoreSpirit remains a separate entity and communicates through stable contracts/events.
```

## Not claimed complete
- full TradingView drawing geometry engine
- pointer hit testing/edit handles/drag/resize
- magnetic snapping
- grouping/z-order
- complete measurement engine
- full chart renderer abstraction for every CoreDrawing kind
- full CoreSpirit compiler/runtime


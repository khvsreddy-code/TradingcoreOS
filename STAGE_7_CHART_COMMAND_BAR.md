# Stage 7 — TradingCore Chart Command Bar + Favorite Symbol UI

## Scope
Stage 7 refines the Core Chart workspace command surface using the supplied TradingView-style visual reference while preserving the existing TradingCoreOS visual language.

## Top command bar
The live chart workspace now exposes a compact upper command bar with:
- selected symbol/search control
- per-symbol favorite star with local persistence
- add/select symbol shortcut
- 1m / 3m / 5m / 15m / 30m / 1H / 1D timeframe controls
- chart-type control surface
- Indicators command
- Levels command
- Option Chain command
- AI prediction command
- Layout command
- Replay command surface
- Alert command surface
- Fit-chart control
- Draw command
- Undo / Redo controls
- More menu containing Positions, Orders, Trades, Order Ticket and refresh actions
- existing Buy / Sell actions remain available

The toolbar keeps the existing dark, compact, monospace-accented TradingCoreOS style rather than copying TradingView branding or exact styling.

## Command routing
Top-bar commands use stable workspace events where the underlying chart subsystem owns the behavior:
- `TRADINGCORE_SET_TIMEFRAME`
- `TRADINGCORE_OPEN_INDICATORS`
- `TRADINGCORE_OPEN_PREDICTIONS`

The focused chart receives targeted commands. This prevents multi-chart workspaces from accidentally changing every chart when a command is intended for one focused chart.

## Favorite symbol
Favorites are persisted per normalized instrument key in local browser storage:
`tradingcore:favorite:<instrumentKey>`

The favorite star is independent of watchlist membership.

## Watchlist placement
The watchlist is not represented as a top-toolbar button. The canonical watchlist remains the Stage 6 right-side dock and right-side tool rail. The top symbol control can open that right dock for symbol selection.

## Architecture
```text
Core Chart Engine
  ├── Top Command Bar
  ├── Left Drawing Toolbar
  ├── Chart Renderer
  └── Right Watchlist Dock
          │
          └── Data / Event Contracts

CoreSpirit Engine remains separate:
  Parser → AST / IR → Compiler → Stateful Runtime
```

CoreSpirit does not own chart toolbar state or rendering lifecycle.

## Validation
- TypeScript transpilation/syntax validation passed for changed Stage 7 TS/TSX files.
- Full project `tsc --noEmit` remains blocked by the existing extracted-project dependency/type-definition issue: `TS2688: Cannot find type definition file for 'vite/client'`.
- No dependency installation was performed as part of this UI stage.

## Still required
- full replay command/panel integration
- full alert creation workflow
- functional chart-type switching if desired
- true chart undo/redo history rather than command-surface placeholders
- continued advanced drawing hit-testing/editing/snapping work

## Completion pass — 2026-09-18

The CoreSpirit output boundary now has an explicit dispatcher for plot series, spatial drawing outputs and script signals/events. Rendering remains owned by Core Chart.

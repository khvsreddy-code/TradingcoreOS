# Stage 6 — Stateful CoreSpirit Runtime + TradingCore Right Workspace Dock

## Scope
Stage 6 turns the Stage 4 CoreSpirit AST/IR foundation into a chronological, stateful IR execution boundary and refines the Core Chart workspace to a TradingView-style right dock/watchlist presentation.

## CoreSpirit runtime
Added/expanded:
- `src/services/coreSpirit/runtime.ts`
- `src/services/coreSpirit/ir.ts`
- `src/services/coreSpirit/compiler.ts`
- `src/services/coreSpirit/index.ts`

### Runtime properties
- Executes compiled CoreSpirit IR chronologically, one bar at a time.
- Maintains persistent runtime state across bars for EMA, RSI, ATR, VWAP and other stateful calculations.
- Preserves local variables within each bar and chronological state between bars.
- Enforces backward-only historical indexing at runtime.
- Runtime lookback beyond available history resolves to `null` rather than reading future bars.
- Dynamic series indexing is supported for canonical market series and is checked at execution time.
- Execution has a per-bar step guard to prevent runaway scripts.
- Runtime errors are captured per bar and do not mutate the Core Chart lifecycle.
- `signal` outputs publish `script.signal` through the shared event bus.
- `alert` intents publish through the existing script-event boundary; `webhook` intents publish a dedicated `script.webhook` event. Actual network delivery remains a later integration concern.
- Plot/marker/line/zone outputs remain chart-independent `CoreSpiritObject` contracts. CoreSpirit does not render the chart.

### Runtime pipeline
```text
CoreSpirit Source
      ↓
Parser / AST
      ↓
Semantic Analysis
      ↓
IR Compiler
      ↓
Stateful CoreSpirit Runtime
      ↓
CoreSpirit Output / Script Events
      ↓
Shared Event Bus / CoreDrawing contract
      ↓
Core Chart / Alerts / Validation
```

### No-lookahead boundary
The runtime rejects negative indices and never resolves an index against a future bar. A positive historical offset that is not yet available at the beginning of a dataset returns `null`. This keeps the runtime chronological and suitable for later deterministic replay/backtesting integration.

## Right workspace dock
Added:
- `src/components/workspace/WatchlistDock.tsx`

The live route uses `LiveTradingTerminalV5` → `LiveTradingTerminalV4`, and the watchlist is no longer represented by a top-toolbar button. It is a canonical right-side workspace dock with:
- far-right vertical tool rail
- watchlist toggle on the right rail
- compact Symbol / Last / Chg / Chg% columns
- grouped market sections
- selected-row state
- broker instrument search
- remove controls
- selected-ticker information card
- price/change display from normalized live tick data
- market-data status and last-update presentation
- day/52-week range presentation placeholders when the broker payload does not provide those fields
- news/context and performance sections matching the requested information hierarchy

The layout is intentionally based on the supplied visual reference while avoiding invented live market values. Missing broker fields remain `—`.

## Drawing rail
`CoreDrawingToolbar` remains owned by Core Chart. The Stage 6 right dock does not couple drawing controls to CoreSpirit.

## Architecture rule
```text
Core Chart Engine                  CoreSpirit Engine
      │                                  │
      ├── Drawing UI                     ├── Parser
      ├── Watchlist UI                   ├── AST / IR
      ├── Chart renderer                 ├── Stateful Runtime
      └── Chart lifecycle                └── Script outputs
                    \                    /
                     \-- Event/Data Bus /
```

CoreSpirit runtime internals do not become chart lifecycle dependencies.

## Validation
- TypeScript source transpilation/syntax validation passed for all changed Stage 6 TS/TSX files.
- Runtime smoke test passed for chronological execution, EMA state, signal emission and rejection of `close[-1]` during semantic analysis.
- Full project `tsc --noEmit` remains blocked by the existing environment/dependency issue: missing `vite/client` type definition in the extracted project. This is distinguished from errors in the changed Stage 6 source files.

## Still required after Stage 6
- complete CoreSpirit type system
- full semantic trading primitives
- optimized IR / bytecode format
- session-aware and MTF semantics
- full dynamic series/function typing
- deterministic replay/backtest integration
- Pine reader/translator
- runtime quotas/resource accounting beyond the basic step guard
- real webhook delivery layer
- complete CoreDrawing hit-testing/editing/snapping/geometry engine
- richer watchlist persistence/editing/multiple lists and broker-specific fundamentals/ranges/news

## Completion pass — 2026-09-18

CoreSpirit now has a compile-once/load boundary, incremental `executeBar()` execution and a dedicated worker boundary. The executable IR remains serializable and chart-independent.

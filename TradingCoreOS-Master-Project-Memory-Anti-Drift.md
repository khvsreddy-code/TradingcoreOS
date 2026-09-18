# TradingCoreOS — Master Project Memory & Anti-Drift Specification

**Status:** Canonical project context  
**Date:** 2026-09-17  
**Purpose:** Keep future implementation work aligned with the agreed TradingCoreOS architecture and prevent architectural drift.

## 1. Project Identity

**TradingCoreOS** is intended to become a browser-based trading operating system with:

1. A TradingView-class **Core Chart Engine**
2. A proprietary scripting/runtime platform called **CoreSpirit**
3. A unified market/data/event architecture
4. Real server-side ML models trained on historical market data
5. Deterministic replay/backtesting
6. TradingCore V Price Action and Levels built on the same underlying structure engine
7. AI that can generate, validate, debug, optimize, and execute CoreSpirit programs in a controlled workflow
8. Broker connectivity, alerts, webhooks, and eventual execution-intent plumbing

Treat the project as one integrated platform, not a collection of unrelated indicators/pages.

## 2. Core Architecture

```text
TradingCoreOS
│
├── Core Chart Engine
│   ├── Candles
│   ├── Volume
│   ├── Drawings
│   ├── Indicators
│   ├── Levels
│   ├── Predictions / ML overlays
│   ├── Replay
│   ├── Layouts / panes
│   └── Autoscale / log scale / synchronization
│
└── CoreSpirit Engine
    ├── Parser
    ├── AST / IR
    ├── Compiler
    ├── Runtime
    ├── Semantic trading primitives
    ├── Pine compatibility layer
    └── AI integration
             │
        Data / Event Bus
             │
       ┌─────┼───────────┐
       │     │           │
      ML   Alerts    Webhooks
       │
  Validation / Meta Gate
       │
  Risk / Policy Engine
       │
 Execution Intent
       │
 Broker Execution
```

**Architectural rule:** do not create parallel engines that independently implement the same trading logic. Shared concepts such as swing, trend, support/resistance, supply/demand, liquidity, and mitigation must come from canonical shared engines.

## 3. Core Chart Engine Requirements

Ultimately provide a TradingView-class experience:

- candlestick/OHLC charts
- realtime updates and historical loading
- multiple timeframes
- volume
- indicators
- user and script drawings
- horizontal/vertical levels
- trend lines
- zones
- markers/signals
- multiple synchronized panes
- autoscale
- log scale
- fit-content behavior
- replay
- persistent layouts
- symbol/timeframe persistence
- reliable websocket reconnects

### Failure isolation

A failed indicator/model must **never blank the candle chart**. Candles, volume, price action, levels, indicators, predictions, and drawings should be independently recoverable.

## 4. Unified Drawing Model

User drawings and script drawings share renderer infrastructure while remaining distinct object classes.

Canonical conceptual objects:

```text
Series(time, value)
Marker(time, price, metadata)
Line(start, end, style)
Zone(left, right, top, bottom, state)
Signal(time, type, metadata)
Alert(condition, payload)
Webhook(endpoint, event, payload)
```

Store drawings in **data coordinates**, not screen pixels:

- time
- price
- logical pane/series reference
- style
- metadata
- ownership/source
- lifecycle state

They must survive resize, zoom, pan, timeframe changes, reload, and layout changes.

## 5. CoreSpirit

CoreSpirit is the proprietary scripting language/runtime. It is **not merely a renamed PineScript**.

It should eventually understand semantic concepts including:

- swing, fractal, trend
- support, resistance
- supply, demand
- liquidity
- ATR, volatility, volume
- market structure
- MSS, CHOCH, FVG
- order block, mitigation
- breakout, retest
- MTF confluence
- regime
- model prediction
- signal, drawing, alert, webhook, strategy

### Execution pipeline

```text
Natural Language
      ↓
AI
      ↓
CoreSpirit Program
      ↓
Parser
      ↓
AST / IR
      ↓
Compiler
      ↓
Validation
      ↓
Historical Execution / Backtest
      ↓
Chart
      ↓
Signal / Alert / Webhook
```

Native CoreSpirit goes directly through parser → compiler → runtime.

## 6. PineScript Compatibility

```text
PineScript
   ↓
Pine Reader / Parser
   ↓
Pine → CoreSpirit Translator
   ↓
CoreSpirit AST / IR
   ↓
CoreSpirit Compiler
   ↓
CoreSpirit Runtime
```

Pine compatibility is an **adapter/translator**, not the architectural foundation. CoreSpirit remains the native language/runtime.

## 7. Current CoreSpirit Status

Current integrated build contains:

- `src/services/coreSpirit/types.ts`
- `src/services/coreSpirit/runtime.ts`

The runtime is currently a **minimal stateful execution boundary/scaffold**, not a complete compiler/runtime.

Still required:

1. lexer/parser
2. AST
3. semantic analysis
4. IR
5. compiler
6. chronological/stateful runtime
7. no-lookahead guarantees
8. semantic primitives
9. drawing/signal/alert/webhook instructions
10. Pine translation layer

Never describe this scaffold as a finished CoreSpirit system.

## 8. Event Bus

Current foundation:

`src/services/core/event/eventBus.ts`

Event categories include:

```text
market.bar
market.tick
replay.started
replay.paused
replay.stopped
script.signal
script.alert
model.prediction
execution.intent
```

Next priority: integrate the live broker/market runtime so normalized live data publishes the appropriate events.

## 9. Replay Engine

Current foundation:

`src/services/core/replay/replayEngine.ts`

Provides deterministic bar-by-bar concepts:

- load
- start
- pause
- stop
- reset
- status
- cursor
- `market.bar` emission

Replay should eventually use the **same event bus/runtime path as live operation**:

```text
Live Market Feed ──┐
                   ├──> Event Bus ──> Chart
Replay Feed ────────┘              ├──> CoreSpirit
                                   ├──> ML
                                   ├──> Alerts
                                   ├──> Strategies
                                   └──> Validation
```

This prevents live/replay divergence and enables deterministic testing.

## 10. TradingCore V Price Action + Levels

Target:

```text
CoreSpirit
    ↓
TradingCore V Price Action
    ├── Chart
    └── Levels
```

Do not maintain separate algorithm A/B implementations.

Planned structure logic:

- N-bar fractals
- KDE-weighted support/resistance
- volume weighting
- ATR-based impulse detection
- order-block detection
- supply/demand zones
- mitigation lifecycle
- DBSCAN clustering within approximately 0.25 ATR
- multi-timeframe confluence
- broken levels become grey
- dynamic chart levels

The same canonical structure engine drives Price Action and Levels.

## 11. ML Architecture

The goal is **real server-side ML**, not placeholder registry entries.

Every production model should have:

- real training pipeline
- real historical data
- feature schema
- target/label definition
- training artifact
- validation metrics
- model version
- inference path
- provenance
- forecast horizon
- chart-overlay contract where applicable
- failure isolation

### 39-model requirement

The registry previously represented 39 models while only some were genuinely implemented server-side. The long-term requirement is for **all 39 to become genuinely functional server-side models using real historical data**.

Do not claim all 39 work until they actually do.

## 12. Four ML Layers

### Layer 1 — Price Prediction

- stock cash-flow / valuation models
- DOM/order-book models
- index constituent flow models
- short-horizon prediction
- intraday prediction

### Layer 2 — Market Structure & Regime

- deterministic price-action engine
- regime classifier
- correlation/competitor tracker
- market-state classification

### Layer 3 — Multi-Asset / Cross-Asset Intelligence

- cross-asset relationships
- relative strength / alpha
- commodities/macro context
- FX currency strength
- rate differentials
- indices
- options OI
- GEX
- DEX
- PCR

### Layer 4 — Trade Decision / Execution Support

- trigger generator
- adaptive risk/SL
- feature aggregator
- confidence evaluator
- meta-classifier
- execution gate
- execution intent

**Important:** ML should initially produce evidence, features, classifications, and predictions. It should not directly place live orders.

```text
Models
  ↓
Evidence / Features / Predictions
  ↓
Validation / Meta Labeler
  ↓
Risk / Policy
  ↓
Execution Intent
  ↓
Broker
```

## 13. Model Horizon Separation

Match features and labels to the intended horizon:

- DOM/order-book → very short-horizon microstructure
- OHLCV/options/flow → intraday and swing contexts
- fundamentals/valuation → medium/longer horizon

Do not indiscriminately mix all data.

## 14. DOM Requirement

A genuine DOM/order-book model requires genuine Level-2/depth data.

**OHLCV is not a substitute for DOM.**

If real depth data is unavailable:

- do not call the model a true DOM model
- explicitly mark the limitation
- use an appropriate non-DOM model instead

## 15. Market Structure: Deterministic First

First compute deterministic structure:

- fractals
- swings
- MSS
- CHOCH
- FVG
- order blocks
- support/resistance
- supply/demand
- liquidity
- mitigation

ML can then classify regime, probability, quality, confidence, and context.

Do not use ML to reinvent basic structural definitions when deterministic computation is appropriate.

## 16. Cross-Asset Engine

Model relationships instead of simply stacking hundreds of indicators.

Examples:

- relative strength
- intermarket relationships
- lead/lag
- correlation regimes
- sector/index relationships
- FX/rates/commodities relationships
- options/index flow relationships

Feature engineering must remain explainable and versioned.

## 17. Meta-Labeling and Risk

Potential components:

- triple-barrier labeling
- probability of success
- expected return
- volatility regime
- time-of-day
- liquidity
- transaction costs
- spread
- slippage
- drawdown context

Preferred sequence:

```text
Signal
 ↓
Feature Aggregation
 ↓
Meta Label
 ↓
Risk Rules
 ↓
Execution Gate
```

Risk remains deterministic/policy-controlled initially.

## 18. RL

Reinforcement learning comes later, not first.

Before serious RL, simulation should model:

- fees
- spread
- slippage
- latency
- partial fills
- liquidity
- position constraints
- drawdown
- market impact
- realistic order handling

RL should initially remain in sandbox/research environments.

## 19. AI Integration

AI should work **through CoreSpirit**, not bypass the platform.

```text
User Intent
   ↓
AI
   ↓
CoreSpirit Code
   ↓
Compiler Validation
   ↓
Historical Backtest
   ↓
Chart Visualization
   ↓
User Review
   ↓
Signal / Alert / Webhook
```

AI should eventually:

- generate scripts
- explain scripts
- debug scripts
- propose optimizations
- translate supported PineScript
- explain model predictions
- inspect validation failures
- generate chart objects
- create alerts/webhooks

AI-generated logic must not bypass validation.

## 20. Broker / Historical Data

When broker/data connectivity is established:

1. connect
2. fetch required historical data
3. normalize/cache it
4. share it across chart, replay, indicators, CoreSpirit, ML, and validation

Avoid repeatedly downloading identical history for every model.

## 21. Persistence

Persist relevant user state:

- settings
- symbol
- timeframe
- levels
- positions
- indicators
- drawings
- layouts
- AI-generated chart objects
- relevant script/strategy state

Autosave target: approximately every 30 minutes plus important immediate-save events.

Cloud persistence must handle signup/login lifecycle and missing rows robustly.

## 22. UI Requirements

### Navigation / account

- clean landing page
- clean navigation
- login
- broker connection flow
- home button

### Chart

- TradingView-class interaction
- left drawing toolbar
- right watchlist panel
- panels open/close without destroying chart space
- option chain can return to chart context
- clean layout handling

### AI panel

- scrollable
- stable
- clear controls
- AI-created chart objects removable

### AI Chart Clear All

When **Clear all** is pressed:

- all AI-created chart objects are removed
- count becomes `0`
- stale async jobs cannot re-add deleted objects

## 23. Reliability / Lifecycle

```text
READY
  ↓
LOADING
  ↓
UPDATING
```

On error:

```text
ERROR
  ↓
RECOVERING
  ↓
READY
```

Guard against:

- broker disconnect/reconnect
- malformed payloads
- invalid timestamps
- duplicate timestamps
- indicator exceptions
- stale references
- symbol/timeframe race conditions
- stale async prediction jobs
- invalid fitContent calls
- invalid chart values
- chart initialization races
- failed model overlays
- persisted drawing corruption

A recoverable subsystem failure must not destroy the entire chart.

## 24. Current Integrated Build

Current architecture-integrated build:

`TradingCoreOS-browser-os-architecture-integrated.zip`

Merged foundation:

`TradingCoreOS-merged-v0.0.19-browser-os-foundation.zip`

Important additions include:

```text
src/services/core/event/eventBus.ts
src/services/core/replay/replayEngine.ts
src/services/core/compatibility/tradingViewReferenceAdapter.ts
src/services/coreSpirit/types.ts
src/services/coreSpirit/runtime.ts
docs/ML_BROWSER_OS_ARCHITECTURE.md
```

### v0.0.19 is the source of truth

When versions differ, prefer v0.0.19 and preserve its:

- NIFTY/BANKNIFTY/SENSEX canonical symbol handling
- chart-value sanitization
- safer persisted drawings
- AI prediction clear/stale-job invalidation
- cloud settings row materialization
- release-note history

## 25. TradingView-API Reference Repository

Unofficial repository:

`https://github.com/Mathieu2301/TradingView-API`

Use only as a research/reference/compatibility adapter unless licensing and terms have been reviewed.

It must not become:

- the Core Chart Engine
- the CoreSpirit runtime
- the broker execution engine
- the authoritative production market-data architecture

Potential uses: protocol/reference study, adapter experimentation, compatibility testing.

## 26. Current Implementation Truth

### Implemented / scaffolded

- browser trading OS foundation
- Core event bus foundation
- deterministic replay foundation
- CoreSpirit type definitions
- CoreSpirit runtime boundary/scaffold
- TradingView reference adapter contract
- ML architecture documentation
- previous v0.0.19 chart/AI reliability fixes

### Not complete

- full CoreSpirit language/compiler
- full PineScript compatibility
- full unified structure engine
- full TradingCore V migration
- all 39 genuinely trained server-side ML models
- complete cross-asset intelligence
- production meta-labeler
- realistic execution simulator
- production RL system
- full event-bus integration across every existing subsystem

**Never describe scaffolding as a finished subsystem.**

## 27. Recommended Implementation Order

### Phase 1 — Foundations

1. integrate event bus into live market runtime
2. normalize market data
3. establish canonical chart data contracts
4. harden chart failure isolation
5. establish drawing persistence/object contracts

### Phase 2 — CoreSpirit

6. lexer/parser
7. AST
8. semantic analysis
9. IR
10. compiler
11. stateful chronological runtime
12. semantic primitives
13. draw/signal/alert/webhook support

### Phase 3 — Structure

14. deterministic market-structure engine
15. TradingCore V Price Action migration
16. Levels migration
17. shared structure outputs

### Phase 4 — Compatibility

18. Pine reader/parser
19. Pine → CoreSpirit translator
20. compatibility test suite
21. reference comparison adapter

### Phase 5 — Replay / Validation

22. full event-driven replay
23. same runtime path for replay/live
24. backtest engine
25. lookahead prevention
26. fees/slippage/latency/partial-fill simulation

### Phase 6 — ML

27. model registry schema
28. training-data pipeline
29. artifact/provenance system
30. genuine server-side models
31. model overlay contract
32. regime engine
33. cross-asset engine
34. meta-labeling
35. deterministic risk/policy gate

### Phase 7 — AI

36. AI → CoreSpirit generation
37. compiler validation
38. backtest validation
39. explain/debug/optimize
40. controlled alerts/webhooks

### Phase 8 — Advanced Execution

41. execution-intent framework
42. broker execution adapter
43. realistic simulator
44. sandbox RL research
45. only then consider carefully controlled live RL-derived policies

## 28. Non-Negotiable Anti-Drift Rules

1. Do not replace the architecture with shortcuts.
2. Do not build duplicate engines for the same market concept.
3. Do not claim ML is real unless it has a real training/inference path.
4. Do not claim all 39 models work until all 39 genuinely work.
5. Do not call OHLCV a DOM substitute.
6. Do not let AI bypass compiler/validation/backtest safeguards.
7. Do not allow one indicator/model failure to blank the chart.
8. Do not use screen coordinates as canonical drawing state.
9. Do not introduce lookahead into replay/backtesting.
10. Do not make replay a separate fake implementation; share the event/runtime path.
11. Do not turn CoreSpirit into a PineScript clone.
12. Do not make TradingCore V and Levels separate algorithmic implementations.
13. Do not put live RL directly into execution before realistic simulation.
14. Do not silently discard working v0.0.19 reliability fixes.
15. When modifying ZIPs, preserve existing working functionality unless an intentional migration replaces it.
16. Prefer incremental integration over large rewrites.
17. Compile/type-check changed code whenever practical.
18. If dependencies prevent full-project compilation, distinguish that from errors in changed code.
19. Keep model provenance and feature/label definitions explicit.
20. When uncertain, inspect the current project/source before inventing an implementation.

## 29. Canonical Immediate Next Step

> **Integrate the existing event bus with the current live market/runtime pipeline, then establish canonical chart/drawing/data contracts before implementing the full CoreSpirit compiler.**

After that, follow the implementation order above unless a concrete engineering dependency requires a change.

## 30. Working Principle

```text
One Data Model
      ↓
One Event Bus
      ↓
One Chart Object Model
      ↓
One Structure Engine
      ↓
One CoreSpirit Runtime
      ↓
Many Indicators / Models / Strategies
      ↓
One Validation + Risk Boundary
      ↓
Controlled Execution
```

The objective is not simply to add features. The objective is to make TradingCoreOS **coherent, deterministic, extensible, observable, and resistant to architectural drift**.

## 31. Stage 2 — Unified CoreDrawing + Calculation Clock

### Unified CoreDrawing object model

The project now has a canonical shared drawing contract:

`src/services/core/drawing/coreDrawing.ts`

CoreDrawing is a **shared data contract**, not a renderer and not a CoreSpirit subsystem.

```text
User drawing ─┐
AI drawing ───┤
Script intent ┤
System object ┘
        ↓
   CoreDrawing
        ↓
 Core Chart renderer
```

Core Chart remains responsible for interaction/rendering. CoreSpirit remains a separate entity and may later emit drawing intents that conform to the shared CoreDrawing contract.

CoreDrawing stores:

- stable `id`
- semantic `kind`
- data-coordinate points `{time, price}`
- `owner`: user / script / ai / system
- optional `sourceId`
- optional `paneId`
- optional `seriesId`
- `coordinateSpace: data`
- style
- label
- metadata
- lifecycle: draft / active / hidden / deleted / expired
- created/updated timestamps

Legacy chart drawings are normalized into CoreDrawing when loaded, preserving backward compatibility with existing persisted chart state.

### Calculation clock — tick and bar execution

TradingCoreOS must support calculations at two granularities:

```text
Market Tick
   ↓
Developing-bar calculation
   ↓
Realtime calculation snapshot

Bar close
   ↓
Bar calculation
   ↓
Deterministic state update
```

The current foundation is:

`src/services/core/calculation/realtimeCalculationEngine.ts`

It provides stateful calculation snapshots for:

- close
- change / change %
- SMA(20)
- EMA(20)
- RSI(14)
- ATR(14)
- VWAP
- developing high/low
- calculation timestamp
- bar index
- tick vs bar mode
- bar-close flag

Every incoming market tick can update the developing bar without treating each tick as a new completed bar. This prevents repeated ticks inside one candle from incorrectly advancing chronological state.

`market.calculation` is available on the shared event bus so Chart, CoreSpirit, replay, validation, ML and other independent consumers can subscribe without direct coupling.

### TradingView-class calculation semantics

The target is not simply "indicators on candles". TradingCoreOS should support:

1. **Tick/developing-bar calculations**
   - recalculate relevant realtime values as market ticks arrive
   - preserve the distinction between current-bar state and completed-bar state
   - never treat every tick as a new historical bar

2. **Bar-by-bar calculations**
   - deterministic chronological updates
   - identical semantic path for replay and live operation
   - no future-bar/lookahead access

3. **Calculation dependency graph**
   - primitives → derived series → structure → indicators → models → signals
   - calculate only affected nodes when possible
   - cache reusable series/state

4. **State snapshots**
   - current value
   - previous confirmed value
   - developing value
   - calculation timestamp
   - source/timeframe
   - provenance/version

5. **Failure isolation**
   - one calculation/indicator failure must not stop candle updates or unrelated calculations

6. **Session-aware calculations**
   - exchange/session boundaries
   - daily/weekly/monthly resets
   - timezone/session configuration
   - opening-range and VWAP session semantics

7. **Multi-timeframe calculations**
   - explicit higher/lower timeframe state
   - confirmed-vs-developing HTF values
   - no accidental future data

8. **Realtime/replay parity**
   - live ticks and replay events must enter the same calculation/event path
   - deterministic replay must be able to reproduce calculations

### TradingCoreOS improvement layer

Do not copy limitations or UI assumptions merely because TradingView has them. Where technically and legally appropriate, TradingCoreOS should extend the chart with:

- explicit tick/developing-bar calculation visibility
- deterministic calculation provenance
- per-output lifecycle/state
- shared structure outputs instead of duplicate indicator implementations
- stronger failure isolation
- native CoreSpirit semantic calculations
- richer AI/script/user drawing ownership
- replay/live calculation parity
- server-side ML evidence with provenance and horizon
- cross-asset context
- explainable calculation dependencies
- auditable validation/risk boundaries
- persistent calculation/script state
- configurable calculation cadence where data permits

These are architectural goals, not claims that every item is already implemented.

### CoreDrawing / CoreSpirit separation rule

CoreDrawing is a shared contract.

It must **not** cause:

- Core Chart to import CoreSpirit runtime internals
- CoreSpirit to own chart lifecycle
- chart rendering to depend on compiler/parser implementation
- AI to bypass CoreSpirit validation when generating executable script logic

Core Chart and CoreSpirit remain separate entities working together through stable contracts and the shared data/event architecture.

## 32. Stage 2 Implementation Truth

### Implemented in Stage 2

- canonical `CoreDrawing` model
- legacy drawing normalization
- ownership/source/lifecycle metadata
- data-coordinate drawing contract
- chart persistence migrated to CoreDrawing version 2
- stateful tick/developing-bar calculation engine
- bar calculation mode
- realtime calculation event
- initial incremental calculation set: SMA20, EMA20, RSI14, ATR14, VWAP, change/change%, high/low
- integration of calculation engine into `LiveChart` historical initialization and live tick processing

### Still required

- full dependency-graph calculation engine
- complete indicator-by-indicator incremental runtime
- session-aware calculation state
- explicit MTF confirmed/developing semantics
- calculation cache/invalidation graph
- replay calculation conformance tests
- full CoreDrawing renderer abstraction for every drawing kind
- script/AI drawing producers using CoreDrawing
- chart object hit-testing/editing/dragging
- drawing selection and z-order
- complete measurement semantics
- full CoreSpirit compiler/runtime
- full Pine compatibility



## 33. Stage 3 — Data/Event Bus + Individual Drawing Tools

### Implemented

- live broker/runtime market events now publish through `src/services/core/event/eventBus.ts`
- normalized `market.tick` publication with broker and receive timestamp
- `market.status` and `market.error` lifecycle events
- `market.history.loaded` telemetry event
- realtime calculation engine emits completed `market.bar` events in addition to `market.calculation`
- event listener failure isolation so one faulty consumer cannot block other consumers
- canonical individual drawing-tool registry at `src/services/core/drawing/drawingTools.ts`
- drawing tool interaction cardinality/semantics for the current CoreDrawing tool set
- LiveChart drawing menu now consumes the canonical drawing-tool registry
- user drawing creation/deletion/clear operations publish drawing events
- chart lifecycle events are represented on the shared bus

### Individual drawing-tool roadmap

TradingCoreOS will implement individual tools as first-class Core Chart interaction modules while preserving the shared CoreDrawing contract. The target is TradingView-class or better interaction without copying limitations merely because they exist elsewhere.

Future tool capabilities include:

1. pointer hit-testing
2. magnetic snapping to OHLC/high-low/structure/indicator values
3. exact drag/edit handles
4. multi-point geometry editing
5. lock/hide/delete
6. z-order and grouping
7. multi-select and alignment
8. tool templates/styles
9. precise price/time measurements
10. log-scale-aware geometry
11. timeframe/zoom persistence
12. undo/redo history
13. script/AI/user ownership isolation
14. drawing event provenance
15. future CoreSpirit drawing intents without chart/runtime coupling

### Data/Event Bus target

The canonical flow is:

```text
Broker / Replay
      ↓
Normalized Market Data
      ↓
   Core Event Bus
      ├── Core Chart
      ├── CoreSpirit
      ├── Realtime Calculations
      ├── Structure Engine
      ├── ML
      ├── Alerts
      ├── Validation
      └── Execution Intent
```

Replay and live must converge on the same event semantics.

### Stage 3 still required

- replay/live conformance tests for every event type
- event sequence IDs and stronger observability/diagnostics
- full calculation dependency/invalidation graph
- full CoreDrawing renderer abstraction
- hit-testing/editing/dragging/selection/z-order
- advanced snapping and geometry semantics
- script/AI drawing producers
- complete CoreSpirit compiler/runtime

## 31. Stage 4 — CoreSpirit AST / IR Foundation

The Stage 4 implementation establishes the language representation boundary behind the existing CoreSpirit runtime scaffold.

### Added source layers

```text
CoreSpirit Source
      ↓
Lexer / Tokens
      ↓
Parser
      ↓
AST
      ↓
Semantic Analysis
      ↓
CoreSpirit IR
      ↓
Compiler Boundary
      ↓
Existing Stateful Runtime (next stage)
```

Added:

- `src/services/coreSpirit/ast.ts`
- `src/services/coreSpirit/lexer.ts`
- `src/services/coreSpirit/parser.ts`
- `src/services/coreSpirit/semanticAnalyzer.ts`
- `src/services/coreSpirit/ir.ts`
- `src/services/coreSpirit/compiler.ts`
- `src/services/coreSpirit/coreSpiritPipeline.ts`
- `src/services/coreSpirit/index.ts` exports for the language layers

### AST scope

The current AST represents:

- program blocks
- variable declarations
- expression statements
- conditional branches
- numeric/string/boolean/null literals
- identifiers
- unary expressions
- binary arithmetic/comparison/logical expressions
- function calls
- historical indexing such as `close[1]`

### Semantic boundary

The semantic analyzer currently validates:

- declared-variable collisions
- unknown identifiers
- unknown built-in calls
- non-negative historical indexing
- maximum constant lookback

Future-looking constant indexing such as `close[-1]` is rejected at semantic analysis time. This is a foundation for the later no-lookahead runtime/backtest guarantee, not a claim that the complete compiler/runtime is finished.

### IR scope

The IR is a serializable instruction representation with operations for:

- constants
- market-series loads
- local moves/assignments
- unary/binary operations
- calls
- indexing
- conditional jumps
- chart-independent output intents (`plot`, `marker`, `line`, `zone`, `signal`, `alert`, `webhook`)

The IR intentionally does not own chart rendering. Core Chart and CoreSpirit remain separate entities connected by shared contracts/events.

### Stage 4 implementation truth

Implemented in this stage:

- lexer/token model
- parser
- expanded AST
- semantic validation boundary
- historical lookback metadata
- AST → IR compiler boundary
- public CoreSpirit parse/compile helpers
- isolated TypeScript compilation of the changed CoreSpirit language files
- executable smoke tests for valid compilation and rejection of future indexing

Still not complete:

- full CoreSpirit type system
- complete semantic trading primitives
- optimized IR
- bytecode/native execution format
- chronological/stateful IR runtime
- complete no-lookahead enforcement for dynamic/runtime indices
- drawing/signal/alert/webhook runtime execution
- Pine reader/parser and Pine → CoreSpirit translation
- full compiler validation suite
- deterministic replay/backtest integration

Never describe Stage 4 AST/IR as the finished CoreSpirit compiler/runtime.

## 32. Stage 4 Anti-Drift Rules

1. AST and IR are language/runtime representations, not chart-rendering implementations.
2. CoreSpirit must remain a separate entity from Core Chart Engine.
3. Shared output contracts and the event bus are integration boundaries; they are not permission to couple chart lifecycle to parser/compiler internals.
4. Pine compatibility must translate into CoreSpirit AST/IR rather than replace CoreSpirit's native representation.
5. Historical indexing is backward-looking only; future references must not be introduced into replay/backtesting.
6. Semantic trading concepts should eventually be canonical primitives shared with the structure engine rather than duplicated inside individual scripts.
7. Preserve the existing event bus, chart lifecycle, drawing, calculation, symbol handling, sanitization, and AI reliability work when advancing CoreSpirit.

## 34. Stage 5 — Core Chart Workspace Layout + Drawing Rail

### Implemented
- Core Chart workspace treats the watchlist as a canonical right-side panel.
- Legacy left-side watchlist injection/cloning is not part of the canonical workspace.
- Dedicated `src/components/workspace/CoreDrawingToolbar.tsx` provides the Core Chart drawing rail.
- Drawing tools use the canonical `CORE_DRAWING_TOOLS` semantics.
- Drawing-tool events can be scoped to the focused chart index.
- `LiveChart` supports workspace-owned drawing UI via `showEmbeddedDrawingToolbar={false}`.
- Chart workspace sizing was hardened so chart viewports retain usable height/width.

### Stage 5 still required
- full pointer hit-testing
- edit handles and drag/resize geometry
- magnetic OHLC/structure snapping
- grouping and z-order
- advanced measurement semantics
- complete renderer abstraction for every CoreDrawing kind
- complete CoreSpirit chronological runtime/compiler

## 35. Stage 6 — Stateful CoreSpirit Runtime + Right Workspace Dock

### Implemented
- chronological CoreSpirit IR executor at `src/services/coreSpirit/runtime.ts`
- state persistence across bars for EMA/RSI/ATR/VWAP-style calculations
- runtime no-lookahead enforcement for historical indexing
- safe handling of unavailable historical lookback at dataset boundaries
- dynamic indexing for canonical market series with runtime validation
- per-bar execution step guard
- per-bar diagnostic isolation
- `script.signal` event publication for runtime signals
- chart-independent CoreSpirit output objects
- optional alert/webhook intent routing through the existing script event boundary
- runtime exports from `src/services/coreSpirit/index.ts`
- `src/components/workspace/WatchlistDock.tsx`
- right-side vertical workspace rail with watchlist toggle
- compact TradingView-style watchlist table hierarchy
- grouped instrument sections
- selected ticker information panel
- broker-driven live quote values; missing fields remain `—`
- top-toolbar Watchlist control removed from the live V4/V5 workspace path
- workspace-owned left drawing rail retained and embedded LiveChart drawing rails disabled in the workspace

### Stage 6 architecture
```text
                         TradingCoreOS
                              │
              ┌───────────────┴───────────────┐
              │                               │
       Core Chart Engine                CoreSpirit Engine
              │                               │
       ┌──────┼──────┐                  Parser / AST / IR
       │      │      │                         │
 Drawing  Chart   Watchlist              Stateful Runtime
  Rail   Grid     Right Dock                   │
       │      │      │                         │
       └──────┴──────┴────── Event/Data Bus ───┘
                                      │
                         Signals / Alerts / Validation
```

### Stage 6 still required
- complete CoreSpirit type system
- complete semantic trading primitives
- optimized IR/bytecode execution format
- session-aware calculation state
- explicit MTF confirmed/developing semantics
- deterministic replay/live runtime conformance
- full backtest integration
- Pine reader/parser and Pine → CoreSpirit translation
- resource/memory quotas beyond the basic execution-step guard
- real webhook delivery service
- full CoreDrawing geometry/hit-testing/editing/snapping engine
- richer watchlist persistence, multiple lists and broker-provided range/news/fundamental data

### Stage 6 anti-drift rules
1. CoreSpirit runtime execution must remain independent from Core Chart lifecycle/rendering.
2. Core Chart consumes CoreSpirit output contracts/events; it must not import parser/compiler internals.
3. Historical indexing is chronological and backward-only.
4. Missing historical bars return `null`; future bars are never read.
5. Runtime calculation state must be reproducible in replay/backtest.
6. Script signals/alerts/webhooks cross the event boundary rather than directly manipulating chart internals.
7. The right watchlist dock is Core Chart workspace UI, not a CoreSpirit feature.
8. Do not invent live ticker/range/news values when broker data is unavailable.
9. Preserve v0.0.19 reliability and symbol-normalization behavior while extending the workspace.
10. Do not describe the Stage 6 runtime as the finished CoreSpirit language/runtime; compiler completeness, Pine compatibility, replay/backtest integration and semantic trading primitives remain future stages.

## 34. Stage 7 — TradingCore Chart Command Bar + Favorite Symbol UI

Stage 7 refines the Core Chart workspace upper command surface using the supplied TradingView-style reference while preserving TradingCoreOS's existing dark/minimal visual language.

### Implemented

- selected symbol/search control in the upper chart command bar
- per-symbol favorite star with local persistence
- add/select symbol shortcut
- compact timeframe controls: 1m / 3m / 5m / 15m / 30m / 1H / 1D
- chart-type command surface
- Indicators command
- Levels command
- Option Chain command
- AI prediction command
- Layout command
- Replay command surface
- Alert command surface
- Fit chart control
- Draw command
- Undo / Redo command surfaces
- More menu with Positions, Orders, Trades, Order Ticket and refresh actions
- existing Buy / Sell actions preserved

### Focused-chart routing

The upper toolbar uses targeted workspace events for chart-owned commands:

```text
Top Command Bar
      ↓
Workspace Event
      ↓
Focused Core Chart
```

Implemented event contracts include:

- `TRADINGCORE_SET_TIMEFRAME`
- `TRADINGCORE_OPEN_INDICATORS`
- `TRADINGCORE_OPEN_PREDICTIONS`

`LiveChart` ignores targeted commands intended for another chart index. This keeps multi-chart workspaces isolated.

### Favorite symbol

Favorites are stored independently from watchlist membership using:

`tradingcore:favorite:<instrumentKey>`

The favorite star is therefore a symbol-level preference rather than a second watchlist implementation.

### Watchlist placement rule

The watchlist remains exclusively represented by the canonical Stage 6 right-side workspace dock/right rail. The upper symbol control may open the right dock for selection, but there is no duplicate top-toolbar Watchlist button.

### Workspace composition

```text
                 Core Chart Workspace
┌─────────────────────────────────────────────────────────────┐
│ Symbol ★ + │ Timeframes │ Indicators │ Levels │ AI │ ...    │
├─────────────────────────────────────────────────────────────┤
│ Draw Rail │                 Charts                  │ Watch  │
│           │                                          │ list   │
│           │                                          │ Dock   │
└─────────────────────────────────────────────────────────────┘
```

### Stage 7 implementation truth

Implemented in this stage:

- TradingView-inspired command-bar density and grouping
- symbol/favorite/add controls
- timeframe event routing into `LiveChart`
- Indicators/AI command routing into the focused chart
- Levels/Option Chain integration with existing workspace panels
- removal of the top-toolbar Watchlist command in favor of the right-side dock
- persisted symbol favorite state
- command-bar More menu

Still not complete:

- full replay UI/runtime integration from the toolbar
- full alert creation workflow from the toolbar
- chart-type switching implementation
- true chart undo/redo history behind the top buttons
- complete drawing hit-testing/editing/snapping/geometry engine

### Anti-drift rule

The command bar is a **Core Chart UI layer**. It must not import or depend on CoreSpirit parser/compiler/runtime internals. CoreSpirit remains a separate entity connected through the established data/event contracts.

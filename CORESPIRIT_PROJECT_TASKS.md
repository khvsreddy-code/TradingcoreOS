# TradingCoreOS — CoreSpirit Master Task File

**Project direction:** Build CoreSpirit as TradingCoreOS's own trading-native scripting language and runtime. CoreSpirit is **not** intended to be a Pine clone. Pine compatibility remains an import/translation layer only.

**Current source baseline:** merged NIFTY/history-fix archive (v9)
**Current workstream:** CoreSpirit language + TradingView-style coder + chart reliability + indicator/runtime correctness
**Updated:** 2026-09-20

---

## 1. Product definition

CoreSpirit should let users write trading logic with Pine-like simplicity while exposing capabilities that are natural to a web trading platform:

- time-series calculations and state
- plots and chart drawings
- alerts and events
- webhooks
- models / ML calls
- multi-symbol data
- multi-timeframe data
- custom calculations
- custom UI panels/tables
- realtime execution
- replay and backtesting
- broker/order interfaces behind explicit execution controls
- instant script modification / hot reload
- strong diagnostics, autocomplete and documentation

**Design principle:** CoreSpirit owns language/runtime semantics. The chart renderer, broker adapters, ML services and automation services consume CoreSpirit outputs through stable interfaces.

---

## 2. Target architecture

```text
CoreSpirit source
      ↓
Lexer → Parser → AST → Semantic Analysis
      ↓
CoreSpirit IR / executable artifact
      ↓
CoreSpirit VM
      │
      ├── historical execution
      ├── realtime-bar execution
      ├── replay/backtest execution
      ├── state store
      └── event/output dispatcher
             │
     ┌───────┼────────┬─────────┐
     ↓       ↓        ↓         ↓
   Chart   Webhooks  Models   Trading/Automation
     ↓       ↓        ↓         ↓
 Lightweight Charts / TradingCoreOS modules
```

Pine compatibility:

```text
Pine source → Pine compatibility translator → CoreSpirit → same VM
```

There must not be separate indicator semantics for native indicators and translated CoreSpirit/Pine scripts long-term.

---

## 3. Existing CoreSpirit foundation — DONE

- Lexer
- Parser
- AST
- Semantic analyzer
- IR
- Compiler
- deterministic executable artifact/checksum
- stateful chronological runtime
- incremental bar execution
- lookback guards
- step quota
- worker boundary
- plot/drawing/signal output contract
- event bus integration
- fail-closed Pine compatibility adapter

Relevant source area: `src/services/coreSpirit/`

---

## 4. Current iteration — DONE / STARTED

### 4.1 CoreSpirit coder foundation — DONE

Added:

- `/corespirit` workspace route
- CoreSpirit Coder page
- TradingView-style dark editor layout
- line-number gutter
- starter scripts
- local script save
- compile action
- compiler diagnostics
- compile status
- roadmap panel

Source:

- `src/pages/CoreSpiritEditorPage.tsx`
- `src/App.tsx`
- `src/components/workspace/WorkspaceModuleShell.tsx`

### 4.2 Chart history lifecycle hardening — STARTED

Added an abort-aware chart history lifecycle boundary:

- chart creates an `AbortController` per history lifecycle
- cleanup aborts the lifecycle request
- stale/aborted results are ignored
- history guard accepts an optional abort signal
- runtime checks cancellation before/after broker history retrieval

Important limitation: current broker adapter interfaces do not yet pass `AbortSignal` into the underlying HTTP request. The current layer therefore prevents stale results and queued work from affecting the chart, while true transport-level cancellation must be added to the broker HTTP adapters next.

---

# 5. CoreSpirit v1 build plan

# 5. Pine release-notes research → CoreSpirit design decisions

**Source reviewed:** TradingView Pine Script release notes across the current 2026 entries and historical releases. We are using the useful language, runtime, editor, visualization and strategy ideas as design input—not cloning Pine or inheriting its limitations. citeturn0view0

## 5.1 Adopt the useful ideas

### Language/runtime
- [ ] `once`-style one-time execution for initialization. citeturn0view0
- [ ] Strict `bool` semantics plus lazy `and`/`or` evaluation. citeturn1view0
- [ ] Dynamic symbol/timeframe requests, extended by CoreSpirit to async external/model requests with quotas. citeturn1view0
- [ ] `const`/`simple`/`series`-like type qualifiers with CoreSpirit type inference. citeturn3view0
- [ ] Arrays, maps and matrices as first-class data structures. citeturn3view0turn3view2
- [ ] User-defined objects/types and methods/dot notation. citeturn3view1
- [ ] Historical collection state where explicitly requested, with memory controls. citeturn3view2
- [ ] Well-defined dynamic loop semantics. citeturn1view0

### Trading data
- [ ] Realtime `bid`/`ask` where the feed supports them. citeturn1view0
- [ ] Rich symbol metadata: exchange, ticker, type, currency, sector, industry, country, contract/expiry and stable identifiers. citeturn1view0turn3view0
- [ ] Session awareness, trading-day identity and session resets. citeturn2view4
- [ ] Timeframe utilities, bar offsets, timestamps and alignment. citeturn1view2turn1view3
- [ ] Lower-timeframe/intrabar requests for advanced calculations and replay. citeturn3view2
- [ ] Secure external-data adapters; CoreSpirit extends this beyond Pine with web/API connectors. citeturn3view0
- [ ] Optional footprint primitives: buy/sell volume, delta, POC and value area. citeturn0view0

### Visuals
- [ ] Polylines for arbitrary multi-point structures. citeturn3view0
- [ ] Mutable line/box/label/zone objects with setters, cloning and lifecycle management. citeturn3view1turn2view3
- [ ] Line fills, gradients and gap controls. citeturn2view3turn3view1
- [ ] Explicit plot/drawing pane or overlay routing. citeturn1view3
- [ ] Per-output format/precision and Data Window/status-line visibility. citeturn2view1
- [ ] Solid/dashed/dotted plot styles. citeturn2view0
- [ ] Tables with tooltips/merging plus richer CoreSpirit-native dashboard UI. citeturn2view3
- [ ] Text formatting/font controls. citeturn2view3

### Inputs/editor
- [ ] Dependent/active inputs. citeturn2view0
- [ ] Input groups, inline controls, tooltips and display controls. citeturn2view0turn2view4
- [ ] Multiline text inputs and multiline strings for prompts/webhook bodies. citeturn2view3turn0view0
- [ ] Automatic expression wrapping and word wrap. citeturn0view0turn2view0
- [ ] Side-by-side coder with chart visible at the same time. citeturn2view0
- [ ] Command palette, formatter, autocomplete and profiler. citeturn2view0turn1view0
- [ ] First-class compile/runtime warnings with actionable diagnostics. citeturn2view5

### Alerts, automation and strategy
- [ ] Script alerts and contextual alert payloads. citeturn2view4turn3view0
- [ ] Explicit execution modes: bar-close, realtime tick, historical intrabar and order-fill events. citeturn0view0
- [ ] Lower-timeframe bar-detail/backtest model. citeturn0view0turn3view2
- [ ] Separate order-fill assumptions, delay, leverage and simulation properties from script logic. citeturn0view0
- [ ] Strategy analytics: profit %, drawdown %, runup %, capital held and per-trade metrics. citeturn2view1turn1view0

## 5.2 Deliberately improve on Pine
- [ ] Native async webhooks with retries/status.
- [ ] Native model/AI calls with caching, timeouts, cost/rate controls and feature preparation.
- [ ] Native HTTP/data connectors with capability permissions and secret isolation.
- [ ] Unified multi-symbol + multi-timeframe alignment engine.
- [ ] Rich custom UI components, not only fixed tables/labels.
- [ ] True hot reload that reuses candle data and atomically swaps outputs.
- [ ] Same runtime for live, replay and backtest.
- [ ] Versioned CoreSpirit libraries/packages.
- [ ] Event system: `on.tick`, `on.bar`, `on.session.open`, `on.order.filled`, `on.webhook`, `on.model.result`, etc.
- [ ] Capability permissions for broker orders, webhooks, external network, models and account data.
- [ ] Better diagnostics: source location, type, runtime context and suggested fix.
- [ ] Pine import/translation layer only; Pine must not define CoreSpirit's internal architecture.

## 5.3 Do NOT copy blindly
- [ ] Do not reproduce Pine's limitations for compatibility's sake.
- [ ] Do not make external/model requests block the synchronous bar engine.
- [ ] Do not allow scripts to bypass sandbox or permission boundaries.
- [ ] Do not maintain separate indicator semantics for native, CoreSpirit and imported Pine scripts.
- [ ] Do not copy Pine's UI limitations where web-native UI can be better.

## 5.4 New implementation priority
**P0 runtime correctness:** series, `na`, state, realtime rollback/commit, sessions, timeframes, deterministic execution.

**P1 coder:** side-by-side editor, autocomplete, diagnostics, formatter, hot reload, inputs, profiler.

**P2 visuals:** plots, mutable objects, zones, polylines, fills, tables, panes.

**P3 market data:** multi-symbol, multi-timeframe, bid/ask, lower-TF, session/calendar, optional footprint.

**P4 automation:** alerts, webhooks, events, model calls with permissions.

**P5 strategy/replay:** intrabar simulation, bar detail, order model, analytics and replay.

**P6 Pine bridge:** expand import coverage as CoreSpirit itself becomes stronger.

## 5.5 CoreSpirit design targets

```corespirit
indicator "Adaptive Trend" {
    overlay: true

    input length = int(20, min: 1)
    input source = close
    input showSignals = bool(true)

    fast = ema(source, length)
    slow = ema(source, length * 2)

    plot fastLine = fast {
        width: 2
        color: color.green
        format: price
    }

    plot slowLine = slow {
        width: 2
        color: color.red
    }

    if showSignals and fast crossesAbove slow {
        signal "BUY" { price: close }
    }
}
```

Future web/model target:

```corespirit
model regime = model.load("market-regime-v1")
score = regime.predict({
    trend: ema(close, 20),
    volatility: atr(14),
    momentum: rsi(close, 14)
})

on signal("BUY") {
    webhook "trade-alert" {
        body: { symbol: symbol.ticker, price: close, score: score }
    }
}
```

Exact syntax is intentionally not frozen until the language-core/type-system milestone is implemented.

---

## Phase A — Language core

### A1. Series semantics — NEXT

- [ ] first-class `series<number>`, `series<bool>`, etc.
- [ ] `close[1]`, `high[5]` historical indexing
- [ ] deterministic current-bar context
- [ ] strict future-reference prevention
- [ ] `na` as a real runtime value
- [ ] `nz()` semantics
- [ ] explicit warm-up behavior
- [ ] stable series alignment

### A2. State semantics — NEXT

- [ ] persistent variables (`var`-style behavior)
- [ ] state per script instance
- [ ] state per function/call site where required
- [ ] clean state reset when symbol/timeframe/input changes
- [ ] no state leakage between charts

### A3. Realtime semantics — NEXT

- [ ] historical bars execute once
- [ ] current realtime bar can update repeatedly
- [ ] rollback/recalculate current bar state
- [ ] commit state on bar confirmation
- [ ] confirmed/unconfirmed bar flags
- [ ] deterministic tick-to-bar aggregation

### A4. Types and language ergonomics

- [ ] number
- [ ] bool
- [ ] string
- [ ] color
- [ ] time
- [ ] symbol
- [ ] timeframe
- [ ] series types
- [ ] line/box/label/zone objects
- [ ] model handle
- [ ] order/position handles
- [ ] type inference
- [ ] clear compile errors

---

# 6. CoreSpirit standard library

### B1. Core math/time — NEXT

- [ ] math namespace
- [ ] statistics
- [ ] date/session helpers
- [ ] rounding/precision helpers
- [ ] safe division and `na` propagation

### B2. Trading indicators — NEXT

Implement against one canonical CoreSpirit calculation engine:

- [ ] SMA
- [ ] EMA
- [ ] WMA
- [ ] HMA
- [ ] RMA/Wilder smoothing
- [ ] RSI
- [ ] ATR
- [ ] ADX/DMI
- [ ] MACD
- [ ] Stochastic
- [ ] CCI
- [ ] ROC
- [ ] Bollinger Bands
- [ ] Keltner Channels
- [ ] Donchian Channels
- [ ] Supertrend
- [ ] VWAP with session anchoring
- [ ] Ichimoku
- [ ] pivots
- [ ] structure functions
- [ ] volume functions

Every implementation needs bar-by-bar tests and explicit warm-up/`na` behavior.

### B3. Market data requests

- [ ] `symbol()`
- [ ] multi-symbol request
- [ ] timeframe request
- [ ] historical alignment
- [ ] session/calendar alignment
- [ ] missing-data policy
- [ ] request deduplication
- [ ] request quotas
- [ ] async request boundary

---

# 7. Chart API

### C1. Plots

- [ ] `plot()`
- [ ] multiple plots
- [ ] plot title/name
- [ ] line width/style
- [ ] colors
- [ ] opacity
- [ ] hidden/conditional plots
- [ ] plot lifecycle without destroying chart

### C2. Drawings

- [ ] line
- [ ] ray
- [ ] horizontal line
- [ ] box
- [ ] zone
- [ ] label
- [ ] arrow
- [ ] channel
- [ ] Fibonacci objects
- [ ] persistent drawing IDs
- [ ] update/delete drawing
- [ ] chart-coordinate/data-coordinate separation

### C3. Custom UI

- [ ] panel
- [ ] table
- [ ] badge
- [ ] text/value display
- [ ] script settings panel
- [ ] user inputs

---

# 8. TradingView-style CoreSpirit Coder

### D1. Editor UX

- [x] dark editor shell
- [x] line numbers
- [x] compile button
- [x] diagnostics
- [x] local save
- [x] examples
- [ ] syntax highlighting
- [ ] bracket matching
- [ ] autocomplete
- [ ] hover documentation
- [ ] keyboard shortcuts
- [ ] minimap/outline (optional)
- [ ] search/replace
- [ ] multi-file scripts/libraries

### D2. Script lifecycle

- [ ] New script
- [ ] Rename script
- [ ] Save script
- [ ] Save version
- [ ] duplicate script
- [ ] restore previous version
- [ ] cloud persistence
- [ ] private/public script permissions
- [ ] script import/export

### D3. Run modes

- [ ] Compile only
- [ ] Run on active chart
- [ ] Run on all chart panes
- [ ] Replay
- [ ] Backtest
- [ ] Paper mode
- [ ] Live mode
- [ ] explicit execution confirmation

### D4. Instant modification

- [ ] edit source
- [ ] compile new version
- [ ] reuse candle dataset
- [ ] reset only required script state
- [ ] atomically replace outputs
- [ ] do not destroy Lightweight Chart
- [ ] preserve visible range
- [ ] preserve user drawings
- [ ] preserve broker/websocket connection

---

# 9. Automation / webhooks / events

- [ ] `signal()`
- [ ] `alert()`
- [ ] `webhook()`
- [ ] event handlers
- [ ] async task boundary
- [ ] webhook secrets stored server-side
- [ ] retry policy
- [ ] idempotency keys
- [ ] delivery status
- [ ] execution audit log
- [ ] rate limits
- [ ] failure isolation

Possible syntax target:

```corespirit
if bull {
    webhook("tradeSignal", {
        symbol: symbol,
        timeframe: timeframe,
        side: "BUY",
        price: close
    })
}
```

---

# 10. Models / AI

- [ ] `model.load()`
- [ ] model registry integration
- [ ] feature references
- [ ] asynchronous prediction API
- [ ] prediction cache
- [ ] prediction timestamp/provenance
- [ ] model version pinning
- [ ] model failure state
- [ ] no blocking of chart calculation loop
- [ ] optional model outputs as series/events

Target syntax:

```corespirit
model trend = model.load("trend-v3")
score = model.predict(trend, {
    rsi: rsi(close, 14),
    volatility: atr(14)
})
plot(score)
```

---

# 11. Backtesting / replay

- [ ] same CoreSpirit program for historical/replay/live
- [ ] deterministic replay
- [ ] commission
- [ ] slippage
- [ ] position state
- [ ] order simulation
- [ ] risk controls
- [ ] performance metrics
- [ ] trade list
- [ ] equity curve
- [ ] parameter sweeps
- [ ] walk-forward evaluation

---

# 12. Broker / trading API

- [ ] read-only market data API
- [ ] order intent API
- [ ] broker capability checks
- [ ] risk policy boundary
- [ ] explicit live-execution authorization
- [ ] order status events
- [ ] position events
- [ ] idempotent order requests
- [ ] execution audit trail

CoreSpirit should not bypass the TradingCoreOS risk/execution boundary.

---

# 13. Chart reliability — TradingView-quality target

### Current fixes

- [x] history request serialization
- [x] request deduplication
- [x] 600ms broker request spacing
- [x] no retry of broker 429s
- [x] 60s successful-history cache
- [x] chart generation guards
- [x] stale result rejection
- [x] progressive history loading
- [x] NIFTY canonicalization
- [x] NIFTY date-format fallback
- [x] weekend/date correction
- [x] lifecycle AbortController boundary

### Remaining

- [ ] transport-level HTTP abort in FYERS adapter
- [ ] transport-level HTTP abort in Upstox adapter
- [ ] stale-while-revalidate history cache
- [ ] keep previous candles visible while replacement history loads
- [ ] atomic symbol replacement
- [ ] loading/error state machine
- [ ] distinguish empty broker data from invalid symbol/network/rate-limit errors
- [ ] websocket lifecycle tied to chart generation
- [ ] no stale indicator output after symbol switch
- [ ] rapid-switch soak test
- [ ] 429/rate-limit soak test
- [ ] 10+ chart layout soak test
- [ ] browser memory/FPS test

Target lifecycle:

```text
symbol change
  ↓
invalidate generation
  ↓
abort previous request
  ↓
reuse cached candles if available
  ↓
request missing history
  ↓
validate symbol + generation
  ↓
atomic chart update
  ↓
initialize indicator state
  ↓
attach realtime updates
```

---

# 14. Indicator correctness — TradingView-style target

The current application has a separate `indicatorEngine.ts` plus CoreSpirit/Pine execution. Long-term this must become one canonical calculation semantics layer.

- [ ] move core indicators onto CoreSpirit standard-library semantics
- [ ] exact warm-up rules
- [ ] exact `na` propagation
- [ ] correct RMA/Wilder calculations
- [ ] correct EMA initialization
- [ ] session-aware VWAP
- [ ] realtime-bar recalculation
- [ ] crossover/crossunder state correctness
- [ ] MTF alignment
- [ ] symbol-switch state reset
- [ ] indicator output generation independent from chart renderer
- [ ] numerical regression fixtures
- [ ] compare against independently calculated reference values

No indicator is considered complete merely because it visually resembles a TradingView plot.

---

# 15. Pine compatibility — compatibility layer only

- [x] fail-closed translator exists
- [x] basic `ta.*` normalization
- [x] crossover/crossunder translation
- [x] math/input/plot/alert subset
- [ ] expand only where useful
- [ ] document unsupported Pine constructs
- [ ] never let Pine constraints dictate CoreSpirit design

---

# 16. Security / sandbox

Before enabling powerful CoreSpirit actions:

- [ ] sandbox user scripts
- [ ] CPU/time quotas
- [ ] memory quotas
- [ ] request quotas
- [ ] webhook allowlist/policy
- [ ] secrets never exposed to scripts
- [ ] broker credentials never exposed to scripts
- [ ] model/API access capability tokens
- [ ] per-script permissions
- [ ] audit trail

---

# 17. Testing gates

Every CoreSpirit milestone should add tests for:

- [ ] parser
- [ ] semantic analysis
- [ ] compiler
- [ ] runtime state
- [ ] series indexing
- [ ] `na`
- [ ] historical execution
- [ ] realtime execution
- [ ] rollback/commit
- [ ] indicator numerical output
- [ ] chart output contract
- [ ] symbol switching
- [ ] webhook events
- [ ] model events
- [ ] replay determinism
- [ ] security quotas

Required release gate:

```text
unit tests
   ↓
CoreSpirit self-test
   ↓
full TypeScript lint
   ↓
production build
   ↓
browser smoke test
   ↓
rapid symbol-switch test
   ↓
indicator numerical regression
   ↓
release
```

---

# 18. Immediate next implementation order

## Milestone 1 — CoreSpirit series semantics

**Status: NEXT**

1. Define canonical series/value model.
2. Implement `na` and `nz` semantics.
3. Implement historical indexing.
4. Define warm-up rules.
5. Add deterministic series tests.

## Milestone 2 — Canonical indicator library

1. Move SMA/EMA/RMA/RSI/ATR/MACD onto the same semantics.
2. Add regression fixtures.
3. Fix VWAP session anchoring.
4. Connect chart rendering to canonical outputs.

## Milestone 3 — TradingView-style editor

1. syntax highlighting
2. autocomplete
3. compile diagnostics with source ranges
4. Run on active chart
5. instant hot reload
6. script persistence/versioning

## Milestone 4 — Chart lifecycle

1. broker-level AbortSignal support
2. stale-while-revalidate
3. atomic symbol switching
4. rapid-switch soak tests

## Milestone 5 — CoreSpirit advanced capabilities

1. multi-symbol
2. multi-timeframe
3. events
4. webhooks
5. custom drawings/UI
6. models
7. replay/backtest
8. broker execution boundary

---

# 19. Historical project documentation merged into this file

The previous root-level release/stage/task documents were consolidated into this master file to prevent project drift and duplicated instructions. Historical topics retained here include:

- chart lifecycle hardening
- CoreDrawing
- data/event bus
- CoreSpirit AST/IR/compiler/runtime
- chart command bar and UX
- Pine compatibility
- TradingCore V price action
- shared Levels/structure engine
- progressive history / 30k candle history
- FYERS history and NIFTY fixes
- broker routing/live feed fixes
- indicator runtime reliability
- ML feature registry and model roadmap
- deterministic replay
- workspace/chart persistence
- validation/environment limitations

Operational README files inside `ml/` and `fyers-execution-gateway/` are retained because they document deployable subcomponents rather than project planning history.

---

# 20. Current truth / anti-drift rules

1. CoreSpirit is the primary language/runtime design target.
2. Pine compatibility is an adapter, not the language specification.
3. Chart rendering never owns indicator calculation semantics.
4. Indicator calculation must be deterministic and testable without the browser.
5. Historical, replay and live execution should share CoreSpirit semantics.
6. Webhooks/models/trading actions are asynchronous capability boundaries.
7. User scripts never receive broker credentials or unrestricted server access.
8. A visual match is not proof of numerical indicator parity.
9. Every completed milestone must update this file.
10. Do not create another root-level release/stage markdown file for routine implementation progress; update this master task file instead.


## 6. Stage 1 — Series/state runtime foundation — COMPLETED

Implemented in this stage:

- [x] Canonical local-series history: values assigned with `let` can be referenced with historical indexing such as `x[1]`.
- [x] Historical indexing remains non-lookahead: negative/future offsets are rejected.
- [x] Explicit `na` identifier maps to CoreSpirit's null/unknown value.
- [x] Added `isNa()` builtin for explicit missing-value checks.
- [x] Strict warm-up behavior for `sma`, `highest`, `lowest`, and EMA: insufficient history returns `na` instead of a partial value.
- [x] EMA seeds from the requested historical window instead of the first observed bar.
- [x] RSI initializes from a full gain/loss window before producing a value.
- [x] Realtime-bar rollback: repeated updates to the same bar restore pre-bar state before recalculation, preventing duplicate EMA/RSI/cross state.
- [x] Realtime confirmation boundary via `confirmRealtimeBar()`.
- [x] Bar-state metadata now exposes index/time plus realtime/confirmed flags to the runtime state.
- [x] Stage self-tests added for local series indexing, warm-up/`na`, and realtime rollback/commit.

### Stage 1 validation

- [x] Source-level implementation review completed.
- [x] CoreSpirit Stage 1 focused TypeScript transpilation/self-test executed with the repository's source modules; `CORESPIRIT_STAGE1_SELFTEST=PASS`.
- [ ] Browser verification deferred until the dependency tree is restored and the dev server can start.

### Known Stage 1 follow-ups

- [ ] Replace eager `and`/`or` evaluation with true short-circuit semantics.
- [ ] Add explicit `barstate` language identifiers rather than exposing only runtime metadata.
- [ ] Add session-aware VWAP reset semantics.
- [ ] Complete Pine-style rollback/commit semantics for every stateful object, not only numeric series state.
- [ ] Add deterministic golden-vector tests for EMA/RSI/ATR against reference calculations.

## 7. Next stage — Stage 2 indicator/math kernel — NEXT

Build the canonical CoreSpirit indicator library on top of the Stage 1 runtime. Native indicators and future Pine imports must use this same kernel.

First Stage 2 targets:

- [ ] SMA / EMA / WMA / HMA
- [ ] RMA / RSI
- [ ] True Range / ATR
- [ ] MACD
- [ ] Bollinger Bands
- [ ] Stochastic
- [ ] ADX / DMI
- [ ] CCI
- [ ] ROC / momentum
- [ ] session-aware VWAP
- [ ] deterministic warm-up and `na` rules for every function
- [ ] golden-vector tests

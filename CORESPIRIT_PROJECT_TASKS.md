# TradingCoreOS — CoreSpirit Master Task File

**Project direction:** Build CoreSpirit as TradingCoreOS's own trading-native scripting language and runtime. CoreSpirit is **not** intended to be a Pine clone. Pine compatibility remains an import/translation layer only.

**Current source baseline:** TradingCoreOS v27 (built from v25)
**Current workstream:** staged CoreSpirit language/runtime + TradingView-quality chart reliability + canonical indicator kernel + coder; Stages 1–3 deep-audited through v26; richer market data, intrabar execution and footprint access deepened
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

## 3. Existing CoreSpirit foundation — VERIFIED + DEEPENED IN V19

Stage 1 was re-audited from the v18 source instead of being assumed complete. The audit found that the main execution path was sound, but several foundation contracts needed to be made explicit. v19 addresses the highest-value gaps without moving Stage 2 semantics into the runtime foundation.

### Stage 1 verification checklist
- [x] Lexer/token positions and deterministic tokenization
- [x] Line comments
- [x] Block comments with unterminated-comment diagnostics
- [x] Parser → AST pipeline
- [x] Semantic unknown-identifier/function guards
- [x] AST → deterministic IR compilation
- [x] Executable artifact checksum/shape validation
- [x] Chronological bar execution
- [x] Stateful series/local history
- [x] Historical warm-up / `null` propagation foundation
- [x] Realtime same-bar rollback and confirmed-bar commit
- [x] Per-bar execution step quota
- [x] Worker execution boundary
- [x] Main-thread output contract separated from VM
- [x] Cooperative execution cancellation via `AbortSignal`
- [x] Configurable runtime timezone instead of hard-coded session timezone
- [x] Configurable state-history retention with 2048 default floor
- [x] Dependency-free Stage 1 foundation self-test

### Stage 1 remaining hardening (not yet marked complete)
- [ ] Structured multi-diagnostic parser recovery
- [ ] Formal type lattice (`scalar`, `series`, `bool`, `number`, `string`, `na`)
- [ ] Explicit execution-context object shared by live/replay/backtest
- [ ] Deterministic random/clock policy (if randomness is introduced)
- [ ] Formal memory quotas per script
- [ ] Versioned VM compatibility contract


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

## 3.5 Stage 1–3 deep audit — TradingCoreOS v20

**Goal:** Do not advance the roadmap merely because a stage has a green checkbox. Re-audit the runtime, language semantics, indicator kernel and chart-output boundary before Stage 4/5.

### Stage 1 — Runtime foundation: deepened
- [x] Structured parser recovery with multiple syntax diagnostics and source spans.
- [x] Formal core type lattice for number/boolean/string/null and series-qualified values.
- [x] Builtin signature/argument-count validation during semantic analysis.
- [x] Type validation for arithmetic, logical operators, `if`, indexing, indicators and outputs.
- [x] Shared execution-context contract with mode/symbol/timeframe/timezone/run id.
- [x] History/output/step quotas are explicit runtime controls.
- [x] Chronological and finite OHLCV bar validation.
- [x] Bounded runtime history to prevent accidental unbounded memory growth.
- [x] Versioned IR call identities for stateful builtins.
- [x] Cooperative cancellation retained.
- [ ] Deterministic random/clock policy (only needed when those capabilities are introduced).
- [ ] Full VM compatibility/migration contract across persisted artifacts.

### Stage 1.5 — Language simplicity: deepened
- [x] Friendly syntax continues to lower into one deterministic core grammar.
- [x] Syntax errors preserve source line/column/range information.
- [x] Parser can recover after statement-level errors instead of stopping at the first error.
- [x] Surface language now receives type-aware diagnostics rather than only unknown-name errors.
- [ ] Metadata/input syntax needs a proper AST representation instead of line-based normalization.

### Stage 2 — Indicator kernel: deepened
- [x] Pure indicator math module created for shared deterministic calculations.
- [x] SMA/highest/lowest/EMA seed/true-range/RSI math extracted behind a testable kernel boundary.
- [x] Stateful indicator calls are memoized per bar so calling the same EMA/RSI/ATR/VWAP twice does not advance state twice.
- [x] Stateful cross detection now uses stable compiled call identities; it no longer changes identity every bar.
- [x] Lookback retention expands to cover compiled lookback requirements.
- [x] Warm-up returns explicit `null` instead of manufacturing values from incomplete history.
- [ ] Full indicator catalog and exact reference-value conformance suite.
- [ ] Session/calendar-aware VWAP and exchange-specific sessions.
- [ ] Higher-order/series-expression arguments such as `ema(close[1], 20)` without semantic ambiguity.

### Stage 3 — Chart/output lifecycle: deepened
- [x] Stable per-output IDs originate in compiled source locations rather than per-run ordinals.
- [x] `null` plot values are rendered as chart whitespace instead of invalid numeric points.
- [x] Per-bar output quota protects the renderer from pathological scripts.
- [x] Script outputs remain isolated from native chart series/drawings.
- [x] Worker execution + stale-run guard remains the chart boundary.
- [ ] Transactional renderer swap for richer primitives/panes.
- [ ] Native box/zone/polyline lifecycle rather than line-series approximation.
- [ ] Output format/precision/pane metadata contract.
- [ ] Realtime incremental output frames (Stage 5).

### Deep-audit regression contracts
- [x] Stage 1 foundation contract retained.
- [x] Stage 1–3 deep contract added: type diagnostics, duplicate stateful indicator calls, stable plot identities, warm-up behavior and execution context.
- [ ] Browser integration stress run with real Lightweight Charts dependencies.
- [ ] Broker-connected realtime conformance run.


## 3.7 Stage 1–3 visual system deep pass — TradingCoreOS v22

The goal of v22 is to make CoreSpirit a genuinely expressive chart language rather than a collection of line plots. The design borrows the *capabilities* users expect from modern chart scripting while keeping CoreSpirit's own simpler surface syntax and a renderer-independent output model.

### Stage 1 — runtime/output contract
- [x] Rich visual intents are data-only and renderer-independent.
- [x] Visual output quotas cover boxes, bands, arrows and symbols.
- [x] High-cardinality visuals are batched by the dispatcher instead of creating one chart series per object.
- [x] Visual identities are deterministic from source location/output identity.
- [ ] Persistent VM artifact migration/version compatibility remains open.

### Stage 1.5 — language simplicity
- [x] `box(left, right, top, bottom, fill, border, opacity, pattern)`
- [x] `band(top, bottom, color, opacity)` for per-bar filled ranges
- [x] `fill(top, bottom, color, opacity)` as the simpler visual alias for band shading
- [x] `gradient(top, bottom, topColor, bottomColor, opacity)`
- [x] `arrow(time1, price1, time2, price2, color, width)`
- [x] `shape(price, symbol, color, size, text)`
- [x] `heatmap(price, intensity, color, size, text)` for footprint-style per-price cells
- [x] `zone(...)` now supports fill opacity and simple patterns.
- [ ] Array literals / arbitrary polylines are intentionally deferred until the grammar gains a clean collection model.

### Stage 2 — indicator/visual composition
- [x] Bands can consume indicator series directly, enabling volatility envelopes, oscillator zones and model uncertainty regions.
- [x] Visual primitives are independent of indicator math, so the same calculations can feed chart, replay and model pipelines.
- [ ] Full indicator reference-value corpus and exchange-session engine remain open.

### Stage 3 — chart/output lifecycle
- [x] Added a single high-performance canvas overlay for boxes, filled zones, gradients, bands, arrows, patterns and symbols.
- [x] Added solid/hatch/dot/stripe fills.
- [x] Added gradient band rendering.
- [x] Added arrows with vector heads.
- [x] Added symbols: circle, square, diamond, triangle up/down, arrow up/down, cross and star.
- [x] Added text-capable symbol overlays.
- [x] Rich visuals use chart time/price coordinates, so zoom, pan and resize remain data-anchored.
- [x] High-cardinality bands are sampled before canvas rendering to avoid blocking the UI on large histories.
- [ ] Multi-pane visual routing.
- [ ] True 3D/interactive tables and object editing.
- [ ] Realtime incremental frames/hot reload (Stage 5).

### Visual design direction
CoreSpirit should eventually support three levels of plotting:
1. **Simple:** `plot`, `label`, `shape`, `signal`.
2. **Analytical:** `band`, `gradient`, `zone`, `box`, `arrow`.
3. **Advanced:** paths/polylines, heatmaps, tables, custom panels, model uncertainty surfaces and interactive objects.

The advanced layer must remain declarative. A script should describe *what* is being visualized; the renderer decides how to draw it efficiently. This is important for the future model/AI and automation stages.

## 3.6 Stage 1–3 visual/runtime deep pass — TradingCoreOS v21

### Stage 1 — Runtime foundation
- [x] Stable execution/output identities retained across repeated runs.
- [x] Output quota now applies to rich visual objects as well as plots/signals.
- [x] Rich output contracts are data-only; renderer remains outside the VM.
- [x] Label placement is data-price based and therefore usable in historical/replay/realtime modes.
- [ ] Full deterministic clock/random policy remains deferred until those capabilities are introduced.

### Stage 1.5 — Language simplicity
- [x] Added concise `label(...)` and `labelAt(...)` primitives without requiring chart API knowledge.
- [x] Added customizable plot arguments: color, width, line style and title.
- [x] Friendly surface syntax continues to lower to one core execution model.
- [ ] Proper metadata/input AST remains a future language-grammar pass.

### Stage 2 — Indicator kernel
- [x] Added standard deviation, WMA, stochastic and Bollinger math to the shared pure kernel.
- [x] Indicator math remains chart-independent and testable.
- [ ] Full exchange/session-aware conformance remains open.
- [ ] Reference-value corpus across the full catalog remains open.

### Stage 3 — Chart/output lifecycle
- [x] Added rich CoreSpirit labels with above/below/in-bar/arbitrary-price placement.
- [x] Added customizable label background, text color, size and shape.
- [x] Added stable transactional-ish plot/drawing reconciliation: existing owned series are updated instead of destroyed every frame.
- [x] Added stable line/zone IDs and incremental lifecycle.
- [x] Added plot visual metadata (color, width, line style, title).
- [x] Added a dedicated CoreSpirit HTML overlay layer for arbitrary-price labels.
- [ ] Full pane routing and native geometric primitives remain open.
- [ ] Realtime incremental output frames remain Stage 5.


### Stage 3 visualization examples
```corespirit
fast = ema(close, 20)
slow = ema(close, 50)
plot(fast, "#22c55e", 2, 0, "Fast EMA")
plot(slow, "#ef4444", 2, 2, "Slow EMA")

if fast crossesAbove slow {
    label("BUY", "below", "#16a34a", "#ffffff", 12, "pill")
}

if fast crossesBelow slow {
    label("SELL", "above", "#dc2626", "#ffffff", 12, "pill")
}

labelAt(high + 10, "Resistance", "price", "#111827", "#ffffff", 11, "box")
```

`label(...)` anchors to the current candle's high/low depending on position. `labelAt(...)` anchors to an explicit price so CoreSpirit can place annotations in empty chart space as well as above/below candles.


## 3.8 Stage 1–3 visual scene-graph deep pass — TradingCoreOS v23

**Goal:** move from a collection of rich drawing calls toward a real chart-visual scene graph: persistent objects, per-bar visuals, screen-space panels and renderer-safe reconciliation. This pass is explicitly informed by the capabilities highlighted in TradingView/Pine's visual system and recent release notes, but CoreSpirit keeps its own smaller syntax and renderer-independent contract.

### Stage 1 — runtime/output contract
- [x] Added renderer-independent `polyline`, `hline`, `background`, `barcolor`, and `table` output objects.
- [x] Added deterministic IDs for persistent visual objects so repeated execution can reconcile/update rather than blindly accumulate.
- [x] Kept high-cardinality per-bar visuals (`band`, `shape`, background tint, bar tint) append-oriented while persistent objects are upsert-oriented.
- [x] Extended label style metadata with font style/text alignment.

### Stage 1.5 — language simplicity
- [x] `polyline(time1, price1, time2, price2, ..., color, width, pattern)`
- [x] `hline(price, color, width, style)`
- [x] `bg(color, opacity)`
- [x] `barcolor(color, opacity)`
- [x] `table(position, row, column, text, background, color, size)`
- [x] Labels can request weight/style without exposing DOM/CSS APIs.

### Stage 2 — indicator/visual composition
- [x] Any indicator/model output can feed the new visual primitives because visuals remain downstream of calculated values.
- [x] Persistent zones/boxes/lines can be updated from changing indicator state instead of generating a new object every bar.
- [ ] Footprint/volume-row data model inspired by modern chart scripting remains a future Stage 2/6 capability.

### Stage 3 — chart/output lifecycle
- [x] Added polyline rendering on the single canvas overlay.
- [x] Added horizontal levels without creating one Lightweight Charts series per level.
- [x] Added chart background and bar-tint layers.
- [x] Added screen-space table panels with 3x3 anchor positions and grid cells.
- [x] Added label font-style handling.
- [x] Added persistent visual upsert behavior in the dispatcher.
- [ ] Multi-pane routing and shared pane-scale contracts.
- [ ] Interactive script-owned drawing handles/editor.
- [ ] Realtime incremental visual frames/hot reload (Stage 5).

### Visual capability study — lessons from Pine release notes
TradingView's recent releases show a recurring pattern: visual expressiveness grows by adding composable drawing objects, better text formatting, gradients, editor ergonomics, data structures, and more granular execution/data access. Recent notes include UDT-aware binary search, historical tick calculation controls, multiline strings, and typographic text formatting; the visual docs expose lines, boxes, polylines, fills, labels and tables as distinct drawing concepts. CoreSpirit should use these as a capability checklist, not as a syntax-copying target.

**CoreSpirit direction beyond Pine:** one stable scene graph shared by historical/realtime/replay/model outputs, plus direct model/webhook/event outputs. That lets the same visual object be generated by an indicator, a prediction model, a replay engine, or an automation rule without changing the chart renderer.


## 3.9 Stage 1–3 + rich-data deep pass — TradingCoreOS v26

The v26 pass goes below the surface-level Pine feature checklist. The goal is to make market data a first-class, cacheable execution input while keeping CoreSpirit deterministic and host-controlled. TradingView's current docs show three important pressure points: dynamic data requests, all-intrabar access, and footprint data; v26 treats those as architectural contracts rather than isolated built-ins. citeturn0search0turn0search3turn0search5

### Stage 1 — Runtime foundation
- [x] Per-bar data memoization so repeated external/market reads do not repeatedly hit a host resolver.
- [x] Historical-tick execution API sharing the same VM instead of a second calculation engine.
- [x] Explicit `historicalTick` execution mode path.
- [x] Richer host capability boundary for quote/depth/intrabar/footprint data.
- [ ] Persistent VM artifact migration/version contract remains open.

### Stage 1.5 — Language/editor ergonomics
- [x] Hover information for built-ins and market series.
- [x] Semantic-token extraction for the coder.
- [x] Cached editor snapshots combining diagnostics, completions, formatting and tokens.
- [x] Richer market-data vocabulary without forcing users to learn provider APIs.
- [ ] Incremental parser/AST reuse remains open.

### Stage 2 — Indicator/data kernel
- [x] Quote primitives: `bid()`, `ask()`, `spread()`, `mid()`.
- [x] Intrabar aggregations: `intrabarCount()`, `intrabarSum()`, `intrabarHigh()`, `intrabarLow()`, `intrabarDelta()`.
- [x] Footprint row access: `footprintRowPrice()`, `footprintRowBuy()`, `footprintRowSell()`, `footprintRowDelta()`, `footprintRowImbalance()`.
- [x] Batched request capability (`requestBatch`) for host-side request coalescing.
- [ ] Full session/calendar engine and reference-value corpus remain open.

### Stage 3 — chart/output lifecycle
- [x] Data-driven outputs can now be generated from granular quote/intrabar/footprint calculations without changing the renderer contract.
- [ ] Native footprint-map scene object with viewport-aware row virtualization remains open.
- [ ] Multi-pane routing/shared pane scale remains open.

### v26 design rule
**Do not make CoreSpirit simpler by throwing away capability. Make it simpler by moving complexity into the runtime and host adapters.** A user should be able to express a multi-source, footprint-aware calculation in a few lines while the host handles caching, alignment, freshness, provider differences and transport.

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

### 4.2 Chart history lifecycle hardening — COMPLETED IN V13

Added an abort-aware chart history lifecycle boundary:

- chart creates an `AbortController` per history lifecycle
- cleanup aborts the lifecycle request
- stale/aborted results are ignored
- history guard accepts an optional abort signal
- runtime checks cancellation before/after broker history retrieval

Transport-level cancellation is now wired through the browser/runtime/broker adapter and FYERS server history route. Shared requests use consumer-aware cancellation so one chart switch does not cancel another chart that is still waiting for the same dataset.

---

# 5. CoreSpirit v1 build plan

# 6. Pine release-notes research → CoreSpirit design decisions

**Source reviewed:** TradingView Pine Script release notes across the current 2026 entries and historical releases. We are using the useful language, runtime, editor, visualization and strategy ideas as design input—not cloning Pine or inheriting its limitations. citeturn0view0

## 6.1 Adopt the useful ideas

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

## 6.2 Deliberately improve on Pine
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

## 6.3 Do NOT copy blindly
- [ ] Do not reproduce Pine's limitations for compatibility's sake.
- [ ] Do not make external/model requests block the synchronous bar engine.
- [ ] Do not allow scripts to bypass sandbox or permission boundaries.
- [ ] Do not maintain separate indicator semantics for native, CoreSpirit and imported Pine scripts.
- [ ] Do not copy Pine's UI limitations where web-native UI can be better.

## 6.4 New implementation priority
**P0 runtime correctness:** series, `na`, state, realtime rollback/commit, sessions, timeframes, deterministic execution.

**P1 coder:** side-by-side editor, autocomplete, diagnostics, formatter, hot reload, inputs, profiler.

**P2 visuals:** plots, mutable objects, zones, polylines, fills, tables, panes.

**P3 market data:** multi-symbol, multi-timeframe, bid/ask, lower-TF, session/calendar, optional footprint.

**P4 automation:** alerts, webhooks, events, model calls with permissions.

**P5 strategy/replay:** intrabar simulation, bar detail, order model, analytics and replay.

**P6 Pine bridge:** expand import coverage as CoreSpirit itself becomes stronger.

## 6.5 CoreSpirit design targets

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

---

# 6. Build log — v13 / 2026-09-20

## 6.1 Chart reliability hardening — DONE for this iteration

### Fixed architectural failure found in v12
- [x] History request deduplication no longer shares the first caller's `AbortSignal`.
- [x] Each chart is now a consumer of a shared history request.
- [x] A symbol switch cancels only that chart's waiter.
- [x] The underlying request is aborted only when the last consumer leaves.
- [x] Broker history HTTP requests now receive `AbortSignal` through the browser → runtime → adapter chain.
- [x] FYERS server history requests now abort their upstream FYERS fetch when the client disconnects.
- [x] Broker request-gate waits are abort-aware.
- [x] Chart cleanup now actually calls `historyAbortController.abort()`.
- [x] 429 requests remain terminal rather than multiplying retries.
- [x] Historical results remain generation-checked before chart paint.

### Why this matters
The previous v12 guard could deduplicate NIFTY history for multiple callers while tying the shared promise to the first caller's abort signal. A rapid symbol switch could therefore abort the shared request and make later consumers receive `AbortError`, producing an empty chart even though the broker could have returned data. v13 separates **request ownership** from **consumer cancellation**.

## 6.2 CoreSpirit language simplicity — DONE for this iteration

### Surface syntax now accepted
- [x] `indicator("Name") { ... }` declaration is recognized as script metadata and removed from executable syntax for the current compiler stage.
- [x] `fast = ema(close, 20)` lowers to the compact core declaration form.
- [x] `if fast crossesAbove slow { ... }` lowers to `crossover(fast, slow)`.
- [x] `if fast crossesBelow slow { ... }` lowers to `crossunder(fast, slow)`.
- [x] `plot fast` lowers to `plot(fast)`.
- [x] `signal "BUY"` lowers to `signal("BUY")`.
- [x] `plot(x, name = "...")` accepts the common human-readable form and lowers to the core plot call.
- [x] Existing explicit CoreSpirit syntax remains valid.

### Design rule
Keep complexity inside the compiler/runtime. Users should not have to learn Pine's internal qualifier machinery merely to write normal trading scripts. CoreSpirit will infer internal series/state information wherever possible.

## 6.3 Stage 2 indicator kernel — DONE for this iteration

- [x] Added canonical deterministic indicator math module: `src/services/marketData/coreIndicatorKernel.ts`.
- [x] SMA warm-up is explicit.
- [x] EMA uses a complete-window SMA seed, then recursive updates.
- [x] Wilder/RMA smoothing has an explicit SMA seed.
- [x] ATR uses true range + Wilder/RMA semantics and warm-up.
- [x] RSI uses Wilder averages and handles zero-loss/zero-gain edge cases (`100`/`50`) instead of returning `99.01`-style artifacts.
- [x] Native indicator engine now imports the canonical SMA/EMA/RMA/ATR/true-range implementations instead of maintaining duplicate implementations.
- [x] HMA no longer feeds synthetic zeroes into the final WMA warm-up.
- [x] Stochastic no longer treats unavailable early `%K` values as zero during smoothing.
- [x] MFI zero-negative-flow behavior is corrected (`100` when positive flow exists, `50` when both are zero).
- [x] CoreSpirit runtime RSI zero-loss handling is aligned with the canonical behavior.
- [x] CoreSpirit runtime ATR now waits for its seed window and uses Wilder smoothing.
- [x] CoreSpirit runtime VWAP resets by Indian session day instead of carrying cumulative volume across sessions.
- [x] CoreSpirit `change(source, length)` now compares against the requested historical length rather than always using one bar.

### Validation completed
- [x] Targeted TypeScript check passes for the modified CoreSpirit + indicator source set when compiled with the repository's CommonJS/Node resolution mode.
- [x] CoreSpirit language self-test passed: `CORESPIRIT_LANGUAGE_SIMPLICITY=PASS`.
- [x] Indicator-kernel deterministic vector self-test passed: `CORESPIRIT_STAGE2_KERNEL=PASS`.

### Environment limitation
- [ ] Full application build still requires the repository dependencies (`node_modules`); the uploaded archive does not contain them. Server-wide TypeScript validation therefore remains a separate deployment/environment task.

---

# 7. v13 next stages

## Immediate next stage — Stage 3: visual/runtime unification
- [ ] Make CoreSpirit plots first-class chart series with stable plot IDs, names, styles and pane routing.
- [ ] Atomic replacement of script outputs on hot reload.
- [ ] Prevent duplicate/stale indicator series after rapid symbol/timeframe/script changes.
- [ ] Add CoreSpirit output generation IDs to the chart renderer.
- [ ] Preserve old valid chart data until the replacement dataset has passed validation.

## After Stage 3
- [ ] Stage 4: full TradingView-style CoreSpirit Coder — syntax highlighting, autocomplete, diagnostics, formatter, side-by-side chart, run/stop, script management.
- [ ] Stage 5: realtime execution + true hot reload.
- [ ] Stage 6: multi-symbol / multi-timeframe data alignment.
- [ ] Stage 7: events / alerts / webhooks.
- [ ] Stage 8: model/AI runtime interface.
- [ ] Stage 9: replay/backtesting/strategy execution.
- [ ] Stage 10: arrays/maps/objects/methods/collections.
- [ ] Stage 11: Pine import/translation expansion.
- [ ] Stage 12: security, quotas, profiling and production hardening.

## TradingView-quality chart gate
A chart stage is not marked complete until it passes rapid-switch tests covering at minimum:

`NIFTY → BANKNIFTY → SENSEX → NIFTY → RELIANCE → NIFTY FUT → NIFTY`

and:

`1m → 3m → 5m → 15m → 1H → 5m`

while verifying:
- [ ] final selected symbol has candles
- [ ] final selected timeframe has candles
- [ ] no old symbol paints into the new chart
- [ ] no old indicator state paints into the new chart
- [ ] no shared-request cancellation causes a false empty result
- [ ] 429s do not create a retry storm
- [ ] current realtime bar updates without corrupting history
- [ ] chart remains responsive during rapid changes

TradingView's documented execution model is our reference for the **runtime semantics**: historical bars execute sequentially; realtime bars are recalculated on updates; applicable state is rolled back to the last committed state before the next realtime execution; only the closing execution is committed to the time series. citeturn0search0turn0search5

Lightweight Charts is the renderer foundation; TradingView describes it as supporting streaming realtime updates without page reloads and maintaining responsiveness with large datasets. citeturn0search2

---

# 6. TradingView-quality market-data pass — V14 — COMPLETED / IN PROGRESS

## 6.1 Completed in this pass

- [x] Raised the chart history memory ceiling from 30,000 to **50,000 candles**.
- [x] Raised the initial history request target from 500 to **25,000 candles** where the broker/date-window permits.
- [x] FYERS intraday first-load window now uses the broker-safe **100-day** maximum instead of a 30-day window.
- [x] FYERS daily first-load window uses the documented **366-day** maximum.
- [x] Added `cont_flag=1` to FYERS History requests.
- [x] Increased progressive history pages so the client can extend toward 25k without tiny 500-candle pagination.
- [x] Added timeframe-aware page sizing so large broker windows are not accidentally trimmed in a way that creates history gaps.
- [x] Added stale-while-refresh history caching: a recently used symbol can paint from memory while its cache refreshes in the background.
- [x] Removed the browser-side artificial 325 ms history delay. Broker-side request gating remains in place.
- [x] Added watchlist history warming for the first eight instruments.
- [x] Added chart history-to-paint and initial-candle-count telemetry through the CoreEventBus.
- [x] Reworked the FYERS browser market-data client into a shared stream multiplexer so identical watchlist subscriptions share one connection instead of competing controllers.
- [x] Preserved realtime candle updates from ticks and continued using historical REST data only for history.
- [x] Kept stale-response/lifecycle protections so an old symbol cannot paint over a newer chart lifecycle.

## 6.2 25k vs 50k decision

**Architecture:** 50,000 is the maximum in-memory chart/history ceiling; 25,000 is the first-load target.

This is intentional. FYERS documents up to 100 calendar days per intraday History API request and 366 days for daily requests. Therefore 25k candles cannot always arrive in one broker response on higher timeframes. The first response is painted immediately, then older pages warm in the background until the 25k target is reached (or valid broker history runs out). 50k remains available for further left-edge expansion.

The browser must never wait for the full 25k/50k target before showing the first valid chart.

## 6.3 Next market-data work

- [ ] Keep the same Lightweight Charts instance across symbol changes instead of destroying/recreating the chart effect.
- [ ] Add explicit `HistoryStore` metadata: fresh/stale/loading/oldest/newest/live.
- [ ] Add atomic REST-history + WebSocket reconciliation with duplicate/gap detection.
- [ ] Add switch-to-paint telemetry in addition to history-to-paint telemetry.
- [ ] Add watchlist priority prefetch scheduling rather than simple sequential warming.
- [ ] Stress-test rapid NIFTY → BANKNIFTY → SENSEX → NIFTY FUT → NIFTY option switching.
- [ ] Verify index and F&O history across 1m/3m/5m/15m/1H/1D with real connected FYERS sessions.

## 6.4 Validation note

The source changes were made against the v13 archive. A full TypeScript/Vite production build could not be completed in this environment because the supplied `node_modules` tree is incomplete (`vite/client` and several type-definition packages are missing) and package installation timed out. This is an environment limitation, not a claim of successful production compilation.


## V15 market-data acceleration completed
- Persistent Lightweight Charts instance across symbol/timeframe lifecycle changes.
- Dedicated shared HistoryStore with 50k ceiling and timestamp deduplication.
- REST/live candle reconciliation utility with duplicate, stale, gap, and bucket handling.
- Watchlist prefetch for up to 8 instruments on the 5-minute baseline.
- Next: persistent subscription manager across chart slots and full rapid-switch stress test.


---

# TradingCoreOS v16 — What has been coded

## Market-data/chart engine
- [x] Persistent FYERS terminal stream key: chart/watchlist subscribers reuse the terminal stream instead of one socket per symbol-set.
- [x] Broker stream instrument union: new symbols expand the shared stream; normal chart switching no longer creates a new transport solely because the selected symbol changed.
- [x] HistoryStore cache-first atomic switch path in LiveChart. Cached candles are painted immediately while the normal runtime request refreshes/revalidates data.
- [x] `symbol_switch_to_paint_ms` telemetry for cache and network first paint.
- [x] `history_cache_hit` telemetry.
- [x] Rapid-switch stress harness (`src/services/marketData/chartSwitchStress.ts`) with a representative NIFTY/BANKNIFTY/SENSEX/F&O sequence.
- [x] REST/WebSocket reconciliation remains centralized through `HistoryStore.reconcileRealtimeCandle`.
- [x] 25k target / 50k maximum retained.

## CoreSpirit language simplicity
- [x] `indicator("Name") { ... }` wrapper is now metadata-only; its executable body is preserved instead of being discarded.
- [x] Concise assignments: `fast = ema(close, 20)` lower to `let fast = ...`.
- [x] Concise `if condition { ... }` syntax.
- [x] `fast crossesAbove slow` / `crossesBelow` syntax.
- [x] `plot fast` and `signal "BUY"` shorthand.
- [x] Simple `input length = int(20, min: 1)` surface form lowers to a deterministic declaration; UI metadata remains an editor concern.
- [x] Editor starter script and syntax reference updated to the simplified language.

## v16 validation notes
- The source changes are intentionally separated from order execution and external network capabilities.
- Persistent stream sharing is broker-transport reuse; when the server endpoint requires a changed instrument subscription set, the shared transport reconnects with the union. This is not yet a claim of zero-reconnect FYERS protocol-level dynamic subscription.
- Full production build still requires the project's dependency installation; no build pass is claimed when dependencies are unavailable.

## Next
- [ ] Protocol-level dynamic FYERS subscribe/unsubscribe without reconnect where supported.
- [ ] Run automated rapid-switch stress against a connected broker and record p50/p95 switch-to-paint telemetry.
- [ ] CoreSpirit type inference/series semantics, arrays/maps, `once`, methods/objects and richer inputs.
- [ ] Side-by-side coder autocomplete/formatter/hot reload.

## TradingCoreOS v17 — Supabase CoreSpirit persistence

### Completed
- Added cloud persistence service for CoreSpirit scripts.
- Added versioned source + compiled IR persistence.
- Added SHA-256 source hashes and compiler version metadata.
- Added editor cloud-load on startup when authenticated.
- Added cloud save with localStorage fallback when unauthenticated/unavailable.
- Added execution-run persistence API for future chart/alert/backtest/automation integration.
- Reused existing Supabase CoreSpirit tables instead of duplicating schema.

### Next
- Connect deployments to actual chart/alert/automation lifecycle.
- Persist compile/execution runs from the worker/runtime without blocking chart paint.
- Add CoreSpirit script list/version browser.
- Add Supabase Realtime only for low-frequency deployment/run status.
- Add Storage-backed model/artifact integration where useful.


# 6. Stage tracker — TradingCoreOS v18

| Stage | Status | v25 work |
|---|---|---|
| Stage 1 Runtime foundation | 🟢 deepened v25 | Rich visual output contracts, quotas and renderer-independent objects; VM migration remains open |
| Stage 1.5 Language simplicity | 🟢 deepened v25 | Concise visual primitives: box/band/gradient/arrow/shape plus labels and zones |
| Stage 2 Indicator kernel | 🟢 deepened v25 | Indicator-to-visual composition via bands/gradients; full reference corpus remains open |
| **Stage 3 Chart/output lifecycle** | **🟢 deepened v25** | **Canvas scene graph, persistent visual reconciliation, labels, boxes, zones, polylines, levels, gradients, patterns, tables, background/bar tint** |
| Stage 4 CoreSpirit Coder | 🟢 foundation deepened v25 | Editor exists; completions/signatures/formatter/structured diagnostics added; incremental AST reuse remains open |
| Stage 5 Realtime + hot reload | 🟠 foundation v25 | Tick execution + explicit execution policy added; true incremental hot reload remains open |
| Stage 6 Multi-symbol / multi-timeframe | 🟠 foundation v25 | Host-only request/lowerTf capability boundary added; real alignment/cache layer remains open |
| Stage 7 Events / webhooks | 🟢 foundation | `entry()` / `exit()` produce broker-neutral execution intents and reuse the typed event bus; durable automation remains open |
| Stage 8 Models / AI | 🟢 CoreSpirit-native prediction foundation | `score()` / `predict()` / probability transforms let users build custom deterministic prediction formulas directly in CoreSpirit; training/remote model adapters remain open |
| Stage 9 Replay / backtesting | ⬜ | Same VM with replay/backtest execution modes |
| Stage 10 Objects / collections | ⬜ | Arrays, maps, objects, methods |
| Stage 11 Pine import | ⬜ | Compatibility translator into CoreSpirit |
| Stage 12 Production hardening | ⬜ | Sandboxing, quotas, versioning, observability, failure recovery |

## 6.1 Stage 3 implementation details

- [x] `CoreSpiritChartOutputController` owns script-created chart series/markers and cleans them atomically.
- [x] Stable `seriesId` is emitted by the runtime so multiple `plot` calls no longer overwrite one another.
- [x] Historical CoreSpirit execution runs in a dedicated worker when supported.
- [x] Active chart registry lets the coder target the chart the user last interacted with.
- [x] Coder now has **Run on chart**.
- [x] Stale CoreSpirit executions are ignored after a newer run/chart lifecycle.
- [x] Plot, signal, line and zone outputs have a renderer boundary.
- [x] Chart lifecycle emits `updating`/`ready` around CoreSpirit execution.
- [x] Chart execution metadata can be persisted through `corespirit_execution_runs`.
- [ ] Realtime bar-by-bar CoreSpirit output updates — Stage 5.
- [ ] True hot reload without full historical re-execution — Stage 5.
- [x] Rich script-owned chart primitives/fills/gradients/patterns/symbols/arrows via a single canvas overlay.
- [ ] Multi-pane routing and native pane scale contracts — Stage 3.x.
- [ ] Realtime incremental/hot-reload visual frames — Stage 5.

## 6.3 CoreSpirit v24 — model + automation foundation

- [x] Added `exp`, `log`, `tanh`, `clamp`, `sigmoid`, and `probability` math primitives.
- [x] Added `score(bias, feature, weight, ...)` for transparent custom model scoring.
- [x] Added `predict(bias, feature, weight, ...)` for logistic probability output in `[0,1]`.
- [x] Added `entry(condition, side, confidence, stop, target, tag)` as a broker-neutral execution intent.
- [x] Added `exit(condition, tag)` as a broker-neutral flatten intent.
- [x] Execution intents flow through the typed `execution.intent` event boundary rather than directly touching a broker.
- [x] Chart output dispatcher can visualize execution intents as entry/exit markers while preserving the original intent object for automation.
- [x] Added a model/automation compiler/runtime contract test.
- [ ] Add first-class feature sets, reusable model declarations and model versioning.
- [ ] Add historical walk-forward training primitives that explicitly prevent lookahead.
- [ ] Add model metrics (precision/recall, calibration, drawdown-aware scoring) and replay/backtest integration.
- [ ] Add permissioned webhook templates and automation deployment lifecycle.

### v24 design principle
CoreSpirit should allow a user to express a useful prediction/entry model without leaving the language, while keeping actual broker execution outside the deterministic VM. A script computes features -> score/probability -> decision -> execution intent; the execution layer decides whether and how an intent may be sent.

Example:

```corespirit
trend = ema(close, 50)
momentum = change(close, 5)
prob = predict(-1.1, momentum, 0.30, rsi(close, 14), 0.018, close - trend, 0.002)

plot(prob, "#a78bfa", 2, 0, "Model probability")

if prob > 0.72 {
  entry(true, "long", prob, close - atr(14), close + atr(14) * 2, "trend-momentum-long")
}
```

The formula is intentionally inspectable. A future `model { ... }` syntax can compile to the same IR rather than creating a second execution system.


## 6.4 CoreSpirit v25 — richer data, granular execution, footprint + coder ergonomics

- [x] Added a host-only `CoreSpiritDataResolver` capability boundary for cross-symbol/timeframe requests, lower-timeframe snapshots, depth imbalance and footprint data.
- [x] Added `request(symbol, timeframe, field, offset)` and `lowerTf(timeframe, field)` primitives. Async/network work remains outside the VM; unresolved async calls return null until the host prefetches a snapshot.
- [x] Added footprint primitives: `footprintDelta`, `footprintBuy`, `footprintSell`, `footprintPoc`, `footprintVah`, `footprintVal`, `footprintRows`.
- [x] Added provider-neutral footprint row/bar contracts so future Fyers/Upstox adapters can normalize actual footprint sources without changing the language.
- [x] Added `executeTick()` for granular realtime tick execution while preserving the VM's socket-free boundary.
- [x] Added execution-policy metadata (`onEveryTick`, `onOrderFill`, `onBarClose`, `onHistoricalTicks`) to the execution context.
- [x] Added a lightweight CoreSpirit editor language service with completions, signatures, formatter and structured diagnostics.
- [x] Added v25 data/execution/editor contract tests.
- [ ] Connect real lower-timeframe aggregation and depth snapshots to the resolver.
- [ ] Build a real footprint adapter from broker/feed data rather than synthetic/test snapshots.
- [ ] Add tick/event replay persistence and deterministic historical-tick backtesting.
- [ ] Add incremental compiler/AST reuse for sub-100ms hot reload.

## 6.5 Version rule

Every modified project archive increments by exactly one: v17 → v18 → v19 … . The master task file remains the single project task tracker; avoid creating redundant task Markdown files.
# CoreSpirit surface syntax cases — v16

These cases are compiler-contract examples. They must normalize to the existing core AST without losing executable statements.

```corespirit
indicator("Trend") {
  overlay: true
  input length = int(20, min: 1)
}
fast = ema(close, length)
slow = ema(close, length * 2)
plot fast
if fast crossesAbove slow {
  signal "BUY"
}
```

Expected properties:
- `indicator` wrapper is metadata only.
- `overlay:` is not sent to the VM.
- `input length` becomes a deterministic declaration.
- assignment becomes `let`.
- `crossesAbove` becomes `crossover`.
- `plot fast` becomes `plot(fast)`.
- `signal "BUY"` becomes `signal("BUY")`.


# CoreSpirit rich visual syntax — v22

```corespirit
fast = ema(close, 20)
slow = ema(close, 50)

plot(fast, "#22c55e", 2, 0, "Fast")
plot(slow, "#ef4444", 2, 0, "Slow")

band(fast + atr(14), fast - atr(14), "#38bdf8", 0.10)
gradient(highest(close, 20), lowest(close, 20), "#22c55e", "#8b5cf6", 0.08)

if crossover(fast, slow) {
  shape(low, "arrowUp", "#22c55e", 10, "BUY")
  label("BUY", "below", "#16a34a", "#fff", 12, "pill")
}

box(time[20], time, highest(high, 20), lowest(low, 20), "#2563eb", "#60a5fa", 0.10, "hatch")
arrow(time[10], low[10], time, high, "#f59e0b", 2)
```

Design rule: one small visual call should be enough for common chart intent. Advanced visuals should compose from these primitives rather than force users to learn a renderer API.


## 6.5 CoreSpirit v26 — rich market-data deepening

- [x] Quote snapshot primitives: bid/ask/spread/mid.
- [x] Per-bar host-data memoization to avoid duplicate resolver work.
- [x] Batched cross-symbol/timeframe request capability.
- [x] Structured intrabar host contract plus scalar aggregation primitives.
- [x] Footprint row-level access, not only POC/VA/delta summaries.
- [x] Historical tick sequence execution through the same VM.
- [x] Editor hover metadata, semantic tokens and cached editor snapshots.
- [x] Version contract bumped to CoreSpirit v26; compiler persistence version bumped to `corespirit-v26`.
- [ ] Real feed-backed footprint adapter and exchange-specific aggressor semantics.
- [ ] True lower-TF alignment/cache planner across multiple symbols/scripts.
- [ ] Native viewport-aware footprint scene graph and row virtualization.
- [ ] Incremental AST reuse / true hot reload.

**Next deep work:** build the data planner + native footprint scene graph before moving to the `model {}` / `features {}` syntax layer. This keeps the eventual model language capable of consuming the same rich data without creating a second data engine.


## 7.1 Current status — TradingCoreOS v27

| Stage | Status | Current depth |
|---|---|---|
| Stage 1 Runtime foundation | 🟢 | Deep-audited through v27; deterministic VM, state, cancellation, execution modes, host-controlled data boundary |
| Stage 1.5 Language simplicity | 🟢 | Friendly syntax normalization + typed semantic foundation |
| Stage 2 Indicator kernel | 🟢 | Canonical stateful kernel + memoization + warm-up semantics |
| Stage 3 Chart/output lifecycle | 🟢 | Stable visual objects, rich scene primitives, output isolation |
| **Stage 4 CoreSpirit Coder** | **🟠 ACTIVE v27** | DOM-free language service, incremental editor model, diagnostics, tokens, symbols, formatter, cached compile |
| Stage 5 Realtime + hot reload | ⬜ | Tick execution foundation exists; atomic incremental reload remains |
| Stage 6 Multi-symbol / multi-timeframe | 🟠 foundation | Host data resolver + v27 request planner; alignment engine remains |
| Stage 7 Events / webhooks | 🟠 foundation | signal/entry/exit/alert/webhook intents exist; event router remains |
| Stage 8 Models / AI | 🟠 foundation | predict/score + model runtime boundary exists; first-class models remain |
| Stage 9 Replay / backtesting | ⬜ | Runtime modes exist; replay engine remains |
| Stage 10 Objects / collections | ⬜ | Visual objects exist; language collections remain |
| Stage 11 Pine import | ⬜ | Surface normalizer foundation only |
| Stage 12 Production hardening | ⬜ | Quotas/security/telemetry remain |

### v27 completed work
- [x] Data request planning and deduplication before host resolution.
- [x] Batch resolver path with per-request fallback.
- [x] Reusable DOM-free editor model.
- [x] Incremental source edit API and editor versioning.
- [x] Symbol outline extraction.
- [x] Cached compilation inside editor model.
- [x] v27 contract test.
- [x] History file updated.

### Stage 4 next deep tasks
- [ ] Replace textarea-only editing with an editor adapter capable of syntax highlighting while preserving the CoreSpirit language service.
- [ ] Add completion context (member/call/argument/property) rather than prefix-only completion.
- [ ] Add quick fixes and diagnostic code actions.
- [ ] Add document outline/folding ranges and go-to-definition.
- [ ] Add incremental parse/AST reuse for large scripts.
- [ ] Add editor-to-chart execution state with cancel/replace semantics.

### Data engine next deep tasks
- [ ] Align higher/lower timeframe series without lookahead leakage.
- [ ] Explicit confirmed/developing data policy for every request.
- [ ] Shared cross-script request cache.
- [ ] Real footprint row scene graph + viewport virtualization.
- [ ] Native broker/depth adapters with feed-quality metadata.


## v28 — Data Engine + Footprint Scene Graph deep pass
**Base:** v27

### Implemented
- [x] Added explicit data states: historical, confirmed, developing, realtime.
- [x] Extended data snapshots with receive time and revision metadata.
- [x] Added bounded shared CoreSpiritDataCache for cross-script/host-side reuse.
- [x] Added cache-aware request-plan resolution; VM remains network-free.
- [x] Added deterministic higher-timeframe snapshot alignment without leading-value invention.
- [x] Added lower-timeframe/intrabar grouping contract for parent-bar execution.
- [x] Added footprint scene normalization with per-row intensity and buy/sell/balanced classification.
- [x] Added native footprint visual object and canvas renderer path.
- [x] Added v28 deep contract tests for cache, alignment, intrabar grouping and footprint rendering data.
- [x] Continued Stage 4 editor/data architecture without coupling the editor model to the DOM.

### Remaining deep gaps
- [ ] Feed-native footprint data adapters for each broker/provider.
- [ ] Exact session/calendar-aware HTF/LTF alignment.
- [ ] Historical tick persistence and deterministic replay from captured feed data.
- [ ] Multi-pane scene graph with independent price scales.
- [ ] Viewport culling/virtualization for footprint rows beyond the visible range.
- [ ] Incremental hot-reload frames and transactional visual swaps.
- [ ] First-class `features {}` / `model {}` compiler lowering.


## TradingCoreOS v29 — Stage 4 CoreSpirit Coder deep pass

- [x] Context-aware completion modes (global/call/argument/member).
- [x] Definition metadata and definition-at-cursor lookup.
- [x] Folding-range extraction from block structure.
- [x] Deterministic quick-fix/code-action API.
- [x] Bounded undo/redo in the DOM-free editor model.
- [x] Versioned editor edits and cached compilation retained.
- [x] Synchronized syntax-highlight textarea adapter in the CoreSpirit Coder page.
- [x] Ctrl/Cmd+S save, Ctrl/Cmd+Enter run, Ctrl/Cmd+Z/Y editor actions.
- [x] v29 contract tests and coder contract document.
- [ ] Incremental AST reuse rather than full parse on every edit.
- [ ] True Monaco/CodeMirror adapter with diagnostics decorations and folding UI.
- [ ] Transactional compile/validate/swap hot reload.
- [ ] Source maps from normalized CoreSpirit syntax to original editor positions.
- [ ] Rich type inference/member completion for future UDTs, collections and model objects.

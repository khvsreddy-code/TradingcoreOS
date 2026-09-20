# TradingCoreOS — CoreSpirit Master Task File

**Project direction:** Build CoreSpirit as TradingCoreOS's own trading-native scripting language and runtime. CoreSpirit is **not** intended to be a Pine clone. Pine compatibility remains an import/translation layer only.

**Current source baseline:** TradingCoreOS v16 (built from v15)
**Current workstream:** staged CoreSpirit language/runtime + TradingView-quality chart reliability + canonical indicator kernel + coder
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

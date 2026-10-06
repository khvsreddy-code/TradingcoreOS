# CoreSpirit: AI-native trading language and runtime roadmap

CoreSpirit should not try to become a Pine Script clone. The product advantage should come from making the language the programmable control plane for market data, indicators, models, risk, automation, execution, visualization, and reproducible research.

## North-star execution model

A CoreSpirit program compiles into a typed dataflow graph:

market data -> temporal alignment -> feature/indicator graph -> model graph -> signal graph -> risk/policy graph -> order intent -> execution adapter

The same graph should run in replay/backtest, paper, and live modes with an explicit execution-mode boundary rather than separate code paths.

## Language differentiators

### 1. First-class temporal types

Make time semantics part of the type system:

- `series<float>`
- `series<int>`
- `event<T>`
- `forecast<T>`
- `probability`
- `distribution<T>`
- `regime<T>`
- `orderIntent`
- `position<T>`

The compiler should reject accidental future-data access, unsafe temporal joins, and implicit lookahead.

### 2. Models are language artifacts

A model declaration should carry:

- input feature schema and provenance
- target definition
- training/evaluation dataset snapshot
- model version and ABI
- calibration/uncertainty metadata
- regime and timeframe scope
- latency/cost budget
- deployment policy

A prediction should therefore be a typed value with lineage, not an opaque API response.

### 3. AI-generated code is still deterministic code

Natural-language requests should compile into CoreSpirit AST/IR. The model may propose or refactor the program, but only the compiler/runtime may authorize execution.

Every generated artifact should have:

- source text
- normalized AST
- compiler version
- dependency graph
- model/tool trace
- policy decision
- artifact hash

This makes AI useful without turning live trading into an uncontrolled agent.

### 4. Multi-symbol and multi-timeframe as native graph edges

The compiler should understand temporal alignment explicitly instead of forcing users to manually stitch series together.

Examples:

`align 5m:nifty with 1m:banknifty by close_time`

`spread = normalize(nifty.close - beta * banknifty.close)`

The runtime can then schedule only the changed nodes.

### 5. Backtest/live parity

The same CoreSpirit program should declare:

`mode replay | paper | live`

Data, broker, and clock implementations change by mode, but the semantic graph does not.

This is a strong product advantage because a strategy moves from research to paper to live without a parallel implementation.

### 6. Native automation and safety

Automation should be a language primitive, not an alert webhook bolted onto an indicator.

The runtime should expose:

- position/risk limits
- session and market-state constraints
- idempotent order intents
- approval policies
- kill switches
- reconciliation
- explainability
- audit lineage

No generated model or indicator should bypass the policy/execution boundary.

### 7. AI research loop

Add a first-class experiment object:

experiment -> hypothesis -> dataset snapshot -> feature graph -> model/version -> walk-forward evaluation -> paper deployment -> live deployment -> drift report

The AI assistant should be able to inspect this lineage and answer why a model changed, which features mattered, where performance degraded, and what evidence supports a new version.

## Runtime/performance strategy

The hot path should remain:

- columnar numeric buffers
- typed-array/SAB transport where safe
- persistent workers
- incremental dirty-range computation
- fused execution plans
- patch-based chart updates
- zero object creation in tick loops where possible

Keep the browser as the low-latency rendering/interaction plane and keep broker secrets and durable execution state on the server.

## Visual/IDE advantage

CoreSpirit should make the code editor feel like a trading workstation:

- error-underlining with temporal/type explanations
- live dependency graph
- per-node execution cost
- repaint/lookahead diagnostics
- data lineage inspection
- model confidence/uncertainty overlays
- event timeline
- replay scrubber
- one-click diff between backtest and live outputs
- visual strategy graph generated from the same AST

## 12-month implementation order

### Phase 1: reliability and hot-path correctness

Stabilize auth/session recovery, realtime gateway configuration, historical-data failure classification, durable settings, CI lockfile integrity, and browser performance budgets.

### Phase 2: typed temporal CoreSpirit

Finish temporal types, lookahead/repaint checking, deterministic multi-timeframe alignment, and typed series/event semantics.

### Phase 3: AI-native authoring

Natural language -> CoreSpirit AST, AST -> diagnostics, deterministic code generation, refactor/explain tools, and provenance for every generated artifact.

### Phase 4: model runtime

Versioned model ABI, feature lineage, prediction confidence/uncertainty, walk-forward evaluation, calibration, drift detection, and model registry.

### Phase 5: automation runtime

Unify signal, risk, policy, broker intent, reconciliation, and notifications under one deterministic automation graph.

### Phase 6: visual advantage

Ship a first-class chart/strategy canvas where code, execution graph, market state, model state, and automation state are views of the same runtime.

## Product thesis

TradingView/Pine is strong at chart-native scripting and a mature ecosystem. CoreSpirit should win somewhere different:

**Pine:** write a script that runs on a chart.

**CoreSpirit:** describe a market system; let a typed compiler turn it into an observable, testable, explainable, low-latency execution graph.

That distinction is the strategic moat.

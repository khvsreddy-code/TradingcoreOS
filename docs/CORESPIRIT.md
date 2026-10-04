# CoreSpirit — How to Think, How It Works, and What Must Never Be Broken

CoreSpirit is the trading-native programming layer of TradingCoreOS. It is the only user-facing chart scripting language and is not a broker scripting API.

The core mental model is:

> **One language → one compiler → one stable IR → one VM → multiple execution environments.**

Charting, replay, research, strategy evaluation, and automation should share the same semantics rather than growing separate mini-runtimes.

## Current platform lock — v110

TradingCoreOS is now committed to a **CoreSpirit-first platform + Vela production chart engine + TCO-owned data/compute/broker systems** boundary. CoreSpirit remains the only user-facing trading language; Vela is strictly a renderer behind TCO chart contracts.

```text
CoreSpirit source
      ↓
compiler → stable IR → VM → reactive runtime
      ↓
renderer-neutral visual output
      ↓
TCO Chart API / ChartController
      ↓
Vela NativeRenderer
      ├── WebGL2
      └── Canvas2D fallback
```

The ownership rule is deliberately strict:

- **CoreSpirit:** language semantics, deterministic computation, indicators, models, signals, automation declarations and visual intent.
- **TCO host:** canonical market data, incremental compute, viewport/data coordination, risk, policy, credentials, persistence and broker authorization.
- **Vela:** chart rendering, renderer-local interaction/presentation and GPU/Canvas implementation details.

No external scripting language is emulated. No external script catalog is part of the indicator product model. Community distribution uses versioned **CoreSpirit Community Indicators** with source, settings/schema, immutable version identity, compiled-artifact identity, author/license metadata and documentation.

Vela is isolated to the adapter boundary so CoreSpirit and React never become coupled to its internal types. The upstream Apache-2.0 `LICENSE` and `NOTICE` remain in `vendor/vela`, and its required visible attribution stays enabled.

Performance deepening continues without moving ownership: typed-array ingress, viewport-driven LOD, stable CoreSpirit render packets, retained drawings, renderer-neutral multi-chart synchronization and measurable frame/GPU budgets are tracked as explicit follow-up work in `docs/CORESPIRIT_BUILD_TRACKER.md` and `docs/VELA_INTEGRATION.md`.


## v110 indicator definition and settings ABI

Indicator customization is now a **schema contract**, not a collection of UI conditionals. The canonical implementation is `src/services/coreSpirit/indicatorSettingsSchema.ts`. The same schema is used to describe native and user-authored indicator metadata before it reaches the editor, workspace persistence, public publication or the Vela adapter.

```text
Indicator definition
  ├── identity
  ├── inputs schema
  ├── style schema
  ├── display schema
  ├── behavior capabilities
  ├── alert capabilities
  ├── visualization metadata
  ├── pane / scale layout
  └── stable outputs
          ↓
Universal IndicatorSettingsPanel
          ↓
workspace normalization / persisted values
          ↓
public indicator_settings snapshot
          ↓
TCO render packet
          ↓
Vela adapter
```

### Schema rules

A schema is JSON-serializable and versioned. Fields declare their path, label, primitive control type, default, bounds/options, optional conditional visibility, advanced-level flag, units and read-only state. The editor never asks whether an indicator is MACD, Ichimoku, Bollinger or a future CoreSpirit study in order to decide which control to render. It asks the schema.

The path model is intentionally small (`period`, `source`, `display.opacity`, `display.precision`, etc.) and is validated against duplicate IDs/paths, numeric bounds, option cardinality, visibility dependencies and prototype-pollution path segments. This keeps user-provided schemas declarative rather than executable.

Native definitions can still be assembled from the native indicator registry today, but the important boundary is that the resulting definition is the same shape a CoreSpirit/community definition will use tomorrow. That means a new indicator can add settings without adding another settings-panel branch.

### Simple by default, deep on demand

The universal editor exposes the declared basic fields first. Fields marked `advanced` stay behind one generic Advanced control. A field may also declare `visibleWhen`, so a schema can express dependencies such as showing precision only when value labels are enabled. This makes the authoring surface small without reducing what the definition can express.

### Workspace and publication semantics

Workspace normalization hydrates missing fields from schema defaults. Nested writes preserve sibling values, so updating `display.opacity` does not overwrite `display.showValues` or `display.precision`. The public `indicator_settings` JSONB projection now contains both the legacy flat snapshot and the schema projection: `schemaVersion`, `schema`, `identity`, `layout`, `outputs`, `capabilities`, `values` and `settingsSchema`. Existing rows therefore remain interpretable while new consumers can become fully schema-driven.

### Runtime/rendering boundary

Settings metadata does not become indicator execution code. Calculation remains owned by the native/incremental indicator engine or the future validated CoreSpirit user-component runtime. The live chart fingerprints the complete schema-derived settings snapshot so nested display/style changes are not missed by reactive updates. Vela receives the final renderer-neutral intent through the TCO chart adapter; no Vela type enters the CoreSpirit language or universal settings UI.

### Current architecture consequence

The product now has one indicator settings system across the Indicators page, `/live` indicator controls, workspace state and publication metadata. The community model is therefore **CoreSpirit definition + schema + source/version + compiled artifact metadata**, not a renderer-specific widget implementation.


## 0. Historical lineage and recovered invariants

The current architecture is the result of a continuous CoreSpirit line, not a restart at v45. The historical CoreSpirit documents and release manifests supplied with the project were reconciled into this architecture so that older decisions remain visible and newer stages do not accidentally reintroduce previously rejected designs.

### v13–v20 — market-data and runtime foundations

The early line established the basic compiler/runtime boundary, persistent market history, cancellation, stale-response guards, configurable timezone/state retention, parser recovery, static type checking, runtime quotas, deterministic indicator kernels, stable call identities, warm-up behavior, and stable output identity. These decisions remain foundational: the VM owns execution semantics; the host owns network/data transport; history must be valid and dense rather than synthetically fabricated; state keys must survive recompilation and bar-to-bar execution.

### v21–v23 — visual composition becomes a runtime capability

Visuals evolved from styled plots into labels, exact time/price annotations, boxes, bands, fills, gradients, arrows, symbols, heatmaps, polylines, horizontal levels, backgrounds, bar tinting and tables. Stable visual reconciliation was introduced so logical objects update in place rather than accumulating duplicates. This lineage directly leads to the current persistent renderer-neutral scene graph and realtime visual patch engine.

### v24–v29 — prediction, rich data, host planning and real language tooling

Prediction became an explicit deterministic model concept with broker-neutral entry/exit intents. Rich-data work added provider-neutral requests, bid/ask/spread/mid, lower-timeframe/intrabar access, footprint summaries/rows and historical-tick execution. The data planner introduced request deduplication and batching outside the VM. The editor evolved into a DOM-free language-service boundary with diagnostics, completions, formatting, semantic tokens, definition lookup and cached compilation. These are now expressed by the canonical data model, model ABI, scanner, IDE and execution-target contracts.

### v30–v31 — time-series correctness and language freeze

The language was hardened around explicit scalar/series types, typed declarations, boolean signal gating, future-index rejection and semantic analysis. Time became a first-class execution-frame concept and one series engine became the canonical history cursor. Chart history loading returned to a target-based contract with broker-safe windowing, generation checks and no fabricated candles. The type/language boundary was frozen before later syntax expansion.

### v32–v36 — deterministic runtime, native indicators, compiler and IR/replay

Time, series indexing, session context and realtime revision semantics were made explicit. Realtime became a begin/revise/rollback/commit transaction. The native indicator engine became the single mathematical implementation. The v1 semantic core was intentionally small at 30 primitives, with visual/output/host capabilities kept in the larger extension ecosystem. The compiler pipeline became independently testable and stable IR became the only production VM input. Replay consumes validated artifacts and checksums state/output/trace determinism.

### v37–v39 — architecture consolidation

The architecture was consolidated into the rule used today: **one language → one compiler → one stable IR → one VM → multiple execution environments**. The debugger became observational, signals became an immutable boundary before risk/order intent, strategy events became declarative, and the EMA+RSI program became an end-to-end conformance fixture. Stage governance became dependency-aware and contract-driven.

### v40–v43 — layered platform, visual identity, renderer ABI and event bus

Script, Model, Strategy and Automation were formalized as capability layers over the same runtime. Persistent visual identity, rollback-safe indicator contracts and the renderer-neutral scene ABI were added. Signals became native immutable events with dedupe/idempotency; webhooks became host capabilities; the VM remained network-free.

### v45 — external model, research and automation foundation

The model invocation ABI, Python research surface and signal-to-automation pipeline became explicit. Python was deliberately kept outside the production VM. The model/runtime boundary introduced typed inputs/outputs and host-owned execution. v45 is the direct foundation for the stricter model ABI, AI semantics and model-visualization work in the current line.

### v68 — declarative AUTOMATE + universal ORDER intent

Automation became a compact language concept over a single canonical order-intent schema. `order` can express direction, quantity/risk sizing, flattening and protective stop/target data without exposing risk, policy or broker execution internals. Legacy `entry`/`exit`/`buy`/`sell` remain compatibility mappings.

### v67 — declarative MODEL surface

MODEL was reduced to the same principle used for SHOW: users describe intent, not platform machinery. A model declaration can name a registered model or a host implementation binding, optionally declare input/output fields and types, and expose qualified outputs such as `Regime.confidence`. The compiler lowers those references into the existing expression/IR path; the host receives the opaque binding and remains responsible for resolving the strict model ABI, adapters, state and quotas. MODEL can feed the universal SHOW primitive without introducing a model-specific renderer or runtime.

### Recovered invariants that remain binding

- A single canonical series/history cursor owns indexing, warm-up, bar state and future-sample rejection.
- A single native indicator engine owns mathematical definitions; chart/replay/backtest code does not fork indicator math.
- Realtime revisions are provisional transactions; only commit advances confirmed state.
- The production VM executes validated IR artifacts, never arbitrary AST nodes.
- Artifact identity is deterministic and source mapping is part of the executable contract.
- The host owns network, broker, filesystem, process, renderer and external-model transports.
- Visual identity is stable and scene state is transactional, so rollback never creates duplicate logical objects.
- Signals/events are immutable and idempotent at the consumer boundary.
- Order intent is broker-neutral; risk and policy are authoritative before execution.
- Python/C++/Rust/WASM/ONNX/remote models are adapters behind one semantic model ABI, not competing runtimes.
- The core language remains intentionally smaller than the total platform capability surface; extensions are capability-scoped rather than silently promoted into the language core.
- Historical data loaders and host planners must prefer valid dense history, bounded caches and stale-response protection over fabricated or race-prone data.

### Historical gaps and current reconciliation

Some older documents deliberately said "not claimed complete." Those statements remain historical records, not automatic blockers. The current status is determined by the v73 tracker and current contracts. Known items that are still genuinely open include exchange/session-calendar completeness, full indicator reference-value corpus, persisted artifact migration compatibility, production worker scheduling for large scans, production renderer/browser end-to-end validation, and full production external-model transports. Items already replaced by later contracts—such as transactional realtime visuals, rich visual primitives, model adapters, multi-symbol/MTF alignment, and debugger/source mapping—are considered superseded rather than still-open historical TODOs.

## 1. How to think about CoreSpirit

The governing product philosophy is **trading-system-centric, not chart-centric**. A chart is one projection of the runtime; the same executable artifact should feed research, models, signals, automation, replay and controlled execution.


CoreSpirit should be treated as a deterministic computation language with trading-native semantics.

A program can read time-series data, calculate indicators and features, emit visuals, emit signals, describe strategy intent, and participate in automation. It does **not** own broker credentials, account state, venue APIs, sockets, arbitrary filesystem access, or unrestricted processes.

The safest abstraction boundary is:

```text
CoreSpirit source
      ↓
   compiler
      ↓
  stable IR
      ↓
      VM
      ↓
 signal / strategy event
      ↓
  automation
      ↓
  risk engine
      ↓
 order intent
      ↓
 policy
      ↓
 execution host
      ↓
 broker
```

The VM is a producer of deterministic facts and intents. The host is the owner of side effects.

## 1.2 User-authored indicators and public composition

TradingCoreOS can expose native indicator starters as editable CoreSpirit source without turning indicators into a separate language. The authoring path is:

```text
indicator settings
      ↓
starter CoreSpirit source
      ↓
Indicator Studio
      ↓
canonical compiler
      ↓
versioned script
      ↓
optional public publication
```

Private ownership and versioning use the existing CoreSpirit persistence boundary. Public discovery uses a separate `indicator_publications` projection so an unpublished draft never becomes public merely because a script exists.

The public catalog intentionally shows the published source. Public code is inspectable but remains sandboxed; publication does not grant broker/network/filesystem authority. See `docs/INDICATORS_USER_AUTHORING.md` and `docs/INDICATOR_COMMUNITY_ARCHITECTURE.md`.

## 1.1 Small surface, deep composition

The six concepts are the user-facing mental model, not six separate execution systems:

```text
DATA · LET · WHEN · SHOW · MODEL · AUTOMATE
```

CoreSpirit should resist the temptation to add keywords whenever a new capability appears. A new quantitative module, model, indicator, visual capability, or automation primitive should normally enter through an existing expression, a typed registered component, a model binding, a `SHOW` projection, or an `AUTOMATE` event boundary.

For example:

```corespirit
data = close
motionValue = motion(data)
vol = volatility(data)
reg = regime(motionValue, vol)
signal = setup(reg, liquidity, structure)
show signal
```

The implementation may expand this into:

```text
AST
 ↓
semantic analysis + component binding
 ↓
semantic dependency graph
 ↓
typed stable IR
 ↓
execution graph + reactive plan
 ↓
backend planner
 ↓
CPU / WASM / GPU-capable execution host
```

That implementation complexity is intentionally hidden from the author. Components carry explicit type, determinism, statefulness, and capability metadata so the planner can schedule them without changing the language surface.

The boundary matters: component registration makes a capability composable, but it does not grant unrestricted host authority. Side effects remain governed by the existing host, risk, policy, and execution boundaries.

### 1.2 The five-layer deepening rule

The next layer of CoreSpirit design is not five new language systems. It is deeper semantics behind the same source mental model:

```text
1. Small surface
2. First-class values
3. Semantic components
4. Typed reusable graphs
5. One runtime / many execution backends
```

These layers should compose monotonically. A value can become a component result; a component can become part of a graph; the graph can become a reusable component; and the same component contract can be planned for CPU, WASM, GPU or host execution. No step requires a new source keyword.

### 1.3 Reusable functions: semantic component first

Traditional declarations such as `fn volatilityExpansion(price)` or `component volatilityExpansion(price)` are **not** the current foundation. The semantic component system is the foundation. It supplies typed ports, lineage, state lifecycle, execution metadata and backend eligibility before any public declaration syntax is considered.

A future declaration, if eventually added, should be syntactic sugar over an already-existing component contract rather than a second programming model.

### 1.4 Authoring depth is a view, not a language fork

CoreSpirit has three progressive authoring levels:

| Level | Primary experience | Deeper surfaces |
|---|---|---|
| Simple | DATA / LET / WHEN / SHOW | hidden |
| Advanced | composition, MODEL, multi-symbol/MTF, automation | selected graph/library discovery |
| Professional | research, optimization, execution inspection | component contracts, IR, runtime, backend planning |

All three compile through the same frontend, stable IR and runtime. The level changes what is visible and inspectable; it does not create professional-only semantics or extra authority.

### 1.5 Complexity absorber

The governing rule is:

> **Source complexity stays small; semantic complexity may become arbitrarily deep.**

The internal fabric is therefore allowed to grow through:

```text
CoreSpirit source
      ↓
semantic graph
      ↓
typed component graph
      ↓
MODEL / indicator / automation contracts
      ↓
dependency graph
      ↓
execution plan
      ↓
reactive scheduler
      ↓
CPU / WASM / GPU / host backend
```

This is a deliberate complexity absorber. The compiler, IR, planner and host contracts absorb implementation complexity so source authors do not have to learn it merely to use advanced capability.

### 1.6 Namespaced standard library

Namespaces are a discovery and semantic-addressing layer above the canonical builtin/component registries:

```text
market.*
series.*
math.*
stats.*
time.*
structure.*
volatility.*
liquidity.*
probability.*
model.*
visual.*
automation.*
data.*
state.*
```

For example:

```corespirit
let expansion = volatility.expansion(close)
let persistence = stats.persistence(expansion)
let regime = market.regime(...)
show visual.show(regime)
```

The important rule is that a qualified member lowers to an existing canonical builtin or an explicitly registered semantic component. Namespaces never create duplicate mathematical implementations or a namespace-specific runtime. Some members can be cataloged before their executable component is registered; the compiler must distinguish cataloged capability from executable capability.

### 1.7 MODEL is another semantic component source

A strict MODEL ABI manifest can be projected into the same semantic component vocabulary:

```text
MODEL ABI manifest
      ↓
validated typed component contract
      ↓
semantic graph
      ↓
execution planner
```

This keeps model inputs/outputs, state, determinism, backend eligibility and capabilities visible to the same planning machinery used by other reusable computation. Python, native RPC and WASM remain adapters below the ABI; the VM still does not gain arbitrary external authority.

## 2. The four capability layers

CoreSpirit remains one language and runtime, but programs are assigned a capability layer.

| Layer | Purpose | Direct broker access |
|---|---|---|
| Script | indicators, visuals, signals | never |
| Model | features and typed model outputs | never |
| Strategy | entry/exit/position intent | never |
| Automation | event orchestration and order-intent creation | never; execution remains host-owned |

The layer is part of the execution contract. A capability cannot be gained merely because a source file calls a function by name.

### Script

A script can calculate EMA/RSI-style indicators, draw persistent visuals, and emit signals.

A script **cannot** call `entry()`, `exit()`, `buy()`, or `sell()` as an execution path. It must stop at a signal/event boundary.

### Model

A model program defines features/model outputs. External compute is hosted through the model ABI; the VM remains deterministic and sandboxed.

### Strategy

A strategy may describe entry/exit intent, but that intent is still an event/intent for the platform. It is not a broker request.

### Automation

Automation consumes signals/events and may create an **order intent**. An order intent is a structured request that still requires risk and policy approval.

Example:

```text
when signal:
    buy(...)
```

means:

```text
CoreSpirit automation
    ↓
order intent
    ↓
risk evaluation
    ↓
policy evaluation
    ↓
possible execution request
```

It never means `broker.buy(...)` inside the CoreSpirit VM.

## 3. Risk is a hard architectural boundary

The most important invariant is:

> **No indicator, model, strategy, or script can bypass the risk engine.**

Even if a future language convenience looks like `buy()`, it must resolve to an order-intent object. It must not receive broker credentials or an execution client.

The authoritative path is:

```text
Indicator / Model / Strategy
          ↓
       Signal / Event
          ↓
      Automation
          ↓
 Proposed Order Intent
          ↓
      Risk Engine  ← mandatory authority
          ↓
 Approved / Reduced Intent
          ↓
       Policy Engine
          ↓
    Execution Gateway
          ↓
       Broker host
```

The distinction between **proposed** and **approved** order intent is intentional. CoreSpirit may construct the proposal, but the risk engine decides whether it may continue and may reduce quantity or reject it. Policy then decides whether an approved intent is permitted under the automation/account/venue rules. Live execution additionally requires the explicit LIVE lifecycle state and the host live-execution guard.

There is no supported shortcut such as:

```text
indicator → broker
strategy → broker
model → broker
CoreSpirit VM → broker API
```

### Execution-authority invariants

1. **No broker capability in CoreSpirit.** The VM can emit a typed `orderIntent`, but it cannot call an execution client.
2. **Risk comes before policy and execution.** A policy approval without a preceding risk approval is invalid.
3. **Execution is host-owned.** Even a risk/policy-approved intent becomes an execution request only inside the host control plane.
4. **Every intent is traceable.** The authority record carries intent ID, automation ID, lifecycle state, source layer, stage, actor, reason, timestamp, and correlation ID.
5. **Malformed IR is not a bypass.** The runtime re-checks capability boundaries instead of trusting the compiler alone.

This turns #14 into a security boundary, not merely a coding convention.

## 4. Automation lifecycle is visible and authoritative

Every automation owns an explicit lifecycle:

```text
CREATED
   ↓
VALIDATED
   ↓
PAPER
   ↓
ARMED
   ↓
LIVE
   ↓
PAUSED
   ↓
STOPPED
```

The runtime must not infer LIVE from `enabled=true`, a UI toggle, or a mode string.

### Lifecycle rules

- `CREATED` — definition exists but is not executable.
- `VALIDATED` — definition passed platform validation.
- `PAPER` — automation can run through paper/simulation paths.
- `ARMED` — automation is enabled for activation but still cannot submit live broker requests.
- `LIVE` — live execution is eligible, subject to risk, policy, and the host live-execution guard.
- `PAUSED` — automation is temporarily stopped; it is still a known automation, not a hidden process.
- `STOPPED` — terminal state; no new execution is allowed.

Every transition records automation ID, actor, reason, timestamp, and transition ID. LIVE activation cannot be performed by a generic `system` actor.

### Lifecycle is a control plane, not a UI label

The lifecycle should be the authoritative control-plane record used by the runtime, Automation Center, audit trail, and execution gateway. A visual badge is only a projection of that state.

Capabilities are state-dependent:

| State | May evaluate | May create intent | May simulate | May live execute |
|---|---:|---:|---:|---:|
| CREATED | no | no | no | no |
| VALIDATED | yes | no | no | no |
| PAPER | yes | yes | yes | no |
| ARMED | yes | yes | yes | no |
| LIVE | yes | yes | yes | yes, subject to risk/policy |
| PAUSED | no | no | no | no |
| STOPPED | no | no | no | no |

This prevents hidden execution states such as an automation that is `enabled=true` but actually behaving as LIVE.

## 5. Realtime execution is transactional

A developing realtime bar is not a second kind of runtime. It is a transaction over the same runtime state.

```text
confirmed state
      ↓
snapshot
      ↓
revision 1
      ↓
rollback
      ↓
revision 2
      ↓
...
      ↓
commit
```

Stateful indicators, series state, cross detection, signals, and provisional visual outputs follow the same rollback/commit boundary.

Historical, replay, backtest, and realtime execution should converge for equivalent confirmed data.

## 6. Visuals are a scene, not chart-specific imperative calls

CoreSpirit emits a renderer-neutral visual scene.

Visual objects should have persistent identities so an update changes an existing object rather than destroying and recreating it on every revision.

The scene model is organized around layers such as:

- price
- indicator
- structure
- order
- data
- UI

Renderers may target web, desktop, mobile, image, replay, or headless environments. The VM does not know which renderer is active.

## 7. Events are immutable envelopes

Signals/events carry stable metadata such as:

- event ID
- source/program identity
- run ID
- mode
- bar index
- timestamp
- sequence
- dedupe key
- payload

A single signal can fan out to chart, alert, webhook, strategy, and automation consumers.

Network delivery is host-owned. CoreSpirit never opens a network connection to deliver a webhook.

## 8. Models and Python are external capabilities

Python is first-class for research, replay, evaluation, feature engineering and training workflows, but Python is not embedded into the production CoreSpirit VM. The same principle applies to C++, Rust, WASM, ONNX runtimes and remote model services.

The model boundary has two layers, together forming the external model ABI:

```text
CoreSpirit transport ABI
        ↓
strict semantic model profile
        ↓
host adapter
 ┌──────┼─────────┬─────────┬────────┐
Python  C++/Rust  WASM     ONNX   Remote
        ↓
typed prediction + confidence + metadata
        ↓
CoreSpirit signal / visual / research / automation surfaces
```

The transport ABI remains versioned and backward-compatible. The strict semantic profile adds explicit feature schemas, market context, prediction identity, confidence, metadata, state/rollback requirements, provenance checksums and resource limits. This keeps different model implementations interoperable without making their languages part of CoreSpirit.

Python therefore orchestrates CoreSpirit rather than competing with it: Python can load an executable artifact, fetch canonical datasets, train a model, register/package the resulting model contract, run research inference, inspect signals and evaluate results. Production execution still happens through the CoreSpirit host/runtime contracts.

A model must not receive unrestricted network, filesystem, process, broker, account or arbitrary host capabilities. Network/process/filesystem authority belongs to the adapter host, and only declared typed model data crosses the ABI.

## 9. Stable IR is the execution contract

The VM should execute versioned IR rather than depending directly on the AST.

The core IR vocabulary remains intentionally small:

```text
const
loadSeries
move
unary
binary
call
index
setLocal
jumpIfFalse
jump
emit
```

Executable artifacts carry identity information such as source checksum, IR checksum, source map, lookback, and capability/layer contract.

This makes persistence, replay, debugging, worker execution, and cache reuse much safer.

## 10. Replay and debugging

Replay is deterministic execution of:

```text
validated executable artifact + immutable dataset
```

Repeated runs should produce the same output/state/trace checksums. Debugging is observational: source → AST/reference → IR instruction → runtime state → output.

The debugger must not create a second runtime whose behavior can diverge from production execution.

## 11. Standard library philosophy

Keep the deterministic semantic core small and trustworthy. The canonical executable core remains at 30 primitives. Namespace expansion is a **catalog and lowering mechanism**, not permission to grow the primitive core indefinitely.

The preferred scaling mechanism is:

```text
namespace
   ↓
qualified member
   ├── canonical builtin
   ├── registered component
   └── catalog-only future capability
```

This permits an enormous discoverable library while keeping one mathematical implementation per primitive and one runtime path.

The standard library namespace architecture is currently organized around:

```text
market · series · math · stats · time · structure · volatility
liquidity · probability · model · visual · automation · data · state
```

A member documented in the catalog is not automatically executable. Execution requires a registered builtin/component contract. That distinction keeps the manual honest as the library grows.

Avoid:

- a giant convenience library
- direct broker APIs in the language
- arbitrary network/filesystem/process access
- AI-generated runtime code
- external scripting compatibility becoming the product architecture
- a second execution engine for each feature

## 12. Canonical killer example

The canonical certification fixture is an EMA + RSI strategy:

```corespirit
strategy("EMA + RSI Cross")

input fast = 20
input slow = 50
input rsiLength = 14

emaFast = ema(close, fast)
emaSlow = ema(close, slow)
r = rsi(close, rsiLength)

plot(emaFast)
plot(emaSlow)

longSignal = crossover(emaFast, emaSlow) and r > 50
shortSignal = crossunder(emaFast, emaSlow) and r < 50

signal(longSignal, "LONG")
signal(shortSignal, "SHORT")
```

This example is valuable because it can certify compilation, indicators, visuals, historical execution, replay, realtime rollback/commit, debugging, signal identity, and the downstream risk boundary without giving the program direct broker access.

## 13. Roadmap acceptance model

The architectural roadmap is now 100 stages. The first 18 establish the language/runtime/governance foundation; later stages extend that same contract across visuals, UI, execution targets, scanner/data, models/AI, explainability/debugging, graph compilation, reactive scheduling, numerical planning, capability security, v1 convergence, language unification, universal SHOW, the declarative MODEL surface, library discoverability and readable syntax.

The v1 convergence milestone is:

```text
one CoreSpirit artifact
        ↓
same Core IR + VM
        ↓
reactive execution
        ↓
renderer-neutral scene graph
        ↓
deterministic replay
        ↓
host-specific projections
```

A stage is complete because its contract and conformance gates are satisfied, not because a UI feature exists.

## 14. What belongs where

**CoreSpirit source/runtime:** deterministic computation, state, indicators, signals, strategy/automation declarations, visual/event output.

**TradingCoreOS host:** risk, policy, execution, broker connectivity, credentials, persistence of external side effects, network delivery, process lifecycle.

**Research layer:** Python experiments, datasets, replay analysis, metrics, training workflows.

Keeping these boundaries explicit is more important than adding more syntax.

## 15. Documentation policy

This file is the canonical CoreSpirit architecture/how-it-works/how-to-think document.

Version-specific design notes, duplicate stage writeups, temporary repair notes, and repeated implementation summaries should be merged here or deleted rather than accumulating as competing specifications.

Keep separate documents only when they represent an independently maintained contract, such as:

- `CORESPIRIT_PROJECT_TASKS.md` for detailed execution planning
- broker-specific operational documentation under `docs/fyers/`
- non-CoreSpirit subsystem architecture under `docs/`

Source code and conformance tests remain the implementation authority for machine-checkable behavior.

## 16. The visual system is the IDE/runtime surface

The chart is not a passive preview beside a code editor. It is one renderer of the same deterministic CoreSpirit runtime used by replay and execution.

The intended IDE loop is:

```text
source edit
   ↓
compile
   ↓
validated IR
   ↓
run on active chart/replay target
   ↓
scene + outputs + events
   ↓
chart updates
   ↓
signal inspector updates
   ↓
automation preview updates
```

### One runtime, many projections

The IDE must not create a simplified "editor runtime". The editor invokes the same compiler, IR and chart execution target used elsewhere. The visual surface simply subscribes to the resulting output stream.

That gives the IDE five synchronized projections of one execution:

| Projection | What it shows |
|---|---|
| Code | source and compiler diagnostics |
| Chart | candles, indicators, structure, signals, order-intent visuals |
| Runtime inspector | run ID, bars, outputs, state and diagnostics |
| Automation preview | lifecycle plus risk/policy/execution gates |
| Explainability | why a signal/intent was produced and what happened next |

### Latest-run-wins

Interactive editors generate overlapping runs. A slower older run must never overwrite a newer run's inspector state. The IDE bridge therefore assigns a monotonically increasing run generation and discards stale results before publishing them.

### Preview is intentionally safe

The IDE's automation preview defaults to `PAPER` and `PREVIEW_ONLY`. It can show that an order intent exists and that a gate is pending/blocked, but it cannot silently submit a broker request.

That separation is what lets TradingCoreOS make the IDE feel live without turning editing code into accidental live trading.

## 17. Explainability is a first-class execution artifact

A signal should not stop at:

```text
LONG
```

It should carry an inspectable causal trace:

```text
SIGNAL
  └─ LONG
      reason: EMA/RSI condition satisfied

LIFECYCLE
  └─ PAPER

RISK
  └─ APPROVED
      approved quantity: 10

POLICY
  └─ APPROVED
      policy: US-EQUITY-INTRADAY

EXECUTION
  └─ PREVIEW ONLY
      broker request not submitted
```

The important point is that explainability is **structured data**, not a generated paragraph. Every step has a stable ID, stage, status, reason, optional facts, and timestamp. This allows the same explanation to power a tooltip, side panel, audit record, replay inspector, API response, or future AI assistant without inventing a separate explanation runtime.

### Explainability data model

A signal explanation contains:

- signal identity and source/run identity
- symbol, timeframe, bar index and timestamp
- source location/output identity when available
- scalar runtime facts such as indicator values
- a decision trace spanning signal → lifecycle → risk → policy → execution
- a checksum so an explanation can be correlated with the exact emitted facts

### Example

Clicking **LONG** should be able to show:

```text
Signal: LONG
Reason: EMA20 crossed EMA50 and RSI threshold passed

Facts
  EMA20       105.42
  EMA50       104.91
  RSI          67.2
  bar          18342

Risk
  portfolio exposure   1.2%
  proposed risk        0.25%
  approved quantity    10

Policy
  policy               INTRADAY-DEFAULT
  result               APPROVED

Execution
  lifecycle            PAPER
  result               PREVIEW ONLY
```

The platform does not have to guess why a decision happened from screenshots after the fact. The runtime emits the facts and control-plane decisions as part of the execution record.

### Explainability must survive replay

Historical replay and realtime runs should produce the same explanation structure for equivalent confirmed inputs. This makes explainability useful for debugging and incident review rather than only as a UI convenience.

## 18. CoreSpirit target architecture

#18 is the point where the earlier contracts become one platform architecture.

The goal is **one language, one compiler, one executable IR, one VM, and many host adapters**.

```text
                              CORESPIRIT
                                  │
          ┌───────────────────────┼────────────────────────┐
          │                       │                        │
       LANGUAGE                 VISUALS                  MODELS
          │                       │                        │
   lexer/parser/type         scene graph            Python / C++ / Rust
   checker/compiler          stable object IDs       WASM / native RPC
   debugger/source maps     renderer-neutral ABI     typed Model ABI
          │                       │                        │
          └───────────────────────┼────────────────────────┘
                                  ↓
                       VALIDATED EXECUTABLE ARTIFACT
                                  ↓
                             CORE IR + VM
                                  │
               ┌──────────────────┼──────────────────┐
               ↓                  ↓                  ↓
          Historical            Replay            Realtime
               │                  │                  │
          immutable bars     immutable data     host feed + revisions
               │                  │                  │
               └──────────────────┼──────────────────┘
                                  ↓
                            SIGNAL ENGINE
                                  ↓
                          AUTOMATION CONTROL
                                  ↓
                           RISK / POLICY
                                  ↓
                           ORDER INTENT
                                  ↓
                       EXECUTION ADAPTER
                                  ↓
                        FYERS / UPSTOX / ...
```

### 18.1 The most important rule: dependency direction

The platform dependency graph should point **downstream** toward adapters, never upstream into CoreSpirit.

```text
UI / IDE
   ↓
CoreSpirit platform facade
   ↓
Compiler → Artifact → VM
   ↓
Signal / Visual / Model outputs
   ↓
TradingCoreOS host control plane
   ↓
Risk → Policy → Order Intent → Execution Adapter
   ↓
Broker adapter
```

This means:

- CoreSpirit does not import broker classes.
- CoreSpirit does not import FYERS/Upstox SDKs.
- The VM does not know whether data came from a broker, CSV, database, replay file or research notebook.
- Broker adapters convert their data into the neutral CoreSpirit market-data contract.
- Broker execution adapters consume a neutral approved order request.

This inversion is important enough to treat as a conformance rule. A convenient direct import is an architectural regression even when it makes the immediate implementation shorter.

### 18.2 The language front-end is only a compiler front-end

The source language should never become the runtime architecture.

```text
source
  ↓
lexer
  ↓
parser
  ↓
AST
  ↓
name resolution
  ↓
type checking
  ↓
capability/effect checking
  ↓
IR lowering
  ↓
IR optimization
  ↓
IR validation
  ↓
executable artifact
```

The front-end owns language meaning.

It does **not** own:

- broker credentials
- live sockets
- account mutation
- order submission
- persistent side effects
- a separate live execution engine

That distinction lets CoreSpirit grow syntactically without turning the language into a giant application runtime.

### 18.3 The executable artifact is the real unit of deployment

The source file is what the user edits.

The executable artifact is what the platform executes.

A production artifact should conceptually contain:

```text
artifact
├── source identity
├── source checksum
├── IR format/version
├── IR checksum
├── runtime ABI version
├── language/capability layer
├── capability/effect set
├── max lookback
├── quotas
├── source map
├── model dependencies
└── deterministic execution metadata
```

That gives the platform a stable hand-off between:

```text
Editor → Cache → Worker → Replay → Backtest → Realtime Host
```

The same artifact can therefore be inspected, replayed and executed without recompiling the user's source in each subsystem.

### 18.4 One VM, many execution hosts

The VM should not have separate copies for historical, replay, backtest and live trading.

Instead the host changes the **environment around the VM**.

| Host | Owns | VM receives |
|---|---|---|
| Historical | immutable dataset + clock | confirmed bars |
| Replay | immutable dataset + trace/checkpoints | confirmed bars |
| Realtime | feed + revision lifecycle | developing bars |
| Backtest | dataset + simulation clock | confirmed bars plus host-supplied fills/events |

The VM remains responsible for:

- series history
- indicator state
- locals
- deterministic computation
- output generation
- runtime quotas
- realtime rollback/commit semantics

The host remains responsible for:

- where data comes from
- when a revision arrives
- when a bar is confirmed
- session/account context
- persistence
- external side effects

This is the architectural meaning of “one runtime, many environments.”

### 18.5 Realtime is a host protocol, not a special language

The developing-bar lifecycle should stay explicit:

```text
confirmed checkpoint
      ↓
revision 0
      ↓
rollback
      ↓
revision 1
      ↓
rollback
      ↓
revision N
      ↓
COMMIT
```

Only the commit becomes confirmed history.

The same runtime state participates in:

- indicators
- `series<T>` values
- cross detection
- signals
- visual scene state
- explainability facts

A visual object, for example, must not be committed merely because the chart renderer already received it. Rendering is downstream projection; runtime state is authoritative.

### 18.6 Signal Engine is the first control-plane boundary

VM outputs are facts.

The signal engine turns signal-shaped outputs into immutable envelopes:

```text
VM output
   ↓
Signal Engine
   ├── eventId
   ├── sourceId
   ├── programChecksum
   ├── runId
   ├── mode
   ├── barIndex
   ├── timestamp
   ├── sequence
   ├── dedupeKey
   └── payload
```

This gives TradingCoreOS a stable event object independent of how the signal was produced.

The same signal can then feed:

```text
chart
alert
replay inspector
automation
strategy audit
webhook host
```

without the VM knowing which consumers exist.

### 18.7 Automation is not the VM

Automation is a host control-plane service.

Its job is to answer:

```text
Should this signal become an order intent?
Is this automation lifecycle state allowed?
What policy applies?
What risk checks are required?
What should be recorded?
```

It should not duplicate indicator computation or create another strategy interpreter.

A clean path is:

```text
signal event
   ↓
automation rule
   ↓
order-intent proposal
   ↓
risk engine
   ↓
policy engine
   ↓
approved order intent
```

### 18.8 Risk is authoritative, not advisory

Risk is not a recommendation attached to an already executable order.

It is an authority gate.

```text
proposed intent
      ↓
   risk engine
      ├── reject
      ├── reduce quantity
      └── approve
              ↓
          policy engine
              ↓
        execution adapter
```

The downstream execution request should be constructed from the **risk-approved intent**, not copied from the original signal.

This matters because risk can change:

- quantity
- allowed side
- allowed symbol
- exposure
- execution eligibility
- portfolio constraints

The final broker-facing object is therefore a consequence of the control plane, not of the user's signal alone.

### 18.9 Order intent is the anti-bypass object

The order intent is the immutable hand-off between “what the automation wants” and “what the platform may execute.”

Conceptually:

```text
Signal
  ↓
Intent proposal
  ↓
Risk-approved intent
  ↓
Policy-approved intent
  ↓
Execution request
```

Each transition should preserve correlation:

```text
signalId
strategyEventId
automationId
orderIntentId
policyId
executionId
brokerOrderId
```

That gives the audit trail a single causal chain rather than unrelated records.

### 18.10 Broker adapters are replaceable leaves

The broker should sit at the edge of the architecture.

```text
                  TradingCoreOS
                       │
                Execution Adapter
               /        |        \
           FYERS     Upstox     future broker
```

CoreSpirit should not know how an order is encoded for a broker.

A broker adapter should translate from the neutral execution request into broker-specific transport:

```text
CoreSpirit / host request
        ↓
neutral Execution Adapter contract
        ↓
broker-specific order format
        ↓
FYERS / Upstox API
```

The reverse path converts broker receipts into neutral execution receipts.

This makes broker replacement a leaf-level integration task instead of a language/runtime migration.

### 18.11 Models are another leaf-level capability

Models belong beside visuals, not underneath the VM as a competing runtime.

```text
CoreSpirit features / canonical trading state
                  ↓
             Strict Model ABI
                  ↓
          Model Orchestrator
       ┌──────────┼──────────┐
       ↓          ↓          ↓
    Python     Native RPC   WASM/ONNX/Remote
       \            |            /
        └───────────┴───────────┘
                  ↓
       prediction / confidence / metadata
                  ↓
       signal / visual / research output
```

The strict model profile is intentionally explicit:

- typed named input features with dtype and shape
- canonical timestamp/instrument/timeframe context
- optional market-state snapshot controlled by `read-market-state` capability
- typed prediction output
- optional confidence constrained to `[0,1]`
- structured metadata for provenance/explanations
- model ID/version and request checksum
- deterministic seed and execution context
- state token when stateful
- rollback safety requirement for stateful models
- memory, step, input-byte, output-byte and optional latency quotas

The model orchestrator performs validation before the adapter is invoked. Adapters are the only components allowed to own Python processes, native services, WASM instances, ONNX sessions or remote transport. The CoreSpirit VM receives only the typed result.

This is how CoreSpirit orchestrates Python/C++/Rust/WASM/ONNX/remote inference without making any of them a competing language or runtime.

### 18.11A Model lifecycle and research flow

```text
Python research
      ↓
feature engineering / training
      ↓
model artifact + strict manifest
      ↓
registry
      ↓
host adapter
      ↓
model orchestrator
      ↓
CoreSpirit runtime / replay / scanner / server
      ↓
prediction + confidence + metadata
      ↓
signal / visual / research result
      ↓
automation
      ↓
risk
      ↓
order intent
```

The final four steps remain outside the model ABI's authority. A model can inform a signal or strategy decision; it cannot approve risk, activate LIVE, submit an order, or mutate account state.

### 18.11B Target-aware model capability

Model inference is an execution-target capability, not an unconditional language permission. Research, server, replay, backtest, scanner and chart hosts may opt into `model-inference`; automation does not gain it merely because a model exists. The same executable artifact can therefore be reused without silently gaining new side effects.

### 18.12 Visuals are a projection of runtime state

The chart should consume a scene generated by the same execution that produced signals.

```text
VM state
   ├── series outputs
   ├── signals
   ├── structures
   └── visual scene
           ↓
      renderer adapter
       /    |     \
     web  replay  image
```

This is why stable visual IDs matter. On a realtime revision:

```text
same logical object ID
       ↓
update object
       ↓
scene diff
       ↓
renderer
```

rather than:

```text
delete everything
create everything again
```

The latter makes rollback, inspection and user interaction much harder.

### 18.13 IDE, replay and live execution become projections of one artifact

The deepest consequence of #18 is that the IDE no longer needs a “preview runtime.”

```text
                    executable artifact
                           │
             ┌─────────────┼─────────────┐
             ↓             ↓             ↓
            IDE          Replay        Live
             │             │             │
          chart +       trace +       chart +
          inspector     debugger      automation
```

The IDE can therefore show:

- the exact artifact checksum
- the same bar index and revision
- the same source-map location
- the same runtime facts
- the same signal event identity
- the same explainability record

That is much stronger than “an editor next to a chart.”

### 18.14 Observability should use the same identity graph

Every runtime-visible artifact should be correlated through stable IDs:

```text
programChecksum
   ↓
runId
   ↓
barIndex + revision
   ↓
outputId / signalId
   ↓
strategyEventId
   ↓
orderIntentId
   ↓
risk decision
   ↓
policy decision
   ↓
executionId
   ↓
brokerOrderId
```

This is the foundation for:

- debugging
- replay divergence analysis
- incident review
- audit history
- automation history
- “why did this signal fire?”
- “why did this order not execute?”

### 18.15 Failure boundaries

Each plane should fail in a way that does not silently cross into the next authority level.

```text
compiler failure      → no artifact
IR validation failure → no execution
VM failure             → no signal publication for invalid run
signal failure         → no automation event
lifecycle rejection   → no order intent progression
risk rejection        → no policy approval
policy rejection      → no execution request
execution rejection   → no broker receipt
broker failure        → execution receipt records failure
```

A failure should be explicit and correlated, never silently converted into “continue anyway.”

### 18.16 What should be persisted

Persisted CoreSpirit data should be divided by authority:

**CoreSpirit artifacts**

- source checksum
- IR artifact
- source map
- capability/layer metadata
- model dependency versions

**Runtime evidence**

- run identity
- dataset identity
- replay traces/checksums
- signal envelopes
- explainability records

**TradingCoreOS control-plane evidence**

- automation lifecycle history
- risk decisions
- policy decisions
- order intents
- execution receipts

**Broker evidence**

- broker order IDs
- broker status
- fills
- reconciliation events

This separation prevents the language layer from becoming a persistence schema for every trading concern.

### 18.17 Scaling model

The architecture naturally supports scaling by **run**, not by language implementation.

A worker can own:

```text
artifact + dataset snapshot + runId
```

and produce:

```text
outputs + signals + trace + final state checksum
```

The control plane can then consume the result without needing the worker to own broker credentials.

Live trading is different only because the host maintains a long-lived realtime session and external side effects. The VM itself still remains the same deterministic computation engine.

### 18.18 The architectural acceptance test

#18 is successful when all of the following are true:

```text
1. Source compiles once to a validated artifact.
2. The same artifact can run in historical and replay hosts.
3. The same VM handles realtime revisions and commit/rollback.
4. CoreSpirit has no broker-domain dependency.
5. VM outputs become immutable signal envelopes.
6. Automation consumes signals rather than recompiling strategy logic.
7. Risk is mandatory before policy/execution.
8. Order intent is the only bridge into execution.
9. Broker connectivity exists only behind host adapters.
10. IDE, replay and live surfaces can correlate to the same run/artifact identity.
```

That is the architecture I would treat as the foundation for everything after #18.

It keeps the product split into two coherent halves:

```text
             CORESPIRIT
   language + IR + VM + visuals + models
                  │
                  │ deterministic facts
                  ↓
           TRADINGCOREOS
 signal + automation + lifecycle + risk
 policy + order intent + execution + brokers
```

CoreSpirit becomes the deterministic **trading computation platform**.
TradingCoreOS becomes the **control plane that decides what external actions are allowed**.

That separation is what allows both sides to become substantially more powerful without turning either one into a hidden, unsafe second system.


### 18.19 CoreSpirit is trading-system-centric, not chart-centric

CoreSpirit intentionally does not inherit the boundary of a chart scripting language. The chart is one important **projection** of the system, not the system itself.

The design target is:

```text
Market Data
    ↓
Canonical Trading Model
    ↓
CoreSpirit Language / Runtime
    ├──────────┬───────────┬────────────┬─────────────┐
    ↓          ↓           ↓            ↓
 Visual     Research     Models      Automation
    ↓          ↓           ↓            ↓
 Chart      Replay       Python      Signals
 Objects    Backtest     C++/Rust    Webhooks
 Panels     Analysis     WASM        Execution intent
    └──────────┴───────────┴────────────┴─────────────┘
                              ↓
                          Risk / Policy
                              ↓
                           Execution
```

This creates an explicit distinction:

| System concern | CoreSpirit owns | Host/adapters own |
|---|---|---|
| Market vocabulary | canonical instrument/bar/quote/depth/session types | broker/feed conversion |
| Computation | language, series, indicators, deterministic VM | execution environment |
| Visuals | semantic scene graph | pixels, GPU, DOM, chart library |
| Research | artifact/replay contracts | datasets, Python orchestration, training jobs |
| Models | typed Model ABI | WASM/native process lifecycle |
| Signals | immutable signal envelopes | downstream consumers |
| Automation | declaration/event semantics | lifecycle/control plane |
| Risk | no direct authority in VM | authoritative risk engine |
| Execution | neutral intent/output | broker adapters and credentials |

The important product rule is: **do not make chart rendering the lowest common denominator for every capability**. A liquidity model, depth map, portfolio state, replay trace, model confidence surface or automation decision can exist without pretending that it is a `plot()`.

### 18.20 Canonical Trading Model

All upstream data should converge into one broker-neutral model before entering the language/runtime.

```text
FYERS / Upstox / CSV / DB / Research
              ↓
        Host data adapter
              ↓
     CoreSpiritTradingSnapshot
       ├── instrument
       ├── session
       ├── bar / tick
       ├── quote
       ├── depth
       ├── portfolio snapshot
       └── execution mode
              ↓
       compiler / VM / model ABI
```

`CoreSpiritTradingSnapshot` is deliberately richer than a candle. It is the shared vocabulary that lets an indicator, research notebook, model and automation reason about the same trading context without importing one another's implementation types.

The model remains descriptive, not authoritative. A portfolio snapshot can tell the risk engine what the current state is, but the CoreSpirit VM still cannot mutate the account. An execution adapter can report a broker receipt, but that receipt is converted back into the neutral model before higher layers observe it.

The contract also permits capability-specific views. A script can receive only the market fields it was authorized to see while the same canonical snapshot remains the source of truth for richer host integrations. This keeps the data model unified without making every program omniscient.

### 18.21 Visual Scene Graph, not a plotting side-effect

The scene graph is the visual ABI. Existing outputs such as `plot`, `zone`, `box`, `label` and `footprint` remain valid and are adapted into the same graph, so the change is additive rather than a rewrite.

The richer graph supports semantic layers such as:

```text
Chart Scene
├── Price
├── Indicator
├── Structure
├── Liquidity
├── Volume
├── Depth
├── Orders / Intents
├── Signals
├── Data / Heatmaps
└── UI / Interactive Panels
```

Every visual object has:

- a persistent identity
- a semantic kind/layer
- data-space anchors
- style/state
- optional parent relationship
- optional interaction references
- renderer-independent payload

The graph therefore behaves more like a retained-mode UI scene graph than a list of chart drawing commands.

#### Persistent identity

The important invariant is:

```text
bar update
   ↓
existing object ID
   ↓
patch state
   ↓
scene diff
   ↓
renderer
```

not:

```text
bar update
   ↓
delete old drawings
   ↓
recreate everything
```

This is required for realtime rollback, fast hot reload, object inspection and interactive charts.

#### Serializable interaction

The language surface can eventually look like:

```corespirit
zone = visual.zone(
    id = "liquidity_1",
    top = 25200,
    bottom = 25160
)

zone.opacity = liquidity_strength
zone.label = "Liquidity"
zone.on_click = inspect_zone
```

but the runtime representation is intentionally **not** a JavaScript/Python callback. It lowers to serializable action references:

```text
onClick → { kind: "inspect", actionId: "inspect_zone", params: ... }
```

That preserves determinism, replayability, persistence and renderer portability. The host resolves `actionId` to the appropriate UI/control-plane behavior.

#### Object families

The graph is designed for several semantic families without making them language-core primitives:

```text
zone / liquidityZone
heatmap
volumeProfile
footprint
orderIntent
signal
panel / interactivePanel
depthMap
polyline / path
```

Each family can share identity, quotas, hit-testing references, source mapping and scene diffing.

#### Hierarchy

Parent relationships allow a visual feature to be a composed object rather than a flat pile of drawings:

```text
Liquidity Zone
├── zone body
├── strength label
├── volume heatmap
└── inspection affordance
```

The graph validator rejects duplicate IDs, parent cycles, missing parents and non-serializable callback closures.

#### Renderer contract

Renderers consume the scene and decide how to draw it. A web renderer may use Vela NativeRenderer plus canvas/DOM overlays; a replay renderer may use the same semantic scene for deterministic image output; a headless renderer can inspect identities and interaction references without any browser.

The CoreSpirit VM does not import any of those rendering libraries.

### 18.22 Compatibility rule for #18.19–18.21

The platform should evolve through adapters, not parallel runtimes.

```text
Existing CoreSpirit output
        ↓
legacy object adapter
        ↓
scene graph
        ↓
renderer
```

and:

```text
new visual ABI
        ↓
same scene graph
        ↓
same renderer
```

Similarly:

```text
existing broker feed → canonical trading model
new broker feed      → canonical trading model
research dataset     → canonical trading model
```

No second chart runtime, second scene protocol, or second language runtime is introduced just to support the richer model.

## 18.23 Language-driven interactive UI

The next extension keeps UI inside the same language/runtime rather than inventing a second application runtime.

```text
CoreSpirit source
      ↓
parser / type checker
      ↓
member-call IR
      ↓
Core VM
      ↓
visual scene + UI state
      ↓
host renderer / interaction dispatcher
```

The current language surface supports the deterministic pattern:

```corespirit
panel = ui.panel("Market Structure")
panel.number("ATR", atr(14))
panel.button("Recalculate", recalibrate)
panel.toggle("Show Liquidity", true, toggle_liquidity)
panel.slider("Sensitivity", 1, 10, 5, set_sensitivity)
```

The important boundary is that `recalibrate`, `toggle_liquidity`, and `set_sensitivity` are serialized action IDs, not JavaScript closures. The host receives a `CoreSpiritUiEvent` and resolves the action through the UI/control-plane layer.

### UI runtime invariants

- panel/control IDs are stable and deterministic
- controls are serializable
- UI state is returned with runtime state
- developing-bar UI state participates in realtime rollback
- UI actions cannot call broker APIs
- UI state does not change the risk/execution authority model
- historical/replay/IDE execution uses the same UI contract

The UI is therefore an analytical surface attached to the trading runtime, not a hidden second application.

## 18.24 UI as a mini application surface

A CoreSpirit indicator can now describe a small analytical application inside TradingCoreOS.

The runtime owns the state; the host owns rendering and event routing:

```text
CoreSpirit program
 ├── calculations
 ├── visuals
 └── ui definitions
       ↓
   one runtime state
       ├── chart scene
       └── UI state
              ↓
       host interaction
              ↓
         action reference
```

The design deliberately avoids direct DOM access, browser event handlers, sockets, or arbitrary host mutation. This keeps the UI portable to web, desktop, replay and headless environments.

## 18.25 Data-rich visuals

Visual metadata is now a first-class scene property rather than an unstructured renderer-only detail.

A language visual can attach metadata through the deterministic `meta(key, value, ...)` constructor:

```corespirit
line(
    time, resistance,
    time, resistance,
    meta(
        "strength", 87,
        "touches", 6,
        "volume", 184000,
        "source", "market_structure"
    )
)
```

The metadata becomes part of the renderer-neutral scene node. Scalar values are normalized to deterministic serializable values.

Metadata-bearing objects automatically receive a declarative inspection affordance:

```text
hover object
    ↓
visual.inspect
    ↓
inspection rows
    ├── strength: 87
    ├── touches: 6
    ├── volume: 184000
    └── source: market_structure
```

This makes the chart a data-exploration surface rather than only a drawing surface.

The host can render the inspection as a tooltip, side inspector, replay detail panel, mobile sheet, or headless diagnostic without changing the CoreSpirit program.

## 18.26 Compatibility rule for interactive UI + metadata

These additions do not introduce a second language, compiler, IR or VM.

The compatibility chain remains:

```text
Legacy plot/zone/box/label/footprint
            ↓
Existing scene adapter
            ↓
Canonical scene graph
            ↑
Advanced semantic visuals
            ↑
Language-driven UI state
            ↑
CoreSpirit runtime
            ↑
Same executable artifact / IR
```

The following are explicit non-goals:

- no DOM APIs inside CoreSpirit
- no JavaScript callback closures in scenes or UI state
- no broker order functions from UI controls
- no separate visual runtime
- no separate UI scripting runtime
- no external-language-compatible plot model as the architectural center

## 18.28 Multi-symbol computation is a first-class language capability

CoreSpirit programs are not bound to the active chart instrument. A program may declare provider-neutral market references and relate instruments against the same execution clock:

```text
Base execution clock
      │
      ├── market("NIFTY").close
      ├── market("BANKNIFTY").close
      └── market("USDINR").close
              ↓
       synchronized values
              ↓
        spread / ratio /
        relative-strength
        / correlation logic
```

The runtime owns synchronization; the broker/data host owns acquisition. Cross-symbol inputs are aligned to the current bar clock and must never use a future sample. A host may also enforce a maximum staleness window, so a missing or stale benchmark becomes `null`/unavailable rather than silently contaminating a decision.

The language surface can keep the trading intent readable:

```corespirit
let nifty = market("NIFTY")
let banknifty = market("BANKNIFTY")
let spread = nifty.close - banknifty.close
```

The same IR and VM execute this as a data-reference operation. There is no second multi-symbol runtime and no broker call from the language. Indicators can consume historical series supplied by the host for another instrument through the same `call` IR contract used for native series.

This makes scanner, chart, research and strategy programs naturally relational: an instrument can be evaluated in the context of an index, sector leader, hedge instrument, currency pair, or other benchmark.

## 18.29 Multi-timeframe data is native and synchronized

Timeframe is part of the data model, not an awkward side request:

```corespirit
let daily = timeframe("1D")
let hourly = timeframe("1H")
let fiveMin = timeframe("5m")

let trend = ema(daily.close, 20)
let entry = crossover(fiveMin.close, hourly.close)
```

All requested timeframes use the base execution timestamp as their synchronization clock. The default policy is **last confirmed sample**. This is deliberate: a higher-timeframe value that is still developing is not silently treated as confirmed, and a sample newer than the current execution clock is rejected.

Conceptually:

```text
5m execution clock
       │
       ├── 1H aligned sample
       ├── 1D aligned sample
       └── 5m current sample
              ↓
        one deterministic frame
```

The host can provide historical series directly through a `series` resolver, or it can satisfy short lookbacks through the existing contextual `request` contract. The VM does not create another series engine for higher timeframes. Stateful indicators therefore keep one state model while consuming synchronized external series.

Developing higher-timeframe data can be exposed explicitly by a future policy/API, but it is never the implicit default. This keeps backtest, replay and realtime semantics aligned and makes look-ahead prevention part of the architecture rather than a caller convention.

## 18.27 Current platform interpretation

CoreSpirit is now best understood as a trading-system language with chart and IDE projections:

```text
                 CORESPIRIT
                     │
          ┌──────────┼──────────┐
          ↓          ↓          ↓
      Language     Data      Runtime
          │          │          │
          └──────────┼──────────┘
                     ↓
                Core IR / VM
                     │
       ┌─────────────┼─────────────┐
       ↓             ↓             ↓
   Scene Graph     UI State     Signals
       ↓             ↓             ↓
     Chart        Interaction    Automation
       │             │             ↓
       └─────────────┴────────→ Risk
                                   ↓
                                Policy
                                   ↓
                                Intent
                                   ↓
                              Execution Adapter
```

The differentiator is not external-language feature compatibility. The differentiator is that the chart, research surface, model surface, UI surface, signal surface and automation surface are all projections of one deterministic trading runtime.

> **Implementation status and conformance tracker:** see `docs/CORESPIRIT_BUILD_TRACKER.md`. This is the single build/status record for the CoreSpirit platform and should be updated when a new stage changes architectural truth.

## 23. Advanced visual data model

CoreSpirit visuals are not limited to two-dimensional lines or plot primitives. The visual ABI can carry renderer-neutral analytical structures including heatmaps, liquidity fields, depth ladders, volume profiles, order-flow footprints, market-structure graphs, probability surfaces, regime bands, model fields, trade paths, and replay traces.

The language/runtime describes the **data and semantics**. The host decides whether that becomes SVG, Canvas, WebGL/WebGPU, a native renderer, an image export, or a replay surface. No DOM, GPU object, texture handle, or browser callback crosses into CoreSpirit IR or VM state.

Advanced payloads are validated and quota-limited before entering the persistent scene graph. Grids have explicit dimensions and finite values; depth/profile data is bounded; graphs must have valid node references; trade paths and traces have explicit point quotas. This keeps visually rich programs deterministic and prevents a single indicator from allocating unbounded visual memory.

Examples of renderer-neutral semantic roles include `probabilitySurface`, `structureGraph`, `regimeBand`, `tradePath`, `depthMap`, and `volumeProfile`. They remain scene nodes with stable identities and metadata, so inspection/replay uses the same mechanism as ordinary lines/zones.

## 24. Realtime visual engine

Realtime visual execution is retained-mode and transactional:

```text
market revision
   ↓
CoreSpirit runtime state update
   ↓
new scene state
   ↓
diff(previousScene, nextScene)
   ↓
VisualPatch
   ↓
renderer host
```

A visual engine owns the working scene and committed scene. A developing revision can `begin → apply → rollback` or `begin → apply → commit`. This gives candles, indicators, liquidity maps, order overlays, UI state, and advanced model visuals a common revision boundary.

The patch contains stable node IDs plus `added`, `updated`, and `removed` sets. Multiple patches may be coalesced before a renderer frame, preventing a burst of ticks from producing unnecessary intermediate work. An add-then-remove pair that never existed in the committed scene is reduced to a no-op.

Renderer implementations remain outside CoreSpirit. The realtime engine does not know about Canvas, WebGL/WebGPU, Vela, DOM nodes, or native views. A renderer receives the final scene/patch and chooses how to allocate GPU buffers, textures, hit-test regions, animation clocks, or platform UI.

The same mechanism is also suitable for replay: the scene revision and checksum become part of the replay trace, so a visual divergence can be inspected at the exact revision where it occurred.



## #23 — CoreSpirit Language Simplification development cycle

CoreSpirit has accumulated a substantial implementation surface: stable IR/VM execution, reactive scheduling, persistent scenes, models, multi-symbol/timeframe data, automation, risk/policy boundaries, replay, scanners and host adapters. The architecture is now mature enough that the next useful move is **reduction of author-facing complexity rather than another large architectural layer**.

This is deliberately a **development cycle, not a new roadmap stage**. The active roadmap remains at 59 stages. The cycle operates across those existing contracts and measures progress by how much complexity disappears from ordinary authoring without weakening the internal architecture.

### Objective

> **Move complexity downward: from source syntax into compiler normalization, semantic analysis, diagnostics and host orchestration.**

The public language should answer:

```text
What data do I want?
What value am I calculating?
What should I show?
When should something happen?
What model fact do I consume?
What automation intent should follow?
```

The public language should not require authors to understand:

```text
ASTs
IR blocks
dependency planner internals
scene node identity
render patches
transport selection
capability negotiation
broker adapters
risk policy plumbing
worker scheduling
GPU/WASM execution
```

### Priority map

| Priority | Area | Current direction | Exit condition |
| --- | --- | --- | --- |
| **P0** | Language | Reduce ceremony, increase readable forms, preserve one canonical lowering path | Common trading tasks require fewer source constructs and no semantic fork is introduced |
| **P0** | Compiler | Normalize all surface sugar into one semantic model before IR lowering | Equivalent source forms produce equivalent semantic/IR results and source maps |
| **P0** | Visuals | Make `show` the primary visual surface and keep scene machinery hidden | Simple visuals need no scene/renderer knowledge while advanced visuals still converge on the same scene graph |
| **P0** | Events | Treat `when` + `emit` as universal reactive language primitives | Named events, conditions and bar/replay events share one runtime contract |
| **P0** | Automation | Keep source focused on intent, sizing and risk; hide lifecycle/plumbing | Authoring an automation does not require broker, transport or lifecycle implementation knowledge |
| **P1** | Models | Make model consumption compact and typed | A model can be consumed with a small source expression while ABI details remain inspectable but hidden |
| **P1** | Editor | Teach the simple language first | Completion, templates and hover start from user concepts rather than implementation terminology |
| **P1** | Diagnostics | Explain inferred semantics, not compiler machinery | Errors say what CoreSpirit understood, what is missing and how to fix it |
| **P1** | Replay | Make replay a property of every executable artifact | Any valid script can be replayed with stable source, dataset and configuration identity |
| **P1** | Session/calendar | Keep as a real open semantic area | Session boundaries, holidays, exchange clocks and partial sessions have explicit deterministic policy |
| **P1** | Production renderer | Finish the real host path after semantic contracts are stable | Scene contracts are proven end-to-end with the production renderer without leaking renderer concepts into the language |
| **P1** | Scanner workers | Add production scheduling/backpressure around the existing scanner contract | Concurrency, quotas, cancellation and deterministic collection are observable host behavior |
| **P2** | Indicator corpus | Expand mathematical/reference coverage | Core indicators have reference-value and edge-case tests across supported input shapes |
| **P2** | Artifact migration | Add versioned migration compatibility | Old compiled/script artifacts can be opened, validated and migrated without semantic ambiguity |
| **P2** | Advanced GPU | Optimize only from profiling evidence | GPU/accelerator work demonstrates measured bottlenecks and preserves replay/authority invariants |
| **P3** | More syntax | Add only when repeated real authoring cases justify it | New syntax removes repeated friction and lowers to already-established semantics |

### What “simplification” actually means

Simplification is not deleting expressive power. It is reducing the number of concepts a user must hold simultaneously.

For example, these are intentionally equivalent authoring surfaces:

```corespirit
fast = ema(close, 20)
slow = ema(close, 50)

when fast crossesAbove slow:
    emit "LONG"
```

and the more explicit compiler-facing form:

```text
crossover(fast, slow)
→ conditional dependency
→ event emission
```

The second representation remains useful for diagnostics and tooling, but it does not become a second language that beginners must learn.

### Simplification acceptance test

A proposed public feature should survive all of the following checks:

```text
1. Can the same user task be expressed with less ceremony?
2. Does it lower into an existing semantic contract?
3. Does it avoid a new runtime or evaluator?
4. Is its behavior deterministic in history, replay and realtime?
5. Does it preserve broker/risk/policy boundaries?
6. Can the editor explain it in user terminology?
7. Can advanced users still inspect the underlying meaning?
8. Does it remove a repeated source of confusion rather than add another option?
```

If a feature fails these tests, it belongs below the language surface or should remain an implementation detail.

## #24 — Stop architectural accumulation; enter a reduction cycle

The instruction for the next development cycle is intentionally negative:

> **Do not respond to every remaining gap with another giant architectural stage.**

The roadmap already has 59 stages and a large compatibility/test corpus. At this maturity level, quality comes from consolidation, semantic unification, documentation clarity and removal of redundant authoring paths.

### Reduction-cycle workflow

```text
Inventory public surface
        ↓
Find duplicate / verbose forms
        ↓
Choose one canonical meaning
        ↓
Normalize at the compiler boundary
        ↓
Improve editor discoverability
        ↓
Improve diagnostics
        ↓
Replay / realtime / authority regression
        ↓
Retire unnecessary surface forms
```

The reduction cycle therefore prioritizes **fewer ways to express the same thing**, not more ways.

### What should be frozen underneath

During this cycle, the following remain architectural constants:

```text
one language
      ↓
one compiler
      ↓
one stable IR
      ↓
one VM
      ↓
one reactive execution substrate
      ↓
one renderer-neutral scene model
      ↓
one broker/risk/policy authority boundary
```

The cycle may simplify syntax, compiler passes and editor presentation, but it must not create a “simple runtime” beside the existing runtime or a “professional runtime” beside it.

### The practical end state

A trader should be able to begin with:

```corespirit
show ema(close, 20)
```

then grow naturally into:

```corespirit
fast = ema(close, 20)
slow = ema(close, 50)
show fast, slow

when fast crossesAbove slow:
    emit "LONG"
```

then into model-aware and automated programs without learning a second language:

```corespirit
model "Regime":
    use "regime-v3"

when fast crossesAbove slow and Regime.confidence > 0.8:
    emit "LONG"

automate:
    when "LONG":
        order long 1% risk
```

The compiler absorbs the additional structure; the author does not need to learn the compiler's internal graph vocabulary.

### #23/#24 boundary

This cycle is a **reduction and consolidation program** over existing stages 1–59. It is not permission to reopen foundational runtime architecture casually. New runtime primitives, new execution authorities, or parallel language layers require a separate architectural decision rather than appearing as side effects of “simplification.”

## 25. Documentation and build-status boundary

CoreSpirit intentionally keeps two human-facing documents with different jobs:

- `docs/CORESPIRIT.md` is the stable architecture brain: how to think about CoreSpirit, its invariants, runtime model, execution boundaries, visual model, and design decisions.
- `docs/CORESPIRIT_BUILD_TRACKER.md` is the living implementation truth: current release status, stage completion, verification results, known gaps, and next concrete work.

Machine-readable `CORESPIRIT_Vxx_MANIFEST.json` files remain the release identity record. They do not replace the build tracker.

Do not create version-specific CoreSpirit architecture Markdown files. Update the architecture document only when architectural truth changes; update the tracker whenever implementation status changes.

### Reconciled pre-v45 lineage

The v13–v45 source record has been mined rather than copied wholesale. The authoritative historical inputs were:

- `CORESPIRIT_HISTORY.md`
- `CORESPIRIT_LAYERED_PLATFORM_V40.md`
- `CORESPIRIT_MODEL_AUTOMATION.md`
- `CORESPIRIT_PROJECT_TASKS.md`
- `CORESPIRIT_STAGES_1_16_DEEP.md`
- `CORESPIRIT_STAGES_10_13_DEEP.md`
- `CORESPIRIT_STAGES_13_14_DEEP.md`
- `CORESPIRIT_STAGES_46_47_DEEP.md`
- `CORESPIRIT_V28_DATA_VISUAL_CONTRACT.md`
- `CORESPIRIT_V30_RELEASE_NOTES.md`
- `CORESPIRIT_V31_CHART_DATA_FIX.md`
- `CORESPIRIT_V32_TIME_SERIES_CHART_CONTRACT.md`
- `CORESPIRIT_V33_REALTIME_INDICATOR_CONTRACT.md`
- `CORESPIRIT_V34_STDLIB_COMPILER_CONTRACT.md`
- `CORESPIRIT_V35_DEEP_STEPS_5_6_7_8.md`
- `CORESPIRIT_V36_IR_REPLAY_IMPLEMENTATION.md`
- `CORESPIRIT_V39_DEEP_1_16.md`
- `CORESPIRIT_V39_VERIFICATION.md`
- `CORESPIRIT_V41_DEEP_STAGES_1_2.md`
- `CORESPIRIT_V42_VISUAL_IDENTITY_AND_STAGES_3_4_5.md`
- `CORESPIRIT_V43_RENDERER_EVENT_BUS_IMPLEMENTATION.md`
- `CORESPIRIT_V37_MANIFEST.json` through `CORESPIRIT_V45_MANIFEST.json`

The historical manifests v37, v38, v39, v40, v41, v42, v43 and v45 in this release are byte-for-byte identical to the supplied historical archive. They are retained as machine release records; their human-readable implications are consolidated into this document and the living build tracker.

### Short version history

- **v45:** research/model/automation foundation.
- **v46:** automation lifecycle and risk boundary hardening.
- **v47:** IDE/runtime convergence and explainability.
- **v48:** platform architecture, canonical trading model, one VM/many hosts.
- **v49:** persistent visual scene graph and trading-system-centric visuals.
- **v50:** language-driven UI and metadata-rich visuals.
- **v51:** advanced visual data model and realtime visual patch engine.
- **v52:** declarative visuals and visual applications.
- **v53:** execution targets and native universe scanning.
- **v54:** first-class multi-symbol references, synchronized cross-symbol data, native multi-timeframe references, confirmed-only higher-timeframe alignment, and external-series indicator consumption.
- **v55:** strict external-model semantic ABI, target-aware model inference, adapter contracts for Python/C++/Rust/WASM/ONNX/remote, and deeper model orchestration/research boundaries.
- **v56:** AI as a semantic model kind on the existing ABI, structured direction/probability/regime/confidence outputs, host-side AI model handles, and renderer-neutral model explanation surfaces.
- **v57:** automation explainability records with retained decision paths, optional per-instruction runtime tracing, bar-level visual debugger sessions, source-map highlighting, and chart-click-to-debug integration.
- **v58:** semantic/execution/visual graph compilation attached to the existing Core IR plus reactive dirty-propagation and pure-node reuse with transactional rollback-safe caches.
- **v59:** historical lineage reconciliation; pre-v45 CoreSpirit design records were mined into the stable architecture brain and living build tracker while v37–v45 machine manifests were preserved unchanged.
- **v60:** host-side CPU/WASM/GPU numerical execution planning, deterministic backend eligibility, hybrid pure-work placement, explicit compute batching, and capability-based sandbox enforcement for resources and authority.
- **v61:** the first converged CoreSpirit v1 runtime contract: one executable artifact travels through the existing reactive VM, renderer-neutral scene graph and deterministic replay hosts; realtime revisions use the same visual transaction boundary.
- **v62:** programmable visual coordinate semantics become first-class: plot placement, chart/panel/side-panel/floating areas, time/bar/price/percentage/screen/normalized coordinates, point-based geometry, relative bar anchors, axis ranges, and custom visuals all persist as renderer-neutral scene metadata.
- **v63:** the language surface was unified: concise syntax transforms are registered outside the core parser, direct output/event emission comes from builtin descriptors, namespaced members use one shared member registry across semantic analysis/lowering/editor completion, and the compiler no longer carries a second hard-coded emission allow-list.
- **v64:** the user-facing language was reduced to six semantic concepts — DATA, LET, WHEN, SHOW, MODEL and AUTOMATE — with executable WHEN/SHOW lowering, MODEL/AUTOMATE declaration metadata, host-resolved automation events, and one shared semantic path underneath all six concepts.
- **v65:** the remaining duplicate surface-normalization path was collapsed into one delegating entry point; SHOW became a dedicated Core IR visual emission that directly projects into existing scene objects, while concise coordinate pairs infer time/price or normalized space and retain explicit coordinate escapes for advanced code.
- **v66:** SHOW coordinate inference became a centralized semantic contract, and the renderer-neutral Scene Graph became an explicitly internal compiler/runtime concern behind a public visual-projection summary boundary.
- **v67:** MODEL became a declarative language surface with compact registry/host bindings, explicit input/output metadata, model-qualified output references and a host-owned resolver while the strict model ABI remained underneath.


## 30. Every automation is explainable

Automation is not considered complete merely because it produced an order intent or execution result. A production automation result carries a queryable explanation path:

```text
signal
  ↓
automation lifecycle
  ↓
risk
  ↓
policy
  ↓
execution authority
  ↓
final decision
```

The explanation is structured. It contains event/intent identity, program/source identity where available, symbol, timeframe, selected bar, facts, decision steps, authority checksum and explanation checksum. The human-readable view is a projection of that data; the runtime does not rely on prose to establish why a decision occurred.

The existing execution-authority contract remains authoritative. The explanation system observes that path; it cannot approve risk, alter policy, or submit an order.

Automation explanations can be retained in a bounded `CoreSpiritAutomationExplainabilityStore` and queried by automation ID or intent ID. This is deliberately separate from broker execution adapters so audit/inspection survives a venue change or execution failure.

A canonical automation explanation therefore looks like:

```text
BUY NIFTY

Signal
  EMA20 > EMA50
  RSI = 67.3
  regime = TREND
  model probability = 0.81

Lifecycle
  LIVE

Risk
  proposed risk = 0.25%
  portfolio exposure = 1.40%
  approved quantity = 1

Policy
  APPROVED

Execution
  order intent = READY
  execution host = accepted
```

The values above are examples of the shape, not hidden runtime assumptions. Actual facts come from the selected program/runtime/control-plane record.

## 31. Visual debugger: source → IR → state → output

The flagship debugger is an observational layer over the existing VM. It does not interpret CoreSpirit a second time.

A chart click resolves to a bar index. The debugger replays that same validated artifact against the same market dataset and exposes:

```text
Chart point
    ↓
Bar snapshot
    ↓
Source location
    ↓
IR execution path
    ↓
Runtime locals/state
    ↓
Outputs/signals
    ↓
Explainability facts
```

The runtime can optionally capture per-instruction values. Tracing is disabled by default, so ordinary production runs do not pay for debugger capture. When enabled, each instruction can expose PC, opcode, source-map location, result register and scalar result value.

The debugger session is deterministic and cacheable. It is keyed by executable artifact checksum, bar index and dataset context. The session can inspect arbitrary historical/replay bars without mutating the live runtime or chart state.

Source highlighting comes from the stable Core IR source map. The debugger therefore points back to the actual CoreSpirit source location responsible for the selected execution path instead of reconstructing a best-effort UI guess.

The chart integration emits a host-level `TRADINGCORE_CORESPIRIT_DEBUG_BAR` event. The chart remains a projection surface; the debugger receives a request and performs observational replay. The chart cannot execute code through this event.

The intended IDE surface is:

```text
10:45:00
────────────────────────
close          25143.20
EMA20          25118.40
EMA50          25092.20
RSI               67.14
trend          BULLISH
regime         TRENDING

Execution path
  load close
  ema(20) → 25118.40
  ema(50) → 25092.20
  rsi(14) → 67.14
  crossover → TRUE
  signal(LONG)

Source
  Line 12: signal "LONG"
```

This is the intended distinction from a normal log viewer: the debugger connects the chart coordinate to the language source, deterministic IR, concrete runtime values and the resulting signal/explanation record.

Detailed implementation history belongs in the build tracker.


## 26. Principles 1–16 as one platform

The early design principles are now intentionally represented as one system rather than sixteen independent features:

| Principle | Architectural interpretation | Current contract |
|---|---|---|
| 1 | Trading-system-centric language | one runtime, not chart-only | ✅ |
| 2 | Canonical trading model | neutral market/session/instrument vocabulary | ✅ |
| 3 | Scene graph instead of plot-only visuals | persistent semantic scene | ✅ |
| 4 | Interactive analytical UI | runtime-owned UI state + serializable actions | ✅ |
| 5 | Advanced visuals | high-dimensional renderer-neutral visual ABI | ✅ |
| 6 | Realtime visual engine | transactional scene patches + coalescing | ✅ |
| 7 | Declarative visuals | semantic visual state lowered into scene graph | ✅ |
| 8 | Visual applications | workspace/app manifest | ✅ |
| 9 | Multiple execution environments | target capabilities over one artifact | ✅ |
| 10 | Native scanning | universe/candidate/ranking host | ✅ |
| 11 | Multi-symbol computation | synchronized cross-symbol references | ✅ |
| 12 | Multi-timeframe data | confirmed alignment/no-lookahead | ✅ |
| 13 | Strategy/signal boundary | intents/events stop before execution authority | ✅ |
| 14 | Risk cannot be bypassed | risk before policy/execution | ✅ |
| 15 | Python/C++/Rust are collaborators | external model orchestration | ✅ |
| 16 | Strict model ABI | typed model contract + adapter isolation | ✅ |
| 17 | AI is another model type | AI semantic profile + host model handle | ✅ |
| 18 | Visualize the model itself | probability surface + model field + regime band | ✅ |

The important result is that these are not separate engines. They all converge on the same executable artifact, runtime state, capability system, scene/event model and host authority boundaries.

## 27. External model ecosystem contract

The model ecosystem is deliberately open at the host boundary:

```text
                  CoreSpirit
                     │
              Strict Model ABI
                     │
       ┌─────────────┼──────────────┐
       ↓             ↓              ↓
    Python        C++ / Rust    WASM / ONNX
       │             │              │
       └─────────────┼──────────────┘
                     ↓
                Remote services
                     ↓
              typed model result
```

Supported implementations are an ecosystem contract, not six different CoreSpirit languages. Python remains the research/orchestration surface; C++ and Rust remain native numerical/model hosts; WASM remains a portable sandbox; ONNX is an interoperable model format/runtime option; remote models remain host-owned services.

The release-quality rule is: **every new model backend must implement the same semantic manifest, request/result contract, determinism policy, quota enforcement, provenance identity and authority boundary before it becomes a supported CoreSpirit backend.**



## 28. AI is another model type, not another runtime

AI belongs inside the external-model ecosystem rather than beside it. The semantic distinction is:

```text
CoreSpirit model ABI
        │
   ┌────┴────┐
   │         │
 general     AI
 model       model
   │         │
 typed       structured
 tensors     prediction view
```

An AI model may be implemented by Python, C++, Rust, WASM, ONNX or a remote host exactly like any other external model. `modelKind: "ai"` adds semantics; it does not add a second execution engine.

A canonical AI result is normalized into:

```text
prediction
  direction   = LONG | SHORT | FLAT
  probability = 0.78
  confidence  = 0.81
  regime      = TRENDING
  probabilities = { ... optional class probabilities ... }
  metadata    = { provenance, model facts ... }
```

The authority boundary remains:

```text
AI prediction
     ↓
structured model fact
     ↓
signal / strategy logic
     ↓
automation
     ↓
risk
     ↓
policy
     ↓
order intent
```

An AI prediction is never itself a trading decision and never has authority to approve risk, activate LIVE, submit an order, or mutate an account. The host-side `ai.load(...)` concept is implemented as a model-handle abstraction over the existing registry/orchestrator. Explicit version selection is required when a model has multiple registered versions so inference stays reproducible.

## 29. The model becomes a visualization source

Structured model output can become an explanation surface through the existing renderer-neutral scene graph:

```text
AI result
   ↓
model explanation projector
   ├── probabilitySurface
   ├── modelField
   └── regimeBand
   ↓
scene graph
   ↓
realtime visual patch
   ↓
web / desktop / replay / export renderer
```

The probability surface is an explanation surface, not an execution signal. It can show the predicted class probability and alternative class probabilities. The model field carries direction, probability, confidence, model identity, instrument/timeframe and request provenance. A regime band expresses contextual model output across the chart timeline.

These visualizations are serializable, metadata-rich and compatible with the existing scene identity/diff engine. The projection layer has no risk or broker authority. The model-to-signal path and model-to-visual path therefore share provenance but remain authority-separated:

```text
market data
   ↓
features
   ↓
model
   ├──────────→ structured signal fact → automation/risk path
   └──────────→ explanation surface → chart/IDE/replay
```



## 34. Numerical acceleration is a planner concern

GPU acceleration is deliberately **not** a new CoreSpirit language primitive. The language describes the computation; the host execution planner decides which numerical backend can safely perform eligible pure work.

The architecture is:

```text
CoreSpirit source
      ↓
Core IR + semantic graph
      ↓
execution planner
      ↓
┌───────────┬───────────┬───────────┐
CPU         WASM        GPU
baseline    portable    vectorized
deterministic            host-owned
      ↓
pure numerical work
      ↓
ordered CoreSpirit runtime
      ↓
visuals / signals / automation
```

The planner estimates workload from the compiled graph rather than from UI state. The primary dimensions are:

```text
symbols × timeframes × bars × pure instructions
```

This matters for scanners and research workloads such as:

```text
NIFTY500
  × 3 timeframes
  × 10,000 bars
  × multiple indicators
```

The planner can convert the workload into bounded batches and record an explicit assignment for each backend.

### CPU

CPU is the semantic baseline. It remains available as the deterministic fallback and retains effectful/stateful operations in hybrid execution.

### WASM

WASM is a portable host backend for pure numerical workloads where the host has a suitable runtime. It is not required for CoreSpirit correctness and is never assumed to exist.

### GPU

GPU is an optional vectorized backend. CoreSpirit does not claim that every GPU kernel is bit-for-bit deterministic. Therefore a plan that requires deterministic output can select GPU only when the host explicitly advertises a deterministic GPU profile.

When effects exist, the preferred design is hybrid:

```text
pure numerical nodes
       ↓
GPU / WASM

state / effects / outputs
       ↓
CPU CoreSpirit runtime
```

Visual creation, signals, automation, risk and policy do not move onto an accelerator merely because their upstream calculation was accelerated.

The planner is therefore a **placement and batching contract**, not a new execution engine. The actual CPU/WASM/GPU implementation remains outside CoreSpirit's language semantics.

### Accelerator selection is explainable

Every plan records:

- workload estimate;
- backend assignments;
- batch geometry;
- deterministic status;
- why CPU/WASM/GPU was or was not selected;
- whether execution is hybrid.

That information is intended for the debugger, profiler and scanner planner.

## 35. Capability-based sandbox is the security boundary

CoreSpirit should not become a general-purpose replacement for C++.

Its security model is an explicit capability allow-list:

```text
Program layer
      +
Execution target
      +
Host grants
      ↓
CoreSpirit sandbox
      ↓
exact capabilities for this run
```

The sandbox exposes only trading/application capabilities such as market data, series, visuals, models, signals, research data, scanning, webhooks, risk queries, policy evaluation, order-intent creation and approved numerical backends.

There is deliberately **no sandbox capability** for:

```text
raw network
filesystem
arbitrary process
native call
broker credentials
direct broker API
direct account mutation
```

These are not merely denied at runtime. They are absent from the CoreSpirit capability vocabulary so the language/runtime cannot use the sandbox API to manufacture them.

### Capability composition

A grant is the intersection of:

```text
program layer
       ∩
execution target
       ∩
explicit host grant
```

For example:

```text
research + research target + GPU grant
        ↓
compute-gpu is available
```

while:

```text
script + chart target + no GPU grant
        ↓
compute-cpu only
```

Trying to request an ungranted capability produces a typed `CoreSpiritCapabilityDeniedError`.

### Resource quotas

The sandbox also bounds resource consumption per revision:

```text
instructions
data requests
model calls
visual nodes
compute units
GPU memory
```

A quota breach is represented explicitly rather than being allowed to spill into an unbounded host process.

The sandbox is not itself an OS container or GPU driver. The host still owns those mechanisms. CoreSpirit receives only a bounded capability surface and a bounded resource budget.

### Acceleration never expands authority

This invariant is important:

```text
CPU capability
   ≠ broker authority

WASM capability
   ≠ network authority

GPU capability
   ≠ process authority
```

Changing the numerical backend must never change what the CoreSpirit program is legally allowed to observe or mutate. The backend is a compute placement decision only.

This gives TradingCoreOS a path to large-scale numerical acceleration without turning CoreSpirit into an unsafe general-purpose native runtime.

## 32. Visual compiler (#21): source → semantic graph → execution graph → visual graph

CoreSpirit is no longer conceptually limited to a sequential statement list. The compiler now derives graph metadata from the same lowered Core IR so the program can be reasoned about as a dependency system without changing the VM contract.

The compilation flow is:

```text
CoreSpirit source
      ↓
AST / semantic analysis
      ↓
stable Core IR
      ↓
semantic dependency graph
      ├───────────────┐
      ↓               ↓
execution graph   visual/output graph
      └───────────────┘
              ↓
         existing VM
```

The **semantic graph** contains one node for each executable IR instruction. Nodes record the instruction, source location, register dependencies, market/input dependencies, purity, and effect classification. This means the compiler can answer questions such as:

- which market fields can affect a signal;
- which calculations feed a visual object;
- which nodes are stateful;
- which operations are observable effects;
- which source line owns a runtime output.

The **execution graph** preserves the existing IR instruction order and side-effect barriers. It is deliberately conservative: graph compilation never reorders stateful operations merely because a dependency graph makes such reordering look possible. The stable VM remains the execution authority.

The **visual graph** is a projection of the semantic graph. Visual nodes, UI nodes, signal nodes and automation outputs are linked back to the calculations that produced them. This allows the IDE to move from a chart object to the calculation that generated it without inventing a second visualization runtime.

Graph metadata is attached to the executable artifact as optional IR metadata. Older artifacts without graphs remain valid, while newly compiled artifacts carry semantic, execution, visual and reactive plans. This preserves the one-language/one-compiler/one-IR/one-VM rule.

A canonical graph for:

```corespirit
fast = ema(close, 20)
slow = ema(close, 50)
cross = crossover(fast, slow)
if cross:
    signal("LONG")
plot(fast)
```

is conceptually:

```text
close
 ├── EMA20 ────────┐
 └── EMA50 ────────┤
                   ↓
               crossover
                ┌──┴──┐
                ↓     ↓
             signal   plot
```

The graph is an explanation/optimization substrate, not a new execution engine. The runtime still executes the validated Core IR.

## 33. Reactive CoreSpirit (#22): data event → affected graph → state update

The next runtime model is reactive rather than blindly recomputing every pure expression on every revision:

```text
DATA EVENT
    ↓
changed inputs
    ↓
dependency invalidation
    ↓
recompute affected pure nodes
    ↓
reuse unaffected pure nodes
    ↓
execute stateful/effect nodes in order
    ↓
update visual scene
    ↓
emit signal/event
    ↓
automation / risk / execution
```

The first implementation is deliberately conservative. Stateful or effectful operations remain executable barriers. They are never skipped merely because their current output appears unchanged; rollback-safe state advancement must remain correct. Pure calculations can be reused when neither their direct inputs nor any upstream dependency changed.

For example, if a realtime revision changes only volume while a pure node depends exclusively on a previously computed close-derived value, that node can reuse its cached result. If the close changes, the invalidation propagates through every dependent node until the affected visual/signal outputs are reached.

The reactive runtime maintains:

```text
committed runtime state
reactive dependency plan
per-node cached pure values
current dirty set
recompute/reuse/effect counters
```

The cache is not authoritative trading state. Before a speculative realtime revision, the normal runtime snapshot/rollback mechanism remains authoritative. On rollback the reactive cache is cleared so no speculative computation can leak into a later committed bar.

### Reactive safety rules

1. **Stateful operations are never skipped solely for performance.** Their state evolution remains part of the CoreSpirit runtime contract.
2. **Effects still execute deterministically.** Visual emissions, signal emissions, local-series updates, control flow and automation outputs preserve their existing order.
3. **Only pure calculations are reusable.** Cache reuse is a performance optimization, not a semantic shortcut.
4. **Rollback invalidates speculative reactive state.** A cache cannot make uncommitted bar state persistent.
5. **Capability boundaries remain unchanged.** Reactive scheduling cannot gain market-network, broker, risk, policy or live-execution authority.

The runtime exposes recompute/reuse/effect statistics so the visual debugger and future performance tooling can explain not only *what* recomputed, but *why* it was considered affected.

The long-term direction is to use the same graph for incremental chart updates, scanner batches, multi-symbol dashboards, model explanation surfaces and visual applications. The graph becomes the shared substrate; the stable Core IR remains the portable executable artifact.


## 36. Numerical acceleration without making GPU part of the language (#23)

CoreSpirit should be able to scale numerical workloads without turning the language into a GPU programming language. The source program describes semantics; the host execution planner decides placement.

```text
CoreSpirit source
      ↓
semantic graph + stable Core IR
      ↓
execution planner
      ↓
┌──────────┬──────────┬──────────┐
│   CPU    │   WASM   │   GPU    │
│ baseline │ portable │ optional │
└──────────┴──────────┴──────────┘
      ↓
pure numerical work
      ↓
ordered CoreSpirit VM / effect path
```

### The planner works from workload shape

The planner does not look at how many chart widgets are open. It estimates actual numerical work from the compiled program and the host workload dimensions:

```text
work units
≈ pure instructions
  × symbols
  × timeframes
  × bars
```

This makes scanner/research workloads naturally plannable:

```text
500 symbols
 × 3 timeframes
 × 10,000 bars
 × N pure computations
```

The planner can produce bounded batches with explicit symbol/timeframe/bar offsets. This is important for large scans because the host can schedule chunks, cancel them, retry them and collect results without creating 500 unrelated language runtimes.

### Backend rules

**CPU** is the semantic baseline and deterministic fallback.

**WASM** is a portable optional numerical backend. It is useful where the host wants a sandbox-friendly vectorized worker without requiring native GPU drivers.

**GPU** is an optional vectorized backend. GPU use is never assumed, and CoreSpirit does not pretend that arbitrary GPU floating-point execution is automatically bit-for-bit deterministic.

Therefore:

```text
requireDeterministic = true
        ↓
GPU allowed only if host profile says deterministic = true
        ↓
otherwise CPU/WASM fallback
```

### Hybrid execution

Most real CoreSpirit programs have effects:

```text
EMA
RSI
spread
probability
      ↓
   signal
      ↓
 visual / automation
```

The planner therefore supports:

```text
pure numerical nodes
        ↓
GPU / WASM

stateful / effectful nodes
        ↓
CPU CoreSpirit runtime
```

This does not move risk, signals, broker calls or visual authority onto the accelerator. The accelerator only computes data that the existing runtime is already allowed to compute.

### Why not "GPU everything"?

Because side effects and state transitions have ordering semantics. A GPU backend should not become a second VM. The planner is specifically a **placement/batching layer**, not a semantic execution engine.

The execution plan records:

- workload estimate;
- backend assignment;
- batch geometry;
- deterministic status;
- accelerator eligibility;
- hybrid effect placement;
- planner rationale.

That makes acceleration inspectable in the debugger/profiler and keeps optimization from becoming invisible runtime behavior.

### Host ownership

CoreSpirit does not implement CUDA, WebGPU, Metal, OpenCL, driver management or native device scheduling in the language runtime. Those are host concerns.

The contract is:

```text
CoreSpirit IR
      ↓
host planner
      ↓
host backend adapter
      ↓
CPU / WASM / GPU implementation
```

The actual GPU/WASM adapter is deliberately a later host milestone. v60 establishes the stable planning contract first.

## 37. Capability-based sandbox is part of the language architecture (#24)

CoreSpirit is intentionally not a general-purpose systems language. The VM should never acquire powers simply because the host happens to have them.

The sandbox is therefore an explicit capability composition:

```text
Program layer
       ∩
Execution target
       ∩
Explicit host grant
       ↓
CoreSpirit sandbox
```

A capability is available only when all three boundaries permit it.

### Safe capability vocabulary

The sandbox can grant controlled capabilities such as:

```text
market-data
series
visuals
interactive-ui
signals
models
research-data
scanner
webhooks
strategy-events
order-intents
risk-queries
policy-evaluation

compute-cpu
compute-wasm
compute-gpu
```

The following are intentionally **not capabilities**:

```text
raw-network
filesystem
arbitrary-process
native-call
broker-credentials
direct-broker-api
direct-account-mutation
```

This is stronger than a UI-level permission toggle. There is no CoreSpirit sandbox API through which a script can manufacture one of those powers.

### Example

A normal chart script gets:

```text
script + chart + default host grant
        ↓
series
market-data
visuals
interactive-ui
signals
compute-cpu
```

It does not automatically get GPU.

A host may explicitly grant:

```text
research + research + compute-gpu
```

and receive:

```text
compute-gpu
```

without receiving:

```text
filesystem
raw-network
broker
native-call
```

Changing the numerical backend never expands authority.

### Per-revision quotas

The sandbox carries explicit limits for:

```text
instructions
data requests
model calls
visual nodes
compute units
GPU memory
```

Each revision starts with a clean usage budget.

Quota failures are typed and observable rather than becoming silent host overuse.

### Accelerator authority rule

The critical security invariant is:

```text
CPU       ≠ broker
WASM      ≠ broker
GPU       ≠ broker
```

An accelerator can only compute the values already authorized by the current CoreSpirit program and host policy. It cannot acquire network access, launch processes, open files, call a native broker library, or mutate an account.

### Sandbox and execution targets

The sandbox does not replace the existing execution-target capability system.

They form two separate checks:

```text
Execution target:
    "may this environment use this class of capability?"

Sandbox:
    "was this exact capability granted to this run?"
```

This preserves the existing Script/Model/Strategy/Automation layer separation while making the final host grant explicit and auditable.

### Security consequence

CoreSpirit therefore remains a trading-native runtime rather than becoming an unsafe replacement for C++:

```text
safe numerical acceleration
        +
bounded host resources
        +
explicit capability grants
        +
no direct OS/broker powers
```

The long-term design can support larger scans and GPU-backed research without weakening the execution authority model established by the earlier stages.


## 38. The CoreSpirit v1 end state: one artifact, one runtime, many hosts

The long-term target is not "a bigger chart script language." It is a trading-native programming environment in which one program can travel through the full lifecycle:

```text
code
  ↓
canonical market data
  ↓
CoreSpirit compiler
  ↓
validated Core IR artifact
  ↓
reactive runtime
  ├── visuals
  ├── models
  ├── signals
  └── strategy / automation facts
  ↓
historical | replay | live | scanner | research
  ↓
event system
  ↓
signals | webhooks | automation
  ↓
risk
  ↓
order intent
  ↓
policy
  ↓
execution host
  ↓
broker
```

The critical property is **not** that every environment has identical infrastructure. The critical property is that every environment consumes the same semantic artifact and the same runtime contracts.

### The four-part v1 convergence

**1. One executable artifact**

Source is compiled once into the validated artifact. The artifact carries stable IR, source mapping, graph metadata and checksum identity. Historical, replay and realtime hosts do not compile alternate versions of the same source.

**2. One reactive execution substrate**

The reactive graph is an optimization and scheduling layer over the existing VM. Pure values can be reused when their dependency closure is unchanged; stateful and effectful work remains ordered. There is no "chart VM", "replay VM" and "scanner VM".

This gives the platform a scalable execution model:

```text
same semantic program
       ↓
different invalidated inputs
       ↓
different host workload shapes
       ↓
same CoreSpirit semantics
```

**3. One renderer-neutral scene graph**

Visuals are runtime data, not renderer calls. A scene contains stable node identity, semantic kind, layer/pane, payload, metadata and serializable interaction references.

Realtime execution uses:

```text
begin revision
      ↓
compute + emit scene
      ↓
scene diff
      ↓
VisualPatch
      ↓
commit or rollback
```

A renderer may be TradingView-like, canvas, WebGL, desktop, mobile or another future host. Those are projections of the scene graph rather than competing visual semantics.

**4. Deterministic replay as a truth surface**

Replay is more than a playback button. It is the platform's semantic verification mechanism:

```text
artifact checksum
       +
immutable dataset identity
       ↓
same VM
       ↓
same outputs/state/trace
       ↓
repeat
       ↓
same checksums
```

A deterministic replay record can therefore be used by tests, regression tooling, debugger sessions, model validation and future deployment checks.

### The end-state split between CoreSpirit and the host

CoreSpirit owns:

```text
language semantics
series/history semantics
indicator math
IR + VM
reactive scheduling
scene semantics
signals / strategy facts
model semantic contracts
replay semantics
explainability facts
```

The TradingCoreOS host owns:

```text
market/feed acquisition
exchange sessions/calendars
device/backend scheduling
Python/C++/WASM/ONNX/remote transports
rendering
webhooks/network delivery
risk
policy
credentials
broker connectivity
process lifecycle
persistent external side effects
```

This is why the platform can grow without turning the language into an operating system or a broker SDK.

### What platform depth means

The strategic comparison is architectural rather than feature-count based; CoreSpirit is designed as a complete trading-system language rather than a chart-only scripting surface.

A chart scripting language generally starts from:

```text
bars → indicators → plots
```

CoreSpirit starts from:

```text
market data
   ↕
stateful computation
   ↕
visual scene
   ↕
models
   ↕
signals/events
   ↕
replay/backtest/live
   ↕
risk/policy
   ↕
execution host
```

The language is therefore a **portable trading-system description**, not merely a plotting syntax.

### Acceptance criterion for v1

CoreSpirit v1 should be considered architecturally coherent when one canonical program can be:

1. compiled into one validated artifact;
2. executed by the shared runtime in historical/replay/realtime hosts;
3. projected into the same persistent scene model;
4. revised transactionally during a developing realtime bar;
5. replayed twice with identical deterministic checksums;
6. inspected through runtime/reactive statistics and debugger metadata;
7. routed into signals/events without gaining broker authority.

Anything beyond this—GPU production adapters, complete model transports, full scanner workers, exchange calendars, advanced renderer implementations and live broker adapters—is a host/product maturation layer, not a reason to fork the CoreSpirit execution model.

## 39. Programmable visual coordinate system: plot placement is not the visual foundation

CoreSpirit v62 makes visual placement and coordinate semantics first-class runtime data. The important architectural distinction is that **`plot()` is a convenience surface**, while the underlying scene model is programmable geometry plus explicit placement. This gives CoreSpirit two compatible ways to create visuals without maintaining two visual architectures.

### 39.1 Two APIs, one scene contract

The high-level form is optimized for the common indicator case:

```corespirit
plot(r, chart.price, bar_index > 100, range(0, 100), "#22c55e", 2, "RSI")
plot(rsi(close, 14), panel("Momentum"), true, range(0, 100))
```

Conceptually, these arguments mean:

```text
value
  + area
  + visibility condition
  + optional axis/range domain
  + style
  → series scene node with placement metadata
```

The lower-level form constructs semantic geometry directly:

```corespirit
line(point(time[2], high[2]), point(time, low), panel("Structure"))
box(point(time[3], high[3]), point(time, low[1]), panel("Structure"))
polygon(
    point(time[2], high[2]),
    point(time[1], low[1]),
    point(time, high),
    sidePanel("Geometry")
)
text("LONG", above_bar(2))
text("Risk: 0.25%", point(20, 20, "screen"), panel("Risk"))
customVisual(
    "risk-surface",
    "{\"schema\":\"risk\",\"version\":1}",
    point(0.25, 0.75, "normalized"),
    sidePanel("Risk")
)
```

Both routes become `CoreSpiritObject` values, then renderer-neutral scene nodes. There is therefore no hidden "plot renderer" that bypasses the real visual model.

The current v62 language surface uses positional semantic constructors rather than a named-argument grammar. The conceptual `area =`, `when =`, and `range =` notation describes the contract, while the implemented form passes the same information as typed values.

### 39.2 Areas are semantic destinations, not renderer handles

CoreSpirit defines four area families:

```text
chart
 ├── price
 ├── volume
 ├── indicator
 └── custom

panel("Momentum")
sidePanel("Risk")
floatingArea("Inspector")
```

An area identifies **where a visual belongs conceptually**. It does not expose DOM nodes, canvas contexts, WebGL objects, chart-library pane IDs, or widget references to the VM. Host renderers resolve the semantic area to a concrete viewport.

This separation matters because the same program can render into a desktop chart, browser surface, replay inspector, research notebook, or another renderer without changing language semantics.

### 39.3 Coordinate spaces are explicit

The visual contract currently defines six coordinate spaces:

| Space | Meaning | Typical use |
|---|---|---|
| `time` | timestamp on the horizontal trading axis; y remains price-oriented | lines, zones, annotations tied to bars |
| `bar` | bar index on the horizontal trading axis; y remains price-oriented | structural drawings using bar offsets |
| `price` | price-domain coordinates | price-relative geometry or price-space overlays |
| `percentage` | normalized 0–100 domain | panel-relative or percentage-based graphics |
| `screen` | host viewport/device coordinates | fixed-position UI/annotation geometry inside an area |
| `normalized` | normalized 0–1 coordinates | portable fractional positioning independent of viewport size |

A visual point carries its coordinate-space tag with the coordinates. A renderer performs the final transformation to pixels/device space. CoreSpirit never needs to know the viewport transform.

For example:

```corespirit
point(t1, p1)                     // time/price semantic point
point(bar_index - 20, p1, "bar")  // bar/price structural point
point(20, 20, "screen")            // fixed in-area viewport point
point(0.25, 0.75, "normalized")    // fractional in-area position
point(50, 75, "percentage")        // percentage-space position
```

### 39.4 Geometry is declarative and renderer-neutral

The v62 semantic geometry contract includes:

```text
point
line
box
polygon
```

A line is two typed points. A box is two typed corner points. A polygon is a bounded ordered point set. This is deliberately more general than a price/time-specific line primitive because the same geometry can live in a panel, side panel, normalized overlay, or future custom renderer.

Geometry validation also rejects mixed coordinate spaces inside one line, box, or polygon. A single object must have one coordinate interpretation so the host can apply one deterministic transform. This prevents ambiguous objects such as a time-space start point connected to a normalized-space end point.

The semantic geometry is retained even when the runtime also provides legacy `time`/`price` fields for compatibility with existing chart consumers. Legacy fields are compatibility projections; direct geometry is the authoritative expressive form for coordinate-aware objects.

### 39.5 Plot ranges describe scale intent, not pixels

`range(min, max)` is an axis-domain declaration. It does not mean "draw between these screen coordinates." A panel plot can therefore say:

```corespirit
plot(rsi(close, 14), panel("Momentum"), true, range(0, 100))
```

and communicate that its visual scale is the 0–100 domain while leaving actual axis layout, tick spacing, margins, and pixels to the host renderer.

This separation also makes ranges reusable by non-chart hosts such as research inspectors or model explanation surfaces.

### 39.6 Relative bar placement is a coordinate constructor

Bar-relative helpers express semantic anchoring without embedding renderer offsets:

```corespirit
text("LONG", above_bar(2))
text("STOP", below_bar(1))
text("ENTRY", at_bar(0))
```

The runtime records the relative position and bar offset. The host resolves that relationship against the active bar geometry. This means a label survives chart resizing, timeframe changes, and renderer replacement without turning its meaning into a fixed pixel coordinate.

### 39.7 Conditions and visibility are part of placement

A conditional plot is not implemented as "draw everything and hide it later." The `when` condition becomes semantic visibility on the visual placement:

```text
computed value
     ↓
placement { area, coordinateSpace, visible, range, clip }
     ↓
scene reconciliation
```

When visibility is false, the scene projection can omit the object for that revision instead of emitting a semantically visible object whose renderer must guess what to do. This keeps conditional visuals deterministic across historical, replay and realtime execution.

### 39.8 Clipping and viewport responsibility

The placement contract carries a clipping policy (`area` or `none`). This expresses semantic intent but does not expose a clipping rectangle or GPU scissor state. A host renderer decides the concrete clipping implementation for the target surface.

The same rule applies to screen and normalized coordinates: CoreSpirit may request a semantic coordinate space, but it does not receive viewport width, device pixel ratio, DOM measurements, or GPU resource handles as hidden inputs.

### 39.9 Custom visuals are an escape hatch without breaking the architecture

`customVisual(id, payload, ...)` provides a structured extension point for visuals not yet represented by a built-in geometry primitive. The payload is data, not executable renderer code. It may carry a schema/version and optional point placement, while the host adapter decides whether that schema maps to a heatmap, probability surface, order-flow widget, model explanation, or another renderer.

That allows the platform to grow from:

```text
line / box / polygon / text
```

to richer systems such as:

```text
liquidity heatmap
order-flow ladder
probability surface
regime band
trade path
structure graph
model explanation surface
```

without turning the CoreSpirit VM into a renderer SDK.

### 39.10 Stable scene identity remains mandatory

Coordinate-aware visuals still obey the existing scene identity and transaction rules:

```text
CoreSpirit output
      ↓
scene identity
      ↓
placement + geometry + payload
      ↓
diff
      ↓
VisualPatch
      ↓
commit / rollback
```

Changing a point, panel, range, visibility flag, or custom payload revises the same logical visual when its stable identity is unchanged. Realtime rollback removes speculative state without creating duplicate objects.

### 39.11 Coordinate semantics do not grant execution authority

Visual placement is observational. A screen-coordinate label, side-panel risk surface, heatmap, or custom renderer payload cannot authorize a signal, approve risk, create an order intent, call a broker, or open a network connection. The capability sandbox and execution boundary remain unchanged.

### 39.12 Why this is the right foundation

The resulting model is:

```text
CoreSpirit program
      ↓
semantic value / event / geometry
      ↓
area + coordinate space + range + visibility
      ↓
renderer-neutral scene graph
      ↓
host projection
      ↓
chart / panel / inspector / replay / research UI
```

So `plot()` remains ergonomic for ordinary indicators, while the architecture is no longer defined by plots. A single CoreSpirit program can place indicator series, structural drawings, model surfaces, automation status, and interactive inspection objects into multiple semantic regions while every object remains part of the same transactional scene model.

## 40. Visual placement does not fork CoreSpirit

The visual coordinate layer is intentionally an extension of the v1 scene graph rather than a new rendering runtime. Compiler lowering, Core IR, reactive scheduling, replay, debugger traces, scene identity, rollback, and capability checks continue to operate on the same execution artifact.

This gives the platform a clean evolution path:

```text
plot convenience API
       ↘
        visual coordinate contract
       ↙
point / geometry constructors
       ↓
scene graph
       ↓
renderer host adapters
```

No renderer implementation is required inside CoreSpirit to establish the semantic contract.



## 41. Core language unification: many capabilities, one language

CoreSpirit should be able to expose a large trading-native capability surface without turning every capability into a new mini-language. The v63 rule is therefore **subtraction through convergence**:

```text
friendly surface forms
        ↓
registered source transforms
        ↓
small executable grammar
        ↓
AST
        ↓
shared callable/member contracts
        ↓
semantic analysis
        ↓
one Core IR
        ↓
one VM
```

The user can still write ergonomic forms such as `input`, `crossesAbove`, `plot value`, or compact `if condition { ... }` blocks. Those are not alternate language runtimes. They are registered spellings that converge into the same core syntax before parsing.

### 41.1 The parser stays deliberately small

The parser's job is now even more sharply defined:

- parse declarations, expressions, calls, members, indexing and control flow;
- preserve source locations;
- report syntax diagnostics and recover where possible;
- never acquire chart-specific, strategy-specific or broker-specific semantics.

This is important because the size of the total platform is no longer a reason for the executable grammar to grow. Visuals, scanner operations, model calls, signals and UI remain calls over the same expression grammar.

### 41.2 Surface syntax is a registry, not a second compiler

`surfaceForms.ts` contains the concise source spellings and `syntax.ts` is only the generic transformation executor.

That means the syntax normalizer does not decide what a plot, signal, strategy or visual *means*. It only turns an accepted surface spelling into the canonical spelling accepted by the core parser.

The rule is:

> **Surface syntax may change spelling; it may not introduce a new execution model.**

This keeps future syntax additions reviewable. A proposal that requires its own parser branch, AST family, execution path or renderer-specific semantic stage is no longer "just syntax sugar"; it is a language architecture change.

### 41.3 Callable semantics are described once

Direct function descriptors now carry output information such as `emitKind`, while namespaced methods are described in a single member registry.

For example:

```text
plot(...)              → builtin descriptor → emit(plot)
signal(...)            → builtin descriptor → emit(signal)
webhook(...)           → builtin descriptor → emit(webhook)

visual.line(...)       → member contract → call(visual.line)
ui.panel(...).number  → member contract → call(ui.panel.number)
scan.emit(...)         → member contract → call + emit(scanCandidate)
```

The semantic analyzer uses the same contract for arity and return type. The compiler uses it for lowering and emission. The editor uses it for member completion.

This eliminates the previous failure mode where the same feature could be added independently to:

```text
syntax.ts
semanticAnalyzer.ts
compiler.ts
languageService.ts
```

and quietly drift out of sync.

### 41.4 `plot()` remains a convenience API

The unification does not remove the ergonomic plotting surface. It changes what `plot()` means architecturally:

```text
plot(...)
   ↓
call contract
   ↓
visual/output event
   ↓
scene placement + coordinate semantics
   ↓
persistent scene graph
```

`plot` is therefore a convenience function, not the definition of the visual system.

The same compiler machinery can lower a scalar calculation, a signal, a visual object, a scanner candidate or a workspace call without teaching the compiler a separate mini-language for each domain.

### 41.5 Why this matters for future growth

This architecture makes the language surface proportional to concepts rather than subsystems.

Adding a new renderer-neutral visual constructor should normally mean:

```text
1. add one callable/member contract;
2. add runtime behavior behind the existing call ABI;
3. add semantic validation;
4. add one contract test.
```

It should not require a new parser production plus a compiler allow-list plus an editor-only list plus an unrelated normalization rule.

That is the core subtraction principle for the next phase of CoreSpirit.

### 41.6 The boundary between language and host remains intact

Unification does not weaken the sandbox or execution boundaries. A shared call registry describes *what a program may request*; capability checks still determine *what the current host may actually provide*.

Therefore:

```text
language contract ≠ authority grant
language contract ≠ renderer implementation
language contract ≠ broker API
language contract ≠ model process
```

The host remains responsible for capabilities, quotas, rendering, market transport, model adapters, scanner scheduling and broker execution.

### 41.7 v63 acceptance rule

A future CoreSpirit feature is considered architecturally small only when its surface can converge into the existing parser/AST/IR path and its semantics can be declared through the shared callable/member contracts.

This gives CoreSpirit a useful discipline:

> **Grow capabilities, not languages.**


## 42. The six-concept CoreSpirit language

The platform underneath CoreSpirit is intentionally large. The language users write should not expose that platform as a matching number of concepts.

The user mental model is therefore reduced to:

```text
DATA
LET
WHEN
SHOW
MODEL
AUTOMATE
```

These are **semantic concepts**, not six new parser productions.

The implementation remains:

```text
friendly source surface
        ↓
registered surface lowering
        ↓
small core grammar
        ↓
AST
        ↓
semantic contracts
        ↓
Core IR
        ↓
VM
```

The objective is not to hide complexity by removing power. It is to keep the user's vocabulary stable while the platform grows underneath it.

### 42.1 DATA

**DATA** means read trading context without owning the transport.

Examples:

```corespirit
close
high
volume
market("NIFTY500").close
timeframe("1D").close
```

The DATA concept includes:

- canonical OHLCV series;
- time and bar context;
- symbol/timeframe references;
- host-provided depth/order-flow observations;
- historical and confirmed-only aligned data.

It does not mean:

```text
socket
broker API
database connection
filesystem
network client
```

The host still owns those implementations.

### 42.2 LET

**LET** creates a named value or derived series.

```corespirit
fast = ema(close, 20)
slow = ema(close, 50)
r = rsi(close, 14)
```

The concise assignment surface lowers to the existing `let` core grammar. There is no separate strategy-variable language, model-variable language, or visual-variable language.

This matters because the same value can feed:

```text
SHOW
WHEN
MODEL
AUTOMATE
```

without being copied into subsystem-specific representations.

### 42.3 WHEN

**WHEN** expresses a condition or an incoming automation event.

```corespirit
when crossesAbove(fast, slow):
    signal "LONG"
```

lowers to the same core control-flow form:

```text
if (crossover(fast, slow)) {
    signal("LONG");
}
```

An automation may also consume a named incoming event:

```corespirit
when "LONG":
    buy(1, "entry")
```

The runtime resolves the event through a host-provided event resolver. A consumed event is not the same thing as a signal being emitted. The event boundary therefore remains explicit and does not create hidden broker authority.

WHEN is the language-level simplification of:

```text
if
event guards
signal conditions
automation triggers
```

without creating separate control-flow constructs for each subsystem.

### 42.4 SHOW

**SHOW** means "project this value or visual fact into the renderer-neutral scene."

The simplest form is:

```corespirit
show fast, slow on price
show r on panel("Momentum")
```

At the language boundary this now becomes one semantic visual operation:

```text
show
 ↓
Core IR: emit(show)
 ↓
existing scene-compatible object
```

The important distinction is:

> **SHOW is the user concept. `plot()` is a compatibility/advanced API.**

The full scene graph still supports richer geometry, coordinate spaces, ranges, clipping, heatmaps, model fields, order-flow visuals and custom data-driven objects.

### 42.5 MODEL

**MODEL** declares that part of the program describes features and model outputs.

A compact declaration can therefore look like:

```corespirit
model "Regime":
    features:
        momentum = ema(close, 20)
        volatility = stdev(close, 20)
    predict regime
```

The v64 front end records this declaration as metadata on the same executable artifact. Feature expressions still use the normal LET/DATA path.

The declaration is deliberately **not** a second VM or a second model language. The actual model implementation remains behind the existing host-owned model ABI:

```text
CoreSpirit features
        ↓
semantic model declaration
        ↓
existing model ABI
        ↓
Python / C++ / Rust / WASM / ONNX / remote host
        ↓
typed model result
```

This keeps MODEL understandable to users while preserving the platform's strict model boundary.

### 42.6 AUTOMATE

**AUTOMATE** declares the event-to-intent part of the trading system.

```corespirit
automate "Momentum":
    when "LONG":
        buy(1, "entry")
```

The source describes an orchestration relationship, not a broker API.

Internally the path remains:

```text
incoming event
     ↓
AUTOMATE
     ↓
proposed order intent
     ↓
risk
     ↓
policy
     ↓
execution host
     ↓
broker adapter
```

The language does not expose credentials, sockets, account mutation or a broker-specific execution client.

The compact AUTOMATE concept therefore replaces several implementation-level ideas in the user's mental model:

```text
signal consumer
automation lifecycle
order-intent creation
risk handoff
execution handoff
```

Those platform mechanisms remain observable and explainable, but they are no longer required vocabulary for writing a basic automation.

### 42.7 One value, many projections

The strongest consequence of the six-concept model is that a value does not become a different kind of object merely because a different subsystem consumes it.

For example:

```corespirit
fast = ema(close, 20)
slow = ema(close, 50)
momentum = fast - slow

show fast, slow on price

when momentum > 0:
    signal "LONG"

model "Regime":
    features:
        momentum = momentum
    predict regime
```

The underlying `momentum` computation remains one runtime value/series. SHOW, WHEN and MODEL are different projections of that same state.

That is much closer to the architecture we want than having independent:

```text
plot language
strategy language
model language
automation language
```

### 42.8 Platform concepts are not language concepts

Internals such as:

```text
IR
reactive graph
scene graph
model ABI
execution planner
capability sandbox
event bus
automation lifecycle
risk engine
execution gateway
```

remain important engineering contracts, but they are deliberately absent from the basic source-language mental model.

This is the boundary:

```text
USER LANGUAGE
DATA / LET / WHEN / SHOW / MODEL / AUTOMATE
                         ↓
PLATFORM INTERNALS
AST / IR / VM / reactive runtime / scene graph /
model ABI / sandbox / risk / policy / execution hosts
```

The language should become easier even as the platform becomes more capable.

### 42.9 Surface syntax and executable semantics remain separate

A six-concept language does **not** mean six independent evaluators.

The acceptance rule is:

```text
DATA   → existing data/series semantics
LET    → existing bindings
WHEN   → existing control flow / event input
SHOW   → existing visual/output calls
MODEL  → existing feature computation + model ABI metadata
AUTOMATE → existing event + order-intent pipeline
```

If a future feature cannot be expressed through an existing semantic path and instead requires a new parser, AST, evaluator and runtime, that feature must be treated as an explicit language architecture milestone rather than quietly added as syntax sugar.

### 42.10 v64 rule

The product question for new language work is no longer:

> "What new function should we add?"

It is:

> "Which of the six user concepts does this belong to, and can it reuse an existing semantic path?"

That is the subtraction/unification rule for the next phase of CoreSpirit.


## 43. Six concepts are the language boundary, not six mini-languages

The six concepts are intentionally **semantic categories over one executable language**.

```text
DATA       → acquire/read canonical trading context
LET        → bind reusable values and series
WHEN       → branch on state or consume an input event
SHOW       → project state into visual scene semantics
MODEL      → describe feature/prediction intent
AUTOMATE   → connect events to order-intent orchestration
```

The platform underneath may contain dozens of registries and hosts, but those are implementation contracts. A user does not need a separate syntax vocabulary for charting, models, scanning, alerts and execution.

This has a practical compiler consequence:

```text
surface syntax
     ↓
surface lowering
     ↓
core AST
     ↓
shared semantic contracts
     ↓
Core IR
     ↓
VM
```

There must be one normalization entry point. `syntax.ts` is only the API boundary; the registered surface layer in `surfaceForms.ts` is the source of truth. A feature must not be able to introduce a second line-by-line normalizer merely because it belongs to a different subsystem.

That is the deeper v63/v64 lesson:

> **A small grammar is only valuable when there is also one small surface pipeline.**

### 43.1 MODEL and AUTOMATE stay declarative at the surface

MODEL and AUTOMATE can look like blocks because humans reason about features, predictions, triggers and intents as groups.

Their declarations are metadata and semantic bindings on the same executable artifact. They do not create:

```text
model parser
automation parser
model VM
automation VM
```

The runtime remains unified.

### 43.2 Advanced APIs remain real

The simplification is not the removal of power.

Expert users and platform code may still use explicit calls for:

```text
line
box
zone
heatmap
customVisual
plot
entry
exit
buy
sell
webhook
```

They are capability APIs, compatibility surfaces or implementation-level vocabulary. They are not independent language concepts.

> **Compatibility copy:** active content lives in `docs/01_CORESPIRIT.md`. This file is retained only because historical CI contracts reference this path.

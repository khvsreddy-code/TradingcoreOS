# CoreSpirit — How to Think, How It Works, and What Must Never Be Broken

CoreSpirit is the trading-native programming layer of TradingCoreOS. It is the only user-facing chart scripting language and is not a broker scripting API.

The core mental model is:

> **One language → one compiler → one stable IR → one VM → multiple execution environments.**

Charting, replay, research, strategy evaluation, and automation should share the same semantics rather than growing separate mini-runtimes.

## Current platform lock — v109

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


## v109 indicator definition and settings ABI

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

---

## 44. SHOW is the universal visual primitive

`SHOW` is now the canonical user-facing visual operation.

The source language should make these equivalent in spirit:

```corespirit
show ema(close, 20) on price
show rsi(close, 14) in panel "Momentum"
show resistance from [t1, p1] to [t2, p2]
show zone from 25100 to 25200
show signal "LONG" above bar
```

The important pipeline is:

```text
SHOW
 ↓
Core IR: emit(show)
 ↓
semantic visual object
 ↓
Scene Graph
 ↓
VisualPatch / renderer host
```

There is deliberately **no** intermediate requirement that SHOW become `plot()`, `line()` or `zone()` source calls.

Those APIs remain compatibility/advanced interfaces. SHOW is the common semantic front door.

### 44.1 SHOW of a value

```corespirit
show fast on price
show r in panel "Momentum"
```

The runtime creates normal scene-compatible series objects with placement metadata.

A condition can remain a WHEN-level concern:

```corespirit
when bar_index > 100:
    show fast on price
```

or use the compact modifier:

```corespirit
show fast on price when bar_index > 100
```

Both represent ordinary runtime control flow plus a visual projection.

### 44.2 SHOW of geometry

Geometry is selected semantically rather than by teaching every primitive as a top-level language concept.

```corespirit
show resistance from [t1, p1] to [t2, p2]
show support from [t3, p3] to [t4, p4]
show box at [0.1, 0.2] to [0.5, 0.8]
```

These lower to the single SHOW IR emission and produce existing line/box scene objects.

A visual object's semantic role can therefore be `resistance` or `support` without introducing a new runtime primitive for each trading concept.

### 44.3 SHOW of a region

```corespirit
show zone from 25100 to 25200
```

is a price-domain visual region.

The source expresses the meaning of the region, not fabricated hidden time endpoints. The scene payload carries viewport/domain intent so the host can stretch the region over the appropriate chart domain.

### 44.4 SHOW of a signal visualization

```corespirit
show signal "LONG" above bar
```

creates a visual signal marker/label.

That is intentionally different from:

```corespirit
when condition:
    signal "LONG"
```

The first is a visual projection. The second is an event emitted into the signal boundary.

The same trading fact may therefore be both:

```text
signal event
     +
visual explanation
```

without confusing rendering with automation authority.

### 44.5 Why `plot()` remains

`plot()` is useful as a compatibility/API function and for generated code, migration tools and expert users.

It is not the language foundation.

That gives CoreSpirit a stable product rule:

> **SHOW is the visual concept; plot/line/box/zone/... are implementations or expert APIs.**

---

## 45. Coordinate systems should disappear for normal code

The coordinate contract remains rich:

```text
time
bar
price
percentage
screen
normalized
```

but normal users should rarely need to specify a space.

### 45.1 Inference by source shape

```corespirit
show line from [t1, p1] to [t2, p2]
```

is inferred as time/price geometry.

```corespirit
show box at [0.1, 0.2] to [0.5, 0.8]
```

is inferred as normalized geometry because both points are ordinary 0..1 pairs.

The lowering makes that inference explicit before execution:

```text
[t1,p1]       → point(..., "time")
[0.1,0.2]     → point(..., "normalized")
```

This means the renderer never has to guess.

### 45.2 Explicit coordinate escape hatch

Advanced code can still write:

```corespirit
point(x, y, "screen")
point(x, y, "normalized")
point(x, y, "percentage")
```

Explicit coordinate spaces are an escape hatch, not the normal syntax.

### 45.3 No silent coordinate mixing

Once resolved, a geometry object has one coordinate space.

```text
time → time        valid
normalized → normalized   valid
time → normalized  invalid
```

The validation rule remains mandatory even for advanced APIs.

### 45.4 Area inference and coordinate inference are separate

`panel("Momentum")` decides **where** the object lives.

The coordinate space decides **how its geometry is interpreted within that area**.

This separation prevents the visual system from becoming a pile of chart-specific shortcuts.

### 45.5 The design pattern

This is the general CoreSpirit UX rule:

> **Powerful underneath, inferred above, explicit only when ambiguity matters.**

That rule should apply beyond visuals to data alignment, model bindings, automation intent and future language additions.

---

## 46. v65 acceptance rule

A visual language addition is considered successful only when it answers three questions:

```text
1. What SHOW semantic does the user mean?
2. Which coordinate/area semantics are inferred or explicit?
3. Which existing Scene Graph object represents the result?
```

If the answer requires a new top-level visual language concept, another visual evaluator, or device-specific coordinate logic inside the VM, the feature is not considered a small extension.



The v65 release defines a **universal SHOW visual primitive**: visual source forms converge through one Core IR emission and the existing renderer-neutral scene graph.


v65 makes this a **single surface pipeline**: `syntax.ts` delegates to the registered `surfaceForms.ts` normalizer so no feature can create a competing pre-parser.


## 47. SHOW should own the visual surface

v66 makes the earlier v65 idea deeper: `show` is not merely one more builtin. It is the **language-level visual intent boundary**.

The user says what should be visible:

```corespirit
show ema(close, 20) on price
show rsi(close, 14) in panel "Momentum"
show line from [t1, p1] to [t2, p2]
show zone from 25100 to 25200
show signal "LONG" above bar
```

The compiler/runtime decides how that intent becomes renderer-neutral visual state.

The canonical flow is:

```text
SHOW source
   ↓
surface semantic intent
   ↓
one Core IR `show` emission
   ↓
runtime visual projection
   ↓
private Scene Graph
   ↓
host renderer
```

The important subtraction is that users do not need separate mental models for:

```text
plot
line
box
zone
label
marker
heatmap
...
```

Those remain compatibility/advanced capabilities. The language concept is SHOW.

### 47.1 SHOW modifiers are semantic, not scene fields

`on price`, `in panel "Momentum"` and `when ...` describe intent.

They do **not** expose:

```text
layer
pane
zIndex
parent
nodeId
```

The runtime owns those implementation decisions.

### 47.2 One visual evaluator

Every SHOW shape travels through the same runtime emission kind.

There is no:

```text
series evaluator
line evaluator
box evaluator
zone evaluator
```

as separate language runtimes.

The semantic kind may differ, but the execution authority is one:

```text
Core IR → VM → visual projection
```

That is what keeps advanced visuals from becoming another family of mini-languages.

---

## 48. Coordinate inference should be centralized

The v65 rule "powerful underneath, inferred above" becomes a concrete compiler contract in v66.

The source can use concise pairs:

```corespirit
show line from [time[2], low[2]] to [time, high]
show line from [bar_index, low] to [bar_index, high]
show box at [0.1, 0.2] to [0.5, 0.8]
```

The compiler resolves them before execution:

```text
[time[2], low[2]]      → time space
[bar_index, low]       → bar space
[0.1, 0.2]             → normalized space
```

The inference result is deterministic and explicit.

### 48.1 Conservative inference

Inference has intentionally small rules:

```text
both x/y are numeric literals in 0..1 → normalized
x is bar-like                    → bar
otherwise                         → time/price geometry
```

The runtime never sees an unresolved "maybe this is screen space" decision.

### 48.2 Explicit escape hatch

Advanced code can still use:

```corespirit
point(x, y, "screen")
point(x, y, "percentage")
point(x, y, "normalized")
```

That does not create a second visual language. It is the typed escape hatch of the same visual semantic system.

### 48.3 Coordinate inference is not device conversion

CoreSpirit may say:

```text
time / bar / price / normalized / percentage / screen
```

but it never says:

```text
pixel x=812
pixel y=346
DOM node #42
WebGL buffer 17
```

Host renderers own device/view conversion.

---

## 49. Scene Graph encapsulation

The Scene Graph is internal architecture

This is the explicit v66 rule:

> **Scene Graph = compiler/runtime concern, not a user language concept.**

The internal graph may still contain:

```text
layer
pane
zIndex
node identity
source identity
anchor
parent
time range
style
payload
metadata
interaction
placement
```

That remains excellent implementation machinery.

But the primary runtime API now exposes:

```text
visual summary
revision
checksum
object count
visual update counts
```

rather than graph topology.

### 49.1 Why this matters

A user should be able to write:

```corespirit
show liquidityZones
```

without learning:

```text
create node
assign layer
assign pane
set zIndex
attach parent
attach interaction
```

The compiler/runtime performs those decisions from semantic visual intent.

### 49.2 Public boundary

The public visual projection boundary is now:

The public visual boundary is now:

```text
CoreSpirit source
      ↓
visual semantics
      ↓
visual summary / update
```

while:

```text
visual summary/update
      ↓
private Scene Graph
      ↓
renderer adapter
```

belongs to platform implementation.

This lets the renderer ABI evolve without forcing language evolution.

### 49.3 The same principle applies elsewhere

The rule is broader than visuals:

```text
user concept
   ↓
semantic contract
   ↓
platform implementation
```

Users should not have to learn:

```text
IR opcodes
reactive dependency graphs
model ABI transport
risk authority checks
GPU planner assignments
scene graph topology
```

unless they are building platform infrastructure.

That is the desired CoreSpirit abstraction boundary.


## 50. MODEL should be a declarative language concept, not an ABI tutorial

The model architecture is deliberately split into two layers:

```text
User language
    MODEL
      ↓
binding + input/output intent
      ↓
Core expression / IR
      ↓
host model boundary
      ↓
strict model ABI
      ↓
Python / C++ / Rust / WASM / ONNX / remote
```

### 50.1 What a user should have to understand

The common case is intentionally small:

```corespirit
model "Regime":
    use "nifty-regime-v3"

    input:
        price: number
        volume: number
        volatility: number

    output:
        regime: string
        confidence: number
```

The declaration answers only four questions:

1. Which logical model is being used?
2. Which input values belong to that model?
3. Which outputs can the program refer to?
4. What basic types are those values?

Everything else is platform machinery.

### 50.2 Bindings are opaque to the language runtime

A registry binding:

```corespirit
use "nifty-regime-v3"
```

means "use the host-resolved model identified by this logical locator."

An external binding:

```corespirit
use python "models/regime.py"
```

means "the host has an implementation locator for this model."

The VM does **not** interpret that path, import Python, spawn a process, open a socket, read the filesystem, or obtain broker authority. The binding is immutable metadata attached to the executable artifact and passed to the host resolver.

This keeps the surface simple without weakening the security boundary.

### 50.3 Model outputs are ordinary language values

A user can write:

```corespirit
when Regime.confidence > 0.8:
    show Regime
```

The source-level qualified member is normalized to the existing expression grammar:

```text
Regime.confidence
      ↓
model("Regime").confidence
      ↓
call model
      ↓
call __model_get
      ↓
host resolver
```

There is no model-specific expression evaluator.

Declared output names are checked statically. Optional field types can further constrain the expression. When no explicit type is supplied, CoreSpirit may use conservative semantic defaults for familiar fields such as confidence/probability or regime/direction.

### 50.4 SHOW makes models another visual source

The same model value can cross directly into the universal SHOW primitive:

```corespirit
show Regime
```

This does not create `showModel()` or a model-specific visual subsystem.

Internally:

```text
MODEL result
   ↓
SHOW
   ↓
Visual IR
   ↓
private Scene Graph
```

The model therefore participates in the same visual, replay, reactive and renderer-neutral pipeline as indicators and other data.

### 50.5 The ABI remains underneath

The strict ABI continues to define:

- model identity/version
- typed tensor input/output schemas
- deterministic execution
- state and rollback tokens
- request/output checksums
- model quotas
- capability declarations
- implementation/transport adapters
- Python/C++/Rust/WASM/ONNX/remote integration
- AI semantic mappings

Those details are intentionally absent from the common source-language model. The public contract is therefore **typed MODEL fields + opaque model binding + ABI remains internal**, and the editor provides **MODEL output completion** without exposing adapter machinery.

The architectural rule is:

> **MODEL is a declarative contract in CoreSpirit; model execution is a host capability governed by the strict ABI.**

### 50.6 Editor support follows the same abstraction

The language service knows MODEL declarations well enough to complete:

```text
Regime.
```

with the declared outputs and their optional types.

It does not expose the adapter class, ABI version, transport, process, or filesystem mechanics as required source concepts.

### 50.7 Input binding is intentionally host/runtime work

The declaration can name `price`, `volume` and `volatility` without forcing the user to construct ABI tensors manually.

The next host-layer step is automatic binding:

```text
DATA / LET
   ↓
declared MODEL inputs
   ↓
typed ABI features
   ↓
model adapter
```

That mapping belongs to the execution host and model orchestration layer, not the core grammar.

## v67 acceptance rule

A CoreSpirit user should be able to declare and consume a model without learning the words "ABI", "adapter", "transport", "state token", "quota" or "Python process". Those remain platform internals while the resulting model value remains deterministic, typed where declared, replayable and capability-bounded.



## 51. Automation stays simple above a hard execution boundary

CoreSpirit AUTOMATE is intentionally a user-facing orchestration concept, not a broker API tutorial.

The language describes intent:

```corespirit
automate "Momentum":
    when "LONG":
        order long 1% risk
        stop 1.5 atr
        target 3 atr
```

The platform expands this internally to:

```text
AUTOMATE
   ↓
Order Intent
   ↓
Risk
   ↓
Policy
   ↓
Execution Host
   ↓
Broker Adapter
```

The source language therefore never needs to expose lifecycle state, authority records, risk-engine interfaces, venue clients or broker credentials. Those mechanisms remain mandatory platform boundaries and remain observable through automation explainability rather than becoming source vocabulary.

The concise action may also be written as a structured block:

```corespirit
order:
    side: long
    risk: 1%
    stop: 1.5 atr(14)
    target: 3 atr(14)
```

Both forms lower to the same canonical order-intent representation.

## 52. One ORDER concept replaces entry/exit/buy/sell at the surface

`entry()`, `exit()`, `buy()` and `sell()` historically represented different source actions, but the platform ultimately needs one data structure: a proposed order intent.

CoreSpirit therefore promotes:

```corespirit
order long 1% risk
order short 5 quantity
order exit all
```

to the primary AUTOMATE vocabulary.

A canonical intent contains semantic data rather than an execution verb:

```text
side
sizing
stop
 target
tag
reason / metadata
```

Sizing is explicit:

```text
quantity     → fixed units; risk engine may reduce it
riskPercent  → portfolio/account risk budget; risk engine resolves quantity
all          → close/flatten semantic intent; host resolves actual venue action
```

This distinction is important. `1% risk` is not silently converted into a quantity inside the VM. The VM proposes the risk-sized intent; the risk engine resolves or rejects the executable quantity.

Likewise `order exit all` is not a broker-side `sell all` command. It is a semantic flatten intent. The execution host is responsible for translating that intent into venue-specific close behavior.

Legacy `entry`, `exit`, `buy` and `sell` APIs remain compatibility paths so existing artifacts do not lose meaning, but they are no longer the conceptual language model.

## 53. AUTOMATE order safety invariants

The simplification at the language boundary does not relax execution safety.

1. `order` is available only to AUTOMATE execution layers.
2. Every order is a proposed intent before risk.
3. Risk must approve or reduce executable quantity before policy.
4. Policy must authorize before execution.
5. The execution host remains the only broker-facing authority.
6. `riskPercent` and `all` do not receive arbitrary quantity semantics from the VM.
7. No order surface can carry broker credentials, sockets, filesystem handles or native execution clients.
8. Realtime/replay revisions can propose intents, but only committed/authorized host state can progress toward live execution.

The resulting design is deliberately asymmetric:

```text
language: simple
runtime: structured
risk: authoritative
execution: host-owned
```

That is the intended CoreSpirit abstraction boundary.

## 54. Surface equivalence is a release invariant

Every future user-facing order spelling must lower to the same `orderIntent` semantic emission path. A new spelling must not create a new VM instruction, executor, or broker integration.

Examples that are intentionally equivalent:

```corespirit
order long 1% risk
```

```corespirit
order:
    side: long
    risk: 1%
```

They both produce the same order-intent schema before the risk engine.


## 55. AUTOMATE is simple above a mandatory authority chain

The source language should not expose the platform control plane.

```corespirit
automate "Momentum":
    when "LONG":
        order long 1% risk
        stop 1.5 atr
        target 3 atr
```

This is intentionally a compact description of desired behavior. It lowers to one proposed order intent and then enters the existing authority pipeline:

```text
AUTOMATE
   ↓
Order Intent
   ↓
RISK
   ↓
POLICY
   ↓
EXECUTION HOST
   ↓
BROKER
```

The language does not need to teach the user the lifecycle state machine, authority checksum, policy engine or venue adapter. Those remain platform internals and remain observable through explainability/debugging.

## 56. `order` is the universal automation action

`entry()`, `exit()`, `buy()` and `sell()` are implementation-era spellings for the same underlying semantic need: propose an order intent.

CoreSpirit therefore promotes a single action:

```corespirit
order long 1% risk
order short 5 quantity
order exit all
```

The equivalent structured form is:

```corespirit
order:
    side: long
    risk: 1%
    stop: 1.5 atr(14)
    target: 3 atr(14)
```

Both lower to the same `orderIntent` representation.

## 57. Intent data, not broker commands

A universal order intent contains semantic information:

```text
side
sizing
stop
 target
tag
metadata
```

Sizing has three meanings:

```text
quantity     → proposed fixed quantity
riskPercent  → proposed account/portfolio risk budget
all          → proposed flatten/close intent
```

`riskPercent` must not be turned into a quantity by CoreSpirit itself. The risk engine owns that resolution and may approve, reduce or reject it.

Likewise `all` must not be hard-coded to `sell`. Closing a position is a semantic operation whose final venue-side action depends on the actual position and execution host.

This is why the intent object is the correct abstraction boundary: it is rich enough for automation while still being inert until the host control plane authorizes it.

## 58. Compatibility does not create a second execution language

Existing programs may still contain:

```text
entry(...)
exit(...)
buy(...)
sell(...)
```

Those spellings remain supported for artifact compatibility, but they map into the same canonical order-intent representation.

There is therefore only one order semantics in the runtime:

```text
legacy order spelling ─┐
canonical `order` ─────┼──→ orderIntent → risk → policy → execution
future shorthand ─────┘
```

A new surface spelling is accepted only if it reduces to the same intent schema. That rule prevents automation from becoming another collection of mini-languages.

## 59. Realtime and replay use the same order semantics

Because `orderIntent` is data rather than an immediate broker call, the same representation can exist in historical, replay and realtime evaluation.

```text
replay/realtime revision
        ↓
proposed order intent
        ↓
rollback-safe state
        ↓
commit / authority checks
        ↓
host risk + policy + execution
```

This keeps the language deterministic and makes automation decisions inspectable before any live-side effect is permitted.


## v68 acceptance rule

A CoreSpirit automation author should need to understand only the declarative `AUTOMATE` and `order` concepts. The platform may retain a detailed risk, policy, lifecycle and execution architecture underneath, but those internals must not become required source-language knowledge. Every new order surface must lower to the same broker-neutral order intent before the host-owned authority chain is entered.


## 60. EVENT is one semantic boundary for signals, alerts, webhooks and notifications

The user-facing language does not need separate concepts for `signal`, `alert`, `webhook`, `emit` and `event`.

The preferred surface is:

```corespirit
emit "LONG"
```

A named event is immutable runtime data. It is not a network request and it is not a broker action.

The event travels as:

```text
CoreSpirit source
      ↓
immutable EVENT
      ↓
host-owned routing
      ├── webhook
      ├── notification
      ├── alert
      └── automation
```

Routing may be declared compactly:

```corespirit
route "LONG" to webhook "my-server"
route "LONG" to notification
route "LONG" to automation "Momentum"
```

or attached to one emission:

```corespirit
emit "LONG" to:
    webhook "my-server"
    automation "Momentum"
    alert
```

The compiler records routing as serializable surface metadata. The VM produces the event and cannot open a socket, invoke a broker, or perform the destination's side effect.

This is intentionally the same abstraction pattern used by MODEL and AUTOMATE:

> **simple source intent, structured platform contract, host-owned authority.**

Legacy `signal()`, `alert()` and `webhook()` calls remain compatibility APIs, but new language design should normally extend the single EVENT boundary instead of adding another destination-specific verb.

## 61. WHEN is the central reactive construct

`WHEN` is the source-language gateway into reactive behavior.

The same construct can react to:

```corespirit
when crossover(fast, slow):
    show "LONG"

when bar closes:
    emit "BAR-CLOSE"

when fill:
    emit "FILLED"

when Regime.confidence > 0.8:
    emit "TREND-CONFIDENT"

when price enters zone:
    emit "ZONE-ENTER"

when webhook "risk-update":
    emit "RISK-UPDATE"
```

The important distinction is that these are not six execution mechanisms.

They lower into one of two forms:

```text
WHEN + ordinary expression
        ↓
existing conditional IR
```

or:

```text
WHEN + named host event
        ↓
event(name)
        ↓
host event resolver
        ↓
existing conditional IR
```

Therefore the VM has no event-specific executor for fills, webhooks, bar closes or model thresholds.

### Event sources

The host may provide truth for event names such as:

```text
LONG
BAR-CLOSE
fill
price.enters.zone
webhook:risk-update
```

The exact detection of a fill, price-zone transition, webhook arrival or exchange-specific lifecycle event remains host-owned because those sources depend on external state.

### Expression-driven WHEN

Model output thresholds and market predicates remain normal language expressions:

```corespirit
when Regime.confidence > 0.8:
    show Regime
```

```corespirit
when crossesAbove(fast, slow):
    emit "LONG"
```

No separate model trigger language or indicator trigger language is required.

### Realtime and replay

`WHEN` does not bypass transactional execution.

```text
new input/revision
      ↓
evaluate WHEN
      ↓
produce provisional outputs/events
      ↓
rollback or commit
```

A host may therefore replay the same event state deterministically, and a realtime revision can be discarded without accumulating event-side state.

## 60. Universal EVENT boundary

CoreSpirit exposes a **universal EVENT boundary** for named events, signals, alerts, webhooks, notifications and automation triggers. The event value is immutable; destination routing remains host-owned.

## v69 language rule

The preferred mental model is now:

```text
DATA
LET
WHEN
SHOW
MODEL
AUTOMATE
```

with `EVENT` treated as a shared runtime value/boundary rather than a seventh top-level source block.

`emit` produces an EVENT. `when` can consume an EVENT. Routing determines destinations. The platform owns delivery mechanics.

The architectural rule is:

> **one event concept, many destinations; one reactive construct, many event sources.**

This prevents the language from growing a new keyword or mini-language every time TradingCoreOS adds another event-producing or event-consuming subsystem.

## v70 implementation record — composability + progressive simplicity

CoreSpirit now treats **composability as a language invariant**, not merely a feature idea. The existing six concepts still converge into the same compiler/IR/VM path, but their values and events can be connected across boundaries:

```text
indicator/value
     │
     ├──────────────► SHOW
     │
     ├──────────────► WHEN
     │
     ▼
   MODEL
     │
     └──────────────► WHEN / SHOW

EVENT ──────────────► WHEN ──────────────► AUTOMATE ──────────────► ORDER INTENT
```

### The composition rule

A CoreSpirit author should be able to build a program incrementally without switching languages or runtimes:

```corespirit
show ema(close, 20)
```

then:

```corespirit
fast = ema(close, 20)
slow = ema(close, 50)
show fast, slow

when crossesAbove(fast, slow):
    emit "LONG"
```

then a model can become another producer of ordinary values:

```corespirit
model "Regime":
    use "nifty-regime-v3"
    output:
        regime: string
        confidence: number

when Regime.confidence > 0.8 and momentum > 0:
    emit "LONG"
```

and automation consumes the same event boundary:

```corespirit
automate "Momentum":
    when "LONG":
        order long 1% risk
```

There is no indicator runtime, model runtime, event runtime and automation runtime that the user must learn separately. These are **composable contracts around the same executable artifact**.

### Composition graph

v70 attaches a serializable composition graph to surface metadata. It records nodes such as `indicator`, `model`, `event`, `condition`, `automation`, `order-intent` and `show`, plus edges such as `feeds`, `triggers`, `renders` and `routes`.

The graph is descriptive only. It does not execute code, access a broker, resolve network destinations, or create a second evaluator. The existing compiler, stable IR and VM remain authoritative.

### Progressive simplicity

CoreSpirit should feel like a language that grows with the user:

1. **One line:** `show ema(close, 20)`
2. **Two values:** calculate `fast` and `slow` and show them.
3. **Reactive behavior:** `when crossesAbove(fast, slow): emit "LONG"`.
4. **Model enrichment:** use typed model outputs inside ordinary expressions.
5. **Automation:** consume named events and create canonical order intents.
6. **Deployment:** compile once and deploy the same artifact to the active chart.

Every step is shorthand over the same semantic pipeline. There is no hidden beginner evaluator and no separate automation language.

### UI surface

The chart-side CoreSpirit editor remains the fast `Create → Compile → Deploy to chart` path. In v70 the product accent is blue rather than green. Trading-positive/negative colors remain semantic chart colors rather than being used as the product theme.

## v70 architectural deepening — complexity firewall (#15) + invisible superpowers (#16)

The next refinement of CoreSpirit is not to add more user-facing concepts. It is to make a deliberate distinction between **semantic concepts authors need to understand** and **implementation mechanisms the platform must preserve underneath**.

The governing rule is:

> **Hide mechanisms, expose meaning.**

A CoreSpirit author should be able to express a trading idea without learning how the compiler represents it, how the VM schedules it, how a renderer materializes it, how a model is transported, or how a broker eventually receives an execution request.

This is a complexity firewall, not an abstraction leak. The hidden systems remain strongly typed, testable, deterministic and capability-restricted; they simply do not become part of the public language vocabulary.

### 15. What should be removed from the user's conceptual burden?

The following concepts may remain fully implemented internally, but should not be required knowledge for normal CoreSpirit programming:

| Internal mechanism | Public-language policy |
|---|---|
| Core IR details | Hidden; authors write source semantics, not IR instructions. |
| Execution-target syntax | Hidden behind deployment/host selection; the same artifact remains portable. |
| Scene-node syntax | Hidden behind `SHOW`; advanced visual APIs remain secondary compatibility surfaces. |
| Renderer concepts | Hidden; CoreSpirit produces renderer-neutral visual semantics. |
| Host capabilities | Hidden from ordinary source; capability enforcement remains a host/runtime concern. |
| Broker concepts | Hidden behind order intent, risk and policy boundaries. |
| Model transport details | Hidden behind `MODEL` and the typed external-model ABI. |
| Webhook transport details | Hidden behind EVENT routing and host delivery. |
| Automation lifecycle mechanics | Hidden behind declarative `AUTOMATE`; lifecycle state remains platform governance. |
| Coordinate-space mechanics | Hidden unless the author actually needs explicit placement. |
| Visual patch/diff mechanics | Hidden behind the visual runtime and transactional scene projection. |
| CPU/GPU/WASM selection | Hidden behind host execution planning and capability negotiation. |
| Execution-planner concepts | Hidden; authors describe computation, not scheduling strategy. |
| Risk-policy plumbing | Hidden behind the authoritative risk/policy boundary. |

This does **not** mean these mechanisms are unimportant. The opposite is true: they are important enough that the user should not be able to accidentally bypass them.

The public language should therefore remain centered on:

```text
DATA
LET
WHEN
SHOW
MODEL
AUTOMATE
```

with EVENT functioning as a shared runtime value/boundary rather than becoming another general-purpose language subsystem.

#### Why hiding these mechanisms improves the language

If an author has to understand IR nodes before writing a signal, scene nodes before showing an indicator, transport adapters before calling a model, or broker objects before expressing an order, the implementation architecture has leaked into the language.

That creates several forms of conceptual debt:

1. **Vocabulary debt** — every implementation subsystem becomes another term to learn.
2. **Portability debt** — source begins to depend on a particular host or renderer.
3. **Security debt** — powerful implementation handles become tempting source-level capabilities.
4. **Compatibility debt** — internal refactors become language-breaking changes.
5. **Teaching debt** — beginner examples must explain infrastructure before they explain trading logic.
6. **Composability debt** — every subsystem starts looking like a separate mini-language.

CoreSpirit should absorb that complexity at the compiler/runtime/host boundary instead.

#### The progressive disclosure rule

Advanced users may eventually inspect diagnostics, source maps, model metadata, visual metadata, execution traces and runtime graphs. Those are **inspection surfaces**, not new programming concepts.

The distinction is:

```text
AUTHORING SURFACE
    ↓
meaningful CoreSpirit concepts

INSPECTION SURFACE
    ↓
compiler / IR / graph / runtime details

HOST SURFACE
    ↓
transport / renderer / broker / process / device mechanics
```

The deeper layers may be visible to developers and platform engineers without becoming mandatory language knowledge.

### 16. What must not be removed

Simplifying the language must never simplify away the architectural boundaries that make the platform safe, deterministic and extensible.

These are **invisible superpowers**: capabilities the user benefits from without having to program against their machinery.

#### VM → broker is forbidden

The VM may produce deterministic facts, events and broker-neutral intents. It must never acquire broker credentials or call a venue API directly.

```text
CoreSpirit source
      ↓
     VM
      ↓
order intent
      ↓
risk / policy
      ↓
execution host
      ↓
broker
```

The broker boundary is therefore an authority boundary, not merely an implementation detail.

#### MODEL → broker is forbidden

A model may calculate or return typed facts such as regime, probability or confidence. It cannot approve an order, mutate account state, or submit a broker request.

```text
MODEL
  ↓
typed model fact
  ↓
CoreSpirit logic
  ↓
EVENT / strategy intent
  ↓
automation
```

This keeps model providers interchangeable and prevents external inference infrastructure from becoming an execution authority.

#### INDICATOR → broker is forbidden

Indicators remain measurement/computation primitives. An indicator may feed SHOW, LET, WHEN or MODEL inputs, but it does not receive broker authority.

This preserves the distinction between:

```text
measurement → decision logic → risk → execution
```

rather than collapsing all four into a single callable primitive.

#### Risk before execution is mandatory

The user-facing `order` surface creates a canonical order intent. It does not mean an order has been approved or submitted.

Risk, policy, account constraints, venue rules and execution-host checks remain downstream authorities. This protects the language from accidentally becoming an account-mutation API.

#### Renderer-neutral visuals must remain

`SHOW` expresses semantic visual intent. Scene graphs, visual patches, GPU APIs, canvas/WebGL/WebGPU handles and browser-specific renderer state remain below the CoreSpirit boundary.

This allows the same artifact to project into chart, replay, research or future visual hosts without rewriting the language around a particular rendering technology.

#### Deterministic replay must remain a truth surface

The same validated artifact and dataset identity must produce reproducible semantic results under replay, subject to explicitly modeled external inputs.

Replay is not merely a testing convenience. It is the architecture's protection against hidden state, nondeterministic scheduling and accidental host leakage.

#### One IR / one VM must remain

Simplification must never become a reason to create:

```text
beginner VM
indicator VM
model VM
automation VM
visual VM
```

or any equivalent collection of mini-runtimes.

All public syntax remains source sugar over the same compiler, stable IR and VM.

#### Reactive runtime must remain

`WHEN` is a reactive semantic construct, not a callback framework. Dependency tracking, invalidation, recomputation, reuse and realtime transaction semantics remain runtime responsibilities.

The author sees:

```text
when crossesAbove(fast, slow):
    emit "LONG"
```

not the scheduler, dirty-set propagation or dependency graph that makes it work.

#### Capability sandbox must remain

CoreSpirit should not gain raw network, filesystem, arbitrary process, native-call or broker-credential authority simply because an implementation target becomes more powerful.

Acceleration remains authority-neutral:

```text
CPU  ≠ broker
WASM ≠ broker
GPU  ≠ broker
```

Capability negotiation, quotas and host permissions remain infrastructure contracts.

#### Typed external model ABI must remain

Python, C++, Rust, WASM, ONNX and remote services may remain model implementations, but they must converge on one semantic model contract.

```text
CoreSpirit MODEL
       ↓
Typed model ABI
       ↓
Python / C++ / Rust / WASM / ONNX / remote
       ↓
typed outputs
       ↓
CoreSpirit semantics
```

The transport can evolve without changing the meaning of `MODEL` in the language.

### The combined rule: remove complexity, not architecture

The correct end state is therefore not:

```text
simple language
↓
simple implementation
```

It is:

```text
simple language
      ↓
strong compiler boundary
      ↓
stable IR
      ↓
reactive deterministic VM
      ↓
capability sandbox
      ↓
renderer/model/automation/risk hosts
      ↓
controlled external systems
```

The user experiences a small language. The platform underneath remains sophisticated.

That asymmetry is intentional.

### Complexity firewall acceptance criteria

Future CoreSpirit work should be reviewed against these questions:

1. Does this introduce a new concept that a normal author must learn?
2. If yes, can it be expressed as an existing DATA/LET/WHEN/SHOW/MODEL/AUTOMATE composition instead?
3. Does the feature expose an implementation mechanism rather than trading semantics?
4. Does it create a second evaluator, scheduler, VM, IR or renderer model?
5. Does it weaken the VM → broker, MODEL → broker or INDICATOR → broker boundaries?
6. Does it bypass risk/policy before execution?
7. Does it make deterministic replay harder to guarantee?
8. Does it turn a host capability or transport into a source-language primitive unnecessarily?
9. Can advanced implementation details remain available through inspection/debugging surfaces instead of authoring syntax?
10. Does the feature preserve the principle: **hide mechanisms, expose meaning**?

A feature that fails these checks should be redesigned before it is promoted into the CoreSpirit public language.



## v71 architecture refinement — standard library discoverability + readable syntax (#17–#18)

v71 deepens the same six-concept language rather than adding another subsystem. The central question is no longer “how many functions exist?” but “can a new author discover the right concept without learning the platform internals first?”

### 17. Standard library: organize for discovery, not count

The historical v32–v36 line deliberately kept the executable core small. That remains a runtime contract: the current executable core registry stays at its established size, and platform extensions remain separate. v71 therefore does **not** solve library growth by silently moving every existing extension into the core.

Instead, CoreSpirit now has a separate human-facing catalog that organizes already-supported functionality into stable groups. The current registry is intentionally split as:

```text
30 semantic core primitives
80 extension / compatibility capabilities
110 total registered callables
```

The 30/80 split is an architectural boundary, not a UI limitation.

```text
PRICE
  open  high  low  close  volume

MATH
  abs  min  max  sqrt  pow  round  sign  exp  log  tanh  clamp  sigmoid

TREND
  sma  ema  hma  wma  rma

MOMENTUM
  rsi  change  probability

VOLATILITY
  atr  stdev  variance

STRUCTURE
  highest  lowest  cross  crossover  crossunder  rising  falling

MARKET
  market  timeframe  vwap

MODELS
  model  predict  score

VISUAL
  show

EVENTS
  emit  event  signal  alert  webhook

DATA
  request  requestBatch  lowerTf  bid  ask  spread  mid  ...

STATE
  nz  na  isNa  bar_index  time
```

The grouping is **metadata for discoverability**, not a second registry. Compiler validation, semantic analysis, signature lookup and VM execution still consume the existing canonical builtin registry.

This is important because “small language” and “large ecosystem” are not contradictory:

```text
small semantic core
       +
large capability ecosystem
       +
strong discoverability layer
```

The editor should therefore expose primary concepts in human order instead of making users scan an undifferentiated function list.

#### Primary versus advanced knowledge

A beginner should normally discover:

```text
Price → Trend → Structure → Volatility → Models → Visual → Events
```

before being asked to understand:

```text
requestBatch
intrabar...
footprint...
visual.*
execution planner
host capability details
```

Advanced functionality is still real and supported, but it should be progressively disclosed. The language does not become weaker; the first page of the language becomes easier to comprehend.

#### Do not advertise nonexistent capabilities

Desired future primitives such as `roc` and `stoch` are legitimate library candidates, but they are not exposed as executable CoreSpirit builtins until deterministic runtime, compiler, and conformance contracts exist.

That rule prevents the catalog from becoming a marketing list that the runtime cannot actually execute.

### 18. Readability: surface syntax should read like trading logic

CoreSpirit already has normalization infrastructure, so readable syntax should be used where it preserves exactly one canonical meaning.

Preferred:

```corespirit
fast = ema(close, 20)
slow = ema(close, 50)

show fast, slow

when fast crossesAbove slow:
    emit "LONG"
```

Canonical lowering remains:

```text
fast crossesAbove slow
          ↓
   crossover(fast, slow)
          ↓
   existing condition IR
          ↓
          VM
```

Likewise, market data should read as a reference rather than a transport request:

```corespirit
nifty = market("NIFTY")
spread = nifty.close - market("BANKNIFTY").close
```

The source author sees:

```text
market → reference → field
```

not:

```text
request → batching → provider → cache → alignment → host transport
```

The latter remains real architecture, but it belongs behind the compiler/host boundary.

### Readability is not a new language

Approved readability aliases must satisfy four rules:

1. **One canonical lowering.** A readable form maps to an existing function/expression/IR meaning.
2. **No semantic drift.** Sugar cannot change lookahead, realtime, state, determinism or capability rules.
3. **Editor convergence.** Completion, hover, formatting and diagnostics teach the same surface spelling.
4. **No new executor.** The alias is removed before the stable IR/VM boundary.

This makes `crossesAbove` a language spelling, not a fifth crossing algorithm.

### Data references are similarly layered

`market("NIFTY").close` is valid because `market()` already produces a typed data reference and the existing member-access path already resolves OHLCV/time fields through the host-owned data resolver.

The editor should therefore complete:

```text
market("NIFTY").
                     ├── open
                     ├── high
                     ├── low
                     ├── close
                     ├── volume
                     └── time
```

This is an ergonomics improvement over the same existing ABI, not a new data runtime.

### #13–#18 as one coherent design rule

The six recent refinements now form one chain:

```text
COMPOSABILITY
    ↓
PROGRESSIVE SIMPLICITY
    ↓
COMPLEXITY FIREWALL
    ↓
INVISIBLE ARCHITECTURAL BOUNDARIES
    ↓
DISCOVERABLE STANDARD LIBRARY
    ↓
READABLE SURFACE SYNTAX
```

That chain answers two different failure modes:

```text
Too much architecture exposed
→ user is overwhelmed

Too much capability exposed without structure
→ user is overwhelmed
```

The solution is not to weaken the architecture. It is to make the architecture **invisible, layered and discoverable**.


### v71 deeper architecture model

The six refinements should be understood as one authoring-and-runtime contract:

```text
#13 COMPOSABILITY
      ↓
#14 PROGRESSIVE SIMPLICITY
      ↓
#15 COMPLEXITY FIREWALL
      ↓
#16 INVISIBLE SUPERPOWERS
      ↓
#17 DISCOVERABLE LIBRARY
      ↓
#18 READABLE SYNTAX
```

The first two control how ideas combine and how beginners enter the language. The middle two protect the architecture from leaking into the authoring model. The last two make the remaining surface easy to discover and read.

#### One public language, many hidden services

The intended layering is:

```text
AUTHOR
  │
  │ DATA / LET / WHEN / SHOW / MODEL / AUTOMATE
  ▼
CORESPIRIT SOURCE
  ▼
SURFACE NORMALIZATION
  ▼
CANONICAL AST / SEMANTICS
  ▼
STABLE IR
  ▼
REACTIVE VM
  ▼
CAPABILITY-GATED HOST SERVICES
  ├── market data
  ├── model adapters
  ├── visual projection
  ├── automation/risk handoff
  └── execution adapters
```

The author should not need to know how a market request is batched, how a visual scene is patched, how an external model is transported, or which compute backend is selected. Those mechanisms remain inspectable to platform developers and debuggers without becoming ordinary source vocabulary.

#### Composition is a contract graph, not another runtime

The composable graph answers:

```text
what depends on what?
what can be shown?
what can trigger WHEN?
what can feed automation?
where does an order intent appear?
```

It does not answer:

```text
how to execute the program
how to bypass risk
how to call a broker
how to schedule a second evaluator
```

Those remain existing compiler/VM/host responsibilities.

#### Progressive syntax is a learning ladder

CoreSpirit should support the same concept at increasing depth:

```text
1. SHOW one value
   show ema(close, 20)

2. NAME reusable values
   fast = ema(close, 20)

3. COMBINE conditions
   when fast crossesAbove slow:
       emit "LONG"

4. ADD model facts
   when Regime.confidence > 0.8:
       ...

5. ADD automation
   automate:
       when "LONG":
           order long 1% risk
```

The implementation may be sophisticated at every step; the syntax does not need to be.

#### Standard library has four jobs, not one

The library system is deliberately separated into four layers:

```text
SEMANTIC CORE
small + stable + deterministic

EXTENSIONS
large + specialized + platform-aware

DISCOVERY CATALOG
human grouping + ordering + explanations

LANGUAGE SERVICE
completion + hover + member access + diagnostics
```

The combined ecosystem can therefore be large without making the language feel large. Current v71 counts are 30 semantic core primitives, 80 extensions/compatibility capabilities, and 110 combined registered callables.

#### Readable aliases are compiler commitments

`crossesAbove` and `crossesBelow` are deliberately not alternative implementations. They are source-language spellings with one canonical lowering:

```text
a crossesAbove b → crossover(a, b)
a crossesBelow b → crossunder(a, b)
```

The same principle governs `market("NIFTY").close`: readability changes the way a data reference is written, not the underlying data-access authority.

#### Six-concept authoring model and hidden authority model

The user-visible concepts and hidden platform powers are intentionally asymmetric:

| User can express | Platform secretly guarantees |
|---|---|
| DATA | alignment, history rules, quotas and host-owned acquisition |
| LET | typed values/series through the canonical compiler |
| WHEN | deterministic reactive condition evaluation |
| SHOW | renderer-neutral visual projection |
| MODEL | typed external-model ABI with host adapters |
| AUTOMATE | lifecycle/risk/policy handoff without broker authority |

That asymmetry is a feature. CoreSpirit should feel small because the architecture underneath is doing the hard work.

### Product UI direction

v71 continues the blue product-accent rule across the website. Green product-accent values were removed from active UI surfaces and replaced with the blue family. Trading chart roles now use the same blue/red semantic pairing where green had previously been used for positive/up states; red remains distinct for negative/down states.

The result is a single visual hierarchy:

```text
BLUE
product identity / active UI / positive trading state

RED
negative trading state / destructive warning

PURPLE / AMBER / NEUTRAL
specialized semantic roles
```

Product accent and semantic meaning remain encoded separately in the architecture even though the active positive chart color is now blue.

---

## v72 architectural deepening — #19 declarative configuration + #20 one-file application model

CoreSpirit's next simplification is not to remove capability. It is to remove **imperative setup language** and make configuration part of the same declarative semantic surface.

### #19 — Configuration should describe intent, not instruct the platform

Configuration belongs to the same authoring model as DATA, LET, WHEN, SHOW, MODEL and AUTOMATE. A user should describe **what an artifact is** and **what its boundaries are**, rather than manually calling setup APIs.

The preferred surface is:

```corespirit
indicator "Momentum":
    overlay: price
    precision: 2
```

```corespirit
model "Regime":
    source: "nifty-regime-v3"
```

```corespirit
automation "Momentum":
    mode: paper
```

The important architectural distinction is:

```text
DECLARATIVE CONFIGURATION
        ↓
validated semantic metadata
        ↓
canonical program artifact
        ↓
existing compiler / IR / VM / host contracts
```

not:

```text
source
 ↓
setup API calls
 ↓
mutable host objects
 ↓
feature-specific runtime
```

#### Configuration principles

**1. Configuration is data.**

`overlay: price`, `precision: 2`, `source: "..."` and `mode: paper` are validated values attached to a declaration. They are not executable instructions.

**2. Configuration has explicit scope.**

Configuration belongs to the declaration immediately above it. It does not silently mutate unrelated indicators, models, automations or host state.

**3. Configuration is validated before execution.**

Unknown keys, malformed values, invalid combinations and unsupported modes should become source diagnostics before the executable artifact is accepted.

**4. Defaults are deterministic.**

Omitted configuration uses documented stable defaults. The compiler must not infer different defaults from the current broker, renderer, GPU, or deployment target.

**5. Host authority remains intact.**

`mode: paper` describes the requested automation environment. It does not grant the VM permission to submit orders. Live execution still requires the existing host-controlled risk → policy → execution chain.

**6. Configuration must survive replay.**

A compiled artifact must carry enough normalized declaration metadata that historical/replay and realtime hosts interpret the same source configuration identically.

#### Configuration namespaces

The public configuration vocabulary should stay deliberately small:

```text
INDICATOR
  overlay
  precision
  title / display metadata

MODEL
  source
  inputs / outputs
  binding metadata

AUTOMATION
  mode
  lifecycle intent / activation policy metadata
```

Lower-level fields such as renderer nodes, execution targets, model transports, broker routes and capability tokens remain hidden implementation details.

#### Configuration is not another language

A critical invariant is:

```text
configuration ≠ imperative API
configuration ≠ second DSL
configuration ≠ runtime object graph
```

The configuration syntax is simply a structured declaration surface that lowers into the same semantic metadata already attached to CoreSpirit's single executable artifact.

### #20 — One file should describe the complete trading application

The end-state authoring model should allow one CoreSpirit file to describe the full decision chain:

```corespirit
app "Nifty Momentum":

    input fast = 20
    input slow = 50

    fast = ema(close, fast)
    slow = ema(close, slow)

    regime = model "Regime"

    show fast, slow on price
    show regime on panel "Regime"

    when fast crossesAbove slow and regime.confidence > 0.8:
        emit "LONG"

    automate:
        when "LONG":
            order long 1% risk
            stop 1.5 atr
```

This is not intended to create a sixth execution system called `APP`. `app` is a **composition/declaration envelope** for one source artifact.

The compiler's job is to split that source into existing semantic regions:

```text
                        APP SOURCE
                            │
           ┌────────────────┼─────────────────┐
           │                │                 │
        DECLARATIONS      COMPUTATION      BEHAVIOR
           │                │                 │
     indicator/model/   lets/series       when/emit
     automation/input                     automate/order
           │                │                 │
           └────────────────┼─────────────────┘
                            ↓
                 CANONICAL PROGRAM MODEL
                            ↓
                   STABLE CORE IR
                            ↓
                      REACTIVE VM
                            ↓
          ┌─────────────────┼──────────────────┐
          ↓                 ↓                  ↓
       VISUALS            EVENTS          ORDER INTENTS
                                             ↓
                                      RISK → POLICY
                                         → EXECUTION
```

#### Why the one-file model matters

**One source of truth.**

A trading application should not require one file for the indicator, another for the model binding, another for signals and another for automation just because the implementation has separate subsystems.

**Readable dependency locality.**

The user can see the input, calculation, model, visualization, condition and automation in one place. This makes the program easier to review and reason about.

**Deterministic compilation.**

The compiler can build one dependency graph and one executable artifact while retaining source locations for each declaration and behavior block.

**Safer deployment.**

A single artifact gives the platform one object to validate for capabilities, replay identity, risk-policy compatibility and deployment mode.

**Progressive disclosure.**

Beginners can start with:

```corespirit
show ema(close, 20)
```

and later place that same expression inside a complete `app` without learning a replacement language.

#### App composition rules

The one-file model should follow these rules:

```text
APP
 ├── inputs / configuration
 ├── data + calculations
 ├── model declarations / bindings
 ├── SHOW projections
 ├── WHEN conditions
 ├── EVENT emission
 └── AUTOMATE declarations
       └── ORDER intent
```

The following remain prohibited from the app source:

```text
raw broker API calls
raw network calls
filesystem operations
native process spawning
renderer node construction
GPU/WASM selection
risk approval commands
policy bypasses
```

Those are host/VM infrastructure, not application-language concepts.

#### The compiler split is semantic, not textual

A major design requirement is that the compiler does **not** simply split the file into independent scripts and run them separately. It should construct one semantic dependency model:

```text
input fast ───────► fast series ───────► SHOW
                       │
                       └───────────────► WHEN

model Regime ───────────────────────────► WHEN

WHEN ─────────────────► EVENT ──────────► AUTOMATE ──► ORDER INTENT
```

That preserves the existing composability invariant and avoids parallel runtimes.

#### Single-file application acceptance criteria

A future implementation is complete only when all of the following hold:

```text
✓ configuration is declarative and typed
✓ one app file compiles to one executable artifact
✓ nested declarations retain source locations
✓ MODEL, SHOW, WHEN, EVENT and AUTOMATE remain composable
✓ risk/policy/execution stay outside the VM
✓ replay sees the same normalized configuration
✓ editor completion can discover the complete file structure
✓ deployment works without requiring users to understand the internal graph
```

### #19 + #20 combined principle

The two ideas reinforce each other:

```text
DECLARATIVE CONFIGURATION
          ↓
ONE COMPLETE SOURCE FILE
          ↓
ONE SEMANTIC DEPENDENCY MODEL
          ↓
ONE CORE IR
          ↓
ONE REACTIVE VM
          ↓
MULTIPLE CONTROLLED HOST SERVICES
```

The result should feel like **one small trading language** even though the platform underneath contains a substantial compiler, runtime, visual system, model ABI, risk system, execution planner, sandbox and host ecosystem.

### v72 design guardrails

- `app` is an authoring envelope, not a second runtime.
- Declaration configuration is semantic metadata, not executable setup code.
- Multiple declarations still converge into one CoreSpirit compilation pipeline.
- The single-file model must not weaken DATA/LET/WHEN/SHOW/MODEL/AUTOMATE boundaries.
- Host infrastructure remains inspectable to platform engineers but hidden from ordinary source authoring.


### Product visual identity — black primary, blue accent

**Black remains the primary UI** surface family. Blue is the product accent used for identity, active controls and focus states.

CoreSpirit and the wider TradingCoreOS product use a deliberately restrained palette:

```text
BLACK / NEAR-BLACK
  primary application background
  cards and panels
  chart/workspace surfaces

BLUE
  product identity
  primary accent
  focus / active / selected controls

RED
  negative / destructive trading semantics

PURPLE / AMBER / NEUTRAL
  specialized semantic roles
```

Blue is therefore an **accent**, not a replacement for the product's black visual foundation. A blue button or selection state should read as emphasis on a black interface, not as a blue interface.


## v73 architectural deepening — #21 compiler complexity absorption + #22 progressive authoring levels

CoreSpirit now states an explicit rule for where complexity belongs:

> **The language should be easy because the compiler is doing more work, not because the platform has less architecture.**

### #21 — The compiler absorbs complexity

The source author sees a compact semantic language. Internally, the compiler may construct several useful representations, but these are **views over one program**, not independent execution systems:

```text
CoreSpirit source
      ↓
Surface normalization
      ↓
AST / source model
      ↓
Semantic graph
      ↓
Dependency graph
   ┌──┼───────────────┬───────────────┐
   ↓  ↓               ↓               ↓
Visual   EVENT/WHEN   MODEL      AUTOMATE/ORDER
   \      |            |               /
    \     └────────────┴──────────────/
     \            ↓
      \      canonical IR
       \           ↓
        └──── reactive VM
```

The important distinction is that the visual, event, model and automation graphs are **compiler projections**. They must not become separate evaluators, schedulers or VMs.

The compiler's responsibilities therefore become deliberately broad:

- resolve readable surface syntax into canonical semantics;
- infer dependencies between values, models, events, visuals and automation;
- type-check declaration configuration before runtime;
- build deterministic reactive invalidation relationships;
- produce source mappings for debugging without making IR knowledge mandatory;
- perform semantics-preserving optimization;
- preserve EVENT identity and replay determinism;
- retain capability/risk/policy boundaries when lowering execution-related constructs;
- emit one validated executable artifact for the existing runtime.

#### Equivalent source should converge

These should have one semantic meaning:

```corespirit
when fast crossesAbove slow:
    emit "LONG"
```

and:

```corespirit
when crossover(fast, slow):
    emit "LONG"
```

Readable syntax is therefore not an alternate feature implementation. It is a different spelling of the same semantic node.

The same principle applies to declarative configuration. An author should be able to write intent such as:

```corespirit
indicator "Momentum":
    overlay: price
    precision: 2
```

without learning which internal metadata object, renderer contract or compiler node carries those values.

#### Optimization is allowed; semantic drift is not

Compiler optimization may change how work is organized, cached, batched or scheduled internally. It may not change:

```text
value meaning
EVENT identity
WHEN truth
MODEL output meaning
SHOW semantics
ORDER intent meaning
risk/policy authority
replay determinism
```

This makes optimization an implementation concern instead of a language feature.

#### Debugging stays possible without exposing internals

Advanced inspection may still show:

```text
source line
→ semantic node
→ dependency
→ IR instruction
→ runtime state
```

but the ordinary author does not need to know what an IR opcode or dependency planner is in order to write the program.

This is the same complexity-firewall principle from #15/#16 applied directly to compilation.

### #22 — Three authoring levels, one language

CoreSpirit should progressively reveal complexity rather than create separate beginner and professional languages.

```text
LEVEL 1 — SIMPLE
      ↓ grow the program
LEVEL 2 — ADVANCED
      ↓ add deeper control
LEVEL 3 — PROFESSIONAL
```

#### Level 1 — Simple

The intended entry point for most traders is semantic and direct:

```corespirit
show ema(close, 20)

when close crossesAbove ema(close, 20):
    emit "LONG"
```

The author learns only the essential vocabulary: data, calculation, visual output and a reactive condition.

#### Level 2 — Advanced

The next layer introduces reusable named concepts and typed model facts:

```corespirit
fast = ema(close, 20)
slow = ema(close, 50)

model "Regime":
    use "regime-v3"

show fast, slow

when fast crossesAbove slow and Regime.confidence > 0.8:
    emit "LONG"
```

The user is still writing the same language. They are simply composing more concepts.

#### Level 3 — Professional

Professional authoring exposes the full semantic vocabulary required by complex trading systems:

```text
typed data
multi-symbol relationships
multi-timeframe inputs
custom renderer-neutral geometry
external model bindings
custom event handlers
performance controls
advanced inspection/debugging
```

These are still constrained by the same:

```text
compiler
↓
IR
↓
reactive runtime / VM
↓
host capability boundary
↓
risk → policy → execution
```

#### Authoring level is not a security level

This distinction is important.

A professional program is allowed to express more semantics, but it does **not** receive automatic authority over:

```text
broker credentials
raw network
filesystem
arbitrary processes
account mutation
risk bypass
```

Capability policy remains independent of authoring level.

#### Authoring level is not a grammar fork

There is no:

```text
CoreSpirit Beginner
CoreSpirit Pro
CoreSpirit Enterprise DSL
```

There is only CoreSpirit.

The levels are a tooling/discoverability model that can influence examples, completion depth, documentation and editor presentation while the underlying compiler contracts remain identical.

### #21/#22 acceptance rule

A future feature belongs in the CoreSpirit language only when both questions have good answers:

```text
1. Can the compiler absorb the complexity without creating another runtime?
2. Can the editor reveal that complexity progressively rather than forcing it on every author?
```

If the answer to either is no, the feature should remain a host/internal concern until its semantic boundary becomes clear.

### v73 architectural consequence

The end-state is therefore stronger than simply having a concise syntax:

```text
small language surface
      +
rich compiler
      +
stable IR
      +
reactive VM
      +
strict capability / risk boundaries
      =
professional trading system without a professional-only language
```


## v75 target language contract — #25

The long-term CoreSpirit language should be teachable from a very small public vocabulary. The implementation may remain large, but the author-facing grammar should be deliberately small.

### Minimal semantic vocabulary

```text
let
when
if
show
emit
model
automate
```

These are the primary source concepts. They cover state/value binding, conditional logic, reactive behavior, visualization, event emission, external model consumption and downstream automation.

The surrounding expression library supplies the computational vocabulary:

```text
ema()
rsi()
atr()
market()
timeframe()
```

and the existing discoverable standard-library catalog can grow without expanding the language's conceptual core every time a new mathematical or market capability is added.

### What “almost enough” means

The goal is not to forbid advanced capabilities. It is to make most capabilities compositional expressions and declarations rather than new language control structures.

For example:

```corespirit
fast = ema(close, 20)
slow = ema(close, 50)

when fast crossesAbove slow:
    emit "LONG"
```

uses the core language to combine values, expressions and events. The author does not need a special `crossover` language, signal language, alert language or broker language.

Similarly:

```corespirit
regime = model "Regime"

when regime.confidence > 0.8:
    emit "HIGH_CONFIDENCE"
```

uses MODEL as a source of typed facts and WHEN as the common reactive boundary.

### Minimal grammar versus large ecosystem

The distinction is:

```text
small grammar
    ≠
small platform
```

CoreSpirit can have hundreds of library functions, model backends, visual projections and host capabilities while keeping the source grammar small. New functionality should normally appear as one of:

```text
expression
function
member
model field
visual projection
event value
host capability
```

rather than another keyword that users must memorize.

### Public-language design test

Before adding a keyword, ask whether an existing concept can express the same behavior compositionally. A new keyword is justified only when it introduces a genuinely new semantic category that cannot be explained as an existing value, event, declaration or projection.

That rule protects the six-concept language foundation while allowing the practical vocabulary to evolve.

## v75 ultimate application contract — #26

The ultimate CoreSpirit script is a single declarative application that can describe the complete trading program without forcing the author to split logic into indicator scripts, model definitions, alert scripts and automation scripts.

```corespirit
app "Nifty AI Momentum":

    input fast = 20
    input slow = 50

    fast = ema(close, fast)
    slow = ema(close, slow)

    regime = model "nifty-regime-v3"

    show fast, slow on price
    show regime.probability in panel "AI Regime"

    when fast crossesAbove slow:
        show "LONG" above bar
        emit "LONG"

    when fast crossesBelow slow:
        show "EXIT" below bar
        emit "EXIT"

    automate:
        when "LONG":
            if regime.confidence > 0.8:
                order long 1% risk
                stop 1.5 atr
                target 3 atr

        when "EXIT":
            close position
```

This is the architectural dream because it composes existing semantics rather than inventing one runtime per feature.

### What the single file means internally

The source file is one program and therefore one semantic identity:

```text
app
 │
 ├── inputs / configuration
 ├── data dependencies
 ├── calculations
 ├── model dependencies
 ├── visual projections
 ├── reactive conditions
 ├── event emissions
 └── automation intents
```

The compiler can then construct internal views:

```text
                    ONE SOURCE PROGRAM
                           │
                    normalized AST / CST
                           │
                    semantic model
                           │
          ┌────────────────┼─────────────────┐
          ↓                ↓                 ↓
    dependency view   visual view       event view
          │                │                 │
          └──────────┬─────┴─────┬───────────┘
                     ↓           ↓
                model view   automation view
                     \           /
                      \         /
                       ↓       ↓
                        stable IR
                           ↓
                           VM
```

These are compiler projections, not independent programs with separate evaluators.

### One-file does not mean one giant execution blob

The source is unified for the author, but internally the compiler still preserves boundaries such as:

```text
calculation dependency
model ABI
visual scene projection
EVENT emission
automation intent
risk/policy
execution host
```

The purpose of the compiler is to make those boundaries explicit and enforceable without requiring the author to manually assemble them.

### Configuration versus behavior

The `app` envelope may contain declarative configuration such as inputs, visual placement, model binding and automation mode. Behavior remains expressed through the same values, WHEN conditions and events used outside the envelope.

This prevents `app` from becoming a second programming language hidden inside a declaration.

### Current implementation status

The exact full `app` shorthand above is a **target syntax contract**, not a claim that every line of this final surface is already accepted by the current parser. Existing v64–v74 work provides the semantic building blocks—six concepts, SHOW, MODEL, AUTOMATE, universal EVENT/WHEN, readable syntax, composition and one compiler/IR/VM path. Future implementation work should add the remaining sugar by lowering it into those established contracts rather than introducing another runtime.

## v75 compiler source-of-truth consolidation — #1

The next architectural improvement is to make the compiler pipeline the literal source of truth for all derived language information.

The desired pipeline is:

```text
SOURCE
  ↓
TOKENS / CST
  ↓
NORMALIZED AST
  ↓
SEMANTIC MODEL
  ↓
IR
  ↓
OPTIMIZED IR
  ↓
RUNTIME
```

The critical shift is that parsing and semantic analysis happen once for an executable program. Tooling and feature projections consume the resulting structures rather than independently rediscovering the meaning of the source text.

### Why the current model is the risk

CoreSpirit already has a real parser/compiler pipeline, but some surface metadata and composition utilities still operate directly on source strings. For example, `surfaceForms.ts` performs line-oriented normalization and metadata work, while `composability.ts` can inspect source text separately from the canonical AST.

That creates a subtle failure mode:

```text
same source
 ├── surface normalization
 ├── surface metadata scan
 ├── composition scan
 ├── parser
 ├── semantic analysis
 └── IR compiler
```

The implementations can disagree about what the same program means even though the architecture says there is one language.

### The desired authority model

```text
                 SOURCE TEXT
                      │
                      ↓
                 Lexer / CST
                      │
                      ↓
             Normalized Core AST
                      │
                      ↓
             Semantic Program Model
                 /    |     |    \
                /     |     |     \
               ↓      ↓     ↓      ↓
          diagnostics graph completion source maps
               │      │     │
               └──────┴─────┴──────┐
                                   ↓
                                 editor

             Semantic Program Model
                       ↓
                  IR lowering
                       ↓
                  Optimized IR
                       ↓
                     VM
```

The semantic program model is the key abstraction. It should own resolved declarations, identifiers, types, member access, dependencies, event relationships, visual outputs, model references, automation intents and source spans.

### What becomes a projection

The following should eventually be derived from the semantic program model or its canonical AST:

```text
composition graph
surface metadata
editor completion
hover information
diagnostics
source maps
visual dependency graph
event dependency graph
model dependency graph
automation dependency graph
debugger inspection data
```

These are views of one semantic program. None should parse the original source independently to rediscover program meaning.

### CST versus AST

The CST exists for authoring fidelity:

```text
comments
whitespace
exact token spans
formatting-sensitive diagnostics
editor ranges
```

The normalized AST exists for language meaning:

```text
let bindings
if conditions
calls
members
literals
expressions
blocks
```

The semantic model exists for resolved meaning:

```text
symbol identity
types
dependencies
capability requirements
model fields
event contracts
visual projections
automation intents
source-to-semantic mapping
```

The IR then exists for deterministic execution—not for authoring, completion or language discovery.

### Migration path from the current implementation

This consolidation should happen incrementally:

```text
Phase 1
Keep current surface sugar for compatibility.
Normalize once at the compiler entry point.

Phase 2
Attach source-span/source-form metadata to normalized AST nodes.

Phase 3
Build semantic program metadata from AST + semantic analysis.

Phase 4
Refactor composition and surface-description utilities to consume the semantic model.

Phase 5
Refactor editor completion/hover/diagnostics to consume the same model.

Phase 6
Retire independent source-string scanners where equivalent semantic information exists.
```

This avoids a flag-day parser rewrite and preserves existing release compatibility.

### Important constraint

This is **not** permission to create a CST runtime, semantic-model runtime or graph runtime. These are compiler representations. The executable authority remains:

```text
one normalized program
        ↓
one semantic model
        ↓
one stable IR
        ↓
one VM
```

### Acceptance test for #1

CoreSpirit should eventually be able to demonstrate:

```text
one source
  ↓
one parse
  ↓
one normalization
  ↓
one semantic analysis
  ↓
all tooling views
  ↓
one IR
  ↓
one runtime
```

with equivalent source sugar producing equivalent semantic and IR identities, while source maps still point back to the exact text the author wrote.

That is the strongest version of “one language” because the unity is no longer just conceptual; it is enforced by the implementation structure.

### v75 architectural boundary

#25 and #26 define the target authoring surface. #1 defines how the implementation must support it. Together they establish the direction:

```text
SMALL PUBLIC LANGUAGE
        ↓
STRONG SINGLE COMPILER AUTHORITY
        ↓
RICH INTERNAL SEMANTIC MODEL
        ↓
ONE STABLE IR
        ↓
ONE VM / REACTIVE RUNTIME
```

The language becomes smaller at the top while the compiler becomes stronger underneath.


## v76 compiler architecture hardening — #1 and #3

v76 turns the source-of-truth discussion into an implementation direction that is stricter than the earlier documentation-only statement.

### #1 — one semantic source of truth

The canonical source lifecycle is now:

```text
SOURCE
  ↓
LEXER / CST
  ↓
SURFACE NORMALIZATION
  ↓
NORMALIZED AST
  ↓
SEMANTIC MODEL
  ↓
IR
  ↓
OPTIMIZED IR
  ↓
VM / REACTIVE RUNTIME
```

CoreSpirit already had a real lexer and parser. The architectural defect was that some user-facing tooling and compatibility layers could still derive meaning directly from raw source text. v76 introduces `createCoreSpiritCompilationUnit(source)` as the canonical source-to-semantics gateway. It produces normalized source, AST, syntax diagnostics and semantic analysis as one coherent compilation unit. The compiler now exposes `compileSource()` through the same gateway, while editor diagnostics/type information consume the same unit.

The long-term rule is:

> **Parse once, understand once, project many times.**

The same semantic model should feed diagnostics, composition graphs, completion, hover, source maps, debugger views and dependency inspection. Those are projections, not independent language analyzers.

### #3 — regex must stop being the language parser

Readable `crossesAbove` / `crossesBelow` syntax is now normalized from token spans using the existing CoreSpirit lexer. The structural pass understands balanced call/index/member expressions and the equivalent functional spelling.

```corespirit
ema(close, 20) crossesAbove ema(close, 50)
```

becomes:

```text
crossover(ema(close, 20), ema(close, 50))
```

Strings and comments containing syntax-like text are not treated as operators. Parentheses and nested calls are handled by token balance rather than regex approximation.

### Legacy compatibility containment

Some older surface conveniences still require line-oriented transforms. v76 quarantines those transforms behind a protected-text boundary so they cannot inspect or rewrite string literals and comments. New language semantics should not be added to that regex layer.

### End-state migration

```text
TODAY
lexer + parser + protected compatibility surface
                 ↓
NEXT
AST-backed surface transforms
                 ↓
TARGET
normalized AST as the only language meaning source
                 ↓
semantic model as the only resolved meaning source
```

This is intentionally incremental; removing the legacy surface layer is a migration task rather than a flag-day parser rewrite.

### v76 acceptance boundary

A normalization rule is architecturally acceptable only when it is:

```text
lexically safe
      +
balanced-expression aware
      +
source-span preserving
      +
deterministic
      +
semantically convergent
```

If a rule needs unbounded regex knowledge of nested language syntax, it belongs in the lexer/parser/AST layers instead.

## v77 semantic graph consolidation — #1, #3 and #4

v77 deepens the v76 compiler-hardening cycle by moving the composition model from lexical source discovery to resolved semantic entities.

### #1 — one semantic program

```text
SOURCE
  ↓
LEXER / CST-aware surface boundary
  ↓
NORMALIZED SOURCE
  ↓
AST
  ↓
SEMANTIC MODEL
  ↓
SEMANTIC DEPENDENCY GRAPH
  ↓
IR
  ↓
OPTIMIZED IR
  ↓
VM / REACTIVE RUNTIME
```

The semantic dependency graph is now the source-level authority for language meaning used by composition tooling. It answers which symbols produce values, which data/model entities they depend on, which conditions gate outputs, and which events/visuals/automation intents are downstream.

The intended projection model is:

```text
SEMANTIC PROGRAM MODEL
          ↓
SEMANTIC DEPENDENCY GRAPH
     /       |        \
 diagnostics graph  completion / composition
        ↓       ↓
       editor / debugger
              ↓
             IR
              ↓
 execution / reactive / replay projections
```

The execution-specific IR graph remains useful for instruction ordering and runtime performance. The consolidation target is to attach stable semantic IDs to those execution nodes rather than independently rediscovering language meaning.

### #3 — regex is compatibility only

Readable crossing syntax is structurally normalized through the existing lexer. The legacy line-oriented layer is protected from strings/comments and is no longer the place for new language semantics.

```text
regex compatibility
      ↓
token-aware transform
      ↓
AST transform
      ↓
semantic lowering
```

### #4 — composability is semantic

The previous composition implementation searched identifiers in source lines. v77 replaces that with a semantic dependency graph containing:

```text
data sources
symbols / values
models
model outputs
conditions
events
visuals
automations
order intents
```

Relations are explicit:

```text
depends-on
emits
triggers
renders
contains
```

This means:

```corespirit
let value = close
let closeText = "hello close"
```

creates a dependency from `data:close` to `symbol:value`, but the word `close` inside the string creates no dependency.

Likewise `obj.close` resolves the target object first; the member name is not treated as a standalone market-data symbol. `function(close)` makes `close` a dependency because the AST identifies it as an actual argument.

Model aliases retain identity:

```corespirit
regime = model("Regime")
when regime.confidence > 0.8:
    emit "LONG"
```

The semantic analyzer records the model binding and the compiler preserves the same model reference for member lookup.

The user-facing composition graph is a projection over this semantic graph. Intermediate arithmetic/comparison expression nodes can remain in the internal graph while being collapsed from the author-facing projection.

### Remaining migration

The current normalized AST does not preserve exact named-AUTOMATE container ownership for every order intent. v77 therefore deliberately does not fabricate an `AUTOMATION → ORDER` relationship. The next migration should preserve declaration ownership during normalization so container-level views can remain semantic without lexical guessing.


## v78 P0 source provenance hardening — #5

Source mapping is now treated as a compiler correctness contract rather than a best-effort debugger convenience.

### Previous failure mode

The compiler previously approximated instruction ownership by AST-node position. That fails whenever one source construct emits multiple instructions and becomes stale when optimization changes the instruction stream.

### New rule — origin travels with the instruction

Every compiler-emitted IR instruction can carry:

```text
origin:
{
    sourceNodeId
    start
    end
    line
    column
}
```

The relationship is explicitly many-instruction-to-one-source-node: an AST node can emit several IR instructions and each retains the same source origin.

### Optimization rule

Optimizer replacements preserve the originating instruction's provenance, and the source map is regenerated from the optimized instruction sequence.

```text
raw IR
  ↓
optimizer
  ↓
optimized IR + preserved origins
  ↓
fresh source map
```

### Applications

Instruction origin is the common provenance source for debugger highlighting, diagnostics, visual graph selection, replay diagnostics, profiler attribution, execution explanations and runtime error localization.

### Acceptance boundary

No AST-index source-map approximation remains. Compiler-generated instructions carry provenance; optimization replacements preserve it; final source maps use optimized instruction indexes.


## v79 runtime decomposition + transactional realtime hardening — #6 and #7

v79 makes the existing runtime architecture explicit in code without creating a second runtime, changing the language model, or changing the public `CoreSpiritRuntime` API.

### #6 — the runtime is now a facade, not the VM

The production boundary is now:

```text
CoreSpiritRuntime (compatibility API)
        │
        ▼
CoreSpiritRuntimeFacade
        │
        ├── CoreSpiritVM
        │     └── instruction stepping + builtin execution
        │
        ├── RuntimeStateStore
        │     └── mutable execution state + committed snapshots + history
        │
        ├── RealtimeTransaction
        │     └── begin / revise / commit / rollback
        │
        ├── DataResolver
        │     └── normal data resolution + series references
        │
        ├── ModelResolver
        │     └── model references + output resolution
        │
        ├── EventRouter
        │     └── host event boundary + speculative buffering
        │
        ├── RuntimeDiagnostics
        │     └── debugger trace ownership + source provenance lookup
        │
        └── ReactiveScheduler
              └── dependency-aware reuse + revision scheduling
```

The important rule is that there is still **one executable VM**. The split is organizational: the facade coordinates services and the VM remains the only instruction executor.

The external entry point remains `CoreSpiritRuntime`, which extends the new `CoreSpiritRuntimeFacade`. Existing callers therefore keep the same public class name while the implementation gains explicit ownership boundaries.

The large runtime-side implementations for instruction stepping, builtin calls, output/intent emission, model lookup and visual builtin handling now live with `CoreSpiritVM`. The facade retains only orchestration, lifecycle, state bridging, checkpoints, loading, validation and host-facing coordination.

### #7 — realtime execution is an explicit transaction

Realtime bars are treated as speculative transactions over a committed baseline:

```text
                 COMMITTED STATE
                       │
                 begin transaction
                       │
                       ▼
               SPECULATIVE STATE
                       │
            ┌──────────┼──────────┐
            │          │          │
          tick 1     tick 2     tick 3
            │          │          │
            └──── same-bar revisions ────┘
                       │
                 replace/revise
                       │
                  ┌────┴────┐
                  │         │
               COMMIT    ROLLBACK
                  │         │
                  ▼         ▼
          new committed    restore
             baseline      baseline
```

A same-bucket revision restores the original bar snapshot before evaluation. Its staged host effects are also replaced rather than accumulated, so an earlier signal/order/event from the same bar cannot survive merely because a later tick revises the bar.

At commit, the transaction copies the speculative series/local/cross state into the committed baseline and flushes the current staged event buffer. At rollback, the speculative state, UI/workspace state and staged event effects are discarded together.

### Runtime state ownership contract

| State class | Examples | Transaction rule |
|---|---|---|
| **Committed** | `committedSeriesState`, `committedLocalSeries`, `committedCrossState` | Authoritative baseline; changed only by commit/restore |
| **Transaction-local** | `state.seriesState`, `state.localSeries`, `crossState`, `history`, realtime lifecycle/revision counters, current bar snapshot | May mutate during speculative evaluation; restored on revision/rollback |
| **Cache** | `indicatorMemo`, `dataMemo`, `lastRuntimeCallRefs` | Disposable; cleared on revision and after commit/rollback |
| **Derived** | reactive scheduler cache, debugger bar traces | Recomputable; reset/cleared when speculative state is abandoned |
| **Ephemeral UI** | `uiRuntime`, `workspaceRuntime` state | Snapshot with the transaction and restored on rollback/revision |

This classification is part of the runtime contract: a new mutable field should be assigned to one of these categories before it is added to realtime execution.

### Event side-effect invariant

The VM is still network-free. Runtime events and execution intents cross the host boundary only through `CoreSpiritEventRouter`.

```text
VM emit
   ↓
EventRouter
   ├── historical/replay → immediate host event
   └── realtime → transaction buffer
                    ├── revision → discard old buffer
                    ├── commit   → flush latest buffer
                    └── rollback → discard buffer
```

This makes signal, event, alert, webhook and execution-intent emission rollback-safe without moving broker/network ownership into the VM.

### Checkpoint boundary

Checkpoints capture the durable runtime baseline and history required to resume execution. Transaction-local caches are not checkpoint authority; they are rebuilt after restore. Reactive and debug state is treated as derived rather than persisted execution truth.

### Acceptance boundary

- The public `CoreSpiritRuntime` API remains available.
- `CoreSpiritRuntimeFacade` is the coordinator, not a second runtime.
- `CoreSpiritVM` is the single instruction executor.
- Runtime state has explicit committed/transaction-local/cache/derived/ephemeral ownership.
- Same-bucket realtime revisions replace both speculative state and staged host effects.
- Commit flushes only the latest staged effects.
- Rollback restores the committed baseline and emits nothing from the abandoned revision.
- Speculative debugger traces do not survive rollback.


## v80 runtime decomposition + transactional state semantics — deeper #6 and #7

v80 deepens the existing v79 hardening without adding another runtime, another VM, or another language surface. The purpose is to make the ownership and transaction rules executable rather than merely documented.

### #6 — the facade now delegates execution lifecycle

The runtime boundary is now split at two levels:

```text
CoreSpiritRuntime
      │
      ▼
CoreSpiritRuntimeFacade
      │
      ├── service construction / public compatibility API
      ├── checkpoint + loaded-artifact ownership
      │
      └── CoreSpiritRuntimeExecutionCoordinator
                 │
                 ├── bar/tick lifecycle
                 ├── historical execution
                 ├── realtime commit / rollback coordination
                 └── execution-frame preparation

CoreSpiritRuntimeFacade services
   ├── CoreSpiritVM
   ├── RuntimeStateStore
   ├── RealtimeTransaction
   ├── DataResolver
   ├── ModelResolver
   ├── EventRouter
   ├── RuntimeDiagnostics
   └── ReactiveScheduler
```

The coordinator is not a second runtime. It is a lifecycle component that sequences the existing services. Instruction execution still occurs in exactly one place: `CoreSpiritVM.executeBlock()`.

This removes a particularly dangerous responsibility combination from the facade: deciding transaction state *and* directly owning the per-bar execution algorithm. The facade is now an API boundary and service composition point; the coordinator owns chronological execution orchestration.

The VM host contract remains injected. CoreSpirit therefore keeps the same security boundary: the VM does not gain network, filesystem, broker or process access merely because responsibilities were split.

### #7 — transaction identity and ownership are explicit

A realtime transaction now has a stable identity:

```text
rtx:<monotonic-sequence>:<base-bar-index>
```

and a revision counter:

```text
transaction rtx:17:842
    revision 0
    revision 1
    revision 2
```

The identity is shared by the transaction services:

```text
RealtimeTransaction
      │
      ├── EventRouter       → buffered host effects
      ├── ReactiveScheduler → derived reuse cache
      └── RuntimeDiagnostics→ speculative debugger trace
```

This closes a subtle failure class: a stale transaction must never be able to flush, clear or promote data belonging to a newer transaction.

### State classes

The realtime model is now explicit:

```text
COMMITTED
    authoritative confirmed state

TRANSACTION-LOCAL
    developing bar, revision counters, mutable series/local/cross state

CACHE
    indicator/data/reference memoization

DERIVED
    reactive reuse + debugger trace materialization

EPHEMERAL-UI
    UI/workspace state that follows the speculative revision
```

The transaction boundary applies the same rules to every class:

```text
BEGIN
  create transaction identity
  snapshot confirmed baseline
  start speculative event/reactive/debug scopes

REVISE
  restore baseline
  increment revision
  clear disposable caches
  re-evaluate
  replace staged effects

COMMIT
  promote state
  promote latest diagnostics
  end derived transaction scope
  flush only matching event buffer
  clear disposable caches

ROLLBACK
  restore baseline counters/state
  discard matching event/reactive/debug scopes
  clear disposable caches
  restore confirmed execution frame
```

### Counter/state completeness

The transaction snapshot now includes the execution counters that affect observable runtime behavior:

```text
executionRevision
plotOrdinal
outputCount
realtime
lastBarWasRealtime
realtimeLifecycle
```

Previously these were reset procedurally during rollback. They are now part of the transaction contract, so rollback restores the baseline rather than relying on a hard-coded zero.

### Confirmed historical baseline

Historical execution now explicitly promotes each confirmed bar into the committed state store. This matters when a host performs:

```text
history preload
    ↓
confirmed state
    ↓
realtime transaction
```

The first live transaction therefore begins from an explicit confirmed baseline rather than assuming that the durable committed fields happen to match the mutable working state.

### Debugger consistency

Debugger traces are now treated as transaction-scoped derived state. Speculative traces stay invisible to `getDebugTrace()` until commit. Rollback discards only the speculative trace for that transaction instead of clearing an already-confirmed trace for the same bar index.

### Event consistency

Event buffers now carry their transaction ID. Commit requires the matching active transaction ID. Rollback may discard the matching transaction, while a stale transaction ID is rejected instead of being allowed to affect a newer transaction.

### Acceptance boundary

The runtime architecture is considered structurally hardened for #6/#7 when:

- the public `CoreSpiritRuntime` API remains unchanged;
- instruction stepping remains exclusive to `CoreSpiritVM`;
- lifecycle orchestration lives outside the facade's execution algorithm;
- committed/transaction-local/cache/derived/UI ownership is explicit;
- realtime transaction identity is propagated to side-effect and derived-state services;
- same-bar revisions replace earlier staged effects;
- commit promotes only the active transaction;
- rollback cannot erase already-confirmed debugger state;
- confirmed historical execution establishes the committed baseline.


## v81 timeframe completeness + measured reactive execution — deeper #8 and #9

v81 hardens two execution-semantic boundaries without adding another runtime, another VM, or another language surface:

1. lower-timeframe / intrabar alignment must not invent completeness from a tautological timestamp check;
2. reactive execution must expose measured evidence of recomputation and reuse instead of treating optimization as an assumption.

### #8 — intrabar completeness is explicit, not inferred

The previous grouping logic effectively evaluated:

```text
points = observations where timestamp < parentEnd
complete = lastPoint.timestamp < parentEnd
```

The second line is not evidence of completeness because the first line already guaranteed it. It collapses the meaning of `complete` into "at least one point exists".

The contract is now evidence-based:

```text
Parent interval
      │
      ├── expected intrabar count reached
      ├── closing/final intrabar marker
      ├── source explicitly says parent is final
      └── an intrabar's endTimestamp reaches the parent boundary
                         │
                         ▼
                     complete = true
```

When none of those facts is available:

```text
complete = false
```

CoreSpirit therefore prefers an explicit unknown/incomplete state over manufacturing a completed higher-timeframe value from incomplete lower-timeframe observations.

The `CoreSpiritIntrabar` host contract now permits optional `endTimestamp`, `isClosing`, and `isFinal` evidence. Parent bars may provide `expectedIntrabars` or `sourceFinal`. `groupIntrabars()` accepts an explicit policy controlling which evidence classes are trusted and returns a machine-readable `completenessReason` plus observed/expected counts for diagnostics.

This boundary matters because completeness can change the interpretation of:

```text
higher-timeframe values
signals
replay results
model inputs
automation conditions
visual state
```

The alignment layer should therefore answer **"do we have enough evidence to call this parent complete?"**, not **"did we receive at least one observation before the parent end?"**.

### #9 — reactive execution is measured

Reactive reuse is now treated as an observable runtime optimization. The engine records both revision-local and cumulative measurements.

Per revision:

```text
revision
 dirtyNodes
 recomputed
 reused
 effects
 cacheHits
 cacheMisses
 cacheHitRate
 executionTimeMs
```

Cumulative runtime view:

```text
revisionCount
 totalRecomputed
 totalReused
 cumulativeCacheHitRate
 averageExecutionTimeMs
 worstExecutionTimeMs
```

The measurement window begins with `beginRevision()` and ends after the corresponding VM `executeBlock()` completes. This captures the actual reactive execution interval rather than measuring an unrelated application/UI duration.

A representative runtime report is therefore:

```text
bar revision
------------
nodes:          148
 dirty:          31
 recomputed:     31
 reused:        117
 cache hit:      79.1%
 execution:      0.84 ms
```

The percentage is a measurement, not a confidence score or prediction. It answers a systems question:

```text
How much work did reactive reuse actually avoid?
```

This also provides the basis for future profiling by symbol, timeframe, node kind, model call, data request, and replay/realtime mode without changing CoreSpirit semantics.

### v81 acceptance boundary

- Intrabar completeness cannot be inferred from the filtered last timestamp alone.
- Missing completeness evidence remains `complete = false`.
- Completion evidence comes from explicit host/adapter metadata or interval coverage.
- Reactive cache hits and misses are separately counted.
- Current revision and cumulative reactive metrics are observable through the existing runtime statistics API.
- Reactive execution timing is recorded around the actual VM revision.
- No second reactive engine or alternate execution path is introduced.

## v82 chart architecture hardening — deeper #10 and #11

v82 continues the architecture-hardening policy without creating another runtime, another chart engine, or another market-data authority. The change is about making the frontend/data boundary match the execution architecture that CoreSpirit already claims to have.

### #10 — LiveChart decomposition: make the component a composition boundary

`src/components/workspace/LiveChart.tsx` was measured at **123,968 bytes** in the v81 baseline. The important issue is not the exact number; it is that the same React component currently contains chart construction, history acquisition, realtime reconciliation, indicator rendering, OI, drawings, predictions, CoreSpirit scene output, UI command wiring, and editor panels.

The desired decomposition is:

```text
LiveChart
  │
  ├── useChartLifecycle
  ├── useHistoryData
  ├── useRealtimeFeed
  ├── useIndicators
  ├── useOpenInterest
  ├── useDrawings
  ├── usePredictionOverlay
  ├── useCoreSpiritScene
  └── ChartToolbar
```

with an internal controller boundary:

```text
ChartController
      ↓
ChartState
      ↓
Renderer
```

v82 implements the first structural seams rather than pretending the entire 124 KB component has already been rewritten:

```text
LiveChart
  │
  ├── useChartRealtimeFeed       ← high-frequency data boundary
  ├── useChartUiEvents           ← workspace command boundary
  ├── ChartToolbar               ← drawing-tool presentation boundary
  └── ChartDepthPanel             ← isolated high-frequency UI consumer
```

The chart remains the owner of the imperative Vela-backed chart facade and its existing refs. React state remains appropriate for human-facing controls such as timeframe, menus, indicator configuration, chart style, CoreSpirit editor state, and error/status presentation.

The critical architectural rule is now explicit:

```text
UI state
   ≠
renderer state
   ≠
market-data transport state
```

A future extraction of `useHistoryData`, `useIndicators`, `useDrawings`, `usePredictionOverlay`, and `useCoreSpiritScene` should preserve this same rule. Those extractions are intentionally follow-up work so that the current chart behavior is not rewritten merely for file-size reduction.

### #11 — market ticks are external data, not React render state

The previous shape allowed a tick to cross the application boundary as a React prop:

```text
tick
  ↓
workspace setState
  ↓
LiveChart prop
  ↓
LiveChart render/effects
```

That couples transport frequency to the render lifecycle of a large component.

v82 changes the chart data path to:

```text
Broker feed
    ↓
TradingCoreRuntime
    ↓
ChartMarketStore
    ├── immediate imperative subscribers
    │        ↓
    │   useChartRealtimeFeed
    │        ↓
    │   candle / series renderer
    │
    └── animation-frame-coalesced React subscribers
             ↓
        ChartDepthPanel
```

`ChartMarketStore` is keyed by:

```text
broker + instrument
```

so NIFTY data cannot accidentally feed a BANKNIFTY chart and broker switches can clear the entire chart-data boundary.

The store keeps:

```text
latest tick
revision counter
bounded recent-tick ring
```

The ring is deliberately bounded at 2,048 ticks per instrument. It is observational chart data, not a replacement for the canonical historical/replay data store.

Two notification classes now have different semantics:

```text
imperative subscriber
→ immediate per-packet delivery

React snapshot subscriber
→ requestAnimationFrame-coalesced delivery
```

This distinction is important. The chart renderer should see a fresh tick as soon as the transport accepts it, while secondary React UI should not render once per broker packet during a burst.

`LiveChart` is also memoized and its chart call sites no longer pass `tick` as a prop. Existing workspace state may still retain ticks for watchlists and other non-chart UI, but the chart is no longer structurally dependent on that React state.

For the chart itself, the high-frequency loop is therefore:

```text
transport packet
    ↓
external market store
    ↓
imperative chart subscription
    ↓
reconcile current bar
    ↓
update series
```

and not:

```text
transport packet
    ↓
React state
    ↓
large component render
    ↓
imperative chart mutation
```

### Performance semantics

The architecture now separates **data freshness** from **React rendering cadence**. It does not yet claim a measured frame-rate improvement from this refactor alone.

The next measurement layer should record:

```text
market packets received
packets coalesced for React
imperative chart updates
chart update duration
React renders attributable to chart UI
worst frame time
```

That will allow the frontend to prove whether the data/render separation is actually reducing UI work rather than assuming it.

### v82 acceptance boundary

- `LiveChart` no longer receives high-frequency ticks through its React props at current chart call sites.
- Broker/runtime market data is published once into the chart external store.
- Imperative chart consumers receive immediate tick notifications.
- React-facing chart data consumers receive animation-frame-coalesced notifications.
- Chart data is isolated by broker + instrument key.
- A bounded recent-tick ring exists for observational chart consumers.
- Drawing-toolbar presentation and workspace-command wiring have explicit component/hook boundaries.
- No second chart renderer, second market-data authority, or alternate execution runtime is introduced.
- Full extraction of every remaining LiveChart domain remains follow-up work rather than being claimed complete.


## v83 hardening — chart renderer observability + terminal consolidation

v83 continues the frontend consolidation without changing CoreSpirit language semantics or the one-runtime architecture.

### #10 — LiveChart deeper decomposition

`LiveChart.tsx` remains the composition surface for the chart, but imperative renderer ownership is now explicit:

```text
LiveChart
   │
   ├── useChartLifecycle
   │       ↓
   │   ChartController
   │       ↓
   │   Vela NativeRenderer
   │
   ├── useChartRealtimeFeed
   ├── useChartUiEvents
   ├── ChartToolbar
   └── ChartDepthPanel
```

`ChartController` owns the mutation boundary for the main chart series: realtime bar updates, history setData, candle appearance, chart type visibility, volume visibility, resize, and renderer disposal. This keeps the component focused on orchestration, semantic state, and feature composition rather than scattering imperative renderer operations throughout the render function.

`useChartLifecycle` owns the controller lifetime. The existing history, indicators, drawings, prediction, OI, and CoreSpirit scene code remains in LiveChart until each domain can be extracted without changing behavior. The goal is architectural seams first, then safe migration.

### #11 — high-frequency data is now measurable

The external chart market store remains outside React state. v83 adds an observational performance telemetry boundary:

```text
market packet
    ↓
ChartMarketStore
    ├── immediate renderer subscriber
    └── frame-coalesced React subscriber

telemetry observes both paths without driving either one
```

Per chart key the telemetry records:

```text
packets
rendererUpdates
reactNotificationRequests
reactFrames
coalescedReactNotifications
totalRendererMs
averageRendererMs
worstRendererMs
packetsPerRendererUpdate
reactCoalescingRate
```

Renderer duration is measured around the real chart subscriber callback, not inferred from React render timing. This makes the performance question empirical: how many incoming packets arrive, how many renderer callbacks execute, how much work each callback takes, and how much React notification coalescing occurs.

The telemetry store is observational only. It cannot mutate market data, chart semantics, historical/replay behavior, or CoreSpirit execution.

### #12 — terminal generations consolidated

The production source now has one canonical terminal:

```text
src/LiveTradingTerminal.tsx
```

The implementation is composed from:

```text
LiveTradingTerminal
       ↓
LiveTradingWorkspace
       ↓
LiveChart / workspace surfaces
```

The former `LiveTradingTerminalV2`–`V5` generation files are retired from production source. Their history remains available through source control rather than as competing live implementations.

The application no longer chooses one terminal generation with a fallback to another generation. The live module boundary now loads the canonical terminal directly. This removes ambiguity about which terminal is authoritative.

### #13 — self-mutating layout hotfix retired

`.github/workflows/fix-layout-duplicate-slots.yml` is removed. Layout behavior is now controlled by canonical source and regression tests.

The lifecycle is intentionally: 

```text
temporary repair
      ↓
canonical source change
      ↓
test
      ↓
remove repair automation
```

The repository no longer has a workflow that edits application source with regex after pushes.

### v83 boundaries

v83 does not introduce another chart renderer, React runtime, terminal runtime, or CoreSpirit VM. It converts existing architecture into clearer production-code boundaries and adds measurement around the existing high-frequency path.


## v84 hardening — terminal/routing consolidation and typed boundaries

v84 deepens the frontend consolidation from v83 and applies the same single-authority principle to application routing and external data contracts. This is a hardening cycle; the public roadmap remains **1–59**.

### #12 — canonical terminal is now guarded, not merely selected

The production terminal boundary remains:

```text
LiveTradingTerminal
       ↓
LiveTradingWorkspace
       ↓
LiveChart / workspace modules
```

The terminal's modal/panel lifecycle is now isolated in:

```text
useLiveTradingTerminalController
```

The controller owns portfolio polling, order-ticket state, modal panel state, drag lifecycle, keyboard dismissal, pin state, and order submission orchestration. `LiveTradingTerminal.tsx` remains the only public terminal component and the only terminal generation referenced by `App.tsx`.

A repository-level architecture guard now fails if any retired V2–V5 production file is recreated or if an automation workflow starts mutating application source or reintroducing retired terminal generations. Git history remains the preservation mechanism for those generations.

### #13 — hotfix retirement becomes a repository invariant

The layout hotfix workflow remains deleted. v84 adds a guard that scans workflow definitions for source-mutating repair patterns and retired terminal-generation references. The acceptable lifecycle is now machine-checkable:

```text
temporary repair
      ↓
canonical source
      ↓
regression test
      ↓
retire the repair mechanism
```

The repository does not depend on a bot to rewrite source after a push.

### #14 — one SPA routing contract

Routing is now described by a canonical workspace route registry containing:

```text
/dashboard
/live
/models
/predictions
/automations
/indicators
/portfolio
/profile
/corespirit
```

`App.tsx` and the workspace navigation share the same route type, while `vercel.json` now follows the simpler deployment rule:

```text
/api/*
    ↓
/api/index

all non-API paths
    ↓
/
```

This means `/corespirit` no longer depends on a hand-maintained deployment rewrite entry. The deployment layer is intentionally unaware of individual SPA modules unless a path truly requires a server handler.

`/models` and `/predictions` still resolve to the existing Prediction Center implementation; they are route-level product aliases, not separate execution systems.

### #15 — boundary typing is now explicit where data becomes trusted

The project does not attempt to remove every `any` in one pass. The v84 rule is instead:

```text
external JSON / broker payload
        ↓
unknown
        ↓
runtime validation
        ↓
typed internal contract
        ↓
CoreSpirit / UI / execution
```

A dependency-free boundary validation layer was added for broker API envelopes and the highest-value response contracts: profile, funds, holdings, positions, orders, trades, market quotes, historical candles, option chains, and order mutations.

The runtime event bus was also converted to an explicit event→payload map, so events such as `TICK_UPDATE`, `PORTFOLIO_SYNCED`, `ORDER_EXECUTED`, broker connection changes, and status changes no longer use an untyped payload at the runtime boundary.

This is deliberately a boundary-first typing strategy. A future schema library such as Zod can replace the local guards without changing the surrounding contracts; no new runtime validation dependency is required for v84.

CoreSpirit worker messages are also treated as an untrusted serialization boundary. `chartRunner` validates the worker result envelope and `CoreSpiritObject[]` before results enter the main-thread chart/output pipeline. This keeps a serialization boundary from weakening the VM's typed execution contract.

### v84 acceptance boundary

- exactly one production LiveTradingTerminal implementation exists
- retired terminal generations are guarded against reintroduction
- source-mutating layout hotfix automation is guarded against reintroduction
- SPA routing has one API rule and one fallback rule
- `/corespirit` is part of the same canonical workspace route registry as the other protected modules
- broker JSON is validated before becoming typed internal data
- runtime event payloads are explicitly typed
- no second runtime, terminal runtime, chart renderer, or CoreSpirit VM is introduced

## v88 — complexity absorption, incremental execution, and realtime performance

CoreSpirit v88 freezes the next architectural principle: **the author-facing language stays small while the compiler/runtime absorb increasing complexity underneath it**. The source vocabulary remains DATA, LET, WHEN, SHOW, MODEL and AUTOMATE. Complexity is represented as typed semantic composition rather than as a growing collection of feature-specific language constructs.

The same executable artifact can now be described through reusable component/pipeline contracts, semantic value lineage, execution lanes, and host-owned execution contexts. These are compiler/runtime views of the same program; they do not form second runtimes.

### Complexity absorption

A CoreSpirit program may be projected as:

```text
source → normalized AST → semantic dependency graph → composition graph → execution plan → stable IR → VM
```

Simple source such as `show ema(close, 20)` and larger indicator/model/automation graphs therefore share the same compilation and execution substrate. Progressive Simple, Advanced and Professional authoring profiles are presentation/inspection profiles, not grammar forks.

### Incremental execution

Reactive plans carry a reverse source-input index so a changed market input can begin invalidation from only the directly affected semantic nodes. Dependent propagation continues through the existing graph. Pure deterministic nodes remain cacheable; effectful and authority nodes remain barriers.

Compilation also gains bounded source/result reuse and structural AST reuse. Artifact cache identity includes compiler version, IR version, source identity and semantic identity. Canonical serialization prevents object key order from changing the fast checksum.

### Realtime performance

The high-frequency web path remains external-store driven. Market ticks do not require one React state update per broker packet. Workspace updates are frame-coalesced, chart renderer mutations are frame-coalesced by key, and the realtime calculation engine maintains committed indicator state with developing-bar previews instead of repeated O(window) recalculation.

Historical transport retains shared in-flight requests and stale-while-revalidate behavior while bounding the browser cache. CoreSpirit worker execution uses a reusable bounded pool rather than creating a worker for every run.

### Execution planning

Semantic nodes expose deterministic execution class and hot/warm/cold lane metadata. The execution planner records lane membership, barriers, batching and host accelerator assignments. The planner remains host-owned: GPU/WASM selection never changes semantic meaning and never gains broker, risk or policy authority.

### Lineage and reusable composition

Any semantic dependency graph can be projected into a renderer-neutral lineage graph. Reusable components and pipelines expose typed ports, source identity, deterministic/stateful metadata and capabilities. Package manifests validate those contracts before registry admission.

### v88 boundaries

- No seventh top-level source-language concept was introduced.
- No second CoreSpirit evaluator, VM, runtime or reactive engine was introduced.
- Broker, risk, policy and renderer authority remains host-owned.
- Large datasets are not discarded to create artificial speed; caching, incremental updates and rendering coalescing absorb workload instead.
- Performance telemetry is observational and does not become trading logic.


## v90 — first-class composability without language growth

CoreSpirit v90 deepens the v88 rule: **more expressive programs must not require a proportionally larger language**. DATA, LET, WHEN, SHOW, MODEL and AUTOMATE remain the public authoring model.

### Component composition

A registered typed component is callable from an ordinary expression. Its contract supplies input/output types, determinism, statefulness and capability metadata to the compiler and runtime.

```corespirit
data = close
motionValue = motion(data)
vol = volatility(data)
reg = regime(motionValue, vol)
signal = setup(reg, liquidity, structure)
show signal
```

A single-output component becomes the corresponding CoreSpirit value. A multi-output component becomes a typed component reference, so named output access such as `reg.trendProbability` is resolved through the component contract rather than through a new tuple or component-specific language construct.

### Complexity moves downward

The author should not have to reason about the implementation layers needed to execute a composition:

```text
CoreSpirit source
      ↓
normalized AST
      ↓
semantic typing + component binding
      ↓
semantic dependency graph
      ↓
stable IR
      ↓
execution graph + reactive plan
      ↓
backend planner
      ↓
CPU / WASM / GPU-capable host execution
```

The execution layers can become more sophisticated while the authoring model remains stable. Component contracts also participate in compilation/cache identity, so a changed contract cannot silently reuse an incompatible compiled result.

### Composability boundaries

- Components are explicit registered capabilities; they are not arbitrary host-code injection.
- Component registration does not grant broker, filesystem, network, DOM or unrestricted process authority.
- Stateful/effectful components remain visible to the scheduler and are not treated as pure cacheable computation.
- GPU/WASM are execution targets, not language concepts.
- Formal user-defined function syntax remains unnecessary for this composition model.

The canonical detailed reference is `docs/CORESPIRIT_COMPOSABILITY.md`.


## v91 — semantic component system and progressive authoring depth

CoreSpirit v91 deepens the v90 composition model without expanding the source grammar. The important abstraction is now a **semantic component system**: reusable computations are represented by contracts and composition graphs first, while formal user-defined function syntax remains deliberately deferred.

### Semantic components before language functions

A reusable component is described by a stable contract:

```text
Component
├── identity
├── inputs
├── outputs
├── types
├── state lifecycle
├── dependencies
├── execution class
├── latency / cost
├── determinism
├── cacheability
├── parallelism
├── backend eligibility
└── documentation metadata
```

The public language does not need `FUNCTION`, `COMPONENT`, or `PIPELINE` keywords to make these reusable. A registered component is simply callable from `LET`, and a composition graph can be materialized as another typed component at the host/compiler boundary.

### Reusable graph materialization

The same graph that drives one program can become a reusable component boundary:

```text
composition graph
      ↓
identify public inputs/outputs
      ↓
materialize typed component contract
      ↓
validate execution/state metadata
      ↓
register at explicit host boundary
      ↓
call through ordinary LET expressions
```

This creates reusable graphs without creating a second evaluator. Components still lower through the canonical semantic graph, IR, execution graph and VM.

### Execution and state semantics

Components can now describe where they are eligible to execute and how their state behaves. Pure deterministic components can be marked cacheable, parallelizable and eligible for CPU/WASM/GPU scheduling. Stateful, effectful, I/O and authority components remain constrained to appropriate execution classes and host boundaries.

State is explicit metadata rather than an invisible implementation detail. Bar/window/session/external state can declare snapshot and rollback requirements so realtime revision semantics remain compatible with component reuse.

### Three authoring levels, one language

Progressive authoring is now defined as an explicit feature profile rather than only a UI visibility switch:

```text
Level 1 — Simple
    DATA + LET + SHOW + WHEN

Level 2 — Advanced
    Simple + components + models + multi-symbol/timeframe + richer visuals/automation

Level 3 — Professional
    Advanced + component contracts + execution targets + IR/runtime inspection
              + research + backtesting + optimization + performance controls
```

These levels do **not** create three grammars. A Simple program can grow into an Advanced or Professional artifact by adding more declarations, composition and inspection detail while remaining the same CoreSpirit source language and execution model.

Professional visibility is also not authority escalation. Broker, filesystem, network, process, risk and policy boundaries remain controlled by the host/runtime sandbox.

### v91 invariant

> **Make reusable capability more powerful before making the grammar larger.**

Only add source syntax when a real authoring problem cannot be solved cleanly by typed components, the standard library, models, visuals, automation or host capability contracts.


## v93 — first-class series execution and operation fusion

### Standard library discoverability

The standard library remains discoverable through canonical namespaces while the vector/fusion metadata stays beneath the authoring surface.

Readable surface syntax remains the default: vectorization and fusion are invisible unless an authoring/inspection profile chooses to expose their execution metadata. The same complexity firewall prevents backend and memory machinery from leaking into source syntax.


CoreSpirit v93 makes `series<T>` an execution-level abstraction rather than only a type-system label. Numeric series kernels use dense typed storage (`Float64Array`) when appropriate, with `NaN` representing internal missing/warm-up values. A compatible typed buffer can be consumed without another numeric copy.

### Vector execution contracts

Series-capable library members now declare execution metadata:

```text
vectorizable
fusible
strategy = elementwise | rolling | stateful
```

This is deliberately metadata on the canonical builtin contract. It is not new language syntax and it does not create a second indicator/runtime implementation.

### Operation fusion

A chain such as:

```text
let x = sma(close, 20)
let y = stdev(x, 20)
let z = zscore(y, 50)
```

can be represented internally as:

```text
load close
   ↓
SMA → STDEV → ZSCORE
   ↓
maximal safe fusion group
   ↓
single chronological kernel
```

Transparent `LET` aliasing is followed, so the author does not need pipeline-specific syntax. The fusion planner refuses unsafe fan-out and stateful/effectful operations.

### Memory rule

The fused executor does not create:

```text
full SMA array
full STDEV array
full ZSCORE input array
```

just to pass values between stages. Each stage keeps bounded rolling workspace, while the final dense result is the primary full-length allocation.

### Stateful boundary

EMA and RMA remain vector-capable but are not marked fusible because the canonical runtime treats them as stateful recursive series operations. This distinction prevents an optimization from changing realtime/replay semantics.

### Execution planner

The existing host-owned execution planner now includes the series-fusion plan. Backend eligibility can say `CPU/WASM/GPU`, but availability and authority remain host-controlled. An unavailable accelerator falls back to canonical CPU execution.

## v94 platform data-plane relationship

CoreSpirit series execution and chart execution should converge on the same canonical numeric data plane. The chart-native path now exposes `MarketDataStore` typed-array views and timeline-aligned derived stores instead of requiring object-row conversion. This supports the same general principle already used by CoreSpirit vector execution: values remain dense and reusable until a specific host/API boundary requires materialization.

```text
MarketDataStore
      ↓
Timeline-aligned derived data
      ↓
CoreSpirit series / models / visuals
      ↓
chart LOD / GPU staging
```

The production Vela NativeRenderer adapter is still an explicit object boundary. It does not redefine the canonical data representation.

## v95 — canonical data plane and chart-platform convergence

CoreSpirit v95 extends the zero-copy work into a shared consumer architecture. Market history has one canonical ownership point per timeline, while indicators, models and charting borrow typed views and own only derived outputs/state.

The same principle applies to the chart engine: CoreSpirit and chart consumers depend on semantic chart/data contracts rather than a renderer API.

```text
CoreSpirit / indicators / models
             ↓
       canonical data plane
             ↓
     Chart Data Engine
             ↓
 viewport + scales + scene
             ↓
    rendering coordinator
       ↙           ↘
Lightweight       native WebGL2
 production        experimental
```

This preserves the six-concept CoreSpirit surface and the staged Vela NativeRenderer production policy while establishing the platform boundaries required for a future native renderer.


## v96 chart-coordinate foundation

CoreSpirit's chart platform now treats viewport and scale mathematics as renderer-independent contracts. The viewport is the single horizontal/visible-state authority, while dedicated time and price scale engines own reversible coordinate transforms.

```text
CoreSpirit / indicators / models
          ↓
    canonical data plane
          ↓
       viewport
          ↓
   time + price scales
          ↓
     retained scene
          ↓
 Vela NativeRenderer (production)
       or native renderer
```

The public CoreSpirit language remains unchanged. Chart complexity is absorbed underneath the language and the renderer.


## v97 chart interaction boundary

CoreSpirit visual outputs may target the canonical chart drawing model, but CoreSpirit does not import renderer APIs. Chart navigation and drawing behavior are controlled by Core Chart contracts. This preserves the one-language/one-IR architecture while allowing the chart to evolve from Vela NativeRenderer to the native renderer later.


## 1.7 User indicator settings and public source truth

Indicator settings are renderer-neutral input/style/display metadata attached to the same CoreSpirit authoring artifact. The public indicator projection stores the settings snapshot next to the source snapshot so the public page can describe how the script was authored without depending on a particular renderer.

v98 intentionally separates **source publication** from **arbitrary source execution**. A published script is a compiled, versioned CoreSpirit artifact and public source listing; the current workspace continues to use the registered native indicator executor until the user-component runtime gate is complete.


## v99 host-shell boundary

TradingCoreOS v99 consolidates the `/live` host around the canonical chart workspace. This is a **host UI change, not a CoreSpirit runtime release**: the language, compiler, stable IR, VM, 130-stage roadmap, and v98 user-authored indicator publication/execution boundary remain unchanged.

The live host now follows one ownership chain:

```text
/live
  ↓
LiveTradingTerminal
  ↓
LiveTradingWorkspace
  ├── chart area
  ├── right terminal dock
  └── bottom terminal dock
```

CoreSpirit features continue to enter through their existing editor/compiler/runtime contracts. The terminal shell must not become a second scripting/runtime layer.

## Host integration note — v100

TradingCoreOS v100 applies a flatter terminal visual language to `/live` without changing the CoreSpirit language or execution architecture. CoreSpirit continues to be exposed through the existing host capabilities and chart/strategy integration boundaries.


## v101 host-terminal boundary

TradingCoreOS v101 deepens the `/live` host presentation into a dense terminal workstation. This release does **not** advance CoreSpirit beyond v98.

The host hierarchy is:

```text
LiveTradingTerminal
       ↓
LiveTradingWorkspace
   ├── chart workspace
   ├── right terminal dock
   │    ├── watchlist
   │    ├── order book
   │    └── alerts
   └── bottom terminal dock
```

The right dock is a presentation/control surface. `rightDockOpen`, `rightDockTab` and `rightDockWidth` belong to workspace state. The dock does not become a second compiler/runtime/VM layer, does not own canonical market-data storage, and does not move broker execution into UI code.

The terminal visual language is separator-first and host-scoped: chart infrastructure is square/near-square, compact controls have minimal rounding, transient popovers may use small radii, and decorative shadows are removed from terminal infrastructure. Landing-page aesthetics are outside this rule.

## v102 terminal host boundary — 2026-09-29

TradingCoreOS v102 keeps the terminal on one React root and makes the right dock a first-class presentation subsystem. CoreSpirit remains v98.

```text
index.html
   ↓
src/main.tsx
   ↓
<App />
   ↓
/live route
   ↓
LiveTradingTerminal
   ↓
LiveTradingWorkspace
   ├── chart workspace
   ├── RightTerminalDock
   │    ├── WatchlistSurface
   │    ├── OrderBookSurface
   │    └── AlertsSurface
   └── bottom terminal dock
```

The right dock owns presentation-local panel behavior but not market-data ownership, chart semantics, or broker execution. Only the active dock surface is rendered. Workspace state remains the authority for dock visibility, active surface and width.

The application source contains one React root, owned by `src/main.tsx`. Legacy HTML-loaded DOM bridges and body-mounted terminal hosts are not part of the production lifecycle.

## v103 chart-host data-plane integration — 2026-09-29

CoreSpirit remains **v98**. v103 changes the chart host's resource ownership so multiple visible charts can borrow the same market-data and compute state without multiplying compiler/runtime authorities.

The boundary is:

```text
CoreSpirit chart registry identity
             │
             ▼
      chart-local consumer
             │
             ▼
broker:symbol:timeframe ChartDataPlane
             │
             ├── canonical market data
             ├── shared indicators/analytics
             └── shared prediction work
```

A CoreSpirit registry entry may remain one-per-chart because it represents chart lifecycle and output identity. That is metadata/control state, not an independent market-data store or worker runtime.

The v103 host must preserve:

- one CoreSpirit language/compiler/IR/VM authority;
- no broker authority in chart code or CoreSpirit VM code;
- one canonical market-data ownership point per dataset;
- derived calculations keyed from shared dataset revisions;
- renderer-neutral CoreSpirit visual outputs.

## v104 demand-driven history + multi-chart budget — 2026-09-29

The v103 shared chart data plane is now refined so history initialization, older-page acquisition and compute inputs scale by actual user demand. Initial chart paint is bounded to 300–1,500 candles by timeframe; visible-range movement requests one bounded older page; only the active chart is eligible for a single low-priority warm page. A global `ChartHistoryCoordinator` limits browser history requests to two concurrent operations.

The `HistoryStore` remains reusable retention up to 50,000 candles, but `ChartDataPlane` materializes only its active demanded window. Cached older data is reused through binary-search `getBefore()` before issuing a broker request.

The client/runtime/server history contract now forwards and validates an explicit `limit`, removing the old fixed-size initial request path. The chart compute coordinator also protects pathological deep-history states with a 10,000-candle worker input ceiling while preserving the v103 bounded worker pools and dataset/revision cache identity.

For older-history prepends, logical viewport state is restored with the logical-range API so user navigation does not jump.

**Non-interference:** CoreSpirit language/compiler/IR/VM, execution/risk authority, terminal dock ownership, drawing semantics, and shared realtime symbol-feed ownership remain unchanged.

## Host integration note — v106 — 2026-09-29

CoreSpirit indicators remain renderer-neutral mathematical outputs. The TradingCoreOS chart host may execute compatible built-in indicators through a shared dependency graph so common primitives are reused across studies and chart cells. This is an execution optimization at the host/data-plane boundary and does not introduce new CoreSpirit keywords or alter the language/IR/VM contract.

Indicator appearance metadata (colors, line width, line style, opacity and related display settings) is renderer configuration and is intentionally separated from indicator computation identity.

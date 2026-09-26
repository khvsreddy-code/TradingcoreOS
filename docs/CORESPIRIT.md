# CoreSpirit — How to Think, How It Works, and What Must Never Be Broken

CoreSpirit is the trading-native programming layer of TradingCoreOS. It is not a PineScript clone and it is not a broker scripting API.

The core mental model is:

> **One language → one compiler → one stable IR → one VM → multiple execution environments.**

Charting, replay, research, strategy evaluation, and automation should share the same semantics rather than growing separate mini-runtimes.

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

Keep the deterministic core small and trustworthy. Around 30 core primitives is a deliberate target for v1.

Platform-specific extensions can exist, but they should not silently become part of the language core.

Avoid:

- a giant convenience library
- direct broker APIs in the language
- arbitrary network/filesystem/process access
- AI-generated runtime code
- Pine compatibility becoming the product architecture
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

The architectural roadmap remains:

1. Language foundation
2. Series runtime
3. Indicator runtime
4. IR + VM
5. Historical vs realtime semantics
6. Runtime-native indicators
7. Tiny standard library
8. Compiler pipeline
9. Stable IR contract
10. CoreSpirit replay
11. Debugger
12. Signal boundary
13. Strategy model
14. Killer example
15. Explicit non-goals
16. Release roadmap
17. IDE/runtime convergence
18. Platform architecture/governance

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

Renderers consume the scene and decide how to draw it. A web renderer may use Lightweight Charts plus canvas/DOM overlays; a replay renderer may use the same semantic scene for deterministic image output; a headless renderer can inspect identities and interaction references without any browser.

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
- no Pine-compatible plot model as the architectural center

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

The differentiator is not that CoreSpirit can draw more objects than Pine. The differentiator is that the chart, research surface, model surface, UI surface, signal surface and automation surface are all projections of one deterministic trading runtime.

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

Renderer implementations remain outside CoreSpirit. The realtime engine does not know about Canvas, WebGL/WebGPU, lightweight-charts, DOM nodes, or native views. A renderer receives the final scene/patch and chooses how to allocate GPU buffers, textures, hit-test regions, animation clocks, or platform UI.

The same mechanism is also suitable for replay: the scene revision and checksum become part of the replay trace, so a visual divergence can be inspected at the exact revision where it occurred.


## 25. Documentation and build-status boundary

CoreSpirit intentionally keeps two human-facing documents with different jobs:

- `docs/CORESPIRIT.md` is the stable architecture brain: how to think about CoreSpirit, its invariants, runtime model, execution boundaries, visual model, and design decisions.
- `docs/CORESPIRIT_BUILD_TRACKER.md` is the living implementation truth: current release status, stage completion, verification results, known gaps, and next concrete work.

Machine-readable `CORESPIRIT_Vxx_MANIFEST.json` files remain the release identity record. They do not replace the build tracker.

Do not create version-specific CoreSpirit architecture Markdown files. Update the architecture document only when architectural truth changes; update the tracker whenever implementation status changes.

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

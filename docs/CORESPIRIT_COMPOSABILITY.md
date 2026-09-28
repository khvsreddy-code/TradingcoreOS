# CoreSpirit Composability

## Design goal

CoreSpirit should be **simple to learn and extremely expressive**. The language surface stays centered on six concepts:

`DATA` · `LET` · `WHEN` · `SHOW` · `MODEL` · `AUTOMATE`

The system gets more powerful by enriching the compiler/runtime model rather than by adding a large vocabulary of implementation keywords.

## The key rule: semantic component first, function syntax later

The project deliberately does **not** start by adding traditional user-defined function syntax such as:

```text
fn volatilityExpansion(price): ...
```

or:

```text
component volatilityExpansion(price): ...
```

Those forms may become a readability feature later, but they are not required to establish reuse. The deeper foundation is a semantic component system that can represent reusable computation independently of surface syntax.

A component is a typed, named execution contract. A composition graph is therefore already a reusable object at the compiler/host layer.

## Semantic component contract

A reusable component can carry:

```text
Component
├── id / version
├── name + aliases
├── typed input ports
├── typed output ports
├── component dependencies
├── node identity / lineage
├── state lifecycle
├── execution class
├── latency class
├── estimated cost
├── determinism
├── cacheability
├── parallelizability
├── eligible backends
├── capabilities
└── optional documentation/examples
```

The contract is intentionally richer than a plain function signature because TradingCoreOS needs to schedule, cache, replay and sandbox trading computations correctly.

### Why this is better than a normal function abstraction

A traditional function mainly describes:

```text
inputs → output
```

A TradingCore component also needs to answer:

```text
Can it be cached?
Can it run in parallel?
Is it stateful?
Can it survive realtime rollback?
Which backend can execute it?
What authority does it require?
What is its expected cost?
What source nodes produced it?
```

Those questions belong to semantic/runtime metadata, not to a larger language grammar.

## Building a reusable graph/component from a graph

A **reusable graph** is the internal composition object that can later be materialized as a callable component.


Any validated composition can be materialized into a reusable contract:

```text
source program
      ↓
semantic dependency graph
      ↓
composition graph
      ↓
identify boundary inputs/outputs
      ↓
materialize typed component
      ↓
register at explicit host boundary
```

The materialized component preserves the graph's public inputs/outputs and node lineage. It can then be called using ordinary composition syntax:

```corespirit
data = close
motion = motion(data)
expansion = volatilityExpansion(motion)
show expansion
```

The identifier `volatilityExpansion` is resolved by the component registry; no new keyword is needed.

## Single-output composition

A single-output component behaves like a normal CoreSpirit value:

```corespirit
motion = motion(close)
show motion
```

Its identity is still retained below the surface so the compiler/runtime can associate diagnostics, cache identity, cost, lineage and scheduling metadata with the computation.

## Multi-output composition

A multi-output component becomes a typed component reference:

```corespirit
regime = regime(motion, volatility)
show regime.trendProbability
show regime.rangeProbability
```

The member name is resolved against the registered output ports. CoreSpirit therefore avoids adding tuple destructuring or a component-specific declaration form solely to support multiple outputs.

## Component state

State is a semantic property, not an accidental side effect of an implementation.

A reusable stateful component can declare lifecycle metadata such as:

```text
stateless
bar
window
session
external
```

and whether its state is:

```text
snapshotable
rollbackable
```

This matters for realtime:

```text
confirmed state
      ↓
working revision
      ↓
rollback OR commit
```

A stateful component that participates in developing-bar execution must have semantics compatible with the host's transactional revision model. Pure components do not need hidden state to be reused.

## Execution metadata

The component contract can also describe:

```text
execution class: pure / stateful / io / event / visual / authority
latency:         instant / fast / normal / slow / external
cost:            constant / low / medium / high / external
backends:        CPU / WASM / GPU / host / remote
```

The planner uses this information to select an execution lane and accelerator without exposing those implementation details to normal authors.

For example:

```text
pure + deterministic + cacheable
        ↓
vectorizable
        ↓
CPU / WASM / GPU candidate
```

while:

```text
stateful / IO / authority
        ↓
ordered execution barrier
        ↓
host-controlled backend
```

## Three authoring levels

The authoring levels are progressive presentation/inspection profiles over one language.

### Level 1 — Simple

Designed for the shortest path from idea to visible result:

```corespirit
show sma(close, 20)

when close > sma(close, 20):
    show close
```

Primary concepts:

```text
DATA
LET
SHOW
WHEN
```

The editor should emphasize readable snippets, basic diagnostics, simple autocomplete and direct chart feedback. IR, backend placement and capability details remain hidden.

### Level 2 — Advanced

Advanced authors can compose calculations and platform capabilities without having to understand the internal VM:

```corespirit
volatility = atr(14)
expansion = volatility / median(volatility, 50)
regime = regime(motion(close), volatility)

when expansion > 1.5:
    show regime
```

This level exposes:

```text
component composition
MODEL declarations
multi-symbol data
multi-timeframe data
richer visuals
automation
```

but continues to present the system primarily as typed values and semantic composition.

### Level 3 — Professional

Professional authoring exposes the engineering surfaces needed for research and high-complexity systems:

```text
components
pipelines
execution targets
component contracts
multi-symbol
multi-timeframe
models
custom visuals
automation
backtesting
research
optimization
performance controls
IR inspection
runtime inspection
```

The critical rule is that Professional is **not another language**. It is a deeper view into the same artifacts.

## Upgrade path

The authoring model should support natural growth:

```text
Simple
  ↓ add calculations
Advanced
  ↓ add component contracts / execution / research
Professional
```

An existing source program is not rewritten into a different syntax merely because the author needs more power.

## Same language, deeper machinery

All levels converge through:

```text
CoreSpirit source
      ↓
AST
      ↓
semantic analysis
      ↓
typed component graph
      ↓
CoreSpirit IR
      ↓
execution graph
      ↓
reactive/incremental plan
      ↓
CPU / WASM / GPU / host execution
```

The authoring level never selects a different compiler or runtime.

## Extensibility rule

When a new capability is proposed, prefer this order:

1. standard-library callable
2. registered typed semantic component
3. reusable composition graph / pipeline
4. MODEL binding
5. visual/automation projection
6. host capability
7. new source syntax only when the above cannot express the authoring intent clearly

This rule prevents accidental language bloat.

## Safety and authority

Component composition is not authority composition.

Registration does not grant:

```text
broker credentials
filesystem access
arbitrary network access
DOM/process access
risk-policy bypass
```

Host capability policy remains authoritative. A Professional profile can expose more diagnostics and execution metadata without changing that security boundary.

## Long-term direction

The eventual user experience should feel like one computation fabric:

```text
DATA
  ↓
LET values
  ↓
components / indicators / models
  ↓
WHEN conditions
  ↓
SHOW projections
  ↓
AUTOMATE intent
```

The language can remain compact while the underlying graph, optimizer, scheduler and backend system become extremely sophisticated.

## Complexity absorber

CoreSpirit should absorb complexity below the authoring surface:

```text
source
 ↓
AST
 ↓
semantic graph
 ↓
typed component graph
 ↓
MODEL/indicator/automation contracts
 ↓
dependency graph
 ↓
execution planner
 ↓
CPU / WASM / GPU / host
```

The more capable the system becomes, the less source syntax should need to change. A graph with hundreds of internal nodes can still be exposed as one typed component with a small input/output boundary.

The component boundary should preserve enough information for incremental compilation, caching, replay, rollback, cost estimation, backend eligibility, lineage and diagnostics. That is the mechanism that lets CoreSpirit become extremely expressive without becoming syntactically large.

## Standard-library namespaces

Namespaces scale discoverability without creating namespace-specific execution engines. Current namespace families are:

```text
market.* series.* math.* stats.* time.* structure.* volatility.*
liquidity.* probability.* model.* visual.* automation.* data.* state.*
```

Qualified members resolve in this order:

```text
qualified name
     ↓
namespace registry
     ↓
canonical builtin OR registered component
     ↓
same semantic analysis / IR / VM path
```

Examples such as `stats.median(close, 20)` and `math.abs(value)` are aliases into existing executable semantics. A member such as `volatility.expansion` may be cataloged before a component contract is registered; the compiler must report that distinction rather than pretending the future capability already executes.

## Deep composability invariants

1. A component can consume a component's output by value.
2. Multi-output components retain named typed output ports.
3. A reusable graph has a public input/output boundary independent of its internal node count.
4. Model ABI contracts can be projected into the same component graph.
5. Component identity participates in IR and cache identity.
6. State lifecycle remains explicit for realtime rollback/commit.
7. Component composition never expands host authority.


## v93 series composition depth

Series composition is now explicitly optimization-aware without becoming syntax-aware.

```text
source
  ↓
LET values
  ↓
typed series dependencies
  ↓
canonical IR
  ↓
series fusion planner
  ↓
single-pass kernel
```

Transparent aliases produced by `LET` do not break fusion. The planner follows `move` and `setLocal` links and detects whether an intermediate result has one semantic consumer. This prevents an optimization from deleting a value still required by another branch.

A reusable component can therefore contain a dense series graph whose internal execution is fused, while the component contract remains the same typed boundary described elsewhere in this document.

### Fusion invariants

1. Fusion is derived from canonical semantic contracts, not a second list of language operators.
2. Only pure deterministic series operations with explicit fusion contracts are candidates.
3. Stateful recursive indicators remain outside the fused chain.
4. Full intermediate series buffers are not required by the fused path.
5. The scalar VM remains available as the fallback semantics.
6. Backend choice remains separate from semantic composition.

## v95 shared data composition

Composability now includes data ownership semantics. A component can consume a typed canonical series view without taking ownership of the underlying market history.

```text
canonical market view
        ↓
component input binding
        ↓
indicator / model computation
        ↓
derived output store
```

This separates:

```text
input history ownership
≠
algorithm state ownership
≠
derived output ownership
```

That distinction is required for large graphs containing many indicators and models over one market timeline.

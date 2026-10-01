# CoreSpirit Composability


## User-authored indicator workflow

The indicator workspace provides editable starter CoreSpirit source for supported native indicators. Source edits use the same compiler and semantic contracts as the main CoreSpirit editor. Saving creates immutable versions; publishing creates a public source snapshot in the indicator community catalog.

The public route `/explore/indicators/<slug>` is intentionally separate from the protected workspace route.

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


## Progressive authoring and library depth

The three authoring levels are views over the same language:

```text
Simple → readable values / conditions / SHOW
Advanced → composition / models / multi-symbol / multi-timeframe / automation
Professional → contracts / IR / runtime / backend / research / optimization
```

The level never changes the compiler or runtime. It changes discovery and inspection depth.

### Qualified standard-library calls

CoreSpirit supports namespace-qualified calls without adding namespace-specific syntax rules. For example:

```corespirit
let fast = series.ema(close, 20)
let dispersion = stats.stdev(close, 20)
let expansion = volatility.expansion(close)
let probabilityValue = probability.sigmoid(dispersion)
show visual.show(probabilityValue)
```

`series.ema`, `stats.stdev`, `probability.sigmoid` and similar executable members lower to existing canonical builtins. Component-backed names resolve through the semantic component registry. Catalog-only names remain documentation/discoverability entries until a real executable contract is registered.

This keeps namespace growth from creating a second language, duplicate indicator math, or a second VM.

## Future user declarations

A future source-level `fn` or `component` declaration is optional. It should be introduced only as syntactic sugar over the existing semantic component materialization model:

```text
source declaration
      ↓
semantic graph
      ↓
validated reusable component contract
      ↓
same compiler / IR / VM
```

No future declaration syntax should introduce a parallel evaluator or bypass capability, state, replay, risk, or host-authority contracts.


## v93 vector/series and fusion authoring model

The source experience does not change when vector execution is enabled:

```corespirit
let returns = pctchange(close)
let z = zscore(returns, 100)
let persistenceValue = persistence(z, 30)
plot(persistenceValue)
```

The compiler can treat the numeric section as a series graph and lower compatible operations to one fused kernel. Authors do not write `vector`, `kernel`, `fuse`, `GPU`, or worker directives.

### Professional inspection

Professional tooling may show:

```text
series input
fusion group
operations
lookback
workspace
backend eligibility
fallback path
```

That is inspection of the same artifact, not a new programming language.

### Standard-library relationship

The vector/fusion contract belongs to the same standard-library and namespace registry. Examples include:

```text
series.pctchange(...)
series.zscore(...)
series.normalize(...)
stats.persistence(...)
```

Qualified names still lower into canonical executable members. The namespace does not own another implementation of the math.

## v98 user-authored indicator model

Indicator authoring uses the same CoreSpirit compiler and versioned script persistence as other CoreSpirit artifacts. Settings are renderer-neutral metadata, while the source snapshot is immutable per saved version.

```text
IndicatorConfig
    ├── inputs
    ├── style
    └── display
          ↓
Indicator Studio source
          ↓
CoreSpirit compiler
          ↓
script version + compiled IR
          ↓
optional public publication
```

The v98 public catalog shows source intentionally. Arbitrary edited source is not implicitly granted production chart execution or broker authority; native indicator execution remains the current workspace path until the user-component runtime gate is completed.

## v95 shared-series authoring model

The author still writes ordinary CoreSpirit composition:

```text
let returns = pctchange(close)
let regime = model(regimeModel, returns)
show regime
```

The runtime is now designed so `close` resolves to a canonical series view rather than an indicator-owned history array. This distinction is invisible at Level 1 and inspectable at Professional level.

## v111 — First-class programmable indicators

The recommended mental model for an indicator is now:

```text
source
 ↓
calculation
 ↓
state
 ↓
plots / visuals / events / alerts
```

All of these come from one CoreSpirit executable artifact.

### Example

```corespirit
let basis = ema(close, 20)
let volatility = atr(14)
let expansion = volatility / sma(volatility, 50)

if expansion > 1.5 {
  show(basis)
}

show(basis)
```

The author does not need to learn compiler IR, worker affinity, renderer APIs or Vela objects to write the calculation.

### Indicator component identity

A compiled CoreSpirit indicator exposes typed inputs and outputs, state requirements, calculation metadata and renderer-neutral visual/event descriptors. This makes it reusable in another CoreSpirit graph without inventing an indicator-specific function system.

### Future declaration syntax

`indicator "Name"` is intentionally treated as future metadata/identity sugar over the existing artifact/component model. It is not a second language and should not change VM semantics.

## v111.1 — Programmable indicators without keyword expansion

A first-class indicator is authored with the same small language surface already used for calculations and visuals. The platform adds capability through its artifact/component model rather than by adding indicator-specific keywords.

```text
DATA → LET → WHEN → SHOW
          ↓
   typed graph / IR
          ↓
   indicator component declaration
```

The declaration is an ABI-level object containing `inputs`, `outputs`, `calculation`, `state`, `events`, `plots`, `visuals`, `alerts` and `metadata`. Settings remain a separate schema because changing appearance must not invalidate the calculation graph.

A host can run the same artifact historically or through a realtime execution host. The user does not write host constructors, worker messages or Vela operations in CoreSpirit.

The optional surface form `indicator "Name"` remains declaration sugar only. It must lower into this same component/artifact representation if enabled; it must not become a new evaluator or VM.


## v112 — Parameters without grammar expansion

CoreSpirit indicators can expose a universal parameter schema without adding parameter-specific keywords.

Conceptually:

```text
CoreSpirit program
    ↓
compiled artifact
    ↓
indicator component
    ↓
parameter schema
```

The authoring surface remains `DATA`, `LET`, `WHEN`, `SHOW`, `MODEL`, `AUTOMATE`. Parameter metadata belongs to the artifact/component boundary, not to a parallel evaluator.

A parameter can be typed as `number`, `integer`, `decimal`, `boolean`, `enum`, `color`, `source`, `timeframe`, `symbol`, `session`, `price`, `duration` or `string`, with constraints and conditional visibility.

A future declaration such as:

```text
indicator "Adaptive Trend"
```

can carry or reference these definitions as metadata sugar. It does not become a new language runtime.

## v113 — semantic series annotations

CoreSpirit keeps its compact language surface while allowing explicit semantic type annotations when an author wants stronger guarantees:

```text
let basis: series<price> = close
let traded: series<volume> = volume
let stamp: series<time> = time
```

The compiler treats the annotation as semantic information; the existing VM still receives its compatible structural type. Built-in market fields expose domain-aware type information in the editor.

A future conversion function can intentionally erase or change a semantic domain, but ordinary arithmetic does not silently coerce unrelated domains.

## v113 — preset-aware authoring

Indicator artifacts can declare parameter defaults and serializable templates without teaching authors a second configuration language. The universal editor consumes the same parameter schema used by CoreSpirit publication/runtime metadata.



## v113 depth pass — parameter dependencies, presets and semantic series

The current contract is no longer a flat parameter form. Universal parameters are typed, constrained and serializable; dependency conditions are validated against declared target fields and resolved from fully hydrated defaults. The parameter schema compiles into a dependency graph with deterministic evaluation order and reverse dependents for incremental UI updates.

Preset configuration is layered and profile-aware: Factory → Script → Workspace → Personal. Profiles persist selected preset IDs per indicator, while community presets remain read-only. Preset/profile data is JSON-safe and validated against the current parameter schema.

CoreSpirit semantic series types distinguish `series<price>`, `series<volume>`, `series<time>`, `series<number>` and related domains while retaining the structural VM type system. Explicit `toNumber`/`toPrice`/`toVolume`/`toTime`/`toDuration`/`toCurrency` conversions are the intentional escape hatch; implicit cross-domain arithmetic remains rejected.

Appearance stays outside computation identity, so changing parameter UI state or presentation settings does not trigger indicator mathematical recomputation.


## v114 depth pass

The universal configuration architecture is now compiled rather than merely described. Parameter kinds validate their own value domains; conditions compile to dependencies and reverse dependents; preset profiles can select explicit active presets; and semantic conversions are explicit, pure and capability-neutral.

The current configuration flow is:

```text
CoreSpirit indicator/component
        ↓
parameter schema v3
        ↓
validated parameter state + dependency graph
        ↓
preset/profile resolution
        ↓
universal editor / runtime configuration
```

Semantic series typing remains separate from VM structural typing:

```text
series<price> + series<volume>  → compile-time error
toNumber(series<price>)        → explicit domain conversion
price * volume                 → currency/notional
time - time                   → duration
```

These systems do not grant host authority and remain outside appearance-driven invalidation.

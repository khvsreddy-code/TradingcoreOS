# v112 — Universal CoreSpirit indicator parameters and conditional settings

## 1. Direction

TradingCoreOS now treats indicator configuration as a typed, serializable parameter ABI rather than a collection of indicator-specific controls.

```text
CoreSpirit indicator artifact
        ↓
IndicatorSettingsSchema v3
        ↓
parameter ABI
        ↓
Universal settings editor
        ↓
resolved parameter state
        ├── workspace
        ├── publication
        └── computation / presentation routing
```

The parameter ABI is intentionally separate from appearance metadata. Calculation parameters can invalidate mathematical execution; appearance metadata cannot.

## 2. Supported parameter types

The schema recognizes:

```text
number
integer
decimal
boolean
enum
color
source
timeframe
symbol
session
price
duration
string
```

Legacy `select`, `text`, `range`, and `multi-select` fields remain supported as schema-compatible controls.

## 3. Common parameter contract

Every parameter can declare:

```text
id
path
label
type/defaultValue
min/max/step
options
group
tooltip
placeholder
unit
advanced
readonly
validation
dependency
visibilityCondition
```

All metadata remains JSON-serializable. Arbitrary callback validators and renderer objects are deliberately excluded.

## 4. Conditional settings

Conditions are bounded data, not executable schema code.

```text
equals
notEquals
greaterThan
greaterThanOrEqual
lessThan
lessThanOrEqual
in
notIn
truthy
falsy
AND / OR / NOT composition
```

Example:

```text
Method = Adaptive
    ↓
show Adaptation Length
show Sensitivity
show Noise Filter

Method = Fixed
    ↓
hide Adaptive-only parameters
```

The canonical condition evaluator reads only declared parameter paths. It rejects unsafe paths, self-dependencies and excessive nesting.

## 5. Resolved parameter state

The runtime resolves one immutable state object containing:

```text
values
visible paths
validation errors
valid
```

The same resolver is intended for the editor, persistence normalization and publication snapshots so those surfaces cannot disagree about what a valid parameter state means.

Before visibility evaluation, missing parameter values are hydrated from schema defaults into the evaluation view. This makes conditional settings deterministic on first render rather than dependent on whether a previous workspace snapshot happened to persist the controlling field.

## 6. Computation isolation

`buildIndicatorComputationSnapshot()` now derives its editable configuration from `schema.parameters`. Style/display/renderer fields remain outside the calculation identity.

```text
parameter changes
    → computation identity may change
    → incremental reseed/recompile as required

appearance changes
    → appearance identity only
    → renderer mutation
    → no mathematical recomputation
```

## 7. Compatibility

v1 and v2 custom setting schemas are upgraded in memory to schema v3. If a legacy schema has no explicit parameter array, parameters are projected from its Inputs fields. Existing flat values remain loadable.

## 8. Roadmap

Stages 155–159 cover the parameter ABI, universal types/constraints, dependency graph, resolved state/migration runtime and the release gate.

# TradingCoreOS Indicator Settings Schema

Updated: 2026-09-29 · CoreSpirit v110

## Decision

Indicator settings are published as declarative, versioned metadata. `IndicatorSettingsPanel` is a generic schema renderer; it must not grow one-off branches for individual indicator kinds.

Canonical implementation: `src/services/coreSpirit/indicatorSettingsSchema.ts`.

## Contract

```text
IndicatorSettingsSchema
├── version
├── id
├── identity
│   ├── kind
│   ├── title
│   ├── definitionVersion
│   └── source (native | corespirit | community)
├── layout
│   ├── defaultPane / allowedPanes
│   └── defaultScale / allowedScales
├── outputs[]
├── capabilities
│   ├── rendererNeutral
│   ├── incrementalExecution
│   ├── multiOutput
│   ├── alertsSchema
│   ├── behaviorSchema
│   └── visualizationSchema
└── sections[]
    ├── inputs
    ├── style
    ├── display
    ├── behavior
    ├── alerts
    └── visualization
```

Each field is declarative:

```ts
{
  id: 'display-opacity',
  path: 'display.opacity',
  label: 'Opacity',
  kind: 'number',
  defaultValue: 1,
  min: 0.15,
  max: 1,
  step: 0.05,
  advanced: true
}
```

`visibleWhen` expresses a simple equality dependency against another declared path. It is not an executable predicate.

## Why this is the scalability boundary

The old model encoded settings in several places: indicator kind checks, settings panels, dock controls and defaults. That causes drift as the indicator catalog grows. The schema makes the indicator definition the source of truth, while UI, persistence and publication consume the same description.

A future CoreSpirit/community indicator can supply a validated schema and immediately receive the same editor behavior. The implementation does not need another React form branch.

## Reset and defaults

The schema owns default values. Reset generates a patch by walking every declared field. Nested patch writes preserve previous sibling keys.

## Security

Custom schemas are treated as untrusted metadata. Validation rejects malformed structure, duplicate field IDs/paths, invalid numeric ranges, excessive option counts and path segments that could mutate JavaScript object prototypes. The schema cannot contain functions.

## Persistence

Workspace state normalizes missing schema fields. Public publication stores the resolved values plus the schema definition inside `indicator_publications.indicator_settings` JSONB. This is an additive JSON projection; the existing database column remains sufficient.

## Renderer independence

The schema contains no Vela APIs or render objects. `layout`, `outputs`, style metadata and visualization declarations are translated into TCO chart/render packets before reaching the Vela adapter.

## Security boundary

The schema is declarative metadata, not executable code. Identity, layout, output IDs, section IDs and field paths are bounded and runtime-validated. Paths explicitly reject `__proto__`, `constructor` and `prototype`. A custom schema must also identify the same indicator kind it is attached to. The nested patch writer repeats the unsafe-path check before writing, so unsafe paths are rejected even if a caller bypasses the schema validator.


## v110 schema v2 — presentation is a first-class, renderer-only contract

The schema ABI is now version **2**. The important design split is not only “inputs versus style”; it is **calculation identity versus presentation identity**.

```text
Indicator definition
├── identity
├── inputs                 → calculation identity
├── outputs                → stable result identity
├── style                  → presentation only
├── display                → presentation only
├── behavior               → presentation/runtime policy
├── alerts                 → event presentation/policy
├── visualization          → renderer intent
└── pane / scale           → renderer presentation

                 ┌───────────────────────────────┐
inputs + source ─┤ computation signature          ├─→ worker/incremental state
                 └───────────────────────────────┘

style/display/presentation ─→ appearance snapshot ─→ TCO chart facade → Vela
```

### Appearance schema

The canonical renderer-neutral appearance model is `src/services/coreSpirit/indicatorAppearance.ts`.

#### Line

```text
color
opacity
width
solid | dashed | dotted
gradient
gradientColor
glow
glowStrength
zoomMinBars / zoomMaxBars
timeframes[]
authoritative visibility result
```

Zoom and timeframe visibility are evaluated from render context. They do not modify the indicator data set and do not enter the computation signature.

#### Fill

Band-producing indicators can declare:

```text
enabled
upperColor / lowerColor
opacity
gradient
conditional
bullishColor / bearishColor
```

The Vela adapter keeps the two source series as hidden renderer-owned anchors and updates only the fill primitive when appearance changes. Conditional and gradient colors are produced from existing indicator outputs; no indicator kernel is re-run.

#### Markers

```text
shape
size
position
color
text
textSize
offset
enabled
```

Marker metadata stays renderer-neutral. Existing TCO marker events are associated with their indicator ID so the universal appearance resolver can restyle them without regenerating the signal calculation.

#### Levels

```text
color
width
style
extension
label
labelPlacement
```

Level settings control the presentation of already-computed level geometry. A later renderer-native retained-level primitive can consume the same metadata without changing the CoreSpirit indicator ABI.

#### Pane / scale

```text
overlay | separate | auto
price | percent | indexed | log
auto | manual
min / max
auto
inverted
```

Pane changes are renderer operations. A separate pane is keyed by indicator ID so multi-output indicators share one scale/pane instead of creating one pane per series.

### The no-recompute invariant

This is a hard performance rule:

```text
math input changed
    → computation signature changes
    → worker state may reset/reseed

appearance changed
    → computation signature unchanged
    → no worker request
    → no indicator kernel execution
    → renderer-only update
```

The incremental runtime and shared-worker coordinator both use `buildIndicatorComputationSignature(...)`. The LiveChart host uses separate `indicatorComputeKey` and `indicatorAppearanceKey` effects. The worker payload is also stripped of appearance-only fields so presentation metadata is not needlessly transferred to workers.

The historical `buildIndicatorSettingsSnapshot()` remains available for publications because it is the complete persisted artifact. It is **not** a calculation trigger.

### Schema migration

v1 custom schemas remain readable. The loader upgrades the schema envelope to v2 in memory before validation. This keeps already-published CoreSpirit community indicators loadable while enabling the richer renderer contract.

### Validation requirements

v2 schema validation now covers:

```text
identity and kind match
layout/default compatibility
bounded section/field/output identifiers
duplicate ID/path rejection
numeric bound consistency
option cardinality
multi-select default membership
visibleWhen dependency validity
unsafe path rejection
rendererNeutral capability
```

## v111 relationship to first-class indicator components

The settings schema is presentation metadata attached to the same first-class CoreSpirit indicator component that owns calculation identity.

```text
CoreSpiritIndicatorComponent
├── executable artifact        ← calculation identity
├── typed ports
├── state / events / outputs
├── settings schema            ← presentation/configuration identity
└── visual projections
```

The schema may change without invalidating the executable artifact when the edit is appearance-only. Mathematical input changes remain calculation-affecting and are therefore part of compute identity.

## v111.1 — Settings are an input to presentation, not the indicator component itself

The first-class component and the settings schema have deliberately different responsibilities:

```text
CoreSpiritIndicatorComponent
├── source / artifact / graph
├── typed public ports
├── calculation / state / events
└── output projections

IndicatorSettingsSchema
├── calculation parameter fields
├── style / display
├── behavior
├── alerts
└── visualization / pane / scale
```

A parameter field can require computation invalidation when it changes. Appearance fields cannot. The runtime therefore derives the computation identity from the calculation-relevant configuration and keeps the presentation snapshot on a separate invalidation path.

This separation lets a component be reused with different visual themes, pane layouts, marker styles, fill gradients or zoom/timeframe visibility without recompiling or reseeding the mathematical artifact.


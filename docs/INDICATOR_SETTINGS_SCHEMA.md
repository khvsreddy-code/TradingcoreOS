# TradingCoreOS Indicator Settings Schema

Updated: 2026-09-29 · CoreSpirit v109

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

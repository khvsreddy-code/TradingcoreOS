# CoreSpirit v114 — Universal configuration, presets, conditional dependencies and semantic typing

Date: 2026-10-01

## Scope

v114 deepens v113 without changing the CoreSpirit-first direction. The universal parameter system, preset/profile system, conditional settings, and semantic series model become explicit compiler/runtime contracts.

## Parameter system

Parameter definitions now validate their own value domain. The editor never needs to know that a field belongs to MACD, EMA or a community indicator. The schema supplies type, constraints, options, dependencies, validation and presentation metadata.

The dependency model is compiled into forward dependencies and reverse dependents, with a deterministic evaluation order. A single changed path can therefore identify the transitive conditional settings affected by that change.

## Conditional settings

Visibility and enabled state are resolved from default-hydrated values. Condition trees are bounded, target-type aware, cycle checked and fail closed. `NOT`, `ALL` and `ANY` remain data structures; no arbitrary callbacks are admitted from schemas.

## Presets and profiles

Configuration layers are resolved as Factory → Script → Workspace → Personal. Profiles can explicitly select a personal/workspace preset per indicator. Unselected layers use deterministic latest-by-updatedAt/id fallback.

Presets are schema validated and JSON safe. Versioned preset bundles provide a portable artifact boundary. Profile fingerprints canonicalize preset IDs, values and active selections for reconciliation/change detection.

## Semantic series

The semantic layer keeps CoreSpirit's structural VM type system intact while adding domain types and metadata to compiler analysis. `series<price>` and `series<volume>` are not interchangeable even though both are numerically represented at runtime.

Valid dimension-aware operations include price × volume → currency and time − time → duration. Invalid combinations such as price + volume and price > volume become compiler diagnostics.

Intentional domain changes use pure explicit conversions:

```text
toNumber
toPrice
toVolume
toTime
toDuration
toCurrency
```

## Non-interference

Parameter configuration and preset selection remain separate from appearance state. Appearance-only changes stay outside calculation signatures. Semantic types and conversions add no host capability.

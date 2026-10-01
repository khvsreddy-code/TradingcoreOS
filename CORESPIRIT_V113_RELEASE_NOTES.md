# CoreSpirit v113 — Build repair + universal presets + semantic series typing

Date: 2026-10-01

## Scope

v113 completes the deeper pass over universal parameters and conditional settings, extends them into presets/profiles, and introduces semantic domain typing for series values.

The release also fixes the ten source/generated-build annotations reported by GitHub/Vercel for the Vela migration boundary.

## 1. Build / annotation repairs

### `LiveChart.tsx`
The indicator-series registration helper referenced the component-local `indicatorSeries` ref while living at module scope. It is now defined inside `LiveChart`, alongside the ref it owns.

### `LevelSettingsDock.tsx`
`ReactNode` is now explicitly imported as a type. No undeclared `React` namespace is required.

### `IndicatorSourceEditor.tsx`
`getIndicatorSettingsSchema` is restored from the canonical CoreSpirit schema module.

### `IndicatorSettingsPanel.tsx`
Multi-select options use DOM option values directly from the typed `selectedOptions` collection, and the panel now consumes the resolved parameter state's `visible` and `enabled` maps rather than independently evaluating dependencies.

### `App.tsx`
`RouteErrorBoundary` now declares `RouteErrorBoundaryProps` and extends `Component<RouteErrorBoundaryProps, ...>`, making `this.props` valid under React's current TypeScript types.

### Generated `dist`
Generated build output is outside the source-of-truth boundary. `dist/` is ignored and the repository hygiene contract ensures generated worker artifacts are not tracked.

### Node version alignment
The package engine, lockfile root engine and GitHub Actions runtime are aligned to Node 24.x. This removes the previous Vercel warning where `engines.node = 22.x` overrode the Project Settings Node 24 configuration.

## 2. Universal parameter depth

The parameter system remains schema-driven and indicator-kind agnostic. Parameters expose trading-aware types and constraints, and conditions can control both visibility and enabled state.

Condition validation is now target-field aware. Numeric comparisons cannot target strings/colors, `matches` cannot target numeric fields, and membership conditions require a compatible selectable/string-like target.

Dependency cycles, self-references, unsafe paths, malformed groups and excessive nesting remain rejected before the schema reaches the editor.

## 3. Presets / templates / profiles

The serializable preset ABI now supports:

```text
Factory Default
Script-embedded Defaults
Factory Templates
Personal
Workspace
Community
```

Artifacts can declare their own template definitions with explicit IDs, names, descriptions and parameter overrides. This is configuration data; it does not execute code or add indicator-specific UI branches.

Effective parameter layers are resolved deterministically:

```text
Factory → Script → Workspace → Personal
```

The resolver returns both the effective values and the preset identity applied at each layer.

Local writes are restricted to personal/workspace presets. Community presets remain read/catalog surfaces.

Profiles are isolated by user/workspace context, serialize through the same preset ABI and are bounded to 128 presets. Active profile metadata can associate a selected preset with an indicator kind without creating a second configuration format.

## 4. Semantic series types

CoreSpirit now distinguishes the semantic atoms:

```text
number
price
volume
time
duration
boolean
string
currency
```

including:

```text
series<number>
series<price>
series<volume>
series<time>
series<duration>
series<boolean>
series<string>
```

Semantic metadata may include unit, currency, symbol, timeframe, precision and scale.

This sits above the structural VM type system. The VM can still consume `series<number>` while the compiler knows the value is semantically `series<price>`.

## 5. Domain-aware operators

The semantic layer now rejects expressions such as:

```text
price + volume
price > volume
```

while preserving valid combinations such as:

```text
price + number
price - price
price / price
price * volume
series<time> + duration
```

Source-preserving functions keep the source semantic domain when meaningful. ATR/true-range/VWAP are classified as price-domain outputs, while RSI-like normalized oscillators are numeric/percent-domain outputs.

## 6. Tooling

CoreSpirit language completions and type information advertise domain-aware market series instead of collapsing all series to an anonymous numeric type.

Explicit declarations such as:

```text
let basis: series<price> = close
```

are accepted by the parser and checked against semantic inference.

## 7. Non-interference

- No Pine/PineTS/Pine compatibility layer is introduced.
- No second indicator VM/evaluator is introduced.
- Preset/profile data contains no executable callbacks.
- Semantic types do not create a second runtime graph.
- Appearance changes remain outside mathematical computation identity.
- Vela remains behind the TCO chart facade.
- Broker authorization and risk authority remain TCO-owned.

## Verification

Passing dependency-free Node contracts include:

- `TCO_V113_BUILD_ANNOTATION_REGRESSION_CONTRACT_OK`
- `TCO_V113_INDICATOR_PRESET_SYSTEM_CONTRACT_OK`
- `TCO_V113_CORESPIRIT_SEMANTIC_SERIES_TYPE_CONTRACT_OK`
- `TCO_V113_GENERATED_ARTIFACT_HYGIENE_OK`
- `TCO_V111_VELA_RUNTIME_EXPORT_CONTRACT_OK`
- `TCO_V112_UNIVERSAL_PARAMETER_SYSTEM_CONTRACT_OK`
- `TCO_V112_CONDITIONAL_SETTINGS_CONTRACT_OK`

The complete dependency-free Node contract inventory is the currently verified suite. A full dependency-backed `tsc`/Vite build and post-push GitHub Actions/Vercel run remain unclaimed because the extracted archive environment does not have a usable dependency tree.

## Universal parameter ABI v3

v113 depth work treats parameters as a typed ABI rather than input widgets. Fields validate their value domain, constraints and declared options before presets can be persisted/applied. The dependency schema compiles to a graph of dependencies/dependents with cycle detection and deterministic resolution over default-hydrated state.

## Preset/profile depth

Factory, script-embedded, template, workspace, personal and community configuration remain one serializable preset model. Profiles now persist the deliberate active preset per indicator; when no selection exists, workspace/personal resolution falls back to deterministic latest-by-`updatedAt`/ID ordering. Canonical profile fingerprints are available for reconciliation/change detection.

## Semantic series depth

CoreSpirit now exposes explicit pure semantic conversions (`toNumber`, `toPrice`, `toVolume`, `toTime`, `toDuration`, `toCurrency`) as the sanctioned escape hatch from strict domain arithmetic. They add no new host capabilities.


## v114 preparation/depth

The v114 depth pass formalizes the universal configuration and semantic-type architecture around three principles: parameters are validated values, conditional settings are a dependency graph, and semantic domain changes are explicit.

Preset profiles now participate in effective configuration resolution through `activePresetByIndicator`; workspace/personal layers retain deterministic latest fallback when no explicit selection exists. Profile fingerprints are canonical data fingerprints for reconciliation rather than security signatures.

Universal parameter validation now checks field shape in addition to generic constraints. Session, timeframe, symbol, color and duration kinds receive domain validation before a value can enter a preset or resolved state.

CoreSpirit semantic conversions are registered as pure library functions. They are the deliberate escape hatch from strict implicit domain rules and add no host authority.

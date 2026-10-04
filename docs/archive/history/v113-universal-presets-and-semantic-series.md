# CoreSpirit v113 — Universal presets, conditional parameter depth, semantic series types and build-boundary repair

Date: 2026-10-01

## Scope

v113 extends the v112 universal parameter architecture into two deeper layers:

1. configuration is a reusable, serializable preset/profile system rather than only editor state;
2. CoreSpirit series values carry semantic domains beyond the VM's structural `number` type.

The release also repairs the source-level failures reported by GitHub/Vercel annotations and removes generated build artifacts from the source boundary.

## Build annotation repairs

- `LiveChart.tsx`: component-local indicator series helpers no longer reference `indicatorSeries` from module scope.
- `LevelSettingsDock.tsx`: uses an explicit `ReactNode` type import instead of an undeclared `React` namespace.
- `IndicatorSourceEditor.tsx`: restores the canonical `getIndicatorSettingsSchema` import.
- `IndicatorSettingsPanel.tsx`: multi-select option values are typed through `HTMLOptionElement`; the panel consumes resolved `visible`/`enabled` parameter state.
- `App.tsx`: `RouteErrorBoundary` declares explicit React component props, so `this.props` is typed.
- Generated `dist` output is ignored and must not enter the repository; the annotated worker-module failures therefore cannot become source-of-truth compiler inputs.
- CI/Vercel runtime is aligned to Node 24.x so the project engine no longer overrides the Vercel project setting.

## Universal preset ABI

Presets are immutable JSON-safe parameter snapshots. They are never executable and never contain UI callbacks.

Supported sources/scopes:

```text
Factory Default
Script-embedded Defaults
Factory Templates
Personal
Workspace
Community
```

Preset values are validated against the current indicator schema before application. Built-in factory/template identities are deterministic. Indicators may also publish declarative `presetTemplates` with explicit IDs, names, descriptions and parameter overrides.

## Layer resolution

Effective configuration is resolved with explicit precedence:

```text
Factory
  ↓
Script
  ↓
Workspace
  ↓
Personal
```

The resolver reports both effective values and the preset ID selected at every layer. Multiple user/workspace candidates resolve deterministically by `updatedAt`, then ID.

Community presets are catalog/read surfaces rather than local writable configuration.

## Profiles

Profiles group serializable personal/workspace/community presets and may carry `activePresetByIndicator` metadata. Profile persistence is scoped by user/workspace context and bounded to 128 presets.

Profile serialization uses the same preset schema validator, so profiles cannot become a second persistence format with different semantics.

## Conditional parameters

Parameters now have both:

```text
visibilityCondition
       ↓
visible / hidden

enabledWhen
       ↓
enabled / locked
```

Conditions support scalar leaves plus bounded `ALL`, `ANY`, and `NOT` groups. Validation checks safe paths, self-dependencies, cycle structure, target field domains and operator-specific value shapes.

Visibility/enabled state is resolved only after schema defaults are hydrated, so first-load dependency chains behave the same as persisted ones.

## Semantic series types

The compiler-side semantic layer now distinguishes:

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

and their series forms, including:

```text
series<number>
series<price>
series<volume>
series<time>
series<duration>
series<boolean>
series<string>
```

Semantic values may carry:

```text
unit
currency
symbol
timeframe
precision
scale
```

The existing structural CoreSpirit type system remains the VM contract. Semantic typing is an additional compiler layer used for domain validation, diagnostics and tooling.

## Semantic arithmetic and comparison

Examples:

```text
price + price       valid
price - price       valid → price-domain delta
price + number      valid broadcast
price / price       valid → number
price * volume      valid → notional/currency
price + volume      invalid
price > volume      invalid
series<time> + duration  valid
series<time> + time      invalid
```

Source-preserving indicator transforms retain their domain where meaningful. ATR/true-range/VWAP retain `price` semantics; RSI-like normalized oscillators expose a numeric/percent semantic result.

## Non-interference

Preset state is configuration. Semantic types are compiler metadata. Neither is allowed to bypass the TCO capability boundary, broker/risk authority, or Vela renderer boundary. Appearance remains outside mathematical invalidation.


## v113 depth pass — deterministic presets and typed escape hatches

### Universal parameter ABI v3

The parameter contract now distinguishes field shape from editor presentation and validates the declared value domain itself. Numeric fields enforce finite values, integer semantics, min/max/step constraints and duration non-negativity. Enum/select/source/timeframe/multi-select fields are checked against their declared option domain; color, symbol, session and timeframe values receive shape validation before persistence or application.

The dependency layer is compiled into a small graph containing:

```text
parameter → dependencies
parameter → dependents
parameter evaluation order
```

This lets the editor identify the transitive set of fields affected by one parameter change without scanning every field as a special-case UI rule. Cycles remain a schema error, while malformed condition trees fail closed.

### Preset/profile depth

A profile now carries the active preset selection for an indicator, so a workspace/personal preset can be deliberately selected rather than relying only on the latest timestamp. Resolution remains deterministic:

```text
Factory → Script → Workspace(selected/latest) → Personal(selected/latest)
```

Profile fingerprints are generated from canonicalized IDs, sorted parameter values and sorted active selections. This is intended for change detection and persistence reconciliation; it is not a cryptographic security primitive.

### Semantic type escape hatches

CoreSpirit keeps implicit domain rules strict while exposing explicit pure conversions:

```text
toNumber(x)
toPrice(x)
toVolume(x)
toTime(x)
toDuration(x)
toCurrency(x)
```

These are semantic conversions, not new execution capabilities. The runtime performs the numeric conversion while the compiler changes the semantic domain intentionally. This preserves the useful rule that `price + volume` is invalid without making legitimate unit/domain transformations impossible.

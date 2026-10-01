# CoreSpirit v114 — Universal configuration + semantic series depth

Date: 2026-10-01

## Production build annotation repairs

v113/v114 preserves the source fixes for the reported hosted-build annotations:

- `LiveChart.tsx` no longer has module-scope helpers capturing `indicatorSeries`.
- `LevelSettingsDock.tsx` uses an explicit `ReactNode` import.
- `IndicatorSourceEditor.tsx` imports the canonical settings schema resolver.
- `IndicatorSettingsPanel.tsx` types DOM option values and consumes resolved parameter state.
- `App.tsx` declares `RouteErrorBoundary` props explicitly.
- generated `dist` output is excluded from source control and build inputs.
- package and CI are aligned to Node 24.x.
- the v111 `LineStyle` runtime export remains protected by a contract.

## Universal parameter ABI v3 — deeper layer

Parameters are validated by semantic field kind, not merely by generic JavaScript shape. Numeric fields enforce finite/integer/range/step semantics; duration rejects negative values; select/enum/source/timeframe/multi-select fields enforce their declared domain; color, symbol, session and timeframe receive format validation. Defaults pass the same validator used by persisted and preset values.

The parameter schema compiles to:

```text
parameter
 ├── dependencies
 └── dependents

plus a deterministic evaluation order
```

The universal editor can therefore identify the transitive affected setting paths after a parameter edit without indicator-specific UI branches. Conditions remain bounded, typed against target fields, cycle-checked and fail-closed.

## Conditional settings

`visibilityCondition` and `enabledWhen` are resolved against a fully default-hydrated parameter environment. This makes first-load behavior identical to persisted-state behavior and prevents schema defaults from producing transient hidden/locked controls.

## Presets, templates and profiles

The preset architecture now has explicit portability and profile-selection semantics:

```text
Factory
  ↓
Script
  ↓
Workspace (selected or latest)
  ↓
Personal  (selected or latest)
```

`activePresetByIndicator` is authoritative for explicit workspace/personal selection. Community presets remain read-only and cannot be activated as local personal/workspace configuration. Preset bundles and profiles are versioned JSON data and are schema validated. Canonical profile fingerprints support deterministic reconciliation/change detection.

## Semantic series type system

CoreSpirit distinguishes semantic domains across scalar and series values:

```text
number / series<number>
price  / series<price>
volume / series<volume>
time   / series<time>
duration / series<duration>
currency / series<currency>
boolean / series<boolean>
string  / series<string>
```

Metadata may include unit, currency, symbol, timeframe, precision and scale. Cross-domain arithmetic and ordered comparison remain invalid unless a defined semantic operation exists.

Examples:

```text
price + volume       → error
price > volume       → error
price * volume       → currency/notional
time - time          → duration
toNumber(price)      → number
toPrice(number)      → price
```

The six explicit conversions are pure semantic operations and add no broker/network/filesystem capability.

## Non-interference

Appearance state remains outside mathematical computation identity. Parameter edits only invalidate calculation when the changed parameter belongs to the declared computation ABI. Presets, profiles and semantic metadata do not bypass risk, broker, data or renderer authority.

## Verification

- Full Node-only architecture/contract inventory: **PASS (30 commands)**.
- Semantic-series runtime contract: **PASS** under Node's experimental TypeScript type stripping.
- Roadmap validation: **PASS — 184 stages**.
- Full dependency-backed TypeScript/Vite build: **NOT CLAIMED** because the extracted environment has no complete dependency tree.
- GitHub Actions/Vercel post-push confirmation: **PENDING UNTIL HOSTED BUILD RUNS**.
- Browser smoke: **NOT RUN**.

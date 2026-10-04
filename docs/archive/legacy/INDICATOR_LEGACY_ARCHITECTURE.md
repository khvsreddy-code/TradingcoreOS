# INDICATOR LEGACY ARCHITECTURE

> Consolidated legacy material. The active source of truth is now the four canonical documents in `docs/01-04_*.md` plus `docs/CORESPIRIT_BUILD_TRACKER.md`.

---

# SOURCE: docs/INDICATORS_USER_AUTHORING.md

# TradingCoreOS User Indicator Authoring

## Purpose

The Indicators workspace is the authoring surface for native indicators and CoreSpirit source. Users can configure a study, inspect a starter source template where supported, edit the source, save immutable versions, and publish an openly inspectable public indicator entry.

The authoring model is CoreSpirit-native. Users author, inspect, compile, version and publish CoreSpirit source; the chart surface consumes the resulting renderer-neutral output through the TCO chart contract.

## Indicator settings

Every `IndicatorConfig` can carry renderer-neutral display settings:

- Inputs: source, periods, multipliers, model-specific parameters and anchors.
- Style: line color, width, line style and opacity.
- Display: legend, values, pane, scale, precision and visibility.

The same settings contract is consumed by the indicator workspace and live indicator dock. Settings are persisted through the existing workspace state layer.

## Source-first workflow

1. Add a native indicator.
2. Open `Code` for its starter source, where a meaningful CoreSpirit template exists.
3. Edit the source in Indicator Studio.
4. Compile through the canonical `compileCoreSpirit` pipeline.
5. Save a version to Supabase.
6. Add public metadata and an optional cover image.
7. Publish the immutable version as a public indicator snapshot.

Native-only indicators may expose a clearly marked scaffold rather than fabricated CoreSpirit semantics. Publishing still requires successful CoreSpirit compilation of the actual source being published.

## Persistence

User editing uses the existing CoreSpirit script/version tables:

- `corespirit_scripts` — owner-owned script identity and active version.
- `corespirit_script_versions` — immutable source, compiler status, source hash and optional compiled IR.
- `indicator_publications` — public listing metadata and a source snapshot tied to one immutable version.

## Public publication

Published indicators have:

- stable slug
- title and description
- category and tags
- author identity
- optional cover image
- license
- source snapshot
- language/compiler metadata
- view/install counters

Public source is intentional: the Explore page is an open-source-style catalog. Private drafts never become public merely because a script exists in the workspace.

## Security boundaries

Publishing requires authentication. RLS keeps draft/version mutation owner-scoped. Anonymous visitors can read only rows explicitly marked `published` + `public`.

The public cover bucket is read-only to anonymous users; authenticated uploads are constrained to the publishing user's storage path. Indicator source must never contain broker credentials, access tokens, private keys or other secrets.

Public indicator code is never given direct broker authority. Chart execution, automation and order execution remain separate host-controlled capabilities.

## Shareable routes

Every publication receives a stable route:

`/explore/indicators/<slug>`

The route is intentionally public and can resolve without a workspace session.

## Settings persistence

The shared Inputs / Style / Display settings remain part of the renderer-neutral `IndicatorConfig`. When a user saves or publishes from Indicator Studio, the active indicator configuration is included in the private CoreSpirit script metadata and, for public entries, in `indicator_publications.indicator_settings` alongside the source snapshot.

This keeps the public listing self-describing without making the chart renderer the owner of user settings.

## Source execution boundary

v98 provides editable source inspection, compilation, immutable versioning and public publication. Editing the source does not silently replace the native indicator execution path yet. The workspace continues to execute the registered native indicator while the future user-component runtime gate is developed. A publication is therefore an honest source artifact plus metadata, not a claim that arbitrary user code has already become a production chart primitive.

## v107 live indicator dialogue — 2026-09-29

The `/live` indicator dialogue now treats settings and source inspection as first-class actions for each active indicator.

```text
Indicator Name        ⚙   <>   Hide   Remove
```

`⚙` opens the existing shared `IndicatorSettingsPanel`. `<>` opens the read-only `IndicatorCodeViewer`, which reads the registered CoreSpirit source template for that indicator and provides a copy action.

The settings header also includes the gear affordance and a `Code` action when a source viewer callback is available. Source inspection does not mutate indicator configuration.

The source viewer and Indicator Studio remain intentionally separate:

```text
live dialogue → inspect source quickly
Indicator Studio → edit / compile / save source
```

Native indicators without a fully executable public source ABI receive a clearly labelled starter template rather than a claim that the chart engine has converted arbitrary source into a production native primitive.

## v109 schema-driven customization

The settings editor is no longer a manual map of indicator names to controls. Every indicator resolves to a validated `IndicatorSettingsSchema` with identity, Inputs, Style, Display, Behavior, Alerts, Visualization, layout, outputs and capabilities. The universal editor renders fields from this schema.

For example, an EMA definition can declare:

```text
Inputs
  Source: Close
  Period: 20
Style
  Primary color
  Line width
  Line style (advanced)
  Opacity (advanced)
Display
  Visible
  Show legend
  Show values
  Pane
  Scale (advanced)
  Precision (only when Show values = true)
```

The important rule for contributors is: **add a field to the schema, not a field to the React panel**. The panel already supports primitive controls, conditional visibility, advanced fields, nested paths and reset-from-defaults.

Schema metadata is also persisted with user-authored indicator drafts and public publications. A public indicator therefore carries source + version + schema + resolved settings, making the artifact self-describing without making the renderer the authority.

## v111 — Indicator component model

A user-authored indicator is now conceptually one self-describing CoreSpirit component:

```text
Identity
 └── source + immutable version
Inputs
 └── typed data/parameter ports
Calculation
 └── executable CoreSpirit artifact
State
 └── persistence + snapshot/rollback semantics
Outputs
 └── typed values / plots / events
Visuals
 └── renderer-neutral projection metadata
Alerts
 └── declared event/alert capability
Metadata
 └── title / description / tags / license / author / docs
```

The source remains the canonical mathematical program. Metadata describes the program; it does not duplicate its calculations.

### What this changes for authors

A custom indicator can become reusable by becoming a component contract. The author does not need to create a new language declaration or separate evaluator. The same CoreSpirit source compiles through the same compiler and produces the same stable artifact used elsewhere in the platform.

### Publication rule

Public publication carries the source snapshot and metadata. It does not implicitly promote the source into unrestricted production execution. Runtime admission remains an explicit trusted/local/public execution boundary.

## v111.1 — Indicator authoring model

The authoring mental model is now:

```text
inputs
  ↓
calculation
  ↓
state (only when required)
  ├── events
  ├── plots
  ├── visuals
  └── alerts
       ↓
metadata / publication
```

### Inputs

Declare which inputs are public. Canonical market series are discovered from the compiled reactive graph; parameters or component dependencies may be explicitly added through the host-side input contract.

### Calculation

The calculation projection records the compiled artifact's instruction count, lookback, determinism, incremental eligibility, cacheability, parallelism and backend candidates. These are runtime planning metadata, not new source keywords.

### State

Stateful indicators must expose snapshot/rollback semantics compatible with realtime bar revision. Pure indicators remain eligible for cache and parallel execution. The indicator wrapper delegates actual execution to the existing CoreSpirit runtime.

### Events and visuals

`SHOW`-derived plots and visual emissions, plus `WHEN`/event/alert projections, remain outputs of the same graph. Visuals are renderer-neutral and are later projected through the TCO chart API into Vela.

### Publication

The saved indicator should contain source identity, component declaration, settings schema, compiled artifact identity, public port names/types, metadata and documentation. Publication does not automatically grant host authority.


## v112 — Rich configurable indicator parameters

Indicator authors can expose a universal configuration surface without writing UI code. The schema supports typed numeric/context/text controls and declarative conditional settings.

```text
Method
 ├─ Fixed
 └─ Adaptive
      ├─ Adaptation Length
      ├─ Sensitivity
      └─ Noise Filter
```

The visibility relationship is metadata. The author does not need React conditionals or indicator-specific settings components.

## v113 — presets and semantic inputs

The universal indicator editor now supports serializable preset layers rather than hardcoded per-indicator configuration forms.

```text
Factory Default
Script Defaults
Scalping / Intraday / Swing
Personal
Workspace
Community
```

A published indicator can add declarative templates by providing parameter-path overrides. The editor validates those overrides against the same parameter schema as normal edits.

Conditional parameters can be visible/hidden or visible-but-disabled based on other parameter values. Defaults are resolved before conditions are evaluated, so a newly installed indicator renders the same dependency tree as a restored one.

For Professional-level CoreSpirit authoring, semantic annotations such as `series<price>` and `series<volume>` provide stronger intent. The compiler can reject domain-invalid operations before runtime.



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

---

# SOURCE: docs/INDICATOR_COMMUNITY_ARCHITECTURE.md

# TradingCoreOS Indicator Community Architecture

## UX target

The public experience is modeled after the **interaction pattern** of modern indicator libraries: large visual cards, simple tabs, discovery controls, author metadata, description, usage counts and source inspection.

TradingCoreOS does not copy TradingView source, rendering internals or API contracts.

## System

```text
Indicator Library
      ↓
Indicator Settings Contract
      ↓
CoreSpirit Starter Source
      ↓
Indicator Studio
      ↓
Canonical CoreSpirit Compiler
      ↓
corespirit_scripts + script_versions
      ↓
indicator_publications
      ↓
Public Explore Catalog
```

## Public card

A publication card can display:

```text
cover / generated preview
      ↓
title + category
      ↓
author
      ↓
description
      ↓
tags
      ↓
license + views + installs
```

The detail surface shows the full published CoreSpirit source, captured indicator settings and the description alongside a direct `Use in CoreSpirit` action.


### v109 schema publication

`indicator_publications.indicator_settings` now carries an additive schema projection. The public artifact stores the legacy flat keys for compatibility plus:

```text
schemaVersion
schema
settingsSchema
identity
layout
outputs
capabilities
values
```

`values` contains resolved field values keyed by schema path, while `schema` describes how those values are authored. This keeps the community artifact self-describing and lets future clients render settings without hard-coded knowledge of individual indicators.

## Supabase model

`indicator_publications` is a public-read, owner-write table protected by RLS.

```text
corespirit_scripts
      │
      └── active version
              │
              └── indicator_publications
```

A publication stores a source snapshot in addition to the foreign key to the immutable version. That preserves the exact code shown publicly even if later internal metadata changes.

## Storage

`indicator-covers` is a dedicated public bucket. Upload paths are namespaced by authenticated user and script ID.

## Future extensions

The architecture leaves room for editor picks, following, collections, forks, revision lineage, ratings/comments, signed install manifests and richer generated chart previews without changing the CoreSpirit language.


## Execution truthfulness

The public community layer never implies that arbitrary edited source has already replaced the native chart implementation. v98 compiles and stores the source as a CoreSpirit artifact; the workspace keeps native registered execution until the user-component runtime contract is production-ready.


## v110 publication rule — schema is part of the visual contract

A CoreSpirit Community Indicator publication now captures the v2 settings schema and resolved settings so a client can reproduce the author's presentation semantics without importing application-specific React knowledge.

```text
source snapshot
    + immutable version
    + settings schema v3
    + resolved values
    + computation identity
    + appearance identity
    + compiled artifact identity
```

The publication is self-describing, but appearance remains non-executable metadata. It cannot contain a callback, renderer object, worker function or arbitrary JavaScript.

An imported community indicator therefore has the same host pipeline as a native indicator:

```text
validated publication
      ↓
CoreSpirit compile/resolve
      ↓
calculation output
      ├── computation plane
      └── appearance plane
               ↓
          Vela adapter
```

## v111 — Self-describing community indicator artifact

Community indicators are now modeled around the first-class CoreSpirit indicator component, while retaining the existing immutable-source publication model.

A publication can describe:

```text
source
version
compiled artifact identity
settings schema
resolved settings
component inputs
component outputs
calculation metadata
state metadata
visual/event projections
publication metadata
```

The publication database row remains a transport/storage projection. The executable source/artifact contract remains governed by CoreSpirit compiler/runtime rules.

A public publication is therefore **self-describing**, but not self-authorizing.

## v111.1 — Community indicators as portable component artifacts

The community unit is now a self-describing CoreSpirit component publication rather than a script plus ad-hoc UI configuration.

```text
CoreSpirit source
+ immutable source checksum
+ typed public declaration
+ settings schema v3
+ compiled artifact identity
+ author/license/docs
        ↓
CoreSpirit Community Indicator
```

The public declaration controls composition. The settings schema controls user-editable presentation and indicator parameters. The executable artifact controls calculation. These layers are versioned independently enough to permit appearance-only changes without mathematical recomputation.

Installation should register the validated component contract in a scoped registry. Removing/uninstalling the publication must unregister its callable names as well as its catalog entry.


## v112 — Community indicator parameter contract

A published CoreSpirit community indicator now exposes a stable parameter ABI through `settingsSchema.parameters` alongside its immutable source/version/artifact identity.

The public artifact can therefore describe:

```text
parameter types
constraints
groups/tooltips
conditional dependencies
resolved values
validation state
```

without exposing executable UI callbacks or renderer objects. This keeps community indicators portable across the TCO editor and Vela presentation boundary.

## v113 — community presets and semantic contracts

Community indicators may publish serializable presets alongside their parameter schema. A community preset contains parameter values plus immutable identity/version metadata; it is not executable code.

The community boundary accepts a preset only when indicator kind and schema identity are compatible. Local users can select and apply community presets, but the local preset store does not treat community records as writable personal/workspace state.

Community indicators also inherit the CoreSpirit semantic value contract. Their source may produce `series<price>`, `series<volume>`, `series<time>` and related semantic values through the same compiler that handles native indicators.



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

---

# SOURCE: docs/INDICATOR_DEPENDENCY_GRAPH_ARCHITECTURE.md

# TradingCoreOS Indicator Dependency Graph Architecture

## Purpose

Move indicator execution from independent study-by-study calculation toward a shared dependency graph. Repeated mathematical primitives are computed once per dataset/revision/compute window and then consumed by multiple indicators.

## Canonical graph

```text
OHLCV
  │
  ├── source(close / hlc3 / ...)
  │       ├── EMA / SMA
  │       ├── WMA → HMA
  │       ├── RSI
  │       └── VWAP
  │
  └── true-range
          └── ATR
                ├── Keltner Channels
                └── Supertrend

EMA fast ───────┐
EMA slow ───────┼──→ MACD → signal EMA

SMA ─────────────────→ Bollinger Bands
rolling high/low ────→ Donchian Channels
```

The dependency planner is explicit through `buildIndicatorDependencyGraph()`. Worker evaluation uses a dataset/revision cache so two studies requesting the same primitive do not recompute it.

## Cache identity

```text
broker:symbol:timeframe
        + revision
        + compute window
        + mathematical node key
```

Presentation metadata is intentionally excluded from mathematical cache identity. Changing a color, line width, line style, opacity, legend visibility or similar display setting must reuse the calculation and only update chart presentation.

## Worker ownership

```text
ChartComputeCoordinator
        ↓
shared indicator worker pool (≤ 2)
        ↓
IndicatorDependencyGraph cache
        ↓
primitive nodes + composite results
```

The worker cache is revision-scoped and window-aware. A partial result from one viewport cannot leak into another viewport for the same dataset revision.

## Compute window

The chart renderer may retain substantially more history than it sends to a worker. `selectIndicatorComputeWindow()` centers the worker input around the logical viewport with bounded warmup bars and a hard 10,000-candle ceiling.

This is an execution optimization, not a semantic request to truncate the `HistoryStore`.

## Indicator appearance contract

Indicator configuration contains renderer-neutral appearance metadata:

```text
primary color
signal color
upper color
lower color
line width 1–6
line style solid / dotted / dashed
opacity 0.15–1
```

The appearance editor is available from the chart's Indicators menu and the Indicators page. Style changes persist through the existing `saveIndicators()` path and do not invalidate mathematical computation caches.

## Future graph extensions

Additional reusable nodes can be added without changing the host contract: directional movement/ADX, rolling highest/lowest, standard deviation, stochastic smoothing, volume transforms, and fused multi-output indicators.

## v106 graph depth + linear rolling kernels — 2026-09-29

The dependency graph now models transitive base dependencies explicitly. Composite nodes must expose their upstream source/base nodes even when a user did not separately request the intermediate study:

```text
source → SMA → Bollinger
source → EMA → Keltner
TR → ATR → Keltner / Supertrend
source → EMA(fast/slow) → MACD → signal EMA
source → WMA → HMA
```

`buildIndicatorDependencyGraph()` now returns a deterministic topological order and rejects cycles. This makes the graph a real execution plan rather than only a documentation structure.

Two hot rolling kernels were also tightened:

- WMA uses a rolling-sum / rolling-weight recurrence instead of rescanning every period window.
- Donchian highest/lowest uses monotonic deques with head indices instead of nested period scans.
- Bollinger variance uses rolling sum and sum-of-squares instead of slicing and reducing each window.

These changes preserve the indicator formulas while making repeated dependency evaluation closer to O(n) for the rolling primitives.

## v106 indicator presentation contract

Indicator math and indicator presentation are separate data. The renderer applies persisted style metadata without invalidating the dependency graph:

```text
math identity:
  kind + inputs + periods + multipliers + source

presentation identity:
  color(s) + line width + line style + opacity + display flags
```

The chart Indicators menu provides schema-driven editing for primary, signal, upper/lower colors, line width, line style and opacity. The persisted indicator configuration remains the single source of truth, while the schema defines how those values are presented.

## v107 incremental execution lane — 2026-09-29

The v106 dependency graph remains the canonical **snapshot planning** model. v107 adds a separate stateful execution lane for forming-bar updates so the graph's reusable mathematical definitions can be consumed without replaying the historical dataset on every tick.

```text
snapshot / history change
        ↓
 dependency graph plan
        ↓
 linear seed + graph result
        ↓
 resident incremental state
        ↓
 replace / append tail update
```

The current incremental runtime keeps one state object per active normalized indicator configuration. This is deliberate for safety during the first stateful rollout: it prevents accidental double-updates when multiple configured indicators happen to represent the same mathematical node. The dependency graph continues to own cross-indicator node sharing for snapshot evaluation.

The long-term convergence target is a single node-addressed incremental state store keyed by the same canonical mathematical node identifiers used by the dependency graph. Until that convergence is implemented, the two lanes are required to remain numerically equivalent and are checked through parity tests.

### v107 reset contract

An incremental state must be discarded and reseeded when any of the following occurs:

```text
configuration signature changed
forming-bar timestamp changed during replace
append timestamp is not strictly newer
worker state was lost/recycled
```

A reset is correctness-first. The coordinator sends one full seed payload; ordinary forming ticks remain bar-only afterward.

### v107 compute identity

Mathematical identity remains:

```text
kind + source + periods + multipliers + model inputs
```

The forming candle's current OHLCV tuple is an execution-state input, not a new CoreSpirit language construct. Presentation metadata remains outside the mathematical identity.

---

# SOURCE: docs/INDICATOR_SETTINGS_SCHEMA.md

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


# v112 — Universal parameter system

`IndicatorSettingsSchema` is now v3. The central extension is an explicit `parameters` array containing calculation-relevant fields from the Inputs section.

## Parameter ABI

Each parameter uses one common shape with declarative metadata:

```text
id / path / label
kind / defaultValue
min / max / step
options
group / tooltip / placeholder / unit
advanced / readonly
validation
dependency / visibilityCondition
```

### Kinds

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

Legacy `select`, `text`, `range`, and `multi-select` kinds remain supported for existing schema documents.

## Dependency graph

Dependencies are data expressions. They support:

```text
equals / notEquals
greaterThan / greaterThanOrEqual
lessThan / lessThanOrEqual
in / notIn
truthy / falsy
all / any / not
```

Example:

```json
{
  "path": "sensitivity",
  "kind": "decimal",
  "defaultValue": 1,
  "dependency": {
    "all": [
      { "path": "method", "operator": "equals", "value": "adaptive" },
      { "path": "adaptationLength", "operator": "greaterThan", "value": 10 }
    ]
  }
}
```

The universal editor calls the canonical evaluator. It does not contain indicator-kind branches.

## Validation

Validation is declarative and serializable. Required values, string lengths and patterns are supported, while numeric/enum/membership constraints derive from the parameter type and bounds.

## Resolution

`resolveIndicatorParameterState(schema, item)` produces the canonical resolved state:

```text
values
visible
errors
valid
```

This is the common state consumed by editor/persistence/publication layers.

## Calculation isolation

Only `schema.parameters` feed the calculation snapshot. Presentation sections are excluded from computation identity. Appearance changes therefore do not trigger indicator math.

## Compatibility

v1/v2 custom schemas remain readable. Missing v3 `parameters` are projected from the Inputs section in memory.

## v113 — presets and parameter-dependency depth

The parameter ABI is now the shared source of truth for four layers:

```text
CoreSpirit artifact
      ↓
parameter schema
      ↓
resolved parameter state
      ├── universal editor
      ├── preset/profile system
      ├── workspace/publication snapshots
      └── computation identity
```

A field can independently declare `visibilityCondition` and `enabledWhen`. Hidden fields are not validated as active configuration errors; disabled fields remain visible but cannot be edited. Both states come from the same resolved parameter evaluator.

Preset values use the same parameter paths and validator as direct editor changes, which prevents a preset from becoming an alternate configuration language.

### Preset layers

```text
Factory Default
Script-embedded Defaults
Workspace
Personal
```

Community presets are catalog entries and are intentionally not writable through the local preset store.

Built-in templates and artifact-declared `presetTemplates` are serialized parameter overrides. They do not contain executable callbacks.

### Conditional dependency validation

The schema validator now checks:

- referenced path is declared and safe;
- field cannot depend on itself;
- dependency graph has no cycle;
- numeric operators target numeric fields;
- `matches` targets string-like fields;
- membership operators target selectable/string-like fields;
- nested condition depth and group size remain bounded.

### Resolution invariant

Defaults are hydrated before visibility/enabled conditions are evaluated. This makes:

```text
Method = Adaptive (schema default)
        ↓
Adaptive settings visible
```

behave identically on a clean workspace and a restored workspace.

### Preset/profile persistence

The local persistence layer isolates user/workspace context and bounds profiles to 128 entries. Factory and script-embedded defaults are generated rather than persisted as mutable user records.



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

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

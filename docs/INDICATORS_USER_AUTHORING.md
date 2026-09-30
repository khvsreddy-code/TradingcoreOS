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


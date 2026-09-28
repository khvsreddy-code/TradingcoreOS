# TradingCoreOS User Indicator Authoring

## Purpose

The Indicators workspace is the authoring surface for native indicators and CoreSpirit source. Users can configure a study, inspect a starter source template where supported, edit the source, save immutable versions, and publish an openly inspectable public indicator entry.

The authoring model is intentionally **not** a PineScript clone. TradingCore borrows the useful interaction ideas of mature charting platforms—settings panels, source inspection, public cards and direct sharing—while keeping its own CoreSpirit language, compiler, runtime and security boundaries.

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

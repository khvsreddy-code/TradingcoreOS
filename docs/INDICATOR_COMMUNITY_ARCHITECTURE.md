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

# CoreSpirit v98 Release Notes

Date: 2026-09-27

## Theme

**User-authored indicators + public community publishing**

## Included

- Renderer-neutral indicator Inputs / Style / Display settings contract.
- Editable starter CoreSpirit source templates for common native indicators.
- Indicator Studio for editing and compiling source.
- Immutable Supabase source-version persistence.
- Public indicator publication projection with source snapshot metadata.
- Dedicated public cover-image storage with owner-scoped writes.
- Anonymous public Explore catalog.
- Search, category, open-source and sorting controls.
- Public indicator detail/source inspection.
- Stable `/explore/indicators/<slug>` routes.
- Usage counters through RLS-gated event recording and database-triggered counters.
- Public indicator settings snapshots stored alongside the source snapshot, with only renderer-neutral authoring fields exposed.
- Workspace and live indicator-dock entry points into the source workflow.
- CoreSpirit roadmap extended to 130 stages.

## Non-goals

- PineScript compatibility.
- TradingView implementation/code copying.
- Anonymous script mutation.
- Automatic broker execution from public code.
- Publishing source that does not compile to a CoreSpirit IR artifact.

## Current production chart policy

Lightweight Charts remains the production rendering backend. The community indicator system depends on TradingCore chart and CoreSpirit contracts, not vendor renderer internals.

## Supabase migration

Applied migration:

`20260927140500_tradingcoreos_v98_user_indicator_publications.sql`

This creates the public publication table, indexes, RLS policies, cover-image bucket/policies, and RLS-gated view/install event recording and database-triggered counters.


RLS/index hardening migration:

`20260927141327_harden_indicator_publication_counters.sql`
`20260927141354_optimize_indicator_publication_rls_indexes.sql`
`20260927142500_add_indicator_settings_snapshot.sql`

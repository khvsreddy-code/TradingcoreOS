# v98 — User Indicator Authoring + Public Community

Date: 2026-09-27

## Summary

v98 introduces the first complete architecture for user-authored indicator configuration, editable CoreSpirit starter source, versioned persistence, public publication and an anonymous community Explore surface.

## Architectural decisions

- Keep CoreSpirit syntax unchanged.
- Reuse the canonical CoreSpirit compiler for indicator source.
- Reuse `corespirit_scripts` and `corespirit_script_versions` for private ownership/versioning.
- Add a dedicated `indicator_publications` projection for public discovery.
- Use a dedicated `indicator-covers` storage bucket.
- Make public source inspectable by design.
- Keep public browsing separate from authenticated workspace routing.
- Keep Lightweight Charts as the current production chart renderer.

## Implementation

- Shared Indicator Settings panel with Inputs / Style / Display tabs.
- Indicator Studio with source editing, compile, save and publish workflow.
- Built-in starter source templates for common native indicators.
- Public Explore page with card grid, search, filters, sorting, source modal and direct slug routes.
- Live indicator dock can open the same source studio.
- Supabase migration for publication metadata, RLS, storage policies and bounded view/install events and server-side counters.

## Verification notes

Repository-wide build verification remains dependent on a complete frontend dependency installation in the supplied archive. Supabase migration application succeeded against the project used by TradingCoreOS.

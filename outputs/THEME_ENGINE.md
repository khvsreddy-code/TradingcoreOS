# TradingCore Theme Engine

**Goal:** One semantic visual contract that renders correctly in dark, light, high contrast, institution-branded, and future white-label modes without component forks.

## Architecture

```text
Primitive token scales
  → semantic role map (surface, text, border, action, data, focus, motion)
    → component token map
      → resolved theme snapshot (mode + contrast + brand + density + transparency preference)
```

Primitives are private design-system implementation detail. Components consume component/semantic roles only. Themes are data configurations validated against token schemas, contrast rules, and component coverage; they are not arbitrary CSS overrides.

### Decision record: layered, validated themes

| Aspect | Decision |
|---|---|
| Problem | Dark-first trading UI, accessibility modes, and institutional branding must coexist without visual drift or unsafe contrast. |
| Decision | Resolve a layered theme snapshot from baseline mode, accessibility preference, approved brand pack, and optional user preferences. |
| Alternatives considered | Separate dark/light component libraries; runtime per-component color props; unrestricted institution CSS. |
| Tradeoffs | Theme authoring needs validation tooling and a constrained brand model. |
| Reasoning | Semantic intent lets a component retain behavior while appearance changes safely. |
| Future scalability | Supports tenant branding, scheduled modes, native hosts, and new token families. |
| Risks | Brand demands can conflict with accessibility/data semantics. |
| Recommendation | Treat contrast/data-color validation as a release gate; allow controlled brand accents, not redefinition of safety/status semantics. |

## Theme dimensions

| Dimension | Values | Resolution priority |
|---|---|---|
| Mode | dark, light, system | enterprise policy → user preference → system default |
| Contrast | standard, high | user accessibility preference overrides brand aesthetic |
| Transparency | standard, reduced | system/user accessibility preference overrides glass recipe |
| Density | comfortable, default, compact | user/workspace preference within component constraints |
| Brand | TradingCore baseline, approved institution pack | tenant policy, then baseline |
| Data palette | default, accessible alternative, user-safe preference | accessibility/market convention policy; never changes numeric truth |

## Token requirements

Every theme must supply all semantic roles: canvas/surface layers; text/icon hierarchy; borders; focus; actions; destructive/warning/info/success; chart categories; gain/loss/neutral; overlays; shadows; opacity; typography references; spacing/density aliases; radius; motion; and chart grid/crosshair roles. It may alter primitive values but cannot omit a semantic role or make state meaningful only through hue.

Theme packs contain metadata (ID, version, author/tenant, host compatibility, locales/direction support), semantic overrides, approved logo/mark placements, and validation report. They may customize brand accent, selected surface treatment, typography within metric/performance bounds, and marketing imagery. They may not customize order confirmation hierarchy, focus visibility minimum, destructive semantics, permission prompts, or error/status clarity below baseline.

## Runtime behavior

Resolve the initial theme before meaningful paint to prevent flash. Apply changes atomically to the document/application root, persist only the user-safe preference key, and broadcast changes to embedded approved hosts through the platform contract. Charts and third-party panels receive resolved semantic variables/values, never permission to reach into core token internals. Theme changes must not reset workspace state, interrupt data streams, or alter currency/date formats.

## High contrast and color vision

High contrast is its own evaluated theme, not “dark with stronger borders.” It uses opaque surfaces, obvious focus, sufficient non-color cues, tested data series differentiation, and reduced transparency. Positive/negative financial conventions remain configurable and include sign, arrow/label, and accessible text; red/green pairing is never the only signal. Test token contrast for text, icon, border-as-control-boundary, focus, disabled-but-readable content, and all overlapping glass combinations.

## Governance, risks, recommendations

Version theme schemas independently from brand assets. Snapshot every component in each supported theme/contrast/density combination and block a release on uncovered semantic tokens. The primary risk is a tenant brand pack violating usability or breaking a plugin that assumed literals. Prevent both by limiting plugins to semantic contracts, publishing a token compatibility matrix, validating packs in a preview sandbox, and offering a one-click fallback to the TradingCore baseline theme.


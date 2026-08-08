# TradingCore Design System

**Status:** Phase 0 reference. All visual values are semantic tokens; no raw colors, spacing, shadows, durations, or breakpoints are permitted in product code.

## Design philosophy

TradingCore should feel calm under pressure: institutional clarity, restrained premium materiality, dense information that remains scannable, and predictable behavior. Glass is an accent for hierarchy and depth—not decoration. Data truth and action clarity take precedence over brand spectacle.

### Decision record: semantic token system

| Aspect | Decision |
|---|---|
| Problem | A large product and white-label future make literal values and one-off styling impossible to govern. |
| Decision | Use primitive tokens → semantic tokens → component tokens, with mode/brand values resolved by the theme engine. |
| Alternatives considered | Literal palettes in components; component-local variables; a single global palette only. |
| Tradeoffs | Token naming and governance take upfront effort. |
| Reasoning | Meaning survives visual redesigns, high contrast, and institution branding. |
| Future scalability | Themes and plugins consume stable semantic contracts rather than internal palette values. |
| Risks | Token sprawl and ambiguous names. |
| Recommendation | Require a semantic intent and owner for every new token; periodically deprecate aliases. |

## Token taxonomy

| Tier | Examples | Rule |
|---|---|---|
| Primitive | `color.neutral.0`, `space.4`, `radius.2`, `duration.fast` | Internal scale; never consumed directly by product UI. |
| Semantic | `surface.canvas`, `text.primary`, `border.subtle`, `action.primary` | The default consumption layer for modules. |
| Component | `button.primary.background`, `table.row.hover` | Used only by the owning component family. |

## Color roles

| Role | Intended meaning | Usage |
|---|---|---|
| Canvas / surface | page, raised, overlay, inset, selected | Establish hierarchy without gradients by default. |
| Text / icon | primary, secondary, tertiary, inverse, disabled | Never use low contrast merely to look subtle. |
| Border | subtle, strong, focus, divider | Separation and focus, not ornamental boxing. |
| Action | primary, secondary, destructive, quiet | Actions require label plus state, not color alone. |
| Data | positive, negative, neutral, warning, info, series categorical | Financial gain/loss colors are user-configurable and always paired with direction/sign/text. |

Default dark mode is the primary trading environment; light, high contrast, and institution themes are first-class. No semantic role may depend only on red/green discrimination. Charts reserve a tested categorical palette distinct from status colors.

## Typography

Use an approved system sans family for UI and a metrically compatible monospace family for prices, code, tabular figures, and timestamps. Numeric fields use tabular lining figures; changing values avoid layout shift. Type roles: Display (marketing only), Title, Section, Body, Label, Meta, Data, Code. Line height is role-based and generous enough for localization. UI minimum text is 12px equivalent; body defaults to 14–16px equivalent; user scaling must remain usable through 200% zoom.

## Spacing, sizing, shape, and elevation

Base spacing is a 4-unit scale: `0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16` mapped centrally. Layout gaps use semantic aliases (`gap.compact`, `gap.default`, `gap.section`) rather than arbitrary scale values. Interactive target minimum is 40px pointer / 24px keyboard focusable visual area, with compact data-density exceptions only when adjacent controls remain unambiguous.

Radius has four roles: none for data grids, small for controls, medium for panels/cards, large for prominent marketing or modal surfaces. Elevation has 0–4 semantic levels. Shadows are low-opacity, neutral, and paired with border/surface changes; never use colored glow to communicate status.

## Glassmorphism rules

Glass surfaces are allowed only for global overlays, high-level cards, marketing hero material, and selected floating panels. They require a fallback opaque surface, sufficient contrast against every allowed background, bounded blur, a visible border, and a solid reading surface for dense text/data. Do not stack more than two glass layers, blur behind scrolling data grids, or apply glass to every card. In reduced-transparency/high-contrast modes, replace glass with opaque semantic surfaces.

## Grid, icons, illustrations

Content uses a 12-column fluid desktop grid, 8-column tablet grid, and 4-column mobile grid; workspace canvas uses panel constraints rather than marketing columns. Icons use one approved vector family, a fixed optical size set, labels for unfamiliar/high-risk actions, and a text alternative wherever meaning is not redundant. Illustrations are sparse, geometric, brand-neutral, and used for empty/education states—not error diagnosis or trading confirmation.

## Interaction states

Every interactive component defines: resting, hover (pointer-capable only), pressed, selected/current, focus-visible, focus-within where applicable, loading, disabled, read-only, invalid, and success/error completion. Focus is always a high-contrast visible ring, never a faint shadow alone. Disabled is not used for discoverability when an explanatory locked state is preferable. Loading preserves geometry; errors preserve user input and state the recovery action; empty states explain purpose plus a relevant next action.

## Accessibility standard

Target WCAG 2.2 AA as the release baseline; critical trading and account-confirmation pathways target AAA contrast where practical. Support keyboard-only operation, visible focus, semantic landmarks, screen-reader names/status announcements, logical reading order, target sizing, 200% zoom/reflow, reduced motion/transparency, and localization including longer labels and bidirectional layouts. No component is complete without an accessibility contract and automated plus manual test coverage.

## Component rules

Build primitives first; compose patterns from primitives; use domain modules only for domain semantics. Components expose intent-based variants, not raw style knobs. A component may not create a new token, overlay root, animation behavior, or focus pattern without design-system review. Density is a coordinated system setting (comfortable, default, compact), not a per-control ad hoc pixel override.

## Decision record: restrained motion and material

| Aspect | Decision |
|---|---|
| Problem | Premium references can lead to distracting effects that degrade terminal performance and trust. |
| Decision | Motion signals causality and state; transparency supports hierarchy only where contrast and GPU cost permit. |
| Alternatives considered | Highly animated glass UI; entirely flat static UI; bespoke motion per feature. |
| Tradeoffs | Visual novelty is deliberately limited. |
| Reasoning | Traders need stable, legible interfaces during fast market conditions. |
| Future scalability | A small motion/material vocabulary stays consistent across marketing and products. |
| Risks | Overly austere surfaces. |
| Recommendation | Validate glass and motion under dense data, high contrast, reduced motion, and low-end GPU profiles. |


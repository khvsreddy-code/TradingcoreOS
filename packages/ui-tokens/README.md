# TradingCore UI Tokens

This package is the single source of truth for foundation values. It is framework-neutral TypeScript data: it contains no React, CSS, component, theme-resolution runtime, or UI implementation.

## Public entry point

Import from `@tradingcore/ui-tokens` only. Internal token files are not a stable consumer API.

```ts
import { baseTokens, themes } from "@tradingcore/ui-tokens";

const activeTheme = themes.dark;
const workspaceBackground = activeTheme.background.workspace;
const standardSpacing = baseTokens.spacing[4];
const standardDuration = baseTokens.motion.duration.standard;
```

The example selects existing token data only; resolving user/system preferences and applying values to a renderer belongs to the future Theme Engine phase.

## Token architecture

```text
contract.ts       stable token shape and supported theme names
scales.ts         invariant foundation scales shared by every theme
themes/*.ts       semantic, theme-specific values validated against the contract
index.ts          only public import surface and theme registry
```

`scales.ts` holds values that do not change with color mode: spacing, typography metrics, borders/radii, motion, breakpoints, layering, opacity, and blur. `themes/*.ts` holds visual values whose semantics stay fixed while their values change between dark, light, and high contrast modes. New themes must implement every `ThemeTokens` key; TypeScript rejects missing semantic roles.

## Category reference

| Category                      | Export / semantic role                                               | Purpose                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Primary, secondary, accent    | `color.primary`, `color.secondary`, `color.accent`                   | Brand/action hierarchy with solid, hover, active, and contrast roles.                                           |
| Neutral                       | `color.neutral`                                                      | Ordered neutral palette for internal theme authoring; product UI should prefer semantic roles.                  |
| Semantic text and icon        | `color.semantic.text`, `color.semantic.icon`, `color.semantic.focus` | Readability, icon hierarchy, and visible focus without literal color values.                                    |
| Success, warning, error, info | `color.semantic.{success,warning,error,info}`                        | Each supplies foreground, surface, and border values.                                                           |
| Trade long / short            | `color.semantic.trade.{long,short}`                                  | Directional market semantics; must be paired with text/sign/direction, never hue alone.                         |
| Background layers             | `background.{base,elevated,overlay,modal,sidebar,workspace}`         | Consistent shell and layering hierarchy.                                                                        |
| Glass                         | `glass.{blur,opacity,border,frost,tint}`                             | Premium translucent material recipe; high contrast resolves it to opaque values.                                |
| Borders                       | `borderWidth`, `radius`, `border.{subtle,strong,focus,stroke}`       | Geometric scale plus semantic stroke colors.                                                                    |
| Shadows                       | `shadow.{soft,medium,large,glass}`                                   | Tokenized elevation; high contrast removes decorative shadow.                                                   |
| Typography                    | `typography`                                                         | System font stacks, named type scale, weights, line heights, letter spacing. Data/code uses the monospace role. |
| Spacing                       | `spacing`                                                            | 4pt base increments with 8pt-aligned major rhythm.                                                              |
| Motion                        | `motion`                                                             | Named durations, easing curves, and Framer Motion-compatible spring presets.                                    |
| Breakpoints                   | `breakpoints`                                                        | Capability-layout thresholds from compact through ultra-wide.                                                   |
| Z-index                       | `zIndex`                                                             | Reserved layer order from base to command palette; values must not be invented.                                 |
| Opacity                       | `opacity`                                                            | Named transparency levels for material/data-safe treatments.                                                    |
| Blur                          | `blur`                                                               | Named blur values; glass refers to the same scale conceptually.                                                 |

## Usage rules

- A component may reference semantic token names but may not introduce literal visual values.
- Use semantic text/background/border/status roles in product surfaces; neutral scale values are for token authors.
- Do not use long/short colors as the only expression of market direction.
- Use the z-index scale rather than ad hoc stacking values.
- Use motion recipes only for behavior approved by the animation guide, and preserve reduced-motion handling in the future renderer.
- Do not add component-specific tokens here. A new token requires a cross-component semantic need, owner, documentation, and all-theme coverage.
- Plugins must consume the public entry point and cannot alter token contracts.

## Adding a future theme

Create a theme data object that `satisfies ThemeTokens`, add it to the `themes` registry with a new supported `ThemeName`, document contrast/material behavior, and validate it with the future Theme Engine. This phase deliberately does not provide runtime preference selection, CSS variable emission, persistence, or a theme provider.

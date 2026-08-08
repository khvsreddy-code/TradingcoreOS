# TradingCore Phase 2A — Typography System Report

## Completed scope

Phase 2A adds a framework-native, nonvisual Typography System under `src/platform/typography`. It consumes the Phase 1C Theme Engine runtime scale, which itself is derived from frozen Phase 1B tokens. No token, theme, component, page, layout, or business logic was modified.

## Files created

| File | Responsibility |
|---|---|
| `src/platform/typography/types.ts` | Strict public contracts for roles, responsive modes, weight/line-height/tracking semantics, recipes, and resolved output. |
| `src/platform/typography/recipes.ts` | Semantic hierarchy plus token-key aliases and responsive role recipes. |
| `src/platform/typography/resolve-typography.ts` | Pure resolver from Phase 1C runtime theme to a semantic typography snapshot. |
| `src/platform/typography/useTypography.ts` | Nonvisual client hook consuming the Theme Engine context. |
| `src/platform/typography/index.ts` | Public API boundary. |
| `src/platform/typography/README.md` | Full engineering, hierarchy, responsive, accessibility, trading, code, and extension documentation. |

## Architectural decisions

### Theme Engine is the mandatory gateway

The Typography System never imports raw values from Phase 1B in consumers. It takes `RuntimeTheme` from Phase 1C and resolves only semantic roles, so a future component requests `numeric` or `body` rather than font literals.

### Role recipes instead of text components

Nine roles—Display, Heading, Title, Subtitle, Body, Caption, Label, Code, and Numeric—are typed recipes. They express hierarchy, responsive token keys, family, weight, line-height, tracking, and OpenType numeric behavior without rendering any DOM.

### Frozen-weight compatibility aliases

The required eight public weight names are supplied without editing Phase 1B. Thin, Extra Light, and Light intentionally resolve to the frozen `regular` token; ExtraBold resolves to `bold`. This avoids invented physical values and provides a stable API for a later approved variable-font token expansion.

### Trading and CoreSpirit specialization

The Numeric role uses the tokenized monospace family and tabular lining figures for price/PnL/percentage/volume/OI/time alignment. The Code role also uses monospace and adds slashed-zero behavior for source, logs, AI console output, and future CoreSpirit artifacts.

## Public API

- `resolveTypography(theme, role, viewport, accessibility)` — pure semantic resolver for server/host use.
- `useTypography(role, viewport)` — client hook using the active Phase 1C Theme Engine context.
- `typographyRecipes` — documented role registry.
- `weightAliases`, `lineHeightAliases`, `letterSpacingAliases` — token-backed compatibility maps.

## Future extension points

- Approved token expansion can add true variable-font weights without breaking semantic consumer names.
- A central future font-loading phase may attach optimized Next.js font resources to the existing family roles.
- Accessibility profiles may use the exposed font-scale signal; locale-specific family resolution can remain behind the same role names.
- Plugins may consume roles through the public API but cannot add raw typography values.

## Scope confirmation

No React visual component, Button, Card, Input, page, layout, UI screen, theme change, or business logic was added. The only React artifact is the nonvisual `useTypography` subscriber hook.

## Verification

The final verification succeeded:

- `pnpm format:check` — passed.
- `pnpm lint` — passed with no errors or warnings.
- `pnpm typecheck` — passed under strict TypeScript.
- `pnpm build` — passed; Next.js successfully generated only the existing static `/` and `/_not-found` routes.

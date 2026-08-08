# TradingCore Phase 2C — Icon System Report

## Completed scope

Phase 2C adds a typed, nonvisual Icon System under `src/platform/icons`. It consumes frozen Phase 1B sizing/stroke tokens through the Phase 1C RuntimeTheme and provides a provider-neutral API with a Lucide compatibility adapter.

## Files created

| File | Responsibility |
|---|---|
| `src/platform/icons/types.ts` | Strict contracts for semantic roles, sizes, tones, strokes, providers, registries, accessibility, and resolved icon data. |
| `src/platform/icons/specification.ts` | Token-key size and stroke alias scales. |
| `src/platform/icons/resolve-icon.ts` | Pure semantic size, stroke, color, and accessibility resolver using Phase 1C runtime values. |
| `src/platform/icons/registry.ts` | Provider-neutral icon-pack registry. |
| `src/platform/icons/lucide-provider.ts` | Type-only Lucide React provider adapter accepting a caller-owned icon map. |
| `src/platform/icons/useIcon.ts` | Nonvisual client hook consuming the Theme Engine. |
| `src/platform/icons/index.ts` | Public API boundary. |
| `src/platform/icons/README.md` | Architecture, naming, accessibility, performance, provider, and extension documentation. |

## Architectural decisions

### Provider-neutral references

Callers use an `IconReference` (`provider`, `name`) plus semantic role rather than a provider component. This allows Lucide today and custom, institutional, marketplace, or plugin packs later without changing future component APIs.

### Theme Engine as the color gateway

Icon tone resolution uses the active `RuntimeTheme` for icon hierarchy, action, status, and trade colors. The Icon System contains no color literals and does not import raw token values into consumers.

### Accessibility is part of the contract

Every `IconSpec` must be decorative or semantic. The resolver returns the required ARIA behavior, preventing a future renderer from treating accessibility as an afterthought.

### Lucide support without a coupled icon library

The Lucide adapter uses the `LucideIcon` type and accepts a map provided by the future renderer. It does not create an icon component, import SVG assets, or define a second icon catalogue.

## Public API and extension points

- `resolveIcon(theme, spec)` — pure semantic resolver.
- `useIcon(spec)` — client hook consuming Phase 1C Theme Engine values.
- `createIconRegistry()` — provider registration boundary.
- `createLucideIconProvider()` — Lucide compatibility adapter.
- `iconSizes` and `iconStrokeAliases` — token-key mappings.

Future packs implement `IconProvider`, can register through the registry, and retain the same semantic role/size/stroke/tone/accessibility contracts. Plugins cannot bypass theme or accessibility policy.

## Scope confirmation

No visual React component, SVG asset library, page, navigation, Button, Card, Input, landing page, or business logic was added. The only React artifact is the nonvisual `useIcon` subscriber hook.

## Verification

The final verification succeeded:

- `pnpm format:check` — passed.
- `pnpm lint` — passed with no errors or warnings.
- `pnpm typecheck` — passed under strict TypeScript.
- `pnpm build` — passed; Next.js successfully generated only the existing static `/` and `/_not-found` routes.

# TradingCore Icon System

## Scope

The Icon System governs icon representation, semantics, sizing, token resolution, accessibility, and provider extension. It does not render icons, ship SVG paths, create an icon component, or implement application navigation/actions.

## Architecture

```text
IconSpec (semantic role, provider-neutral reference, size, stroke, tone, accessibility)
  → Phase 1C RuntimeTheme
    → ResolvedIcon (token-backed size, slot, stroke width, color, ARIA contract)
      → future renderer/provider adapter
```

Future components use `IconSpec` and `ResolvedIcon`; they never depend on Lucide names, direct color values, raw dimensions, or a particular SVG component API.

## Roles and naming

Roles classify intent, not artwork: Navigation, Trading, Market, Analytics, AI, Workspace, Settings, Status, Alerts, Broker, CoreSpirit, File, and Action. Use a provider-neutral `IconReference` with `provider` and `name`; provider names are lowercase stable identifiers and icon names are provider-owned stable identifiers.

Name the semantic use at the caller (`role: "trading"`), not an invented generic icon wrapper. A single visual asset can serve different roles only when its accessibility and tone are correct for each use.

## Token-aligned size and stroke scale

| Size | Typography token | Spacing slot token | Use                              |
| ---- | ---------------- | ------------------ | -------------------------------- |
| XS   | `xs`             | `3`                | Dense inline metadata.           |
| SM   | `sm`             | `4`                | Compact labels and tables.       |
| MD   | `base`           | `4`                | Standard UI context.             |
| LG   | `lg`             | `5`                | Prominent action/context.        |
| XL   | `2xl`            | `6`                | Empty-state or feature emphasis. |
| XXL  | `3xl`            | `8`                | Rare hero/education emphasis.    |

Stroke aliases use existing Phase 1B border-width tokens: Thin → `hairline`, Regular → `default`, Strong → `strong`. The system owns no physical pixel values.

## Theme integration

`resolveIcon` and `useIcon` consume `RuntimeTheme` from Phase 1C. Icon tones map only to semantic theme values: icon primary/secondary/disabled/inverse, action primary/secondary/accent, status success/warning/error/info, and trade long/short. No consumer supplies a color literal.

## Accessibility rules

- Use `decorative` only when adjacent text or another accessible control already supplies the meaning. It resolves to `aria-hidden`.
- Use `semantic` with a concise, localized label when the icon conveys information on its own. It resolves to `role="img"` and an accessible label.
- An icon does not make an unlabeled interactive control accessible. A future control must provide its own accessible name.
- Never convey connection, market, broker, long/short, alert, or error state through icon/color alone; pair it with programmatic text/status.

## Provider abstraction and Lucide

`IconProvider<TIcon>` is intentionally generic: it resolves a provider-owned icon value by name. `createIconRegistry` supports multiple packs without coupling UI APIs to a library. `createLucideIconProvider` accepts a caller-provided `LucideIcon` map and returns an `IconProvider`; it imports types only and does not render or bundle an icon catalogue.

Future custom, enterprise, or plugin packs register a provider with a stable ID. They must satisfy the same semantic size, stroke, color, and accessibility contracts. Plugins cannot override core token values or inject global icon styles.

## Framework-native API

```ts
import { createLucideIconProvider, resolveIcon, useIcon } from "@/platform/icons";

const resolved = useIcon({
  icon: { provider: "lucide", name: "chart-no-axes-combined" },
  role: "analytics",
  size: "md",
  tone: "primary",
  accessibility: { kind: "semantic", label: "Market analytics" },
});

resolved.size;
resolved.strokeWidth;
resolved.color;
resolved.accessibility;
```

`useIcon` is a nonvisual client hook that uses the active Theme Engine. `resolveIcon` is pure and host-safe. Rendering a provider value is explicitly deferred to a future component phase.

## Performance rules

- Resolve a semantic icon reference; do not import an entire provider barrel into every future consumer.
- Prefer the provider’s tree-shakeable individual icon imports at the future renderer boundary.
- Do not inline duplicate SVG paths, apply unbounded CSS filters, or animate every status icon.
- Keep icon view boxes, stroke behavior, and optical alignment provider-owned; normalize through this system’s semantic contract rather than modifying paths.

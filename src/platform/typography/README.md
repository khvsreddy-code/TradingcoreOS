# TradingCore Typography System

## Scope

This is a typed, nonvisual typography foundation. It creates no text component, layout, CSS sheet, font-loader, or application screen. Future UI receives a resolved semantic typography record from the Theme Engine and applies it through its approved renderer.

## Architecture

```text
Phase 1B typography tokens
  → Phase 1C RuntimeTheme scale
    → typography recipe (semantic role + responsive intent)
      → resolved typography values / useTypography hook
```

The system never stores a second font family, size, line-height, letter-spacing, or physical weight value. It references `RuntimeTheme.scale.typography`, which Phase 1C derives from the frozen Phase 1B token set.

## Hierarchy and role usage

| Role     | Intended use                                                   | Desktop → tablet → mobile scale | Family / behavior                             |
| -------- | -------------------------------------------------------------- | ------------------------------- | --------------------------------------------- |
| Display  | Rare marketing or high-level product statement only            | 5xl → 4xl → 3xl                 | Sans, bold, dense, compressed.                |
| Heading  | Major page or workspace section                                | 3xl → 2xl → xl                  | Sans, semibold, dense.                        |
| Title    | Panel, dialog, document, or significant region title           | 2xl → xl → lg                   | Sans, semibold.                               |
| Subtitle | Supporting introductory/context text                           | lg → lg → base                  | Sans, medium.                                 |
| Body     | Reading, guidance, research narrative                          | base → base → base              | Sans, regular, relaxed.                       |
| Caption  | Provenance, timestamps, secondary annotations                  | xs → xs → xs                    | Sans, regular.                                |
| Label    | Short control/data labels and headings                         | sm → sm → sm                    | Sans, medium, wide.                           |
| Code     | CoreSpirit source, logs, strategy output, AI console artifacts | sm → sm → xs                    | Mono, relaxed, slashed-zero numeric features. |
| Numeric  | Prices, PnL, percentages, volume, OI, time, account values     | base → base → sm                | Mono, medium, tabular lining figures.         |

## Weight, line-height, and tracking policy

Phase 1B currently provides physical values for `regular`, `medium`, `semibold`, and `bold`. The full public weight vocabulary is still available for consistent future use:

| Public role                       | Current Phase 1B backing token |
| --------------------------------- | ------------------------------ |
| Thin, Extra Light, Light, Regular | `regular`                      |
| Medium                            | `medium`                       |
| SemiBold                          | `semibold`                     |
| Bold, ExtraBold                   | `bold`                         |

This is an intentional compatibility alias, not an invented font value. When a future approved token phase adds variable-font weight tokens, only the alias table changes; consumers keep their public semantic names.

Line-height aliases are Dense → `compact`, Normal → `default`, Relaxed and Loose → `relaxed`. Letter-spacing aliases are Compressed → `tight`, Normal and Monospace → `normal`, and Wide → `wide`. No values are duplicated in this package.

## Trading UI rules

- Use `numeric` for vertically comparable market values, including price, bid/ask, PnL, percentage, volume, OI, timers, and timestamps. Its tabular figures prevent digit-width jitter.
- Do not animate values through intermediate numeric strings. Typography protects alignment; data and motion policies protect correctness.
- Include sign, unit, currency, direction, and stale/source context where applicable. Numeric typography does not make color-only PnL or trade direction accessible.
- Use `code` for source, console output, identifiers, logs, strategy values, and AI artifacts. It enables slashed zero to distinguish `0` and `O`.
- Use caption for supporting metadata, never as the only place for material trading risk, order confirmation, or error text.
- Keep hierarchy semantic: do not choose a role solely because it visually “looks right.”

## Responsive and accessibility rules

Roles contain explicit Desktop, Tablet, and Mobile recipe entries rather than duplicated values. Viewport selection is a future layout/container concern; this package exposes the typed recipes but creates no responsive layout.

`useTypography` consumes `useTheme()` and returns the Theme Engine’s reduced-motion, high-contrast, and font-scale signals alongside typography values. Typography does not use motion itself. The current font-scale value is a reserved Theme Engine signal; future accessibility profiles can scale through the renderer without changing role contracts. High contrast is handled by the active theme while hierarchy remains unchanged.

## Framework-native API

```ts
import { resolveTypography, useTypography } from "@/platform/typography";
import { useTheme } from "@/platform/theme";

const numeric = useTypography("numeric", "desktop");
numeric.fontFamily;
numeric.fontVariantNumeric;

const { theme, accessibility } = useTheme();
const body = resolveTypography(theme, "body", "mobile", accessibility);
```

`useTypography` is a client hook for future client consumers. `resolveTypography` is pure and can be used by any host that already has a Phase 1C `RuntimeTheme`. Neither API accepts raw visual values.

## Best practices and extension points

- Add a role only when it is cross-product semantic language, not a component-specific style.
- Add future physical font values only through an approved Design Token Foundation change; never add literals here.
- A future font-loading phase should use a centralized Next.js font integration, not per-component imports.
- Plugins consume the public typography API and may choose roles, but may not redefine token scales or locally manufacture display/numeric variants.
- Future locale and writing-system support can add font-family resolution behind the existing family role contract.

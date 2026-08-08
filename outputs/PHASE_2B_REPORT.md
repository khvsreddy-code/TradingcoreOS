# TradingCore Phase 2B — Motion Engine Report

## Completed scope

Phase 2B adds a typed, nonvisual Motion Engine under `src/platform/motion`. It consumes only the Phase 1C runtime theme scale, which originates in frozen Phase 1B motion, opacity, blur, and spacing tokens. No prior phase source was modified.

## Files created

| File | Responsibility |
|---|---|
| `src/platform/motion/types.ts` | Strict contracts for categories, presets, token-key references, effects, accessibility preference, and resolved plans. |
| `src/platform/motion/presets.ts` | Semantic preset catalogue for interaction, navigation, overlay, workspace, trading, system, feedback, and background intent. |
| `src/platform/motion/resolve-motion.ts` | Pure mapping from a Phase 1C `RuntimeTheme` and accessibility preference into a renderer-ready motion plan. |
| `src/platform/motion/useMotion.ts` | Nonvisual client hook consuming the Theme Engine context. |
| `src/platform/motion/index.ts` | Public Motion Engine entry point. |
| `src/platform/motion/README.md` | Architecture, lifecycle, accessibility, trading, performance, GPU, usage, and extension documentation. |

## Architectural decisions

### Semantic plans instead of animation code

Future consumers ask for `orderFill`, `workspaceDock`, `drawer`, or `priceFlash`; they never request a raw duration, easing curve, or transform distance. The resolver produces a typed plan from token-backed semantic references and does not perform animation itself.

### Theme Engine is the mandatory gateway

The `useMotion` hook reads the Phase 1C Theme Engine’s active runtime scale and system reduced-motion signal. The pure resolver accepts the same runtime theme for non-hook/host use. Phase 2B does not import visual literals from any Phase 1B source.

### Frozen-token transform policy

Opacity, blur, duration, delay, spring, easing, and translation all use existing Phase 1B values. Scale is derived from the existing solid/subtle opacity tokens. Phase 1B has no angular scale, so rotation is intentionally limited to its token-derived `none` state. New physical angle or scale values require a future approved token change, not a local literal.

### Accessibility first

`disabled` returns an instant, effect-free plan. `reduced` and Theme Engine system reduced-motion return instant state transitions. Full motion uses the selected preset. Future persisted/accessibility profiles can supply the already typed preference argument.

## Public API

- `motionPresets` — semantic catalogue of all current presets.
- `resolveMotionPlan(theme, preset, accessibility)` — pure resolver.
- `useMotion(preset, preference)` — client hook reading the Theme Engine.
- Type exports for preset/category/effect/accessibility contracts and resolved plans.

## Future extension points

- A Framer Motion adapter can translate resolved plans into library-specific props while retaining the semantic API.
- Approved token changes can unlock physical rotate/scale variants without consumer changes.
- Plugin contributions may request public plans but cannot bypass accessibility or introduce global animation styles.
- A future user preference persistence layer can pass existing `MotionPreference` values to the resolver/hook.

## Scope confirmation

No visual component, page, layout, Button, Card, Input, landing page, business workflow, DOM animation, or timer was created. The only React artifact is the nonvisual `useMotion` subscriber hook.

## Verification

The final verification succeeded:

- `pnpm format:check` — passed.
- `pnpm lint` — passed with no errors or warnings.
- `pnpm typecheck` — passed under strict TypeScript.
- `pnpm build` — passed; Next.js successfully generated only the existing static `/` and `/_not-found` routes.

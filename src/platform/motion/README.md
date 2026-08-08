# TradingCore Motion Engine

## Scope

The Motion Engine is a typed, nonvisual policy and resolver layer. It defines semantic transition intent; it does not render a component, manipulate the DOM, create a timer, animate data, or add a UI control. Future renderers consume a `ResolvedMotionPlan` from this engine.

## Architecture

```text
Phase 1B motion, opacity, blur, and spacing tokens
  → Phase 1C RuntimeTheme scale and accessibility signal
    → semantic MotionPreset definition
      → resolved MotionPlan / useMotion hook
```

All durations, delays, springs, bezier curves, opacity values, blur values, and translation distances come from the active Theme Engine runtime scale. Scale is mathematically derived from the existing `solid` and `subtle` opacity tokens; no scale literal is introduced. Rotation currently supports the token-backed `none` state only because Phase 1B intentionally has no angular token scale.

## Runtime API

```ts
import { resolveMotionPlan, useMotion } from "@/platform/motion";
import { useTheme } from "@/platform/theme";

const plan = useMotion("workspaceDock");
plan.transition.duration;
plan.transition.easing;
plan.effects.translate;

const { theme, accessibility } = useTheme();
const modalPlan = resolveMotionPlan(theme, "modal", {
  systemReducedMotion: accessibility.reducedMotion,
  preference: "system",
});
```

`useMotion` is a client hook for future client consumers. `resolveMotionPlan` is a pure host-safe function. Consumers request a preset, never a duration/easing/transform literal.

## Preset catalogue

| Category          | Presets                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Interaction       | Instant, Fast, Spring, Elastic, Hover, Press, Focus.                                              |
| Navigation        | Normal, Slow, Ultra Slow.                                                                         |
| Overlay           | Modal, Toast, Drawer, Overlay, Command Palette.                                                   |
| Feedback / system | Loading, Notification, Market Status, Connection State, AI Streaming, CoreSpirit Console.         |
| Workspace         | Workspace Dock.                                                                                   |
| Trading           | Chart Update, Order Fill, Price Flash, PnL Update, Position Open, Position Close, Scanner Update. |

Each preset declares a category, transition type, token-backed duration/delay/easing or spring, and optional semantic effects. Presets are a policy catalogue—not permission to animate every occurrence of a named event.

## Accessibility and preference resolution

`MotionPreference` is `system`, `full`, `reduced`, or `disabled`.

1. `disabled` is an explicit accessibility override and produces an instant, effect-free plan.
2. `reduced`, or a Theme Engine system `prefers-reduced-motion` signal, produces instant duration while preserving state changes.
3. `full` and `system` without reduced-motion use the preset’s token-backed plan.

The Theme Engine is the system-preference source. A future accessibility profile or persisted user preference can supply the existing `preference` argument without changing preset consumers.

## Trading-specific rules

- Price Flash, PnL Update, Chart Update, and Scanner Update use brief opacity-only cues. They must never fabricate intermediate price values or become continuous flashing indicators.
- Order Fill, Position Open, and Position Close are acknowledgement signals, not execution proof. The data state remains authoritative.
- Market Status and Connection State describe a known status change; they do not hide stale/disconnected text behind animation.
- AI Streaming and CoreSpirit Console plans only describe output-arrival cadence. They never imply model completion, execution, or correctness.

## Performance and GPU rules

- Prefer opacity and transform effects. Translation uses tokenized spacing distances.
- Do not animate layout dimensions, large-area filter/blur values, box shadows, or every cell of a live data grid.
- Do not attach independent animation timers to quote, PnL, scanner, or log rows.
- Pause/defer nonessential background movement when offscreen; honor reduced/disabled modes before allocating animation work.
- Motion must not delay focus movement, order safety confirmation, data freshness indication, or keyboard input.

## Extension policy

- Add a preset only when it describes a cross-product behavior and has an accessibility/performance rationale.
- New physical scale, rotation, or angle values require an approved Phase 1B token addition; do not add literals to this package.
- Plugins may request public presets but cannot inject global animation styles, bypass preferences, or override system accessibility.
- A future Framer Motion adapter can convert `ResolvedMotionPlan` to library props without changing the semantic preset API.

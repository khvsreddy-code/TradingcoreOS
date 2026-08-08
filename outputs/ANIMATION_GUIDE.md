# TradingCore Animation Guide

**Principle:** Motion explains cause, hierarchy, continuity, or progress. If removing an animation does not reduce understanding, remove it. Market data movement is not decoration and follows separate data-update rules.

## Motion token system

| Token family | Values / intent | Default use |
|---|---|---|
| Duration | instant (0), micro (100–140ms), fast (160–200ms), standard (220–280ms), deliberate (320–420ms) | feedback, controls, overlays, structural transitions, respectively |
| Easing | standard (balanced), enter (decelerate), exit (accelerate), emphasized (rare) | all motion must reference named curves |
| Distance | none, micro, small, medium | tokenized translation only; no arbitrary travel |
| Opacity / scale | named transition recipes | used sparingly with motion, never as the sole state indicator |

Durations are budgets, not requirements. Direct manipulation (resize, drag, splitter, chart pan) tracks input immediately and is not animated after the fact. Financial values update without bouncing, counting-up theatrics, or flashing backgrounds that obscure reading.

### Decision record: restrained functional motion

| Aspect | Decision |
|---|---|
| Problem | Premium visual references invite high-motion effects that create distraction, latency, and motion sensitivity problems. |
| Decision | Use a small tokenized motion vocabulary tied to explicit interaction semantics. |
| Alternatives considered | Feature-owned bespoke motion; no motion; highly animated glass/particle treatments. |
| Tradeoffs | Some brand expression is intentionally sacrificed. |
| Reasoning | Traders and researchers need stable spatial memory and immediate response under load. |
| Future scalability | Shared recipes make new modules and plugins coherent and testable. |
| Risks | Motion may become imperceptible or inconsistently applied. |
| Recommendation | Review motion in performance traces and accessibility testing, not only polished demos. |

## Approved patterns

| Interaction | Allowed behavior | Prohibited behavior |
|---|---|---|
| Hover / press | Color/elevation/border change; micro opacity; press feedback under 140ms | Hover that shifts layout, hides labels, or becomes the only affordance. |
| Menu / tooltip / popover | Short opacity + small directional movement; collision-aware | Long spring/bounce, animated travel across screen. |
| Modal / drawer | Fade with subtle scale/edge translation; backdrop appears with it | Full-page theatrics, non-dismissible motion loops. |
| Tabs / panels | Immediate content update; optional brief crossfade only where state remains clear | Sliding a large data canvas merely to look dynamic. |
| Page / workspace | Minimal route transition only when it preserves hierarchy; layout changes show targets | Blocking page transitions or animations that delay trade/research work. |
| Drag / dock / resize | Direct input tracking; target highlight; settle immediately | Inertial panel movement, hidden drop targets, automatic reflow surprise. |
| Loading | Skeleton shimmer or progress using bounded low-contrast motion | Indeterminate animation masking an error or running forever. |
| Success / error | Brief non-color confirmation with clear text; error focuses recovery | Confetti, alarms, shaking form fields, flashy red/green pulsing. |

## Loading and data updates

Skeletons preserve final geometry and use a single shared shimmer recipe; after a reasonable delay, show text/status rather than perpetuating placeholder movement. Known-duration work exposes progress and cancellation where safe. Quote/data updates may use a brief, low-contrast direction cue with a user-configurable suppression policy; the value, timestamp, and stale state are the source of truth. Never animate numeric values through intermediate fictitious prices.

## Accessibility and preferences

`prefers-reduced-motion` turns nonessential duration and travel to instant, disables shimmer/continuous loops/parallax/scroll-linked effects, and preserves immediate state change plus focus movement. `prefers-reduced-transparency` replaces glass/blur with opaque semantic surfaces. Users must not need to change a preference to use a critical workflow. Flashing remains below seizure-risk thresholds; no essential content is available only during motion.

## Performance rules

Animate compositor-friendly opacity and transform where possible; avoid layout-changing properties, filter/blur animation over large areas, box-shadow animation on grids, and repeated DOM measurements during scroll/drag. Pause offscreen/nonvisible decorative motion, batch data updates, and avoid creating independent timers per cell. Establish budgets: interaction feedback begins within one frame where feasible, overlay transition does not delay focus, and continuous UI motion consumes negligible CPU/GPU under a representative multi-panel terminal workload.

## Governance

Motion recipes live with tokens and are reused through component contracts. Any new continuous, scroll-linked, or layout-affecting motion requires performance evidence, reduced-motion behavior, and design-system approval. Plugins may request approved recipes only; they cannot register global animation styles or change user motion preferences.


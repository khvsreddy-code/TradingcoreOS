# TradingCore Landing Page — Design-System Consumption Brief

**Status:** Architecture-level landing page design only. No components, code, styles, or independent visual rules are created here. This is the first proposed consumer of the TradingCore Design System, pending foundation approval.

## Purpose

The landing page introduces TradingCore as a credible trading operating system: calm, capable, and premium—not loud, speculative, or “crypto casino.” Its job is to establish trust, explain the product’s operating-system breadth, and move qualified visitors toward the appropriate next action. It must not behave like an application terminal or duplicate product navigation.

### Decision record: product-system story over feature collage

| Aspect | Decision |
|---|---|
| Problem | A large future roadmap can tempt a landing page into an overwhelming checklist or a generic trading claim. |
| Decision | Tell a progressive story: unified operating system → meaningful workspaces → trusted capabilities → proof and invitation. |
| Alternatives considered | A feature grid as the whole page; a simulated live terminal; campaign-style visual spectacle. |
| Tradeoffs | Some future features receive less individual prominence. |
| Reasoning | The design must establish a durable category and trust before selling individual tools. |
| Future scalability | New modules appear as curated capability stories without redesigning the page’s narrative structure. |
| Risks | Abstract positioning can feel unsubstantiated. |
| Recommendation | Pair every strategic claim with clear product evidence, availability status, or an explicit “planned” designation. |

## Information architecture

1. **Global marketing header** — TradingCore wordmark, concise product navigation, resources, sign-in, and one primary call to action. It uses the marketing shell contract and becomes an accessible menu/sheet on compact viewports.
2. **Hero: TradingCore, the trading operating system** — restrained headline, one-sentence explanation, primary/secondary actions, and a single crafted product-workspace visual. The visual is illustrative/product evidence, never fake real-time performance data.
3. **Operating system proposition** — three to five connected pillars: Observe, Decide, Execute, Build, and Extend. Use semantic iconography and short descriptions; not an indiscriminate feature wall.
4. **Workspace story** — an editorial sequence demonstrating how charting, options, research, portfolio, and AI/IDE contexts coexist through saved workspaces. Reuse panel/window visual language from the UI foundation.
5. **Capability modules** — curated cards for Markets & Trade, Research & Intelligence, Build & Automate, and Portfolio & Operations. Cards use standard Card/GlassCard rules and route to future detail content.
6. **Trust and operational readiness** — broker/data posture, security/privacy statements only when substantiated, availability/status, and enterprise/white-label pathway. Avoid unsourced social proof, fabricated numbers, or compliance claims.
7. **Final conversion band and footer** — repeat the primary action, offer an enterprise/contact route, then stable legal/support/product links.

## Visual direction

The public surface uses the same semantic color, typography, spacing, radius, focus, and motion tokens as the application. The default expression is a dark graphite canvas with restrained translucent elevated surfaces, cool neutral borders, one controlled brand accent, and a sparse data-inspired visual language. Light and high-contrast modes remain fully designed.

Use generous content rhythm, disciplined editorial typography, and one focal visual per section. Glass is limited to hero/product-preview layers and selected capability cards; text rests on contrast-safe surfaces. Avoid neon gradients, animated grids, floating ticker clutter, glowing status colors, faux chart performance claims, coins/candles as decoration, or continuous parallax.

## Product visual rules

- Screens are system-consistent compositions of Topbar, Sidebar, Panel, ChartContainer, DataGrid, and Status components, using synthetic/labelled demonstration content only.
- Product visual captions explain a user outcome, not merely name a UI widget.
- Any chart/data illustration displays simulated/sample labels, a visible timestamp/source convention, and no implication of investment advice or live execution.
- Use a small number of realistic workflow moments instead of a giant collage: e.g., research insight moving into a saved trading workspace, or a strategy artifact flowing into review.
- Future/unreleased modules must be labelled accurately; the page must never present roadmap concepts as available functionality.

## Interaction and motion

Calls to action use standard Button and Link contracts. Navigation, menu, focus, dialog, tooltip, loading, and error behavior inherit platform rules. Reveal effects are optional and only enhance reading order; content exists and is usable without them. Product visuals may use short state transitions to demonstrate workspace continuity, but they stop when offscreen and honor reduced motion/transparency preferences. No auto-advancing carousels, scroll hijacking, or artificial “live market” animation.

## Responsive composition

Desktop uses an editorial 12-column grid with a bounded content measure and wide hero workspace visual. Laptop simplifies visual chrome before reducing type. Tablet changes workspace sequences into stacked chapters and uses an 8-column grid. Mobile becomes a clear single-column narrative: concise hero, vertically ordered capability cards, static or focused product visual, touch-safe actions, and accessible menu. No attempt is made to fit an entire terminal screenshot into mobile width; crop/recompose evidence around one task.

## Accessibility and performance acceptance criteria

- All copy, navigation, actions, product visuals, and form feedback meet the Design System accessibility standard.
- Hero and product imagery have meaningful text alternatives or adjacent equivalent explanation; decorative material is hidden from assistive technology.
- Text remains readable at 200% zoom, with no hover-only information and no visual claim conveyed solely by color.
- Load core content before optional enhanced visuals; defer below-the-fold media and avoid expensive full-page blur/video.
- Measure user-perceived loading, interaction latency, layout shift, and rendering cost on mid-tier laptop/mobile hardware.

## Handoff checklist

Before implementation begins, approve the eight foundation documents; assign content owners for claims; define conversion actions and legal/compliance review; source authentic product visuals or clearly labelled concepts; create content inventory/localization plan; and review the page against token, component, motion, accessibility, and responsive contracts. Any needed primitive or token must be added to the design system first—not invented in the landing-page implementation.


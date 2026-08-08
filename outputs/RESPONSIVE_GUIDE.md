# TradingCore Responsive Guide

**Principle:** Responsive design preserves intent, not a desktop pixel arrangement. TradingCore is desktop-first for creation and high-density analysis, but every supported viewport receives a deliberate, complete experience.

## Responsive modes

| Mode | Typical viewport / environment | Primary intent | Layout behavior |
|---|---|---|---|
| Compact mobile | narrow touch device | monitoring, alerts, approvals, focused task completion | single content column; drawers/sheets replace rails; no multi-panel terminal compression. |
| Mobile / large phone | touch device | watchlists, portfolio, news, simple orders where approved | priority controls visible; data tables become cards/detail routes or horizontally navigable structured views. |
| Tablet | medium touch / keyboard optional | research viewing, account management, light analysis | 8-column content grid; one persistent rail at most; inspector becomes drawer. |
| Laptop | constrained desktop | daily work, selected terminal workflows | persistent primary sidebar may collapse; workspace uses priority-based panel templates. |
| Desktop | canonical desktop | complex trading, research, build | multiple panels, keyboard-first, resizable layout. |
| Ultra-wide | wide desktop | broad comparative analysis | bounded readable content; optional extra workspace zone, never stretched text/data columns. |
| Multi-monitor | coordinated displays | professional terminal/IDE | named display zones, persistent display assignment, single session/workspace context. |

Breakpoint values are tokenized capability thresholds, calibrated from content constraints and tested across zoom—not device brands. Width alone is insufficient: container size, pointer precision, hover capability, keyboard presence, viewport height, display scale, and number of displays influence composition.

### Decision record: capability-led progressive composition

| Aspect | Decision |
|---|---|
| Problem | A trading terminal, IDE, and landing page cannot all scale by shrinking columns at fixed device breakpoints. |
| Decision | Define responsive recipes per component/panel using container constraints and input capabilities, then compose workspace templates by priority. |
| Alternatives considered | Desktop-only UI; one global breakpoint table; independently responsive module CSS. |
| Tradeoffs | Requires more explicit panel metadata and QA matrices. |
| Reasoning | A panel knows its viable minimum size better than a global page rule does. |
| Future scalability | New modules/plugins can declare constraints and participate in safe layout adaptation. |
| Risks | Inconsistent collapse behavior across panels. |
| Recommendation | Publish panel priority/min-size contracts and test template behavior at every supported mode. |

## Content and component behavior

- Navigation: desktop uses sidebar; compact modes use an accessible navigation sheet/bottom task navigation where task count is bounded. Preserve current location and unsaved-work warnings.
- Top bar: global command/search remains discoverable; secondary account/status controls collapse into an overflow or dedicated status surface without hiding critical disconnection state.
- Tables/data grids: maintain headers, row identity, and sorting/filtering. Reprioritize columns, expose detail views, or use a semantic row-card pattern; do not merely clip essential columns.
- Charts: preserve chart canvas and key controls, move settings/indicators to drawers, support touch gestures with visible alternatives, and expose data summary/table alternative.
- Forms/order ticket: become a focused sequence only if complexity demands it; never remove account, instrument, price, quantity, order type, or risk disclosure merely to fit width.
- Overlays: dialogs use bounded width/height and scroll within content; mobile uses appropriate sheets only where the task remains clear. Tooltips acquire tap/keyboard alternatives.
- Density: compact density is permitted on desktop/tablet with precise input; mobile uses touch-safe targets even when data density is high.

## Workspace adaptation

Every dockable panel declares minimum usable width/height, preferred size, collapse priority, compact representation, and unsupported-mode fallback. The workspace manager chooses, in order: reallocate flexible space; collapse low-priority panels into tabs; move inspector/supporting panels to a drawer; promote the focused panel; offer a purpose-designed focused route. It never silently destroys a panel. Saved desktop layouts restore when the capable environment returns.

### Future terminal

Desktop terminal templates may use chart-centered multi-panel layouts. Laptop begins with an instrument/watchlist rail plus chart and a tabbed secondary region. Tablet presents chart plus focused order/position/detail drawers. Mobile prioritizes watch, alert, position, and approved order pathways; advanced DOM, multi-chart grids, and dense option-chain manipulation must offer a specialized experience or be unavailable with a clear reason.

### Future IDE and research

The CoreSpirit IDE remains desktop-first: editor is primary, explorer/problems/output collapse predictably, and unsaved work is protected. Tablet is review/edit-light; mobile supports review, notification, and artifact access rather than pretending to be a full IDE. Research emphasizes readable line length, source provenance, export/share actions, and a focused document canvas on smaller displays.

## Multi-monitor policy

Display assignment uses logical named zones rather than fragile screen coordinates alone. A workspace records display capability and panels per zone, then repairs gracefully if a monitor disappears by returning panels to the primary canvas and notifying the user. Focus, keyboard commands, session state, notifications, and accessibility settings remain globally coordinated. Do not duplicate market streams or account state per display solely because panels are separate.

## Accessibility, performance, and QA

Support 200% zoom, narrow/short viewports, landscape/portrait, keyboard-only navigation, touch/pen, high contrast, reduced motion/transparency, long localized text, and right-to-left layout. Responsive changes preserve focus or place it at the newly relevant landmark with an announcement. Use virtualization for large data, defer noncritical panel work, avoid layout thrashing on resize, and throttle resize observations without perceptible lag.

The release matrix must exercise each core shell and module template in all modes, including minimum panel dimensions, splitters, overlay collision, route restoration, offline/stale status, and monitor disconnect/reconnect. Screenshots alone are insufficient; include keyboard, screen-reader, touch, and performance scenarios.


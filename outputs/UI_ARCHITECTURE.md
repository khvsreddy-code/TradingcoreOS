# TradingCore UI Architecture

**Status:** Phase 0 blueprint — implementation is intentionally prohibited until approved.  
**Scope:** The product shell and workspace platform used by every TradingCore surface. The marketing landing page is a consumer of this system, not an exception to it.

## Architectural intent

TradingCore is a desktop-first trading operating system whose UI must also serve research, automation, administration, IDE, and marketplace workflows. The foundation therefore separates a stable **application platform** from independently owned **product modules** and from **third-party extensions**. No module may directly own the browser viewport, global navigation, theme, notification pipeline, keyboard routing, or persisted layout schema.

### Decision record: workspace-first application shell

| Aspect | Decision |
|---|---|
| Problem | Full-screen terminal, IDE, research, and settings flows need different density and layout without fragmenting navigation or accessibility. |
| Decision | A single shell provides identity/session, global command routing, activity center, workspace registry, status bar, overlays, and theme. Modules render inside a workspace host. |
| Alternatives considered | Page-specific shells; a permanently fixed dashboard; browser-window-per-tool. |
| Tradeoffs | The shell has a larger governance burden and module authors must use declared extension points. |
| Reasoning | It makes saved layouts, deep links, plugins, cross-module notifications, and consistent recovery feasible. |
| Future scalability | Workspaces can be versioned, shared, permissioned, and restored across devices without changing module internals. |
| Risks | A monolithic shell can become a bottleneck. Keep its public contracts small, versioned, and owned by a platform team. |
| Recommendation | Establish an Architecture Review group for shell contracts, layout migrations, and global shortcuts. |

## Layer model

```text
Browser / native host
  └─ TradingCore application shell
       ├─ global services (identity, command, notification, telemetry, preferences)
       ├─ workspace manager
       │    └─ layout / window manager
       │         └─ module hosts and plugin hosts
       └─ global overlays (command palette, dialogs, drawers, toasts)
            └─ design-system primitives and tokens
```

The shell owns chrome and cross-cutting services. A module owns its route, domain state, permissions, data adapters, and panels. A panel owns only its local presentation and declared layout constraints. Plugins receive a constrained host API and never DOM access to another module.

## Application shell

### Persistent regions

| Region | Responsibility | Rules |
|---|---|---|
| Top bar | workspace switcher, global search/command, connection and account context, primary actions | 48–56px tokenized height; never becomes a data-dense toolbar by default. |
| Primary sidebar | product navigation and pinned module destinations | Collapsible; active state is semantic, not color-only; routes remain addressable. |
| Context rail | optional module/workspace navigation, inspectors, watchlists, activity | May collapse independently; not required for basic navigation. |
| Workspace canvas | docked panels, tabs, floating windows, transient empty states | The only region allowed to host arbitrary module content. |
| Bottom status bar | market/session connection, sync, latency, background work, keyboard status | Compact and non-interruptive; errors link to Activity Center. |
| Overlay layer | command palette, dialogs, drawers, tooltips, menus, toasts | Centralized stacking and focus management; one modal task at a time. |

The landing page uses a **marketing shell**: a minimal variant of the same tokens, typography, navigation contracts, overlays, and responsive rules. It does not introduce a separate visual system.

## Navigation philosophy

Navigation is task-oriented, keyboard-addressable, and stable. Primary navigation represents durable product areas (Markets, Trade, Research, Build, Portfolio, Activity, Settings); it must not mirror internal team boundaries. Secondary navigation is module-local. Contextual controls belong in panel toolbars rather than the global sidebar.

Use routes for shareable destinations, workspace identifiers for arrangements, and panel identifiers for ephemeral focus. Back/forward restores route-level intent; it must not replay arbitrary panel mutations.

## Workspace manager

A workspace is a named, versioned, user-visible arrangement of module instances, panel configuration, selected tabs, and durable view preferences. It is not domain data and never stores credentials, secrets, full order payloads, or unbounded market history.

Workspace lifecycle: create from template → open → modify locally → autosave with debouncing → synchronize revision → resolve conflict → archive/restore. Templates include Trading Terminal, Research, Options, Portfolio Review, CoreSpirit IDE, and blank canvas; their panel inventory is declarative and permission-aware.

### Layout data contract (conceptual)

Each node has a stable opaque ID, `kind` (split, stack, panel, floating), direction, children, size constraints, a version, and a panel descriptor. Panel descriptors declare module ID, panel type, instance ID, serialized settings schema version, capabilities, and fallback title/icon. Layout persistence stores references and user settings, never component instances.

## Panel, docking, and window architecture

The layout manager supports split panes, tab stacks, resizing, pinning, maximization, full-screen focus mode, floating windows, drag targets, and recoverable resets. Every panel declares min/preferred size, density support, focus behavior, title actions, data requirements, and a safe fallback renderer.

Docking is a platform service, not a feature duplicated by terminals and IDEs. Drag behavior uses clear insertion affordances, keyboard alternatives, an escape-to-cancel path, and no accidental destructive rearrangement. On a small viewport, floating windows serialize into a stack or route-level detail view; no tiny desktop panels are squeezed into mobile.

### Decision record: declarative layout graph

| Aspect | Decision |
|---|---|
| Problem | Persisted workspaces must survive releases, missing plugins, changed panel internals, and device changes. |
| Decision | Persist a versioned, declarative layout graph with panel descriptors and migrations. |
| Alternatives considered | Persisting rendered UI state; fixed grids; each module creating its own docking solution. |
| Tradeoffs | Schema migration and compatibility testing are mandatory. |
| Reasoning | Data can be validated, repaired, synced, and rendered with fallback placeholders. |
| Future scalability | Enables templates, collaboration, enterprise policies, and external displays. |
| Risks | Unbounded schema growth. Publish ownership and deprecation rules per node type. |
| Recommendation | Maintain migration fixtures for every released layout version and a one-click “reset this panel/layout” recovery path. |

## Special workspace patterns

| Workspace | Default composition | Architectural distinction |
|---|---|---|
| Trading terminal | chart central, order ticket, order book/DOM, positions, watchlist, activity | Critical actions require explicit market/account context and resilient connection status. |
| CoreSpirit IDE | explorer, editor stack, terminal/output, problems, source control, AI assistant | Uses the same docking service but supports editor tab semantics, monospace density, and unsaved-work protection. |
| Research | notebook/document center, datasets, chart outputs, citations, AI sidecar | Long-form reading and provenance take priority over maximum information density. |
| AI workspace | task thread, artifacts, sources, tool activity, review controls | AI output is attributed, cancellable, permission-scoped, and never silently executes trading actions. |

## Responsive and multi-window behavior

Desktop is the canonical authoring surface. Compact layouts preserve task completion by changing composition: hide low-priority rails, combine tabs, surface inspector content in drawers, and promote the focused panel. Tablet supports viewing and lightweight management; mobile supports monitoring, alerts, approvals, and focused workflows—not a compressed multi-panel terminal. Ultra-wide and multi-monitor configurations may map one workspace to named display zones, but share a single command/notification/session context.

## Plugin extension points

Plugins can contribute a navigable module, a panel type, a command, a settings page, a data-cell renderer, a contextual action, an inspector section, or a workspace template. Each contribution declares permissions, capability requirements, icon/label, localization keys, schema versions, minimum host version, and failure fallback. Plugins cannot modify core token definitions, intercept arbitrary keystrokes, inject global CSS, or bypass focus/overlay/telemetry boundaries.

### Decision record: capability-scoped plugins

| Aspect | Decision |
|---|---|
| Problem | Extensions add value but can destabilize finance-critical workflows. |
| Decision | Expose versioned, capability-scoped extension registries with permission prompts and isolation boundaries. |
| Alternatives considered | Unrestricted component injection; no plugin UI; iframe-only plugins. |
| Tradeoffs | Extension authors have less freedom; host adapters require ongoing maintenance. |
| Reasoning | Trading safety, accessibility, and predictable layout behavior outrank arbitrary customization. |
| Future scalability | Supports marketplace review, enterprise allowlists, and gradual API evolution. |
| Risks | API fragmentation. Publish compatibility windows and automated contract tests. |
| Recommendation | Create a plugin design review checklist before accepting marketplace UI contributions. |

## Non-functional guardrails

- Shell startup renders structural chrome before optional module data; defer noncritical panels.
- All workspace and panel operations are keyboard-operable and announce structural changes.
- Error boundaries exist at shell, module, plugin, and panel boundaries with actionable recovery.
- Route, layout, and plugin telemetry is privacy-aware and sampled; never record account-sensitive values in UI telemetry.
- Global z-index, focus trapping, portal targets, and scroll locking are platform-owned tokens/contracts.


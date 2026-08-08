# TradingCore Component Specification

**Scope:** Reusable, implementation-agnostic contracts. “Props” describe the public API shape, not code. All components inherit token, density, localization, analytics, error-boundary, and testability policies from the platform.

## Contract conventions

Required common fields: accessible name, stable test identifier where necessary, `data-state`, disabled/read-only support where relevant, token-only styling, and event callbacks named for user intent. Variants express purpose; state is not encoded by a cosmetic variant. Composition replaces “god components.”

### Foundation primitives

| Component | Purpose / responsibilities | Props & variants | States / accessibility / extension |
|---|---|---|---|
| Box, Stack, Inline, Grid | Tokenized layout composition; no business meaning. | gap, alignment, distribution, padding, responsive recipe. | Semantic element selection; must not replace landmarks. Extend via recipes, not new layout primitives. |
| Surface, Card, GlassCard | Group content and establish elevation. | surface role, padding, radius, elevation; Card: actionable/selectable; GlassCard: transparency level. | Resting/selected/interactive/loading. Cards never impersonate buttons; GlassCard follows transparency fallback rules. |
| Text, Heading, Label, Code, DataText | Apply type roles and numeric formatting. | role, tone, truncate, tabular, emphasis. | Correct semantic level; labels associate with controls; DataText supports sign/change annunciation. |
| Icon, IconButton | Visual symbol / compact action. | icon name, size role; IconButton intent, label, tooltip. | Focus/pressed/disabled/loading; IconButton always has accessible label. Plugins use registered icons only. |
| Divider, Spacer, VisuallyHidden | Structural support. | orientation/inset; token size; assistive text. | Divider has presentation/separator semantics as appropriate. |

### Inputs and actions

| Component | Purpose / responsibilities | Props & variants | States / accessibility / extension |
|---|---|---|---|
| Button, SplitButton | Trigger an explicit action; SplitButton separates default/action menu. | intent: primary/secondary/quiet/destructive; size; leading/trailing icon; confirmation policy. | loading, disabled, pressed; native button semantics. Destructive/high-impact actions can require Dialog. |
| Link | Navigate to route, URL, or anchored content. | destination, external, quiet, inline. | visited policy is deliberate; external destination announced. Never use for mutation. |
| Input, Textarea | Collect text. | value/default, label, description, validation, prefix/suffix, clear; Input types include search/password/number. | invalid, read-only, required, loading; labelled and described programmatically. Preserve value after error. |
| Select, Combobox, Autocomplete | Choose from bounded / filterable options. | items, selected value(s), search, grouping, async status. | expanded, active option, empty, loading, invalid; keyboard pattern follows ARIA guidance. Use native Select when appropriate. |
| Checkbox, RadioGroup, Switch, SegmentedControl | Boolean, exclusive, setting, compact view choice. | checked/value, label, description, options, orientation. | indeterminate where valid; never use Switch for actions requiring confirmation. |
| DatePicker, DateRangePicker, TimePicker, NumberField | Structured finance/date entry. | value, min/max, timezone, precision, step, format. | invalid/out-of-range; keyboard entry and locale-aware display; never silently alter timezone/precision. |
| FileUpload | Controlled file selection and status. | accepted types, max size/count, progress, retry. | error/progress/complete; keyboard-operable picker and accessible drop target. |

### Navigation and disclosure

| Component | Purpose / responsibilities | Props & variants | States / accessibility / extension |
|---|---|---|---|
| Sidebar, NavItem, NavigationGroup | Persistent product/module navigation. | collapsed, items, badge, group label, active destination. | current item exposed semantically; collapse is keyboard available; permission-hidden items do not leave dead routes. |
| Topbar, StatusBar | Shell-level context and global status. | slots, workspace/account/connection models. | Status uses live-region policy; only shell may compose these. |
| Tabs, TabList | Switch peer views without route loss. | tabs, selected ID, closable, reorderable, overflow. | selected/focused/disabled; full arrow-key behavior; use routes for independently shareable views. |
| Breadcrumb | Show hierarchical route context. | items, compact overflow. | Current page identified; not a replacement for primary navigation. |
| Pagination, PageSizeControl | Traverse finite result sets. | page, count, page size, loading. | Announces resulting range; cursor-based APIs are supported. |
| Accordion, Disclosure | Reveal optional content. | open, multiple, heading level. | Expanded state and linked regions; avoid for required critical content. |
| Stepper, ProgressTracker | Show multi-stage task status. | steps, current, completed/error. | Status conveyed by text/icons as well as color. |

### Data, feedback, and content

| Component | Purpose / responsibilities | Props & variants | States / accessibility / extension |
|---|---|---|---|
| Badge, Tag, Status | Compact metadata, removable filters, operational state. | tone, icon, removable, label. | Status has textual name; Tag removal is labelled; not the sole error mechanism. |
| Avatar, AvatarGroup | Represent actor/account/source. | name, image, fallback, presence. | Alt/fallback behavior avoids redundant announcements; image failure safe. |
| Tooltip, Popover, DropdownMenu, ContextMenu | Brief help / anchored supplemental UI / choices. | trigger, placement, open, dismissal, items. | Escape, focus return, collision handling; tooltips never contain required controls. |
| Toast, Notification, ActivityCenter | Ephemeral feedback, durable event, reviewable history. | severity, title, body, action, persistence, event ID. | Announce based on urgency; timeout is pausable; critical errors persist in ActivityCenter. |
| Alert, InlineMessage, Callout | Contextual status and recovery guidance. | severity, title, details, actions. | Proper live role only for urgent changes; input errors link to field. |
| EmptyState, ErrorState, Skeleton, Progress | Explain absent content, failed loading, loading geometry, known work. | title, body, action, illustration, retry/progress. | Skeleton honors reduced motion; errors retain context and offer safe retry. |
| Timeline, TimelineMarker | Ordered events, audit and workflow history. | events, timestamp, actor, marker tone, details. | Chronological semantics, timezone disclosure, filters; plugin events are attributed. |

### Overlay and workflow

| Component | Purpose / responsibilities | Props & variants | States / accessibility / extension |
|---|---|---|---|
| Modal, Dialog, AlertDialog | Focused task / confirmation / high-risk irreversible confirmation. | open, title, description, actions, size, dismissal policy. | Focus trap, restore, Escape only when safe; AlertDialog requires clear consequence and safe default. |
| Drawer, Inspector | Contextual secondary detail. | edge, width, modal/nonmodal, title, persistent. | Keyboard resize/close; nonmodal drawers must not obscure primary controls. |
| CommandPalette | Global action/navigation/search surface. | query, providers, scopes, recent commands. | Keyboard-first; result counts and async status announced; commands declare permissions. |
| Wizard | Guided exceptional multi-step work. | steps, current, validation, save/resume. | Prevent loss on exit; do not use for routine quick actions. |

### Data visualization and trading surfaces

| Component | Purpose / responsibilities | Props & variants | States / accessibility / extension |
|---|---|---|---|
| Table | Accessible finite structured data. | columns, rows, sort, selection, density, empty/loading. | Semantic headers, sorting announcements, responsive priority rules. |
| DataGrid | Virtualized, large, editable/filterable tabular data. | column model, data source, cursor, selection, edit policy, row identity. | Keyboard grid navigation, column resize/reorder, error cells; performance budget and server operations are explicit. |
| DataCell, PriceCell, ChangeCell | Consistent financial value rendering. | value, format, currency, precision, direction/change. | Textual sign/direction; tabular figures; missing/stale values disclosed. |
| ChartContainer | Host for any chart implementation and its controls. | title, timeframe, series metadata, status, actions, inspector. | Loading/no-data/error/stale; accessible summary/table alternative; plugins register series through contracts. |
| Legend, CrosshairReadout, DataTooltip | Chart interpretation support. | series, datum, formatters. | Values available to assistive tech without pointer hover. |
| OrderTicket | Composed high-risk order entry pattern. | instrument, account, order model, validation, submit/review policies. | Explicit confirmation, market/account disclosure, error recovery, audit hooks; not a generic Button form. |

### Workspace platform

| Component | Purpose / responsibilities | Props & variants | States / accessibility / extension |
|---|---|---|---|
| Workspace, WorkspaceSwitcher | Select/save named layouts. | workspace model, template, revision, permissions. | sync/conflict/offline/missing panel; exposes repair/reset actions. |
| Panel, PanelHeader | Host a typed module view. | panel descriptor, title, icon, actions, min/preferred size. | focused, pinned, maximized, error, unavailable; title/action semantics and fallback renderer required. |
| Window | Floating panel container. | bounds, z-order, minimized/maximized, display zone. | Keyboard move/resize/maximize; mobile conversion behavior declared. |
| ResizableLayout, Splitter, DockTarget | Arrange panels and modify layout. | layout graph, constraints, drag/keyboard operations. | Focusable splitter with announced size; supports cancel and persistence migration. |
| WorkspaceTemplate | Declarative initial arrangement. | template ID, required capabilities, default panels. | unavailable dependencies stated; plugins cannot replace core recovery behavior. |

## Dependencies and governance

Components may depend downward only: patterns → composites → primitives/tokens. Domain modules may compose components but cannot become design-system dependencies. Any new component requires a demonstrated reuse case, accessibility contract, visual states, API review, localization review, performance note, and documentation example using realistic content. Usage examples are written as behavior scenarios above to avoid implementation during Phase 0.


# TradingCore State Management

**Status:** Recommendation, not implementation. State is classified before selecting a library. The objective is reliable market/product behavior, inspectability, and controlled persistence—not library uniformity for its own sake.

## State taxonomy and source of truth

| State class | Examples | Source / lifespan | Recommendation |
|---|---|---|---|
| Server state | instruments, positions, orders, market snapshots, settings from backend | authoritative remote system; cacheable | TanStack Query (React Query) with typed API client adapters. |
| Streaming state | quote ticks, order/execution updates, connection health | stream plus snapshot reconciliation | dedicated stream coordinator normalizes events into query cache/domain store; never component-local. |
| Client UI state | open panel, selection, filters in progress, density, drawer state | local/session/workspace | local state first; Zustand for cross-tree, non-server UI state. |
| URL state | shareable filters, instrument, tab, date range | route/history | typed URL schema; derive rather than duplicate locally. |
| Workspace state | layout graph, panel settings, saved templates | server synced with local durable draft | workspace platform store, versioned persistence and migrations. |
| Form state | order ticket, settings editor, search draft | ephemeral task | local/form-scoped state with explicit validation and dirty state. |
| Global app state | session posture, permissions, theme, feature flags, command registry | app lifecycle | narrow Context providers or platform service interfaces. |

## Recommendation

Adopt **TanStack Query** for remote server state and cache lifecycle, **Zustand** for client state that crosses component/tree boundaries, **React Context** only for stable dependency injection or low-frequency global context, and typed local component/form state for everything else. Keep **Redux Toolkit** as an exception path for future highly auditable, multi-step client workflows that genuinely need reducer/event history; do not adopt it as the default. Do not make **Jotai** a platform dependency; it is a valid local exception only with design review where atom granularity is demonstrably superior.

### Decision record: Query cache plus bounded client store

| Aspect | Decision |
|---|---|
| Problem | TradingCore combines slow-changing settings, frequent market streams, critical mutations, workspace synchronization, and deep UI composition. |
| Decision | Separate authoritative server cache from client/UI stores; bridge streams through a single reconciliation layer. |
| Alternatives considered | Redux Toolkit for all state; Context-only; Zustand for server data; atom-first global architecture. |
| Tradeoffs | Developers must understand state classification and avoid duplicating query data. |
| Reasoning | Server cache invalidation and client interaction state have different lifecycles and correctness models. |
| Future scalability | Independently testable modules, offline policies, streaming, and background refresh can evolve without one global store. |
| Risks | Split-brain data if query results are copied to client stores. |
| Recommendation | Add lint/review rules: server entities remain in query cache; stores keep IDs/intent/UI state, not duplicate entities. |

## Library comparison

| Option | Strength | Limitation | TradingCore position |
|---|---|---|---|
| React Context | Dependency injection, theme, locale, stable ambient services | Broad updates and weak dev tooling for frequent mutable state | Use narrowly for stable providers. |
| Redux Toolkit | Predictable reducers, middleware, audit/event history, mature tooling | Boilerplate and temptation to centralize all data | Approved exception for event-heavy regulated workflows. |
| Zustand | Small API, selectors, modular stores, suitable for UI/workspace state | Requires discipline around persistence and state boundaries | Default cross-tree client state option. |
| Jotai | Fine-grained derived state and localized atom composition | Harder global ownership/discoverability at product scale | Not a core standard; exception only. |
| TanStack Query / React Query | Fetching, caching, mutations, retries, invalidation, optimistic updates | Not a general UI state manager; stream integration must be designed | Default server-state layer. |

## Caching and synchronization policies

Every query declares: ownership, identity keys, freshness class, stale policy, refetch triggers, error/retry policy, authorization scope, persistence eligibility, and invalidation events. Market data has distinct freshness states (live, delayed, stale, disconnected); it is never presented as simply “loaded.” Critical order/account mutations are idempotency-aware, reconcile from broker confirmation, and expose pending/uncertain states rather than optimistic finality.

Use optimistic updates only where reversal is safe and obvious (e.g., a local watchlist ordering). Do not optimistically declare an order accepted, executed, cancelled, or account balance changed. Reconnect begins with a snapshot/revision check then replays compatible stream events; events include sequence/version handling to detect gaps.

## Persistence and offline

Persist only explicitly classified user preferences, layout drafts, selected workspace, and safe cache subsets. Encrypt/secure storage according to host capability; never persist secrets, trading credentials, session tokens beyond approved auth mechanism, or sensitive account payloads in generic UI storage. Version every persisted schema and provide migrations plus a reset/recovery path.

Offline mode is a constrained posture: cached read-only information is marked with timestamp/source, unsynced safe preferences queue with conflict handling, and trading mutations default to unavailable unless a regulated/approved offline workflow explicitly exists. Queue metadata must be observable and cancelable; reconnect does not silently submit high-impact intent.

## Risks and recommendations

The critical risk is presenting stale or uncertain financial data as current. Define freshness semantics at the domain level, make status visible in the shell/status bar and relevant panels, and test stream interruption, duplicate/out-of-order events, cache eviction, multi-tab/device conflict, and permission changes. Document store/query ownership in each module’s README before its first production workflow.


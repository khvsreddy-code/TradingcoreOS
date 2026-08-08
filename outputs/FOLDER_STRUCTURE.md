# TradingCore UI Folder Structure

**Status:** Target repository topology; names describe responsibilities, not a mandated framework implementation.

## Proposed topology

```text
tradingcore/
  apps/
    web/                         # browser composition, route registration, host integration
    desktop/                     # optional native-host composition; no duplicated product UI
  packages/
    ui-tokens/                   # primitive + semantic token source and generated artifacts
    ui-primitives/               # accessible low-level reusable components
    ui-components/               # composed general-purpose components and patterns
    ui-icons/                    # approved icon registry and metadata
    ui-charts-contracts/         # chart host, data/format/accessibility contracts
    workspace-platform/          # layout graph, docking contracts, persistence/migrations
    shell-platform/              # top-level chrome, overlay, command, activity contracts
    plugin-sdk/                  # public versioned extension types, manifest validators, examples
    domain-models/               # shared typed domain vocabulary; no UI rendering
    api-clients/                 # transport clients, auth middleware, generated service boundaries
    feature-flags/               # typed flag definitions and evaluation adapters
    observability/               # safe telemetry/error-reporting interfaces
    testing/                     # test utilities, fixtures, accessibility and visual harnesses
    config/                      # lint, type, build and documentation conventions
  modules/
    markets/
    trading/
    options/
    portfolio/
    scanner/
    research/
    ai-workspace/
    core-spirit-ide/
    news-calendar/
    settings/
    marketplace/
  plugins/
    first-party/                 # optional first-party extensions tested as external consumers
    fixtures/                    # compatibility, failure, and migration test plugins
  docs/
    architecture/                # approved permanent architecture records
    design-system/               # token/component usage and contribution guidance
    adr/                         # concise dated decision records
    plugin/                      # public extension specifications and version policy
```

Each module follows the same internal shape:

```text
module-name/
  public/                        # module entry contract only
  routes/                        # route declarations and route-level composition
  panels/                        # workspace panel descriptors and presentation
  features/                      # task-focused UI orchestration
  domain/                        # domain rules, selectors, validation, permissions
  data/                          # server-state query/mutation adapters
  state/                         # local client state that does not belong to server cache
  commands/                      # command palette/contextual command registrations
  extensions/                    # module-owned plugin slots, if any
  tests/                         # unit, integration, accessibility, visual fixtures
  docs/                          # module-specific operational design notes
```

## Boundary rules

- `apps` compose; they do not contain reusable business features.
- `packages` are dependency-light and cannot import product modules.
- A module can import public contracts from packages and other modules only through an explicitly approved public surface. Deep imports are prohibited.
- Modules communicate through typed domain events, shared services, or declared route/workspace contracts—not each other’s internal state.
- Plugins import only `plugin-sdk`; the SDK must not expose private package paths.
- Tokens flow downward into all UI; domain data never flows upward into token/component packages.

### Decision record: modular monorepo with public APIs

| Aspect | Decision |
|---|---|
| Problem | 500+ components and multiple teams need fast reuse without a single application folder becoming ungovernable. |
| Decision | Maintain a modular monorepo: platform packages, independently owned product modules, and a deliberately narrow plugin SDK. |
| Alternatives considered | Single feature tree; micro-frontends for every product area; separate repositories from day one. |
| Tradeoffs | Tooling, dependency rules, and release management require discipline. |
| Reasoning | Shared tokens, shell, workspace layout, and type contracts benefit from atomic change and consistent review. |
| Future scalability | Modules can later be independently deployed/federated where operational need justifies it. |
| Risks | Hidden coupling through shared packages. |
| Recommendation | Enforce dependency graphs in CI, assign code owners, and publish API reports for public packages. |

## Ownership and change control

| Area | Accountable owner | Change gate |
|---|---|---|
| Tokens, primitives, components | Design System team | visual/accessibility/API review |
| Shell, workspace, plugin SDK | UI Platform team | architecture review and compatibility tests |
| Domain modules | Module team | module owner plus platform review for cross-cutting changes |
| API clients/domain models | Platform/domain owners | schema compatibility and security review |
| Docs/ADRs | relevant accountable owner | approval status and supersession link |

Versioned public packages use semantic versioning. Breaking changes require a migration guide, codemod/adapter assessment, deprecation window, and compatibility test updates. Any cross-module state access is an architecture exception documented in an ADR.

## Naming conventions

- Use `kebab-case` for folders/files, `PascalCase` for public component/type names, and clear domain nouns for module boundaries.
- Suffix contracts by purpose: `*-contract`, `*-schema`, `*-adapter`, `*-registry`, `*-policy`, `*-fixture`.
- Use “panel” only for dockable workspace content, “view” for route/subroute presentation, and “feature” for a user task.
- Avoid generic `utils`, `common`, `shared`, `helpers`, and `misc`. Move a reusable abstraction to a named package once it has a genuine owner.

## Risks and recommendations

The principal risk is a “shared” package turning into an undocumented junk drawer. Limit each package to a clearly owned capability, maintain import rules, and review package creation as carefully as component creation. Start with this topology even if directories are initially sparse; do not pre-create empty implementation layers merely to satisfy the diagram.


# TradingCoreOS

> A broker-connected trading operating system built around a CoreSpirit-first execution architecture, canonical market-data/compute plane, and renderer-independent chart contracts.

**Repository:** khvsreddy-code/TradingcoreOS  
**Current chart direction:** Vela NativeRenderer  
**Current CoreSpirit line:** v109  
**Primary branch:** main

## What is TradingCoreOS?

TradingCoreOS is being developed as a trading-focused operating environment rather than a collection of disconnected chart, indicator, broker, and automation features.

It combines:

- authenticated user/workspace state;
- broker connectivity and broker-specific adapters;
- live market data and historical candles;
- watchlists, option-chain/depth views, portfolio state, and trading panels;
- a canonical chart data and rendering architecture;
- native and user-authored indicators;
- CoreSpirit, the platform's trading-native programming language;
- deterministic compiler/runtime contracts;
- semantic dependency graphs and composability;
- reactive and incremental computation;
- model/ML integration;
- automation, risk, policy, and execution boundaries;
- research tooling;
- architecture and regression contract tests.

The central design goal is to keep the surface simple while the underlying system remains capable of expressing complex trading computation.

## Current architecture

    TradingCoreOS
         |
    +----+-----------------------------+
    |                                  |
    CoreSpirit                    TCO host/data plane
    |                                  |
    source -> AST -> semantic model    market data
              -> stable IR             canonical stores
              -> VM                    chart/data coordination
              -> reactive runtime
              |
        indicators / models /
        signals / visuals /
        automation declarations
              |
              v
       TCO control plane
              |
        Risk / Policy
              |
        Order Intent
              |
      Execution Adapter
         /          \
      FYERS       Upstox

Chart path:

    Broker/history/live feed
            |
    Canonical MarketDataStore
            |
    ChartCore / ChartController
            |
        TCO Chart API
            |
       Vela adapter
            |
    Vela NativeRenderer
       /           \
    WebGL2       Canvas2D

Vela is a renderer, not the owner of TradingCoreOS market data, indicators, CoreSpirit, models, risk, automation, or broker authorization.

CoreSpirit is not a broker API. The language produces deterministic computation and declarative outputs; the TradingCoreOS host controls external side effects.

## CoreSpirit

CoreSpirit is the user-facing programming language of TradingCoreOS.

The architectural model is:

    One language -> one compiler -> one stable IR -> one VM -> multiple execution environments.

Historical execution, replay, research-oriented execution, realtime execution, and future execution targets should share language semantics instead of growing separate interpreters.

### Compiler/runtime boundary

    CoreSpirit source
          |
      parsing
          |
      AST / canonical syntax
          |
      semantic analysis
          |
      dependency graph
          |
      IR lowering
          |
      IR optimization
          |
      IR validation
          |
      executable artifact
          |
      CoreSpirit VM
          |
      reactive runtime

The VM does not directly own broker credentials, broker sockets, account mutation, arbitrary network access, filesystem/process access, or order submission.

### Semantic composability

CoreSpirit composability has evolved from syntax-level composition toward a semantic dependency graph. This lets the compiler/runtime reason about relationships such as:

    market / timeframe
            |
          series
            |
        indicator
            |
          model
            |
         signal
            |
       automation

Aliases and model outputs are resolved through semantic bindings rather than fragile textual substitution.

### Provenance and source maps

Later CoreSpirit architecture added source provenance to IR instructions:

    source span
        |
      AST node
        |
    IR instruction origin
        |
     optimized IR
        |
     source map
        |
    editor / diagnostics / inspection

Optimization therefore must preserve the ability to explain where executable instructions originated.

### Versioned architecture

The repository contains versioned CoreSpirit manifests and release notes across the v37+ line, including v74 through v109-era work. These are historical architecture records; they are not separate production runtimes.

The current direction is convergence around one canonical language/runtime architecture.

## Chart engine

TradingCoreOS has moved toward a strict chart ownership model.

### Vela integration

The production chart direction is Vela behind a TCO-owned adapter boundary:

    MarketDataStore
         |
      ChartCore
         |
   ChartController
         |
      Chart API
         |
  velaChartFacade
         |
 velaNativeChartRenderer
         |
  Vela NativeRenderer

React components should not import Vela directly. CoreSpirit should not contain Vela-specific concepts.

### Realtime chart updates

The chart architecture distinguishes:

- full history replacement;
- incremental forming-bar updates;
- confirmed-bar updates;
- viewport changes;
- style-only changes;
- computation invalidation.

The Vela boundary supports incremental bar updates for realtime data and complete replacement for history loads.

### Chart architecture documents

Dedicated documents cover:

- chart engine;
- chart data plane;
- chart history demand;
- chart interaction;
- chart drawings;
- multi-chart synchronization;
- renderer migration;
- Vela integration.

### Renderer deepening

The Vela integration explicitly tracks:

1. typed-array/zero-copy ingestion;
2. renderer-owned viewport-aware LOD;
3. stable CoreSpirit render packets;
4. retained native drawing primitives;
5. renderer-neutral multi-chart synchronization;
6. measurable GPU/frame budgets.

These are documented follow-up areas, not claims that every optimization is already complete.

## Market data and broker layer

TradingCoreOS uses broker-neutral contracts with broker-specific leaves.

The repository contains infrastructure for:

- broker registry and capabilities;
- broker request gating;
- broker adapters;
- FYERS market data;
- FYERS historical data;
- FYERS symbols;
- FYERS account/order transport;
- Upstox market data;
- Upstox history;
- option-chain routing;
- instrument search;
- portfolio snapshots;
- trading routes;
- OAuth/session restoration.

The intended dependency direction is:

    TradingCoreOS neutral contract
              |
         broker adapter
          /          \
       FYERS       Upstox

CoreSpirit and the core chart engine should not depend on a broker SDK.

### Historical data reliability

History work has addressed:

- request gating;
- caching;
- stale-response rejection;
- session-aware ranges;
- broker-specific routing;
- pagination;
- first-paint recovery;
- payload-size control;
- current-session handling;
- history-demand contracts.

### Realtime reliability

Realtime architecture has evolved through:

- broker-specific stream transports;
- focused-chart independence;
- stream lifecycle cleanup;
- heartbeat/recovery;
- stale-feed fallback;
- request-budget protection;
- tab recovery;
- forming-bar updates.

A core requirement is that live quote transport and focused-chart history remain related but not a single fragile dependency.

## Indicators and user authoring

Indicators are a first-class subsystem.

The repository includes:

- native indicator execution;
- indicator dependency graphs;
- incremental indicator calculation contracts;
- universal indicator settings;
- indicator source editing;
- indicator code viewing;
- indicator exploration;
- community-indicator architecture;
- publication/schema contracts.

### Schema-driven settings

Indicator customization is based on a versioned settings schema instead of one-off UI branches.

A definition can describe:

    identity
    inputs
    style
    display
    capabilities
    alert metadata
    layout
    stable outputs

The universal settings UI consumes that schema.

This allows deep configuration without requiring a special UI branch for every indicator.

### Deep visual customization

The architecture is intended to support:

- line color;
- opacity;
- width;
- solid/dashed/dotted style;
- gradients;
- glow;
- zoom-dependent visibility;
- timeframe-dependent visibility;
- fill colors;
- output visibility;
- pane/scale metadata;
- multi-output styling;
- value-label display;
- precision;
- reset-to-default behavior.

Calculation identity and render identity remain separate:

    calculation identity -> incremental computation
    settings identity   -> resolved schema values
    render identity     -> stable output/render packet

A display-only change should not unnecessarily invalidate indicator history.

### Incremental calculation

The repository contains an explicit incremental-indicator contract. The goal is to avoid repeatedly scanning historical arrays inside each update when rolling/stateful implementations can reuse prior state.

This is particularly important for a reactive live terminal where the same indicator graph can be evaluated repeatedly as market data changes.

## Trading workspace

The authenticated application has evolved into a trading workspace/command-center model.

Relevant components include:

- live trading terminal;
- workspace shell;
- watchlist;
- chart toolbar;
- drawing toolbar;
- indicator dock;
- level settings;
- right terminal dock;
- chart depth;
- advanced order ticket;
- broker runtime switching;
- portfolio;
- prediction center;
- automations;
- models;
- CoreSpirit editor/docs.

The current direction favors a dense professional terminal rather than a consumer-dashboard layout.

The intended live surface is approximately:

    Top
      Symbol | Timeframe | Chart Tools | Indicators

    Center
      Large chart / primary workspace

    Right
      Watchlist | Depth / Order Book | Alerts / contextual tools

    Bottom
      Workspace | status | connection | latency | clock

The exact visual implementation remains subject to ongoing work; this README documents direction rather than claiming every UI detail is frozen.

## Models and ML

The repository contains both application ML integration and a dedicated research/ML area.

Relevant areas include:

- ml/;
- research/python/;
- model manifests;
- model services;
- feature generation;
- optimization;
- training;
- production prediction routing.

Models are treated as typed external capabilities rather than a second trading language.

    CoreSpirit / canonical features
              |
          typed Model ABI
              |
        model orchestrator
              |
     Python / native / WASM /
        ONNX / remote adapter
              |
       typed prediction
              |
      signal / visual / research

A model should not receive direct authority to submit broker orders.

## Security and execution boundaries

TradingCoreOS contains explicit infrastructure for:

- authentication;
- protected routes;
- OAuth state;
- encrypted broker data;
- broker repositories;
- audit logging;
- order idempotency;
- broker request validation;
- request context;
- rate limiting;
- fixed-IP FYERS execution gateway support;
- server-side secret configuration.

The desired execution path is:

    CoreSpirit
       |
     signal
       |
   automation
       |
   order-intent proposal
       |
      risk
       |
     policy
       |
   approved order intent
       |
   execution adapter
       |
     broker

This prevents language-level computation from becoming an implicit broker authorization mechanism.

## Repository structure

    /
    ├── api/                         Server/API entry
    ├── src/
    │   ├── auth/                   Authentication
    │   ├── components/             React UI/workspace
    │   ├── constants/              Shared constants
    │   ├── pages/                  Application pages
    │   ├── routing/                Route contracts
    │   ├── server/
    │   │   ├── auth/               OAuth/auth services
    │   │   ├── brokers/            Broker registry/adapters/gates
    │   │   ├── fyers/              FYERS services
    │   │   ├── marketData/         Live transports
    │   │   ├── routes/              API routes
    │   │   ├── security/            Security/encryption
    │   │   └── storage/             Persistence/audit/idempotency
    │   ├── services/
    │   │   ├── core/               Chart/data/calculation
    │   │   ├── coreSpirit/          CoreSpirit compiler/runtime
    │   │   ├── brokers/              Broker abstractions
    │   │   └── boundary/             Host validation
    │   └── ...                      Contract tests
    ├── docs/                        Architecture/operations
    ├── examples/coreSpirit/         Language examples
    ├── ml/                          ML/training
    ├── research/python/             Research package
    ├── fyers-execution-gateway/     Execution gateway
    ├── vendor/vela/                 Vendored Vela
    ├── CORESPIRIT_V*_*.md/json      Version records
    ├── CHANGELOG.md                 Git history
    └── package.json                 Tooling/dependencies

## Development

The application uses TypeScript/React/Vite with an Express server entry and additional Python tooling for ML/research.

### Requirements

The current package.json declares Node 22.x.

### Install

    npm install

### Development

    npm run dev

### Production build

    npm run build

### Preview

    npm run start

### Type checking

    npm run typecheck
    npm run lint

### Full CI-oriented validation

    npm run ci

## Validation and contract tests

Run:

    npm run test:contracts

The contract suite covers areas including:

- architecture consolidation;
- route boundaries;
- CoreSpirit v85 hardening;
- CoreSpirit performance/composition;
- CoreSpirit semantic composability;
- deep CoreSpirit v92 contracts;
- indicator community contracts;
- terminal shell/density/dock architecture;
- React-root consolidation;
- multi-chart data plane;
- chart history demand;
- indicator dependency graphs;
- incremental indicator execution;
- zero-copy canonical data plane;
- canonical chart engine;
- viewport/scale engine;
- drawing/navigation API;
- Vela boundary integration.

The CI command combines:

    contract tests
         +
    typecheck
         +
    production build

Architecture tests are important because many critical requirements are boundaries rather than visual features.

## CoreSpirit CLI

The repository exposes CoreSpirit tooling through:

    npm run coreSpirit:check
    npm run coreSpirit:normalize
    npm run coreSpirit:inspect
    npm run coreSpirit:graph

Examples live under examples/coreSpirit/.

## Environment configuration

The repository includes .env.example.

The main configuration families are:

### Browser Supabase

    VITE_SUPABASE_URL
    VITE_SUPABASE_PUBLISHABLE_KEY

### Server Supabase

    SUPABASE_URL
    SUPABASE_SECRET_KEY

### FYERS execution gateway

    FYERS_EXECUTION_GATEWAY_URL
    FYERS_EXECUTION_GATEWAY_SECRET

### Production ML service

    ML_SERVICE_URL
    ML_SERVICE_SECRET

Do not commit real credentials, broker tokens, encryption keys, or production secrets.

## Documentation map

### CoreSpirit

- docs/CORESPIRIT.md — canonical architecture and runtime model
- docs/CORESPIRIT_SCRIPTING.md — scripting/authoring
- docs/CORESPIRIT_COMPOSABILITY.md — composability
- docs/CORESPIRIT_BUILD_TRACKER.md — build/architecture tracking
- examples/coreSpirit/ — examples and fixtures
- CORESPIRIT_V*_RELEASE_NOTES.md — historical release records
- CORESPIRIT_V*_MANIFEST.json — versioned contract metadata

### Charting

- docs/CHART_ENGINE_ARCHITECTURE.md
- docs/CHART_DATA_PLANE_ARCHITECTURE.md
- docs/CHART_HISTORY_DEMAND_ARCHITECTURE.md
- docs/CHART_INTERACTION_API.md
- docs/CHART_DRAWING_INTERACTION_ARCHITECTURE.md
- docs/CHART_MULTI_CHART_ARCHITECTURE.md
- docs/CHART_RENDERER_MIGRATION.md
- docs/VELA_INTEGRATION.md

### Indicators

- docs/INDICATORS_USER_AUTHORING.md
- docs/INDICATOR_SETTINGS_SCHEMA.md
- docs/INDICATOR_DEPENDENCY_GRAPH_ARCHITECTURE.md
- docs/INDICATOR_COMMUNITY_ARCHITECTURE.md

### Broker/operations

- docs/fyers/
- FYERS_API_ARCHITECTURE_AUDIT.md
- TRADINGCORE_REPAIR_TRACKER.md
- live-feed and toolbar repair notes

### Historical architecture

- docs/history/
- CHANGELOG.md

## Architecture principles

1. **One language, one runtime.** Do not create a second interpreter for a new execution surface.
2. **One canonical data plane.** Charts, indicators, models, and downstream consumers should use canonical market data.
3. **Renderer independence.** CoreSpirit output and indicator metadata remain renderer-neutral.
4. **Broker independence.** CoreSpirit and chart code should not depend on FYERS/Upstox-specific APIs.
5. **Risk before execution.** Automation proposes intent; risk and policy authorize it.
6. **Deterministic execution.** Equivalent confirmed inputs should produce equivalent outputs.
7. **Explicit realtime revisions.** A forming candle is not the same as committed history.
8. **Stable identities.** Indicators, visuals, graph nodes, source locations, signals, runs, and intents need stable identity.
9. **Incremental computation.** Reuse state instead of repeatedly recomputing unchanged historical work.
10. **Capability boundaries.** External resources are accessed through explicit host capabilities.
11. **Architecture is tested.** Important boundaries should have executable contracts.
12. **UI is a projection.** React should not become a second source of truth for market data, indicator calculation, or broker state.

## Performance direction

The repository is progressively moving toward:

- zero-copy/canonical market-data storage;
- typed-array transport;
- incremental indicator calculation;
- vectorized primitives;
- series fusion;
- reactive dependency indexing;
- avoiding O(n) queue shifts;
- viewport-aware history demand;
- multi-chart compute budgeting;
- chart LOD;
- stable renderer packets;
- retained drawing state;
- request deduplication and gating;
- stale-response rejection;
- code splitting;
- broker-specific transport isolation;
- measurable chart frame/GPU budgets.

The intended hierarchy is:

    avoid work
       |
    reuse work
       |
    fuse work
       |
    move work off UI thread
       |
    vectorize
       |
    use GPU where justified

GPU acceleration is not treated as a substitute for correct data ownership or efficient algorithms.

## Current v109 direction

The latest documented chart-engine direction is Vela.

The v109 architecture explicitly moves away from:

- Lightweight Charts as the production chart engine;
- PineScript/PineTS compatibility;
- TradingView script import/runtime paths.

The intended product model is:

    CoreSpirit
        +
    TradingCoreOS canonical data/compute
        +
    TCO Chart API
        +
    Vela renderer

Community indicators are modeled as versioned CoreSpirit definitions rather than external scripting compatibility packages.

The v109 chart integration also reinforces the renderer-neutral indicator settings bridge:

    IndicatorSettingsSchema
            |
       resolved values
            |
       TCO render packet
            |
        Vela adapter
            |
      Vela series/markers

## Roadmap

### CoreSpirit

- simple authoring surface;
- deep composability;
- semantic dependency graph;
- stable IR;
- deterministic VM;
- reactive execution;
- source provenance;
- explainable outputs;
- secure capability model;
- typed model ABI.

### Charting

- canonical data plane;
- incremental updates;
- typed-array ingestion;
- viewport-aware LOD;
- stable render packets;
- retained drawing scene;
- synchronized multi-chart surfaces;
- measurable frame/GPU budgets.

### Indicators

- universal schema;
- community definitions;
- incremental execution;
- dependency-aware invalidation;
- stable output identities;
- deep visual customization.

### Trading terminal

- dense professional layout;
- independent live feed and chart history;
- watchlist;
- depth/order-book surfaces;
- contextual alerts;
- integrated indicator controls;
- risk-aware order workflow;
- workspace persistence.

### Execution

- broker-neutral order intents;
- risk and policy gates;
- idempotent execution;
- auditable lifecycle;
- replaceable broker adapters.

## Historical development

The repository history begins on 2026-08-03 with the initial scaffold and rapidly evolves through:

1. Supabase authentication and protected user state;
2. broker requirements and OAuth;
3. broker adapter capabilities;
4. live trading workspace concepts;
5. FYERS and Upstox market data;
6. historical candles and option/depth data;
7. portfolio and order interfaces;
8. live terminal and command-center architecture;
9. chart-history reliability work;
10. FYERS streaming and heartbeat recovery;
11. CoreSpirit compiler/runtime architecture;
12. semantic composability;
13. IR provenance and source maps;
14. vectorized and incremental runtime work;
15. canonical chart/data-plane consolidation;
16. terminal architecture cleanup;
17. indicator schema/community architecture;
18. Vela renderer integration.

The complete pre-changelog history is preserved in CHANGELOG.md. Commit subjects that are too vague to support reliable interpretation are preserved without invented explanations.

## Contributing

Before changing a core subsystem:

1. Read the relevant architecture document.
2. Identify the owning boundary.
3. Prefer changing the canonical implementation instead of adding another parallel path.
4. Add/update a contract test when an architectural invariant changes.
5. Run relevant subsystem tests.
6. Run npm run test:contracts.
7. Run npm run typecheck.
8. Run npm run build.
9. Update the relevant architecture/release tracker.
10. Record meaningful historical changes in CHANGELOG.md.

Avoid:

- resurrecting retired terminal implementations;
- adding another production chart renderer without an explicit architecture decision;
- importing broker-specific code into CoreSpirit;
- putting renderer-specific types into CoreSpirit contracts;
- adding ad-hoc indicator settings branches when a schema can express the setting;
- bypassing risk/policy before execution;
- creating parallel stores for the same market series;
- hiding architectural regressions behind UI-only fixes.

## Project status

TradingCoreOS is an actively evolving engineering project.

The repository distinguishes between:

- implemented and contract-tested behavior;
- implemented infrastructure still being refined;
- documented architectural direction;
- explicit future performance/renderer work.

This README intentionally does not present every roadmap item as already complete.

For the historical record, use CHANGELOG.md.  
For CoreSpirit architecture, use docs/CORESPIRIT.md.  
For chart ownership/Vela integration, use docs/VELA_INTEGRATION.md.  
For detailed subsystem contracts, use the relevant docs and src test files.

## License and third-party components

Check the repository's current license and vendored third-party notices before redistribution.

Vela is vendored under vendor/vela with its applicable Apache-2.0 LICENSE and NOTICE. Required attribution is intentionally preserved by the chart integration boundary.

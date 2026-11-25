# Production engineering ownership map

**Source anchor:** e79b4d9f3524e781bb8d9664ec0dc13fc9f776ea (2026-11-25)  
**Scope:** the production live-chart, CoreSpirit execution, canonical market-data and broker-order paths. This is a source-derived ownership map, not a claim that every module in the repository has been inventoried.

This map follows actual imports, exported APIs, runtime registration and execution calls. The companion contract src/engineeringOwnershipMapContract.test.mjs guards the critical edges against accidental ownership drift. When a path or boundary changes, update the source map and contract in the same change.

## Runtime ownership

| Concern | Authoritative owner | Verified entry / path | State or side effect owned here | Not owned here |
| --- | --- | --- | --- | --- |
| Application root and routing | React application shell | index.html → src/main.tsx → src/App.tsx | One application React root, authentication gate, route selection and lazy route shells | Chart candles, chart viewport, drawing state, broker order execution |
| Live workspace assembly | LiveTradingWorkspace | src/appShells/LiveTradingShell.tsx → src/LiveTradingTerminal.tsx → src/LiveTradingWorkspace.tsx | Creates the live workspace host, wires Vela, storage, data provider, status, layouts and CoreSpirit engine | A second chart model or a second market-data store |
| Chart/workspace lifecycle | Vela | src/services/core/chart/velaWorkspaceLoader.ts → vendor/vela/src/workspace/index.ts → VelaWorkspace | Chart cells, workspace layout registry, chart model, viewport, drawing lifecycle, scene patches, renderer and native dock lifecycle | CoreSpirit language semantics or broker-owned order state |
| TCO chart compatibility | TCO Vela adapters | src/services/core/chart/velaNativeChartKernel.ts, velaChartFacade.ts, tcoVelaTerminal.ts | Adapts TCO providers, engines, contributions and output contracts into Vela's native API | Independent rendering or indicator calculation |
| Side-panel registry and lifecycle | Vela contribution registry / panel dock | vendor/vela/src/widget/contributions.ts, vendor/vela/src/widget/panel-dock.ts | Stores contributed descriptors; materializes registered panels; dispatches open/chart/destroy lifecycle hooks | TCO-specific panel business logic |
| TCO side-panel definitions | TCO Vela chrome contributions | src/services/core/chart/tcoVelaChrome.ts | Defines TCO panel descriptors and registers them through registerTcoSidePanel into Vela's shared registry | A second private panel registry |
| Canonical chart-market state | Market Data Plane | src/services/marketData/chartDataPlane.ts plus src/services/core/data/canonicalDataPlane.ts | Broker/instrument/timeframe data-plane identity, canonical history/ticks, candle phase, revisions, dirty range, feed/history coordination and canonical column buffers | Vela renderer state or CoreSpirit's derived indicator series |
| Vela market-data boundary | TcoVelaDataProvider | src/TcoVelaDataProvider.ts | Implements Vela's DataProvider contract and subscribes to the shared chart data plane; adapts canonical data into Vela's row/columnar feed | A second broker socket or independent historical cache |
| Broker/session host | TradingCoreRuntime | src/services/runtime/TradingCoreRuntime.ts | Coordinates BrokerManager, TradingEngine, active broker identity, broker restoration, shared market subscriptions, history access, portfolio and order facade | Chart rendering or CoreSpirit VM semantics |
| Broker execution routing | TradingEngine and the active BrokerAdapter | src/services/engine/TradingEngine.ts | Checks for an active adapter and delegates place/modify/cancel/square-off to it | Chart state, indicator semantics or direct UI submission |
| CoreSpirit language front end | CoreSpirit compiler pipeline | src/services/coreSpirit/compiler.ts, compilerPipeline.ts, parser and semantic-analysis modules | Syntax, edition normalization, parsing, name/semantic analysis, typed/canonical IR and compile diagnostics | Browser chart rendering, broker connections, direct broker side effects |
| Browser compilation | CoreSpirit compiler client + compiler worker | src/services/coreSpirit/coreSpiritCompilerClient.ts → coreSpiritCompiler.worker.ts → coreSpiritPipeline | Off-thread compilation, source-version fencing, artifact validation and compiler request lifecycle | Live chart execution state |
| CoreSpirit executable chart engine | CoreSpiritVelaEngine | src/CoreSpiritVelaEngine.ts | Vela scripting-engine adapter; validates artifacts and chart capabilities; coordinates execution, live revisions, output adaptation and Vela patch/model callbacks | The language's independent execution semantics or Vela scene ownership |
| CoreSpirit chart execution | CoreSpirit worker pool + worker runtime | src/services/coreSpirit/chartRunner.ts → coreSpiritWorkerPool.ts → coreSpirit.worker.ts → runtime.ts | Worker admission/context reuse, shared-market descriptor synchronization, executable artifact execution and per-script resource governance | UI/renderer state or unrestricted broker credentials |
| CoreSpirit VM semantics | CoreSpirit runtime | src/services/coreSpirit/runtime.ts, executionVM.ts, optimizedExecutionVM.ts, IR/series/state-kernel modules | Reference and optimized execution tiers, chronological/stateful semantics, runtime state, resource limits and execution outputs | Vela rendering or direct socket/order submission |
| CoreSpirit-to-Vela output boundary | velaOutputAdapter + scene diff | src/services/coreSpirit/velaOutputAdapter.ts, src/services/core/chart/coreSpiritSceneDiff.ts | Validates/aligned output objects and timestamps, converts time units, computes retained scene changes before Vela consumes them | Re-running indicator semantics inside Vela |

## Critical execution paths

### Live workspace and chart

  index.html
    → src/main.tsx
    → src/App.tsx
    → LiveTradingShell
    → LiveTradingTerminal
    → LiveTradingWorkspace
    → loadVelaWorkspace()
    → vendor/vela VelaWorkspace
         ├─ native chart cells / viewport / drawings / renderers
         ├─ shared PanelDock + contribution registry
         └─ TCO DataProvider + CoreSpirit scripting engine

velaWorkspaceLoader.ts dynamically imports the Vela workspace module. Layout registration imports that same module instance before registering layouts; do not statically import a second workspace/layout registry into a split chunk. Vela owns chart and visual state. React owns application routing/auth and the composition/lifecycle host.

### Market data

  BrokerManager / BrokerAdapter
    → TradingCoreRuntime market feed and history facade
    → sharedChartMarketFeed + chartHistoryCoordinator
    → chartDataPlane
    → canonicalDataPlane / HistoryStore
    → TcoVelaDataProvider
    → Vela chart-cell data model
    → CoreSpirit worker input (read-only canonical columns / revision)

The Vela provider must consume the canonical chart plane. It must not start its own broker feed or bypass the shared history/cache path. A quote-only update is not automatically a candle mutation; revisions and dirty ranges describe accepted canonical state changes. HistoryStore is a persistence/cache collaborator, not an alternative live-candle authority.

### CoreSpirit compile, execute and render

  CoreSpirit source
    → coreSpiritCompilerClient
    → CoreSpirit compiler Web Worker
    → compiler / parser / semantic analysis / canonical IR / artifact validation
    → CoreSpiritVelaEngine capability and artifact gate
    → chartRunner
    → CoreSpiritWorkerPool
    → coreSpirit.worker
    → CoreSpiritRuntime (reference or optimized VM)
    → CoreSpiritObject outputs
    → velaOutputAdapter
    → CoreSpiritSceneDiff
    → Vela model / retained ScenePatch / renderer

Compilation and chart execution use separate worker boundaries. CoreSpirit owns source semantics, executable artifacts, deterministic runtime behavior and output generation. The adapter owns time/shape normalization; Vela owns application of the resulting chart model/scene patch. A compatible-looking API or registered backend is not proof of semantic parity; runtime/backend parity tests remain required.

### Broker order submission

  Trading UI / approved host capability
    → TradingCoreRuntime.placeOrder()
    → TradingEngine.placeOrder()
    → active BrokerAdapter.placeOrder()
    → broker response normalization / portfolio and order reconciliation

A CoreSpirit signal or OrderIntent is not a broker order. Risk, account and execution policy must remain host-owned and must authorize the transition before the broker adapter is reached. Do not expose broker credentials to the compiler, VM, worker, model runtime or script source.

## Contract and evidence map

| Invariant | Existing evidence |
| --- | --- |
| One React application root; Vela-mounted panel roots are bounded and unmounted | src/terminalReactRootContract.test.mjs, src/velaLiveWorkspaceOwnershipContract.test.mjs |
| TCO panels register through Vela's shared registry; journal mounts, opens, refreshes and disposes through Vela's dock | src/velaTcoWorkspaceUxContract.test.mjs, src/workspacePanelSystemContract.test.mjs, src/terminalDockSystemContract.test.mjs |
| Vela owns chart/renderer boundaries and TCO does not introduce a competing renderer | src/velaRenderingOwnershipContract.test.mjs, src/velaTcoSemanticBoundaryContract.test.mjs, src/coreSpiritNonNegotiableArchitectureContract.test.mjs |
| Market data uses canonical shared state and Vela provider wiring | src/canonicalMarketDataTransportContract.test.mjs, src/chartMultiChartDataPlaneContract.test.mjs, src/velaP1WorkspaceMarketDataContract.test.mjs, src/marketDataHealthContract.test.mjs |
| Compiler, worker, VM and backend boundaries preserve canonical IR and parity | src/services/coreSpirit/canonicalCompilerPipelineContract.test.mjs, src/services/coreSpirit/backendPlannerIntegrationContract.test.mjs, src/services/coreSpirit/multiBackendKernelExecutorContract.test.mjs, src/services/coreSpirit/artifactIdentityParityContract.test.mjs |
| CoreSpirit output is adapted into the Vela boundary without recomputing semantics in the renderer | src/services/coreSpirit/velaOutputAdapterContract.test.mjs, src/velaRenderingOwnershipContract.test.mjs |
| Strategy/research/simulation does not silently cross into live broker execution | src/strategySimulatorExecutionBoundaryContract.test.mjs, src/coreSpiritBrokerBoundaryContract.test.mjs, src/services/core/replay/strategySimulator.test.ts |

The map contract is deliberately a **source-wiring contract**. It detects moved or bypassed ownership edges; it does not replace behavioral, differential, integration, browser, broker-sandbox or paper-trading tests. A static contract cannot establish live market freshness, browser frame time or real order-routing safety by itself.

## Known boundaries and open verification

- The ownership model is established for the critical live chart, CoreSpirit chart execution, market-data and order-submission paths. It is not a complete inventory of every page, server route, database table, automation adapter or provider.
- Authenticated browser performance remains unverified until the CI browser gate is enabled and produces a valid authenticated run. A skipped browser job is not a baseline.
- GitHub branch protection must be confirmed in repository Settings by an owner/admin. A workflow, this map, and a passing contract suite do not enforce protected-branch settings.
- Do not create a second chart engine, candle store, scripting compiler/VM, order state machine, or Vela panel registry to solve a local integration problem. Extend the owner named above and add a contract at the boundary.

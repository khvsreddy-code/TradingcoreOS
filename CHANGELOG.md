# TradingCoreOS Changelog

> Historical changelog reconstructed directly from the Git history of `khvsreddy-code/TradingcoreOS`.
>
> **Coverage:** 531 commits, from the initial repository commit through the latest commit present immediately before this changelog was created.
>
> **Repository:** `khvsreddy-code/TradingcoreOS`  
> **Branch:** `main`  
> **Initial commit:** `ac7f47f` — Initial commit — 2026-08-03  
> **Latest pre-changelog commit:** `2e754d8` — v109 vela chart engine — 2026-09-29

## Project Evolution

TradingCoreOS began as the initial project scaffold and rapidly evolved into a broker-connected trading workspace. The history shows several major development phases:

1. **Foundation and broker integration (Aug 3):** Supabase authentication, broker adapters, onboarding, broker requirements, OAuth integration, and Vercel deployment.
2. **Trading workspace and market-data expansion (late Aug–Sep 13):** broker-aware routing, FYERS/Upstox market data, historical candles, indicators, OI analytics, portfolio state, workspace navigation, watchlists, trading panels, order interfaces, and the live command center.
3. **Live-market reliability and performance (Sep 13–24):** request throttling, caching, stale-response protection, live-stream lifecycle handling, candle first-paint/history recovery, focused chart rendering, toolbar/drawing restoration, and FYERS heartbeat/recovery work.
4. **CoreSpirit compiler/runtime architecture (Sep 27–28):** syntax normalization, compiler consolidation, semantic graphs, composability, IR provenance/source maps, vectorized primitives, fusion contracts, runtime/reactive performance work, and versioned CoreSpirit contracts.
5. **Architecture/build hardening (Sep 28):** production-source restoration, removal of retired terminal/workflow implementations, canonical market-store consolidation, theme/workspace recovery, production-build validation, and CI contract repairs.
6. **V109 chart-engine direction (Sep 29):** the latest pre-changelog commit introduces the Vela chart engine direction.

## Complete Commit History

### 2026-08-03

- `ac7f47f` — Initial commit
- `9ec5ec0` — first change
- `d09c033` — feat(auth): implement Supabase authentication
- `58d84db` — feat: update supabase config and document project
- `b0b4f51` — refactor: fallback to default Supabase configuration
- `432d42b` — feat: add demo mode and broker requirement modal
- `12d6bbe` — feat(broker): enhance adapter capabilities and tracking
- `ba6becd` — refactor: remove demo mode and integrate broker workflow
- `5585006` — refactor: update onboarding and broker flow
- `e83fbe9` — feat(auth): implement broker OAuth integration
- `78ab46d` — refactor: enable deployment on Vercel

### 2026-08-29

- `b6529d4` — dsxez
- `131fa9d` — Add files via upload
- `93f0b6a` — dsag
- `9a16fb0` — Add files via upload
- `013eaec` — DSAGDSAG
- `0877259` — Add files via upload

### 2026-08-30

- `27d825e` — 132
- `a267f25` — Add files via upload

### 2026-09-01

- `ff9f990` — jk
- `682e536` — Add files via upload
- `6c1fce5` — 489
- `13f0c2c` — Add files via upload
- `828197d` — high coritsol
- `4a05ad5` — Add files via upload
- `c28c645` — bombaclat wallahi
- `6191db8` — Add files via upload

### 2026-09-02

- `4730db2` — 48
- `0320d76` — Add files via upload
- `4b50335` — FDGDFG
- `67b2c8b` — Add files via upload
- `9f3ab4d` — 860.
- `41eef5a` — Add files via upload
- `ea5a318` — deleted
- `99447de` — Add files via upload
- `76b9ed1` — deleted AGAIN
- `c20469b` — Add files via upload
- `dcc2a95` — DS
- `21b221a` — SDF
- `7628e3c` — Add files via upload
- `abb3956` — DFS
- `1429ebc` — Add files via upload
- `adeefdf` — AHSDFKL;
- `1e5c8d4` — Add files via upload
- `62f5d46` — 1 AGAIN
- `070565b` — Add files via upload
- `6fa1696` — 1 AGAIN
- `8fa58cc` — Add files via upload
- `bec43c0` — 456
- `4512fcb` — Add files via upload
- `de30564` — fix: add Fyers low-latency market data transport
- `2af6152` — fix: route Fyers historical and live market data through connected broker
- `0ba2675` — fix: mount broker-specific market data routes
- `390d835` — fix: add broker-selected streaming client
- `942919b` — fix: route chart ticks through the connected broker
- `ace6069` — fix: initialize broker-aware market data routing
- `cf09449` — fix: rank OI levels by strength and delta-OI
- `70aa95d` — fix: start charts clean with indicators disabled
- `299ec16` — fix: keep chart clean by default while preserving toggles
- `3c4b6b3` — fix: make the last connected broker the live data source
- `6d483e5` — Merge chart broker and OI fixes
- `fccaa84` — fix: preserve runtime tick events for broker-selected feeds
- `9515645` — fix: keep live indicator state reactive across chart workers
- `ca97081` — fix: make workspace navigation instant
- `e950049` — fix: return current-session Fyers candles for intraday charts
- `33f9896` — fix: rank impactful OI levels and avoid clustered strikes
- `095615f` — feat: add simple CE and PE buy sell automation templates
- `3341464` — feat: add portfolio daily P&L and snapshot history
- `bc6f66c` — feat: add OI level count preference
- `d3d5783` — fix: fetch Fyers intraday candles directly for current session
- `8159a6b` — feat: add chart indicator manager dock
- `8c60abe` — fix: activate broker routing and chart indicator dock
- `af31b9b` — fix: force Fyers intraday history to current session
- `5e5edf6` — fix: make workspace navigation independent of broker restore
- `66346f2` — fix: show all user-added studies in chart manager
- `de5be92` — fix: keep intraday chart history on current session
- `3e3fd6d` — perf: reuse intraday session date formatter
- `7213f8f` — fix: preserve selected broker across reloads and isolate portfolio sync by active broker
- `1819ad2` — fix: make active broker switching update portfolio immediately and isolate broker syncs
- `84c6c06` — fix: correct runtime broker typing and active-broker portfolio synchronization
- `0ac4864` — feat: show active broker and connected account count throughout workspace
- `0472644` — fix: isolate portfolio history and live data by active broker
- `21d30df` — fix: show live workspace active broker and connected account count
- `0c49223` — revert: restore complete live workspace UI
- `1650b7e` — fix: switch live feed with active broker and reject stale intraday candles
- `fdb12a4` — perf: isolate broker routes and cache session history briefly
- `45208fe` — perf: code split heavy workspace modules
- `2e2976f` — docs: consolidate engineering and deployment notes
- `a7e9f5e` — docs: remove duplicate deployment checklist
- `ed2670a` — docs: remove stale landing page specification
- `7e1138d` — docs: remove duplicate production hardening notes
- `c639b7b` — docs: remove obsolete release notes
- `eff3fbc` — docs: remove obsolete release notes
- `db41399` — perf: reject stale ticks and stale broker responses

### 2026-09-05

- `6fa5a00` — 4
- `fcf7ea4` — Add files via upload
- `5d5f57f` — Add files via upload

### 2026-09-11

- `e12deab` — deleted
- `8bc320b` — Add files via upload
- `fcd1e79` — dg
- `a5d6fbd` — Add files via upload
- `f7dc92e` — Add files via upload

### 2026-09-12

- `93f63c3` — delete
- `3e6e848` — upstox + fyers fast api / indicators depth settings
- `feedbb1` — Add files via upload
- `c3dc65c` — reslove issues
- `4af01c4` — Vercel was failing on this line in src/main.tsx
- `3480da1` — Fix Vercel build: add missing TradingCoreRuntime module
- `7ffa3f3` — Fix Vercel build: restore missing OAuth popup manager
- `f84dbc8` — Fix Vercel build: restore missing broker OAuth service
- `8aa826b` — fix: restore missing workspaceState service
- `e1bfd77` — fix: restore missing Upstox market data client
- `fcdae2d` — fix: route nested Express API paths through Vercel catch-all
- `cef4378` — docs: add v0.0.7 nested API routing release note
- `262a38e` — fix: add explicit broker OAuth login Vercel function
- `da97c23` — fix: correct OAuth login function imports
- `e5f14b9` — fix: add explicit broker OAuth callback Vercel function
- `ac2c62a` — fix: restore shared market feed types
- `87c8e67` — fix oauth popup launch and timeout
- `1c95714` — fix trading route request typing
- `dd3fe5d` — Fix Vercel broker OAuth login handler for native request/response
- `9ae8163` — Fix Vercel broker OAuth callback response adapter
- `57ad703` — Fix market feed type definitions for Upstox V3 events and fields
- `cea3878` — Fix broker session restore with explicit Vercel sessions endpoint
- `19b07fa` — fix: add explicit Vercel broker market stream function
- `bd31322` — fix: add explicit FYERS market stream function
- `99e5b83` — fix: add explicit Upstox market stream function
- `90cdd97` — feat: add instant FYERS and Upstox runtime switcher
- `56c5202` — feat: add top broker runtime switcher
- `1aa34e7` — fix: route FYERS market stream through Express
- `f74dbd2` — fix: route Upstox market stream through Express
- `4baf869` — feat: add trading panels and complete option chain UX
- `6634486` — fix: restore full trading workspace and add movable panels
- `7403950` — fix: restore complete workspace after panel integration
- `8ecb50b` — fix: restore known-good Express API routing for chart and broker feeds
- `3be3591` — fix: make Express API entrypoint explicit and streaming-capable
- `b461809` — fix: expose useful broker feed errors instead of HTML JSON parse failures
- `3c480af` — fix: remove conflicting nested Vercel market-stream function
- `91a78bc` — fix: remove conflicting nested Vercel market-stream function
- `5c7ac05` — fix: remove conflicting catch-all Vercel function in favor of single Express API entrypoint

### 2026-09-13

- `c459a05` — deleted
- `cd86d04` — Add files via upload
- `444a476` — fix: restore missing TradingCoreRuntime source file
- `3761c62` — fix: restore OAuth popup service dependency
- `c6dc31d` — fix: restore broker OAuth service dependency
- `edf3979` — fix: restore landing type contracts
- `cd5c51a` — fix: restore navigation type contracts
- `9da3040` — fix: restore market data provider contract
- `ec1f98c` — fix: restore Upstox market data client
- `53e5b46` — fix: restore broker instrument search
- `c1b4344` — fix: restore chart level analytics engine
- `281dbce` — fix: restore market type contracts
- `a8dad5a` — fix: restore option OI analytics engine
- `40025ed` — fix: restore complete indicator engine
- `1ade203` — fix: repair legacy root entrypoint
- `888d8b2` — fix: restore workspace state service
- `24b2fb1` — fix: use explicit Vercel API entrypoint
- `40ee275` — fix: force all API routes through Express function
- `a3c076c` — fix: remove ambiguous API catch-all function
- `404c91c` — fix: use FYERS authorization code in OAuth callback
- `4b541a8` — fix: route SPA callback and client routes through Vite
- `52f46e8` — fix: optimize Upstox historical candle routing
- `254bdbd` — perf: cap historical chart payloads for faster startup
- `7674b1a` — fix: remove malformed Upstox transport comment
- `d5a5429` — perf: remove redundant fetch shim and handle stale Vite chunks
- `1d0df5d` — fix: mount optimized Upstox historical route
- `f04902c` — perf: extend Vercel live-stream function duration
- `6c345e0` — fix: rate-limit FYERS fallback feed
- `56c2b64` — fix: repair FYERS instrument search
- `9704d40` — fix: restore full broker market routes and repair symbol search
- `3d108ff` — fix: cache option chains and slow portfolio polling
- `f68cae0` — fix: debounce instrument search requests
- `c11a3da` — ui: add TradingView-style watchlist rail
- `64de15a` — ui: add workspace watchlist and levels bridge
- `6787063` — ui: load workspace hotfix bridge
- `92fc098` — perf: cache workspace market requests
- `0487c9b` — ci: apply workspace reliability patch
- `1ae3a42` — fix: stabilize OI and Levels controls
- `cadb0d4` — chore: remove temporary workspace patch workflow
- `d77fb7d` — perf: stabilize OI redraw and cache
- `ea2646e` — fix(levels): make core levels pure price-action structure
- `b0496b8` — feat(order): add index option and stock cash quick-order UI
- `f65b652` — feat(order): load index option and stock cash quick-order bridge
- `aaf8a53` — fix(order): expose target stop and trailing risk fields
- `71f2eb9` — feat(workspace): restore live navigation and polished risk-aware order ticket
- `a2bce28` — style(workspace): polish order ticket and navigation chrome
- `770b130` — feat(workspace): load navigation and risk order chrome
- `28b8710` — fix(workspace): detect selected chart instrument instead of watchlist
- `32d67ab` — feat(levels): integrate quantitative price-action validation
- `f935d67` — fix(api): add broker-wide request rate gates
- `ca366b2` — fix(fyers): make historical chart requests quota-safe
- `cf338f0` — fix(upstox): gate and cache historical candle requests
- `aa832dc` — fix(portfolio): serialize and cache broker snapshot requests
- `847a7e6` — fix(api): route broker history and portfolio through safe paths
- `4563c1b` — fix(portfolio): space every upstream broker request
- `e858159` — feat(workspace): add pro watchlist multi-chart and option scalper
- `8b2fb4b` — feat(workspace): activate pro trading workspace
- `ab4e003` — feat(dashboard): add authenticated trading command center
- `e7f040a` — feat(navigation): add dashboard home to workspace shell
- `a5f7a0f` — feat(app): make authenticated dashboard the product home
- `149f0c4` — fix(workspace): isolate legacy watchlist bridge to live route
- `667fb17` — fix(dashboard): make command center navigation and refresh actions explicit
- `7a8a28e` — fix(app): make workspace routing reliable and prevent blank protected pages
- `193ab27` — fix(workspace): make navigation controls explicit buttons
- `3aae1a7` — feat(live): add complete trading command center with panels and order ticket
- `6761987` — feat(live): mount complete trading terminal with broker-correct instruments
- `cc11c59` — fix(live): use broker-safe terminal for live workspace
- `21c95e5` — fix(live): normalize broker keys and make single chart fill workspace
- `e1baea5` — fix(live): make every chart layout fill available height
- `b0152c8` — fix(runtime): guard historical candle requests
- `eda1601` — feat(live): add focused chart controls and safe default layout
- `c3a4b12` — fix(live): switch to focused chart terminal
- `2086c3d` — fix(live): stop mounting legacy workspace
- `89d256b` — Fix live terminal layout switching and focused chart rendering
- `db7460d` — Use robust live terminal layout renderer
- `7a03427` — fix: allow duplicate instruments across chart layout slots
- `9b08238` — Build polished live terminal option chain and index options order flow
- `7f7f282` — Use polished V4 live terminal
- `f0ab0ec` — style(live): polish terminal toolbar control sizing
- `1289213` — style(live): load polished terminal controls
- `77b6973` — feat(indicators): add proper anchor settings model
- `c908c1f` — fix(indicators): keep anchor metadata type-safe
- `30a3d66` — chore: apply indicator settings polish
- `edcf007` — fix(workflow): make indicator settings patch executable
- `63d2feb` — fix(indicators): correct settings controls [skip ci]
- `98797bb` — feat: add configurable dynamic levels settings
- `11d7d24` — feat: implement TradingCore Dynamic LVLS price-action engine
- `145cff9` — feat: add Dynamic LVLS settings panel
- `17dca77` — feat: mount Dynamic LVLS settings dock
- `33b3dd4` — fix: enable Dynamic LVLS by default
- `843c1c7` — refactor: present price levels as feature settings
- `8f25ee9` — fix: keep workspace panels inline
- `aad56da` — fix: add broker-style instrument suggestions and robust option-chain route
- `2b0f546` — fix: mount robust workspace search and option-chain routes first
- `2f116cd` — fix: broker-style search suggestions and option chain loading
- `8521136` — fix: expose option-chain OI change fields for detailed flow view
- `f36d4ed` — Fix FYERS and Upstox option search and chain expiry handling
- `72f62fb` — Make Upstox search use full broker-style free-text query
- `7b280b4` — Add watchlist rename modal and ATM CE/PE order ticket
- `29b0145` — Fix independent CE and PE strike selection in ATM order ticket
- `3e072c7` — Fix V5 JSX build error before redeploy
- `b8883ed` — Fix V5 JSX build and keep rename plus ATM order ticket
- `b8bc5d4` — Fix workspace panels to centered resizable modal windows
- `c0833a6` — Replace broken interaction-blocking terminal wrapper
- `d66c147` — Restore terminal interaction and use real floating resizable windows for non-option tools
- `8db558a` — Fix terminal interaction by removing blocking overlay
- `7d7603b` — Fix watchlist rename control position so it does not cover search
- `f8ddf87` — Load watchlist rename positioning fix
- `35d9d85` — Make floating terminal windows draggable
- `a9a6de8` — Fix popup backdrop and scope Levels interception to terminal controls
- `5932c41` — Fix watchlist rename control placement so it never covers ticker search
- `139780a` — Fix Fyers option charts when no historical candles exist
- `357e99a` — Prioritize NIFTY over FINNIFTY in instrument search
- `5898fc6` — Mount prioritized NIFTY search before workspace search
- `3f4b93d` — feat: add pinned advanced order ticket for stocks and indices
- `3e019e2` — feat: pin advanced order ticket and support stocks plus indices
- `0a1a17e` — refactor: keep ticket controls in floating frame header
- `69a2ddd` — fix Upstox option-chain underlying resolution in order ticket
- `8af015a` — feat: persist user workspace settings in Supabase
- `25a899d` — feat: hydrate and sync user settings from Supabase
- `20ad24f` — chore: point Supabase client at production project
- `5a3a813` — fix: route FYERS live orders through fixed-IP execution gateway
- `c659d9b` — feat: add fixed-IP FYERS execution gateway
- `496571b` — chore: containerize FYERS fixed-IP gateway
- `9cd47ea` — docs: document FYERS fixed-IP gateway deployment
- `19a5301` — docs: add Supabase and FYERS environment configuration
- `9a7f94e` — security: exclude broker secrets from settings sync
- `43361ef` — fix Upstox option expiry resolution
- `ff50b9b` — route Upstox option-chain expiry fix before workspace route

### 2026-09-14

- `1e439bb` — Fix level settings dock appearing on broker setup page
- `9a60daa` — Show level settings only inside live trading workspace
- `4ed40e0` — Keep broker guard and show level settings only in live workspace
- `5b7da3a` — delete

### 2026-09-15

- `ca9e591` — fux
- `bcaa17c` — modified
- `ff795cb` — modified indicators and few improvements in the ui and models
- `1233a52` — cloud save and teradingview style watchlist

### 2026-09-16

- `e91a6c3` — dfg
- `f137c16` — back but on oic
- `1715db2` — clean navigation
- `af948a0` — prediction models modification
- `0f7b0b0` — unified
- `995a59f` — unified fixed

### 2026-09-17

- `a67b8ae` — fixed

### 2026-09-18

- `2ea49ed` — Stage 4 — CoreSpirit AST / IR
- `6260977` — stage 7 — Chart Command Bar + Favorite Symbol UI

### 2026-09-19

- `8ce914b` — stage 10 merged
- `04cba3c` — candles chart fix
- `1fef967` — TradingCoreOS-stage-11-progressive-history-30k-validation-gated
- `5662df3` — TradingCoreOS-stage-13-history-request-limit-fixed-30k-validation-gated
- `f52a77a` — fixed
- `bac8509` — fixed stage 13
- `b73f159` — d
- `53ebc54` — dop
- `09f2416` — 74
- `dc3f0d0` — gh
- `99f822d` — 897
- `79ffa28` — fixed again v5
- `48b2f5b` — TradingCoreOS-stage-13-nifty-fno-history-root-fix-v7
- `edc58a6` — TradingCoreOS Stage 13 — FYERS History Recovery Fix v8
- `18c7812` — TradingCoreOS-stage-13-progressive-history-pagination-v9
- `a78a7e4` — hlkj
- `7eb292a` — imdoneasniga
- `a270137` — df
- `0b670e9` — gdfg

### 2026-09-20

- `b1cc9da` — fixed at 947
- `225c47f` — 98754
- `f548cba` — 012
- `ef3fb40` — 23
- `c581eb0` — modified
- `3456087` — jiuyhvtv
- `cf146f6` — fgd
- `4363330` — edg
- `11bbe60` — TradingCoreOS-v29-CoreSpirit-coder-deep
- `efb94cd` — TradingCoreOS-v31-chart-history-regression-fix
- `50daf9a` — TradingCoreOS-v32-legacy-history-20k
- `52f4755` — fixed

### 2026-09-21

- `b7610ec` — jksdfhhjkh
- `1bc75c9` — fixed agains
- `dda8978` — fg
- `529d21b` — fixed full fyers api
- `1acfca3` — df
- `111085c` — fix FYERS history nested request gate deadlock
- `e2574b5` — update FYERS v32.5 incident tracker
- `92ac71c` — update FYERS v32.5 incident tracker
- `43d25a8` — update FYERS v32.5 incident tracker
- `cab72ff` — update FYERS v32.5 incident tracker
- `8e0d229` — fix FYERS chart first-paint history window
- `b19af4f` — record FYERS v32.6 chart first-paint fix
- `443ed4c` — update FYERS checklist to v32.6
- `4c6d0b3` — update FYERS todo to v32.6
- `e970ddb` — update FYERS state to v32.6
- `89620b4` — fix FYERS history date format support
- `d51803d` — fix FYERS intraday history range timestamps
- `5535f05` — update FYERS tracker for v32.7 candle recovery
- `7393476` — update FYERS tracker for v32.7 candle recovery
- `f75f58b` — update FYERS tracker for v32.7 candle recovery
- `bd2702e` — update FYERS tracker for v32.7 candle recovery
- `fb0cf18` — use completed trading-day FYERS history ranges
- `dfc9321` — update FYERS tracker for v32.8 deep candle audit
- `4d76878` — update FYERS tracker for v32.8 deep candle audit
- `b3ca68c` — update FYERS tracker for v32.8 deep candle audit
- `0795d05` — update FYERS tracker for v32.8 deep candle audit
- `62055b6` — fix FYERS history no_data terminating successful backfill
- `5730dda` — update FYERS candle root-cause tracking v32.9
- `fa6d691` — update FYERS candle root-cause tracking v32.9
- `3446fe5` — update FYERS candle root-cause tracking v32.9
- `0d27a39` — update FYERS candle root-cause tracking v32.9
- `f47baeb` — diagnose FYERS candle normalization loss
- `c0acb46` — fix FYERS history first-paint page loading
- `16e9f0e` — 123
- `e40f8d5` — fixed
- `8cb3fe6` — fix FYERS candle first-paint transport
- `acffdd9` — stop FYERS history startup fanout
- `d79bd4e` — stop automatic FYERS history backfill
- `5741385` — fixwed
- `897b941` — restore proven FYERS history transport
- `74ef6d7` — restore proven history request guard
- `9273882` — restore proven FYERS adapter history request
- `47b7b60` — normalize FYERS equity symbols like legacy chart
- `4b26d34` — normalize saved FYERS equity watchlist symbols
- `d8ada8f` — use stable V4 live workspace directly
- `363d35c` — prevent cached FYERS history 304 responses

### 2026-09-23

- `627617e` — verified modification
- `3991c35` — modified
- `65c0777` — state

### 2026-09-24

- `e22751e` — dsf
- `0be938f` — gh
- `db0cf3d` — entire thing fixed multiple issues have been fixed
- `1087e49` — stabilize FYERS live stream before Vercel timeout
- `7ff3e4d` — align FYERS v3 live subscription with official data socket type
- `0d6c4af` — clean up FYERS stream subscriptions on response close
- `6bae548` — keep FYERS v3 symbolUpdate wire format
- `6ecb9bb` — speed up FYERS stale quote fallback
- `f23f914` — restore AI model picker and chart menus for top toolbar
- `6545658` — wire top toolbar Draw button to drawing tools menu
- `b049499` — throttle stale-feed quote fallback to protect broker request budget
- `7997017` — track FYERS stall and toolbar repair pass
- `57fe6b5` — make FYERS quotes a 3.5s candle recovery heartbeat with tab recovery
- `420357c` — add hard timeout and dedicated fast lane for FYERS quote heartbeat
- `c30c3f4` — track 3.5s FYERS candle heartbeat and tab recovery
- `11c40cb` — make FYERS quote heartbeat response uncached and timeout-aware
- `dff9ccc` — stabilize FYERS terminal stream lifecycle and watchdog
- `8d7727d` — keep market feed subscribed independently of focused chart
- `762ae54` — track FYERS stream lifecycle stabilization fixes
- `05e4ee5` — speed up FYERS history and isolate live quote heartbeat

### 2026-09-25

- `44d7513` — huge improvement
- `d41b482` — test

### 2026-09-26

- `76c828c` — huge another
- `0a377ea` — massive collection of improvements of corespirit

### 2026-09-27

- `1c2718d` — version 71
- `5fc8888` — fg
- `3e1229f` — fix CoreSpirit composability export syntax
- `6da9efa` — add customizable candle appearance contract
- `c72fde4` — add customizable candle colors and visibility controls
- `37da2bd` — deepen CoreSpirit simplification architecture #23 #24
- `a1be587` — record v74 simplification cycle and Supabase repair
- `a7152e9` — bump CoreSpirit contract to v74
- `b4faaf7` — set CoreSpirit v74 tracker release state
- `8dcc684` — add CoreSpirit v74 release manifest
- `dc161cb` — record Supabase authenticated table ACL repair
- `5afa29e` — define target syntax and compiler source of truth
- `d9663d7` — record v75 target syntax and compiler consolidation
- `8c73a7a` — bump CoreSpirit contract to v75
- `ce197ce` — add CoreSpirit v75 target syntax manifest
- `dc5844f` — add token-aware CoreSpirit surface normalization
- `d3bdf98` — support token-aware crossing call syntax
- `562dbeb` — route normalization through token-aware surface boundary
- `27da83e` — preserve multiline surface transform result shapes
- `b64ff8b` — type-safe protected legacy normalization pipeline
- `9a78df2` — add canonical CoreSpirit source compilation gateway
- `06ace37` — route source compilation through canonical pipeline
- `38ee7cd` — use canonical compilation unit for editor diagnostics and types
- `a68b45b` — add CST-aware normalization pipeline regression
- `d8890bb` — export canonical CoreSpirit normalization pipeline
- `9781b9c` — document v76 compiler and normalization hardening
- `f1d41b6` — record v76 CST normalization and compiler pipeline
- `8f13054` — bump CoreSpirit contract to v76
- `57485cf` — add CoreSpirit v76 compiler hardening manifest
- `35cd7e2` — refine token-aware crossing precedence and call detection
- `f571c1d` — add semantic dependency graph for CoreSpirit composability
- `ad2214b` — redesign composability as semantic graph projection
- `7cf423a` — build composition metadata from canonical AST semantics
- `7dd54f4` — resolve model aliases through semantic bindings
- `673b191` — compile model alias member access consistently
- `809c681` — resolve model outputs from direct and aliased model references
- `107decf` — update composability regression to semantic graph contract
- `b6dddb0` — export semantic dependency graph contract
- `6c5a965` — add semantic composability dependency regression
- `7008e3d` — fix semantic graph regression fixture line joining
- `ef8d8e5` — document semantic composability architecture v77
- `ec97c87` — record v77 semantic composability redesign
- `8b8dc87` — tighten semantic graph string literal typing
- `8ff2f26` — version composition metadata for semantic projection
- `bc2fb36` — expose semantic graph lineage in composition metadata
- `e749732` — preserve market and timeframe alias identity in semantic graph
- `8c9d041` — collapse expression nodes in semantic composition projection
- `6ba02a6` — align composability regression with semantic event direction
- `ef4b927` — align order composition test with semantic dependency chain
- `8f34122` — bump CoreSpirit contract to v77
- `fa56cbf` — add CoreSpirit v77 semantic graph manifest
- `13ce4b0` — set v77 tracker state and record automation ownership boundary
- `96e892a` — add source provenance to CoreSpirit IR instructions
- `8fc9381` — attach instruction origins and build source maps from IR origins
- `8223e3d` — centralize source map generation from IR origins
- `dbb0946` — preserve IR origins and rebuild source maps after optimization
- `8ba016f` — build source maps directly from optimized IR instruction origins
- `0838798` — use direct IR origins for semantic graph source attribution
- `15e8b81` — add source map origin regression contract
- `d82dc51` — validate optional IR instruction provenance
- `5a6fec8` — document P0 source provenance and optimized source maps
- `a10794b` — record v78 source provenance hardening
- `0c096c6` — bump CoreSpirit contract to v78
- `56cf88d` — add CoreSpirit v78 source provenance manifest
- `1335e4b` — preserve provenance when folding binary IR
- `331e42a` — align source provenance regression with AST origin ownership
- `6dbcbe3` — narrow provenance numbers in IR validator

### 2026-09-28

- `b63b0f4` — huge unimaginable improvement i can do and say
- `1519074` — fix(theme): restore missing theme module for Vercel build
- `210af85` — fix(theme): restore missing ThemeContext for Vercel build
- `a3cfed3` — fix(build): restore deleted production source tree
- `2f2a3db` — fix(build): restore v98 CoreSpirit storage schema
- `df6e85a` — fix(build): restore full pre-v98 production source tree
- `1ae0aa4` — fix(architecture): remove retired src/LiveTradingTerminalV2.tsx
- `6e9aa1c` — fix(architecture): remove retired src/LiveTradingTerminalV3.tsx
- `7621ef9` — fix(architecture): remove retired src/LiveTradingTerminalV4.tsx
- `974fab7` — fix(architecture): remove retired src/LiveTradingTerminalV5.tsx
- `8d4bf05` — fix(architecture): remove retired .github/workflows/fix-layout-duplicate-slots.yml
- `08486cf` — fix(build): restore CoreSpirit namespace registry
- `348cd7d` — fix(build): restore CoreSpirit series vector runtime contract
- `e4dff30` — fix(build): restore CoreSpirit series fusion planner
- `dbc119f` — fix(build): restore CoreSpirit model component adapter
- `00c94fd` — fix(build): restore CoreSpirit source inspector
- `32e4605` — fix(build): remove non-production CoreSpirit barrel exports
- `95c760b` — fix(version): restore CoreSpirit v98 release contract
- `7fc040f` — fix(v85): restore CoreSpirit run manifest contract
- `33b8962` — fix(v85): restore CoreSpirit session calendar
- `ef81789` — fix(v85): restore CoreSpirit reconciliation contract
- `33eaf98` — fix(v85): restore CoreSpirit public barrel contracts
- `5f7b113` — fix(v88): restore reactive source dependency index
- `3cdf353` — fix(v88): remove O(n) reactive queue shift
- `12fec95` — fix(v88): remove spread min max from history storage
- `6db2e26` — fix(ci): restore CoreSpirit stage92 contract
- `f8c4b4b` — fix(ci): restore CoreSpirit stage93 contract
- `22ad19a` — fix(ci): restore CoreSpirit VM component contract
- `26090b3` — fix(v90): restore CoreSpirit component semantic binding
- `b7ec012` — fix(v90): restore component dependency graph nodes
- `0d0443f` — fix(v90): satisfy component graph contract form
- `99e4340` — fix(ci): repair stage92 contract string literal
- `2fa0b59` — fix(ci): repair all stage92 line-join literals
- `67ad09c` — fix(v90): repair semantic graph template literals
- `e5e4b76` — fix(core): restore CoreSpirit v98 type algebra
- `38426f5` — fix(core): restore v98 standard library execution metadata
- `da77dc6` — fix(corespirit): restore builtin resolver and series execution contracts
- `1765b09` — fix(ci): correct stage92 newline literals
- `bc55a14` — fix(corespirit): restore canonical library catalog contract
- `5cf8407` — fix(core): restore standard library group catalog
- `a3c9551` — fix(core): enable namespaced member-call parsing
- `c531112` — debug(core): print stage92 normalized source for CI diagnosis
- `1c68913` — fix(ci): use supported CoreSpirit control syntax
- `9b8f0c1` — fix(ci): remove temporary stage92 debug instrumentation
- `814f8fb` — fix(ci): restore stage92 normalized source binding
- `2a7a8cc` — fix(ci): restore stage92 parser input
- `df5a540` — fix(v92): resolve components and namespaced library calls
- `5c6d64a` — fix(v92): include close in CoreSpirit source series
- `fcef266` — fix(ci): use supported CoreSpirit show call syntax
- `a11cb44` — fix(ci): use supported namespaced visual syntax
- `f13b910` — fix(ci): use canonical CoreSpirit SHOW surface
- `320161a` — fix(ci): use supported namespaced visual syntax
- `7fb1025` — fix(ci): remove accidental stage92 test path
- `c9e7e53` — fix(core): unify syntax normalizer with semantic surface pipeline
- `c90ce0a` — fix(ci): use namespaced visual projection in stage92
- `a48f24d` — fix(core): register vectorized zscore normalize persistence primitives
- `0529941` — fix(core): register pctchange vector fusion contract
- `75c25d2` — fix(v93): restore pctchange fusion metadata
- `62b8817` — ci: validate production build before strict typecheck
- `9cc434a` — fix(build): restore chart market store
- `5df1f66` — fix(build): restore chart performance telemetry
- `acc2830` — fix(chart): remove duplicate CommonJS market store resolver trap
- `838b6be` — fix(build): restore canonical marketDataStore compatibility module
- `615c8e2` — fix(build): make canonical market store Vite-resolvable ESM
- `655cf4b` — fix(build): remove duplicate marketDataStore javascript twin
- `73ce2ec` — fix(ui): restore ThemeToggle import in workspace shell
- `58f4d8e` — fix(ui): make route error recovery reset workspace boundary
- `9d3241b` — fix(api): restore ESM broker validation import extension
- `ec159de` — dsfa

### 2026-09-29

- `32e29b3` — Delete .github/workflows directory
- `925c208` — deleted
- `e7d8e2f` — deleted
- `e709917` — Delete all files
- `2e754d8` — v109 vela chart engine

## Notes

- This file records the repository's actual Git commit subjects; it does not invent feature details for commits whose messages are vague (for example, `test`, `deleted`, or `Add files via upload`).
- Commit subjects are preserved as written in Git, with the commit SHA abbreviated to seven characters for readability.
- The changelog is chronological: oldest commits first, newest commits last.
- The act of creating this file produces a new Git commit. That changelog-creation commit is intentionally not included in the historical section above because the history was reconstructed immediately before this file was written.


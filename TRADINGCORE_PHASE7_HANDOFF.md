# TradingCore OS — Phase 7 Engineering Handoff

## Status

This increment hardens the existing OAuth and Upstox REST boundary. It is **not a completed Phase 7 release**: the professional workspace still contains fixture UI data, a real Upstox V3 feed transport/Protobuf decoder has not yet been added, and no live credentialed verification was possible in this checkout. The application no longer presents generated ticks as live market data.

## Existing architecture retained

- React/Vite SPA with state-based routing in `src/App.tsx`.
- Supabase client authentication and the existing broker popup lifecycle.
- Client broker adapters → `TradingCoreRuntime`/`TradingEngine` → Express routes → server broker adapters.
- Server-side AES-256-GCM token encryption and the broker registry.

## Changes in this increment

- Removed embedded Upstox credentials from `.env.example` and removed client-side Supabase fallback credentials.
- Added required environment variables: `UPSTOX_REDIRECT_URI`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `ENCRYPTION_SECRET`.
- Made `ENCRYPTION_SECRET` mandatory (minimum 32 characters); there is no fallback encryption key.
- Added `requireUser` middleware. It validates the bearer token with Supabase `/auth/v1/user` and derives the server-side user ID. Broker routes and trading routes no longer trust a supplied `user_id`.
- Added authenticated client fetch helper `src/services/http/tradingApi.ts`.
- Enforced OAuth state presence, validity, broker match, and authenticated-user match. The callback no longer returns or posts the authorization code.
- Removed fallback-to-Upstox behavior for unknown broker IDs.
- Replaced fake verification checks/latency with real account endpoint checks.
- Updated Upstox order calls to current documented V3 HFT endpoints for place, modify, and cancel; added preflight order validation.
- Added normalized account-trade, quote, and historical-candle adapter methods and routes.
- Disabled generated market data, historical candles, and interval-based fake WebSocket ticks in the generic client adapter.
- Fixed the existing server port TypeScript issue.

## Modified files

- `.env.example`
- `server.ts`
- `src/server/encryption/EncryptionService.ts`
- `src/server/auth/OAuthService.ts`
- `src/server/auth/OAuthController.ts`
- `src/server/auth/requireUser.ts` (new)
- `src/server/routes/broker.routes.ts`
- `src/server/routes/trading.routes.ts`
- `src/server/brokers/BrokerRegistry.ts`
- `src/server/brokers/adapters/BaseBroker.ts`
- `src/server/brokers/adapters/BrokerAdapters.ts`
- `src/services/http/tradingApi.ts` (new)
- `src/services/oauth/BrokerOAuthService.ts`
- `src/pages/BrokerCallbackPage.tsx`
- `src/services/brokers/BaseBrokerAdapter.ts`
- `src/services/auth/supabaseClient.ts`

No files were deleted.

## Current Upstox implementation

OAuth uses the official authorization-code flow:

1. Authenticated TradingCore client requests `GET /api/auth/broker/login?broker=upstox`.
2. Server creates encrypted state bound to the Supabase user and returns the official Upstox authorization URL.
3. Upstox redirects to the configured callback URI.
4. The callback exchanges the one-time code server-side at `POST https://api.upstox.com/v2/login/authorization/token`.
5. Only encrypted tokens are stored in `BrokerRepository`; the browser receives connection metadata only.

`UPSTOX_REDIRECT_URI` must exactly equal the URI registered in the Upstox Developer App. The current controller still derives the callback origin dynamically; align it to `UPSTOX_REDIRECT_URI` before deploying to prevent environment mismatch.

REST endpoints currently wired in the Upstox adapter:

- Profile: `/v2/user/profile`
- Funds/margin: `/v2/user/get-funds-and-margin`
- Holdings: `/v2/portfolio/long-term-holdings`
- Positions: `/v2/portfolio/short-term-positions`
- Orders: `/v2/order/retrieve-all`
- Trades: `/v2/order/trades/get-trades-for-day`
- Quotes: `/v2/market-quote/quotes`
- Historical candles: `/v2/historical-candle/{instrumentKey}/{interval}/{to}/{from}`
- Place order: `https://api-hft.upstox.com/v3/order/place`
- Modify order: `https://api-hft.upstox.com/v3/order/modify`
- Cancel order: `https://api-hft.upstox.com/v3/order/cancel?order_id=…`

## Security model

- Upstox secret and token material must remain server-only.
- Supabase bearer tokens are sent with API requests and checked by the server before session lookup.
- Session ownership is the verified Supabase user ID, not a browser query parameter.
- OAuth state is encrypted, expires in 15 minutes, and is checked against both broker and user.
- Broker session storage remains an in-memory map. It is encrypted but **not persistent**; replace it with a server-side database and key-management strategy before deployment.

## Market-data and workspace status

The official Upstox V3 market feed requires a server-authorized WebSocket URI and Protobuf decoding using `MarketDataFeed.proto`. The repository does not yet have that transport/decode pipeline. The correct design is:

`Upstox V3 feed → MarketDataTransport → Protobuf normalizer → normalized market store → scoped workspace subscriptions`

No React component should open a socket. The prior interval simulator was removed from the base adapter. Consequently, chart/depth/OI/intelligence panels must remain disconnected/error-state UI until the transport is implemented; they must not claim live data.

The existing `FullWorkspaceView` is a scaffold with hard-coded watchlist/position/chart content and automatic keyboard order submission. It needs replacement before real order use: instrument-token selection, explicit confirmation, actual runtime data selectors, real depth, state reconciliation, and safe hotkey handling are outstanding.

## Analytics/model architecture still required

No deterministic indicator, OI, index breadth, market-structure, or scenario engine was present or added in this hardening increment. Build them as independent data-driven modules (indicator/model interfaces, normalized inputs, explanations/confidence) and never as chart decoration or guaranteed prediction.

## API contract additions

Authenticated routes under `/api/trading/:brokerId`:

- `GET /trades`
- `GET /market-data?instrument_keys=key1,key2`
- `GET /historical?instrument_key=…&interval=…`

All require the Supabase bearer token. Errors return `{ success: false, error }`; successful calls return `{ success: true, data }`.

## Verification performed

```powershell
npm install
npm run lint
npm run build 

```

- TypeScript validation: passed.
- Production frontend build: passed.
- Production Express bundle: passed.
- Live OAuth/API/order/feed verification: not run; valid Supabase and Upstox deployment credentials, an exact registered redirect URI, and an authorized Upstox account are required.

## What is real vs mocked

**Real when deployment variables and an authorized account are supplied:** server-side Upstox authorization-code exchange; encrypted token handling; account REST proxying; V3 order submit/modify/cancel route selection and request validation.

**Mocked or incomplete:** persistent broker-session storage; Upstox V3 streaming/Protobuf feed; order/portfolio stream reconciliation; chart; depth; UI watchlist/positions; OI/options analytics; index constituent analysis; market intelligence; quantitative scenarios; end-to-end and broker integration tests. Other broker adapters remain stubs and must not be offered as live.

## Deployment requirements

Set the following server variables in a secret manager: `ENCRYPTION_SECRET`, `UPSTOX_CLIENT_ID`, `UPSTOX_CLIENT_SECRET`, `UPSTOX_REDIRECT_URI`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Build-time client values are only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

Run `npm run build`, then `npm start`. Use HTTPS and register the exact production callback URI at Upstox. Do not deploy the current in-memory repository for live trading.

---

## Phase 7B — Live Data and Workspace Increment

### Files created

- `src/types/market.ts` — broker-independent normalized tick, depth, OHLC, option-chain, and OI observation types.
- `src/server/marketData/UpstoxMarketDataTransport.ts` — one shared server-side Upstox V3 connection per authenticated user; authorize, subscribe/unsubscribe, reconnect backoff, binary Protobuf decoding, normalization, and cleanup.
- `src/services/marketData/UpstoxMarketDataClient.ts` — one browser-side authenticated NDJSON client to the TradingCore server stream. It never opens an Upstox WebSocket.
- `src/components/workspace/LiveChart.tsx` — Lightweight Charts candlestick chart backed by real Upstox historical-candle API responses.

### Files modified

- `package.json` / lockfile — adds `ws`, `@types/ws`, and `lightweight-charts`.
- `src/server/routes/trading.routes.ts` — authenticated `/market-stream` and `/option-chain` endpoints.
- `src/server/brokers/adapters/BaseBroker.ts` and `BrokerAdapters.ts` — Upstox option-chain normalization.
- `src/services/brokers/BaseBrokerAdapter.ts` and `BrokerAdapter.ts` — real trades and option-chain client methods.
- `src/services/runtime/TradingCoreRuntime.ts` — normalized market-event and snapshot path.
- `src/components/workspace/FullWorkspaceView.tsx` — removes static watchlist values, local fake portfolio state, fake chart messaging, and automatic order-success behavior.
- `src/services/brokers/BrokerManager.ts` / `adapters.ts` / `BaseBrokerAdapter.ts` — browser-persisted connection snapshots are not restored as broker sessions; Upstox only becomes connected after the server verifies its real encrypted session.

### P0 real feed architecture

Upstox V3 authorized feed → server WebSocket → binary Protobuf decoder → NormalizedMarketTick → authenticated NDJSON stream → UpstoxMarketDataClient → TradingCoreRuntime → workspace`

The server uses `GET https://api.upstox.com/v3/feed/market-data-feed/authorize` with the encrypted server-only access token, then connects to its one-time returned WSS URI. Feed subscription uses binary JSON request payloads with `full` mode. It deduplicates keys, sends `unsub` where appropriate, reconnects exponentially (capped at 30 seconds), resubscribes on reconnect, emits feed status, ignores malformed frames, and treats authorization-policy close codes as authentication failure.

The decoder implements the published `MarketDataFeed.proto` structures needed for LTPC, D5 depth, full-feed OI/IV/volume totals, OHLC, and market-segment status. Raw Upstox protobuf objects are not sent to React.

### Workspace data wiring

- Watchlist LTP/change is sourced only from `NormalizedMarketTick`.
- Depth is sourced only from Upstox full-feed D5 levels. The API does not provide an order-count value in these decoded fields, so the UI says it is unavailable.
- Candles are fetched only from the real historical-candle endpoint; no generated series exists.
- Funds, holdings, positions, orders, and trades are refreshed through `TradingCoreRuntime.syncPortfolio()` and shown only when returned by the broker.
- Order submit reports only the broker response ID/status after the API resolves. The UI blocks incomplete order payloads and requires an explicit browser confirmation.

### Upstox option/OI data

The official `/v2/option/chain` endpoint is wired as an authenticated normalized endpoint. It returns actual strike, expiry, underlying spot, call/put instrument keys, LTP, volume, OI, previous OI, and D0 bid/ask values when supplied by Upstox. No OI concentration/PCR interpretation UI has been added yet; these deterministic derived metrics remain blocked until live option-chain responses can be verified.

### Phase 7B verification

- `npm run lint`: passed.
- Live OAuth/account/feed/order validation: not run because this workspace has no supplied production Supabase session, Upstox credentials, registered redirect configuration, or authorized trading account.
- Build must be rerun after this increment before deployment.

### Completion matrix

| Feature | Real | Mock | Not implemented |
|---|---:|---:|---:|
| Upstox V3 server feed transport and protobuf normalizer | Yes, credential-dependent | No | No |
| Feed reconnect/subscription cleanup | Yes, credential-dependent | No | No |
| Runtime normalized market state | Yes | No | No |
| Workspace live LTP/depth/portfolio wiring | Yes, credential-dependent | No | No |
| Historical candlestick chart | Yes, credential-dependent | No | No |
| Indicators (VWAP/EMA/SMA/RSI/MACD/BB/ATR) | No | No | Yes |
| Depth order counts/charges/margin estimate | No | No | Yes (not supplied/implemented) |
| Live order submit/modify/cancel backend | Yes, credential-dependent | No | No |
| Workspace order modify/cancel/square-off controls | No | No | Yes |
| Options chain normalized API | Yes, credential-dependent | No | No |
| OI concentration/PCR UX | No | No | Yes |
| Market intelligence and quantitative models | No | No | Yes |
---

## Vercel deployment fix

Production URL:

`https://tradingcoreos.vercel.app`

Inspect URL:

`https://vercel.com/khvsreddy-codes-projects/tradingcore-upstox-integration/8rw3Kt9qYnhJh15VFQG8XdUMfzK1`

### Deployment files changed

- `server.ts` - removed unconditional Vite import from API runtime, added Vercel import guard so the Express app exports cleanly to serverless and only calls `listen()` outside Vercel.
- `api/index.ts` - changed the import to `../server.js` so Vercel's ESM function runtime resolves the server module.
- `src/server/storage/BrokerRepository.ts` - added optional Supabase-backed persistence for encrypted broker sessions, with in-memory fallback for local development.
- `.env.example` - added `SUPABASE_SERVICE_ROLE_KEY`.
- `supabase/broker_sessions.sql` - added the required encrypted broker-session table and owner read/delete RLS policies.
- `src/index.css` - moved the Google Fonts import before Tailwind to remove the CSS import-order warning.
- `README.md` - added Vercel production deployment notes.

### Deployment verification

- `npm run lint`: passed.
- `npm run build`: passed.
- Local compiled server `/api/health`: passed.
- Vercel-style server import with `VERCEL=1`: passed.
- Vercel production deploy: passed.
- Production app page: HTTP 200.
- Production `/api/health`: passed.

### Remaining production configuration

Vercel currently has no environment variables configured. The deployed page and health API work, but Supabase authentication, Upstox OAuth, live feed, account APIs, and order execution require the real production variables:

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `UPSTOX_CLIENT_ID`, `UPSTOX_CLIENT_SECRET`, `UPSTOX_REDIRECT_URI`, and `ENCRYPTION_SECRET`.

Set `UPSTOX_REDIRECT_URI` to:

`https://tradingcoreos.vercel.app/auth/broker-callback`

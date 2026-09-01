# TradingCore production hardening — September 1, 2026

This note records the changes made in this revision so the implementation and public product claims stay aligned.

## Product truth
- Current public broker integrations: **Upstox and Fyers**.
- Landing-page workspace data is explicitly labelled illustrative/demo data.
- Removed fixed latency promises and unsupported HFT/WebGL/TradingView claims.
- Pricing now separates the currently advertised OS tiers from planned extensions.

## Authentication and OAuth
- Broker login remains authenticated with the TradingCore user before an OAuth flow starts.
- OAuth state is encrypted, short-lived, bound to the TradingCore user and broker, and now stored server-side as a one-time record.
- Callback consumption is atomic so the same OAuth state cannot be replayed.
- State validation rejects malformed, expired, future-dated, or already-consumed state.

## Broker sessions
- Supabase is authoritative for broker sessions in production.
- In-memory broker sessions are available only with an explicit development flag.
- Access and refresh tokens remain encrypted with AES-256-GCM.
- A missing/short `ENCRYPTION_SECRET` is a hard configuration error; there is no production fallback key.
- Access tokens are refreshed shortly before expiry when the broker supplies a refresh token.
- Refresh-token rotation preserves the existing encrypted refresh token if a broker does not return a replacement.

## Fyers safety boundary
- TradingCore no longer accepts a global `FYERS_PIN` environment variable for refresh-token rotation.
- Fyers sessions require broker re-authorization when refresh cannot be performed safely with the available user-specific flow.
- This avoids turning a user's trading PIN into a shared server credential.

## API hardening
- JSON request bodies are capped at 32 KB.
- Instrument subscription requests are bounded to 100 keys and 160 characters per key.
- Security response headers were strengthened.
- `/api/health` reports only non-secret configuration readiness and returns degraded status when required production configuration is missing.
- Broker order errors are surfaced as upstream/broker failures rather than generic server failures.

## Development/runtime
- `npm run dev` now starts the Express + Vite middleware server, so `/api/*` and the frontend use the same local runtime path.
- Node loads `.env` through `dotenv/config` for local server development.

## Remaining infrastructure work before a serious public trading launch
1. Put a persistent market-data gateway between broker WebSockets and horizontally scaled application instances; do not rely on a serverless process-local feed map as the long-term market-data architecture.
2. Add distributed rate limiting and abuse protection at the edge/API gateway.
3. Add structured audit logs for order intent, broker response, user ID, request ID, and idempotency key without logging credentials or tokens.
4. Add idempotency keys to order placement and an explicit duplicate-order policy.
5. Add server-side risk checks before every live order (max quantity, exposure, daily loss, kill switch, instrument/product validation).
6. Complete broker-specific conformance tests against sandbox/paper environments where available.
7. Add uptime/error monitoring and alerting for authentication, market data, and order routing.
8. Publish real Privacy Policy, Terms, Risk Disclosure, and broker-specific integration disclosures before public paid launch.

## September 1 UI/navigation pass
- Replaced the landing workspace SVG chart with an interactive Lightweight Charts showcase using candlesticks, volume, VWAP, price levels, projection, zoom/pan and crosshair behavior.
- Made landing navigation and protected-route Back/Forward behavior deterministic with SPA `popstate` synchronization.
- Replaced the broker setup page's `window.history.back()` dependency with an explicit Back to TradingCore action.
- Added real `/privacy` and `/terms` routes with safe return navigation.
- Removed stale product-version labels and duplicate workspace navigation entries.
- Removed unsupported latency wording from the broker setup UI.


## V5 broker-auth and API-version corrections

- Server-side TradingCore auth now validates Supabase access tokens using `SUPABASE_SERVICE_ROLE_KEY` (falling back to `SUPABASE_ANON_KEY`) so a correctly authenticated browser session is not rejected simply because the server lacks the public anon key. Missing server configuration now returns a clear 503 configuration error.
- Browser API calls now attempt a single Supabase session refresh when the access token is missing or near expiry.
- Upstox Fund & Margin now uses the official V3 endpoint.
- Upstox order placement/modify/cancel and Market Data Feed remain on the official V3 routes already supported by the integration.
- Upstox OAuth authorization remains on the broker's documented `/v2/login/authorization/*` endpoints; V3 is endpoint-specific rather than a universal replacement for every Upstox API.
- Upstox profile, holdings, and positions remain on their currently documented V2 endpoints.
- Fyers remains on API V3.
- The broker FAQ/labels now describe the versioning accurately.

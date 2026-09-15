# RELEASE v0.0.9 — Broker API Routing + Live Feed Recovery

## Root causes found

1. Vercel was explicitly configured as a Vite deployment while TradingCore also exposes a root Express server. Nested `/api/...` requests could therefore fall through to the SPA/Vercel page. The browser then attempted to parse the HTML page as JSON, producing:
   `Unexpected token 'T', "The page c..." is not valid JSON`.
2. The FYERS live transport was using the legacy `wss://api.fyers.in/socket/v2/data/` handshake. Current FYERS v3 data-socket implementations use the newer HSM-based WebSocket protocol, so the legacy handshake can return `Unexpected server response: 500`.

## Fixes

- Vercel now deploys the root Express `server.ts` backend instead of forcing the project through the Vite framework route.
- Removed duplicate `/api` catch-all function files so there is one authoritative Express API router.
- API 404s and unexpected API exceptions always return JSON; they can no longer become the SPA HTML page.
- API responses are marked `no-store` to avoid stale broker/API route responses.
- Upstox historical data therefore reaches the real Express route and the chart can receive real candles.
- FYERS legacy WebSocket HTTP-500 handshakes no longer leave the user permanently reconnecting. The transport falls back to the authenticated FYERS Quotes API at 1-second intervals and emits normalized ticks until the socket becomes available again.
- FYERS fallback uses the same authenticated broker session and does not switch to Upstox or any other broker.
- Broker-switch isolation remains enforced: historical cache, tick state, active market route, chart instance, portfolio synchronization, and late-frame rejection are broker-scoped.

## Verification

Static inspection completed after the patch. Full `npm ci`/production build could not be completed in this execution environment because dependencies were not installed and the earlier install attempt timed out. The deployment should run the repository's normal `npm run lint` and `npm run build` checks.

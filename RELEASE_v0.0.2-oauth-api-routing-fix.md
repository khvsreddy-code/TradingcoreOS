# TradingCoreOS v0.0.2 — OAuth/API routing fix

## Fix
The broker OAuth login request was returning HTTP 200 with the Vite SPA HTML instead of JSON. The frontend then reported:

`Broker authorization service returned an invalid response (200).`

Root cause: the previous Vercel routing config rewrote `/api/*` to `/api/index`, while the catch-all SPA rewrite could also consume API paths. The OAuth client correctly rejected the HTML response because it was not JSON.

## Changes
- Removed the `/api/* -> /api/index` rewrite. Vercel auto-detects `api/index.ts` as the Node/Express function.
- Changed the SPA fallback rewrite so it explicitly excludes `/api/*` paths:
  - `/:path((?!api/).*) -> /index.html`
- Kept the Vercel function auto-detection approach; no explicit `functions` block is used.
- No UI changes.
- No broker OAuth logic or credentials were changed.

## Expected result
`GET /api/auth/broker/login?broker=fyers` or `upstox` should reach the Express API function and return JSON instead of the Vite `index.html` document.

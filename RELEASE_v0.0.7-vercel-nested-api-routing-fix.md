# TradingCoreOS v0.0.7 — Vercel nested API routing fix

## Fix
Fixed broker OAuth returning `Broker authorization service returned an invalid response (404)` on Vercel.

## Root cause
The Vercel deployment was using the Vite frontend configuration plus a single `api/index.ts` function. That function only provides the `/api` function entry point; nested requests such as `/api/auth/broker/login` were not being routed to the Express application and could return a Vercel 404 HTML response.

## Changes
- Added `api/[...path].ts` as a Vercel catch-all function for nested `/api/*` paths.
- Reuses the existing Express `server.ts` application; no broker OAuth logic was changed.
- Preserves the existing `/api/auth/broker/*` and `/api/trading/*` route structure.
- No UI changes.
- No credentials or redirect URLs changed.

## Expected result
`GET /api/auth/broker/login?broker=fyers` should now reach `OAuthController.handleLogin` and return JSON containing the FYERS authorization URL instead of a Vercel 404 HTML response.

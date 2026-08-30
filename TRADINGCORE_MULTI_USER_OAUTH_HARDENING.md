# TradingCore OS — Multi-User Broker OAuth Hardening

This release makes the broker OAuth/session boundary user-scoped.

## User/account model

Each TradingCore customer authenticates to TradingCore with Supabase. When they click
Connect for Upstox or Fyers:

1. TradingCore backend reads the authenticated Supabase user ID from the bearer token.
2. The backend creates encrypted OAuth state containing the broker ID and that user ID.
3. The broker login opens using TradingCore's single registered application credentials.
4. The broker redirects to `/auth/broker-callback`.
5. The callback endpoint again authenticates the TradingCore user and verifies that the
   encrypted OAuth state belongs to that same user and broker.
6. The server exchanges the broker authorization code for that customer's broker token.
7. The token is AES-256-GCM encrypted and persisted in `public.broker_sessions` under
   `(user_id, broker_id)`.
8. All trading/account endpoints derive the user ID from the authenticated Supabase
   bearer token and load only that user's broker session.

The browser never supplies a trusted `user_id`, and broker client secrets never go to
the browser.

## Production environment

Required server-side variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_SECRET` (32+ characters)
- `UPSTOX_CLIENT_ID`
- `UPSTOX_CLIENT_SECRET`
- `UPSTOX_REDIRECT_URI=https://tradingcoreos.vercel.app/auth/broker-callback`
- `FYERS_CLIENT_ID`
- `FYERS_CLIENT_SECRET`
- `FYERS_REDIRECT_URI=https://tradingcoreos.vercel.app/auth/broker-callback`

`UPSTOX_CLIENT_ID/SECRET` and `FYERS_CLIENT_ID/SECRET` are TradingCore's broker-app
credentials. They are not customer credentials. Each customer authorizes their own
broker account through the broker's official OAuth page.

## Supabase

Run `supabase/broker_sessions.sql` in the production Supabase project.

Do not use the in-memory broker-session fallback in production. The repository now
fails closed when `NODE_ENV=production` and the server-side Supabase service-role
connection is missing.

## Important behavior

- No `default_user` remains in executable source.
- Backend trading routes do not accept or trust a browser `user_id`.
- OAuth state is checked against the authenticated TradingCore user.
- Broker disconnect deletes the authenticated user's server-side broker session.
- On login/reload, broker connections are rehydrated from the authenticated user's
  server-side sessions instead of treating localStorage as proof of connection.
- The onboarding UI exposes direct OAuth 2.0 as the live broker connection path.

## Verification

A TypeScript parse/typecheck was run against the project source. The only remaining
environment error in this checkout is the incomplete local dependency installation
(`vite/client` type definitions are absent); the edited TS/TSX files no longer produce
syntax errors.

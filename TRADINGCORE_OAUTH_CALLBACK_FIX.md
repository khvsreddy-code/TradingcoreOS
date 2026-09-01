# TradingCore OS — OAuth callback/session fix

## Exact production failure fixed

The broker callback page was calling `tradingApi('/api/auth/broker/callback')`.
`tradingApi` requires a TradingCore Supabase bearer session. The broker OAuth
popup is a separate browser context, so the callback could fail with:

`Authenticated TradingCore session required`

The backend callback route was also behind `requireUser`, creating the same
failure before the broker authorization code could be exchanged.

### New flow

1. A signed-in TradingCore user starts broker OAuth.
2. `/api/auth/broker/login` creates a short-lived encrypted state containing
   the TradingCore `userId`, broker ID, timestamp and nonce.
3. The user logs in on the broker's official page.
4. The broker redirects to:
   `https://tradingcoreos.vercel.app/auth/broker-callback`
5. The callback popup POSTs the broker code directly to
   `/api/auth/broker/callback` — it does not require a Supabase bearer token.
6. The server validates the encrypted state, derives the TradingCore user and
   broker from that state, exchanges the code server-side, encrypts the broker
   token, and stores it under `(user_id, broker_id)`.
7. The parent TradingCore window receives the success message and verifies the
   saved session using its normal authenticated TradingCore session.

No browser-supplied `user_id` is trusted.

## API version note

Do **not** change the Upstox OAuth authorization/token endpoints to v3 just
because Upstox has v3 trading APIs. Upstox's current OAuth authorization-code
flow still documents:

- Authorization: `https://api.upstox.com/v2/login/authorization/dialog`
- Token exchange: `https://api.upstox.com/v2/login/authorization/token`

TradingCore uses Upstox's current v3 HFT order endpoints for live order
operations, including `/v3/order/place`, `/v3/order/modify`, and
`/v3/order/cancel`.

FYERS uses its API v3 OAuth endpoints, including
`https://api-t1.fyers.in/api/v3/generate-authcode` and
`https://api-t1.fyers.in/api/v3/validate-authcode`.

## Multi-user association

The broker app credentials belong to TradingCore's broker application.
Customers do not enter TradingCore's broker client secret. Each customer logs
into their own Upstox/FYERS account, and the resulting broker token is stored
against that customer's authenticated TradingCore user ID.

For FYERS specifically, multi-customer/third-party trading availability is
subject to FYERS approval, app type, and current API/algo compliance rules.
The code can keep users isolated, but broker-side approval is still required
for a production platform integration.

## Deployment checklist

Set these in Vercel Production:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_SECRET`
- `UPSTOX_CLIENT_ID`
- `UPSTOX_CLIENT_SECRET`
- `UPSTOX_REDIRECT_URI=https://tradingcoreos.vercel.app/auth/broker-callback`
- `FYERS_CLIENT_ID`
- `FYERS_CLIENT_SECRET`
- `FYERS_REDIRECT_URI=https://tradingcoreos.vercel.app/auth/broker-callback`

Run `supabase/broker_sessions.sql` in the production Supabase project.

Register the exact callback URL in each broker app.

Redeploy after changing environment variables.

## FYERS v3 correction included

The FYERS `appIdHash` is now generated as:

`SHA256("<APP_ID>:<SECRET_ID>")`

The FYERS v3 REST requests also send the explicit `version: 3` header.

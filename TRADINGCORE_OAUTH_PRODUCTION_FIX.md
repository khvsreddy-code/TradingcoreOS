# TradingCore OS — OAuth production fix

## What was wrong

1. The browser constructed `redirect_uri` from `window.location.origin` and sent it to the backend.
2. The backend accepted a query/body `redirect_uri`, so a Vercel preview/staging origin could be sent to the broker.
3. The production serverless entry was duplicated instead of importing the hardened Express server entry.
4. Broker sessions could fall back to Supabase anon-key storage, which is not suitable for server-side persistence under RLS.
5. An obsolete server OAuth implementation generated simulated tokens and was not the live route.

## Fixed behavior

- Production callback is server-configured:
  - `https://tradingcoreos.vercel.app/auth/broker-callback`
- The browser no longer chooses the broker redirect URI.
- The server uses `UPSTOX_REDIRECT_URI` or `FYERS_REDIRECT_URI`.
- OAuth state is still bound to the authenticated TradingCore user and broker.
- Broker tokens remain server-side and encrypted.
- Supabase service-role storage is used for broker sessions; never expose the service-role key to the browser.
- The obsolete simulated OAuth service was removed.

## Required Vercel variables

Browser:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Server:
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

Do not prefix broker secrets with `VITE_`.

## Broker setup

The OAuth app/client belongs to TradingCoreOS. Each customer logs into their own broker account at the broker's official login page. The resulting broker access token is stored under that customer's Supabase user ID.

Upstox: standard OAuth 2.0 authorization-code flow.

FYERS: standard FYERS user-app auth flow, but a production multi-customer trading platform must use the broker-approved third-party/platform setup and comply with FYERS' current retail-algo requirements.

## Deployment

1. Configure the variables above in Vercel Production.
2. Run `supabase/broker_sessions.sql` in the production Supabase project.
3. Register exactly:
   `https://tradingcoreos.vercel.app/auth/broker-callback`
   in each broker app.
4. Redeploy.
5. Sign into TradingCoreOS first.
6. Click Connect → Upstox/FYERS.
7. Complete the broker login in the broker-hosted popup.
8. The callback must return to TradingCoreOS and the server must persist the session for that TradingCore user.

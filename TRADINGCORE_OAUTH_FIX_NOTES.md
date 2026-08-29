# TradingCore OAuth Fix Notes

This build fixes the broker OAuth connection flow for the Vercel deployment.

## What changed

- FYERS OAuth now uses the real v3 authorization-code validation endpoint.
- FYERS uses SHA-256(app ID + app secret) server-side; secrets are never entered in the browser.
- FYERS callbacks accept `auth_code`.
- OAuth callback broker identity can be recovered from the encrypted OAuth state, so the registered callback URL remains exact:
  `https://tradingcoreos.vercel.app/auth/broker-callback`
- The "Developer Portal" link and custom "App Key / Client ID" field were removed from the OAuth screen.
- Broker OAuth verification is server-side for both Upstox and FYERS.
- Broker portfolio sync no longer fails the entire connection when one endpoint is temporarily rate-limited.
- FYERS REST adapter includes profile, funds, holdings, positions, orders, trades, quotes, history, place/modify/cancel order plumbing.

## Required Vercel server environment variables

Set these as server-side variables (not VITE_ variables):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ENCRYPTION_SECRET` (32+ characters)
- `FYERS_CLIENT_ID`
- `FYERS_CLIENT_SECRET`
- `FYERS_REDIRECT_URI=https://tradingcoreos.vercel.app/auth/broker-callback`

`FYERS_PIN` is only needed if refresh-token rotation is enabled.

For Upstox:

- `UPSTOX_CLIENT_ID`
- `UPSTOX_CLIENT_SECRET`
- `UPSTOX_REDIRECT_URI=https://tradingcoreos.vercel.app/auth/broker-callback`

The broker's own developer/API dashboard must have the exact callback URL registered. Do not paste broker secrets into the browser UI.

## Important

The FYERS API currently has regulatory/static-IP requirements for live order placement. The broker app must be activated/configured for trading according to FYERS' current requirements.

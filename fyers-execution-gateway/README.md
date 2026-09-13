# FYERS fixed-IP execution gateway

This tiny service exists only for live FYERS order placement. FYERS requires order requests to originate from a whitelisted static IP under the post-April-1-2026 retail-algo rules.

## Deploy

Run this on a small VPS/cloud VM with a fixed public IPv4 address. Do **not** deploy this gateway to Vercel unless you have Vercel Static IPs enabled.

```bash
export FYERS_GATEWAY_SECRET='long-random-secret'
node server.mjs
```

Or with Docker:

```bash
docker build -t tradingcore-fyers-gateway .
docker run -d --restart unless-stopped \
  -p 8787:8787 \
  -e FYERS_GATEWAY_SECRET='long-random-secret' \
  tradingcore-fyers-gateway
```

Put HTTPS in front of it with Caddy/Nginx or a managed TLS proxy. Restrict port 8787 at the firewall if your reverse proxy runs on the same VM.

## TradingCore server settings

Set these environment variables on the TradingCore server/Vercel project:

- `FYERS_EXECUTION_GATEWAY_URL=https://your-gateway.example.com`
- `FYERS_EXECUTION_GATEWAY_SECRET=<same random secret>`

Then whitelist the VPS public static IPv4 in the FYERS API dashboard and use the new FYERS API app credentials (the post-April-2026 app). The gateway must remain the only service that sends FYERS order POSTs.

The gateway never logs the access token or order payload.

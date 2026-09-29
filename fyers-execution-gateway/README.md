# FYERS fixed-IP execution gateway

This tiny service exists only for live FYERS order placement. It should run behind a fixed public IPv4 address that has been allowlisted by FYERS.

## Security model

TradingCore authenticates gateway requests with HMAC-SHA256 over:

```text
METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256(BODY)
```

The gateway rejects stale timestamps and replays the same nonce only once. Access tokens and order payloads are never logged.

Optional legacy static-secret compatibility can be enabled temporarily with `FYERS_GATEWAY_ALLOW_LEGACY_SECRET=true`; keep it disabled for normal operation.

## Deploy

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

Put HTTPS in front of it with Caddy/Nginx or a managed TLS proxy. Restrict port 8787 at the firewall when possible.

## TradingCore server settings

- `FYERS_EXECUTION_GATEWAY_URL=https://your-gateway.example.com`
- `FYERS_EXECUTION_GATEWAY_SECRET=<same random secret>`
- `FYERS_GATEWAY_MAX_SKEW_MS` (optional, default `60000`)
- `FYERS_GATEWAY_UPSTREAM_TIMEOUT_MS` (optional, default `8000`)

The gateway should remain the only service that sends FYERS order POSTs.

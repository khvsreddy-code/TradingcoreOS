# FYERS fixed-IP execution gateway

This tiny service exists only for live FYERS order placement. It should run behind a fixed public IPv4 address that has been allowlisted by FYERS.

## Security model

TradingCore authenticates gateway requests with HMAC-SHA256 over:

```text
METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256(BODY)
```

The gateway rejects stale timestamps and replayed nonces. For every live order it also requires a short-lived execution context produced by the trusted TradingCore server. The context must carry an explicit risk approval, decision/strategy identifiers, an expiry, a maximum quantity, and a SHA-256 hash of the exact order; the gateway checks these before contacting FYERS. Access tokens and order payloads are never logged.

The current context gate is a **baseline pre-trade boundary**, not a substitute for a portfolio-aware risk engine. Strategy automation must only set `riskApproved` after the actual strategy and risk pipeline has approved the exact order. Do not let browser clients construct this context or expose the gateway secret.

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
- `FYERS_GATEWAY_MAX_ORDER_QUANTITY` (optional, default `1000`; configure to your permitted account/instrument limits)
- `FYERS_GATEWAY_CONTEXT_TTL_MS` (optional, default `30000`, clamped to 5–60 seconds; set the same value on both the TradingCore server and the gateway)

The gateway also enforces a maximum of 10 order requests per rolling second per account, removes expired rate-window entries, and forces `offlineOrder=false`. FYERS order placement fails closed when the fixed-IP gateway URL or shared secret is missing; it must not fall back to direct serverless broker egress. FYERS applies MPP treatment to market orders; the gateway leaves market-order pricing behavior to FYERS rather than pretending to implement broker-side MPP itself. The trusted TradingCore server and gateway must use matching quantity limits.

The gateway should remain the only service that sends FYERS order POSTs.

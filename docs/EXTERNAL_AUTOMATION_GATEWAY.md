# External AI & Automation Gateway

TradingCoreOS can expose allowlisted market context, CoreSpirit signal events, and risk-gated order requests to an external workflow platform (for example, n8n or a private automation service) without bundling a large AI model into the terminal. The external workflow never receives a FYERS access token. Live orders pass back through the same server-side risk checks, persistent idempotency ledger, fixed-IP execution gateway, and FYERS order-state reconciler used by TradingCoreOS.

## Deployment prerequisites

1. Apply `supabase/migrations/20261016130000_external_automation_gateway.sql` after the base schema and FYERS order-reconciliation migration. The migration creates the credential, signal, and order-request ledgers plus an atomic idempotency/daily-cap claim RPC. The tables are RLS-enabled, have no browser policies, and grant data access only to `service_role`.
2. Configure `SUPABASE_URL` and a server-only `SUPABASE_SERVICE_ROLE_KEY` (or the supported server secret key) on the API deployment. The API deliberately fails closed if durable storage is unavailable.
3. Configure the existing FYERS fixed-IP execution gateway (`FYERS_EXECUTION_GATEWAY_URL` and `FYERS_EXECUTION_GATEWAY_SECRET`) before live orders can be requested. The API will never fall back to serverless egress for live order placement.
4. Configure `TCO_CORESPIRIT_SIGNAL_SECRET` with at least 32 random characters in server secrets only. It is used by the trusted server-side CoreSpirit signal producer at `POST /api/automation-gateway/internal/v1/signals`; do not put this secret in a browser bundle, frontend environment variable, or external AI workflow.
5. Reconnect FYERS and validate the broker's quote, funds, positions and `/multiorder/margin` response for the account and segment before enabling live permission.

## Create a scoped credential

Sign in to TradingCoreOS and open **Automation Center → External AI & automation gateway**. Save an automation to the cloud first, select it, configure its allowed symbols and risk caps, select the required scopes, and create a credential. The full bearer token is shown once. Store it in the automation provider's server-side secret store. TradingCoreOS persists only the SHA-256 token hash and a short display prefix.

Management API, authenticated using the user's Supabase bearer session:

- `GET /api/automation-integrations/automations` — list automations owned by the user.
- `GET /api/automation-integrations` — list credential metadata (never returns tokens).
- `POST /api/automation-integrations` — create a credential.
- `DELETE /api/automation-integrations/:integrationId` — revoke it immediately.

Example request body for credential creation:

```json
{
  "automationId": "YOUR-CLOUD-AUTOMATION-UUID",
  "name": "NIFTY research workflow",
  "brokerId": "fyers",
  "allowedSymbols": ["NSE:NIFTY50-INDEX", "NSE:NIFTYBANK-INDEX"],
  "scopes": ["market:read", "signals:read", "orders:request"],
  "maxOrderQuantity": 20,
  "maxOrderNotional": 50000,
  "maxPositionNotional": 100000,
  "maxDailyOrders": 10,
  "marginBufferPercent": 15,
  "allowLiveOrders": false,
  "expiresInDays": 30
}
```

The API validates caps and scopes. Live permission defaults to `false`. The user can revoke any credential, and expiry is limited to 1–90 days. Create a new credential to rotate a token; do not attempt to retrieve an old token.

## External workflow endpoints

Use `Authorization: Bearer <one-time-integration-token>` for all gateway endpoints. These routes accept the scoped automation credential, not a user's Supabase session.

### Market context

`GET /api/automation-gateway/v1/context?symbols=NSE:NIFTY50-INDEX,NSE:NIFTYBANK-INDEX`

Returns fresh quotes for allowlisted symbols plus the linked automation's lifecycle and the credential's configured caps. Request 1–50 symbols at a time; pagination is available with `offset`. Account tokens, broker session data and unrestricted portfolio records are not returned.

### Signal feed

`GET /api/automation-gateway/v1/signals?limit=50`

Polls durable signals by integration. The initial poll returns the most recent bounded window in chronological order; pass the returned `nextCursor` as `after` on subsequent polls. Deduplicate by `eventId`.

A browser-authenticated signal publish endpoint exists for paper/backtest/historical events, but it rejects user-supplied `realtime` events. A live-order signal must originate from the trusted server-side CoreSpirit producer, not an editable browser payload.

### Trusted CoreSpirit signal ingress (server-to-server only)

`POST /api/automation-gateway/internal/v1/signals`

This endpoint requires `TCO_CORESPIRIT_SIGNAL_SECRET` and the headers:

- `x-tco-signal-timestamp`: a 13-digit epoch-millisecond timestamp, within 60 seconds of server time.
- `x-tco-signal-signature`: lowercase hex HMAC-SHA256 of `<timestamp>\n<canonicalSha256(body)>`.

Canonical JSON recursively sorts object keys before JSON serialization; `canonicalSha256(body)` is SHA-256 hex of that string. The request body is limited to 8 KiB and must contain:

```json
{
  "integrationId": "YOUR-INTEGRATION-UUID",
  "eventId": "unique-core-spirit-event-id",
  "eventType": "BUY",
  "symbol": "NSE:NIFTY50-INDEX",
  "timeframe": "5",
  "sourceId": "your-core-spirit-script-id",
  "runId": "live-runtime-session-id",
  "programChecksum": "8-or-more-hex-characters",
  "mode": "realtime",
  "barIndex": 12345,
  "timestamp": 1792153300000,
  "payload": { "reason": "validated CoreSpirit signal" }
}
```

The producer must send this from trusted server execution, using its server-held secret. Event IDs are unique per integration and request retries are idempotent. Never copy the secret into the frontend. Historical and paper events do not qualify as live-trading authorization.

### Request an order

`POST /api/automation-gateway/v1/orders`

Required headers:

```
Authorization: Bearer <integration-token>
Content-Type: application/json
Idempotency-Key: unique-workflow-request-id
```

Use a stable, unique key for each logical order decision. When a workflow times out, retry the **same key and same body**. Never generate a new key merely because the HTTP response was slow.

Paper request example:

```json
{
  "mode": "PAPER",
  "signalId": "unique-core-spirit-event-id",
  "order": {
    "symbol": "NSE:NIFTY50-INDEX",
    "quantity": 1,
    "side": "BUY",
    "orderType": "MARKET",
    "product": "MIS"
  }
}
```

Paper requests record a validated simulation decision and explicitly return `orderSubmitted: false`; they do not call the broker order endpoint.

Live requests use `"mode": "LIVE"`. When a request includes `signalId`, it must reference a recent server-authenticated `realtime` signal for the same integration and symbol, and the signal side must agree with the order. A direct AI decision may omit `signalId`, but receives no safety exemption: live orders are rejected unless **all** of the following are true:

- the credential was explicitly created with `allowLiveOrders: true`;
- the saved automation's lifecycle is `LIVE`, `allow_order_execution=true`, and `require_confirmation=false`;
- the FYERS fixed-IP gateway is configured;
- the integration symbol and quantity/notional/exposure limits pass;
- a fresh FYERS quote, funds and positions snapshot is available;
- broker-calculated required margin plus the configured safety buffer fits within available margin;
- the durable request and risk audit records can be written.

The API does not accept a risk approval supplied by the workflow. It derives the risk verdict on the server using the current request, broker/account snapshots and stored integration policy.

### Read order status

`GET /api/automation-gateway/v1/orders/:externalRequestId`

This reads the durable automation request and reconciled broker state when available. Reuse the original `Idempotency-Key` as the request ID. If the order-placement HTTP call timed out before the broker order ID was returned, status lookup also searches by the deterministic client order ID written before submission. A response with `reconciliationPending: true` means the broker result is not yet visible in the canonical state store; do not retry with a new key. Poll this endpoint or reconcile the FYERS order book/trade book first.

## Idempotency and order semantics

- The database atomically claims `(integration_id, external_request_id)` while locking the integration row. Reusing a key with a different request hash returns `409`; an existing request is returned without another broker call.
- A per-integration UTC-day cap is reserved atomically. It applies to all live-mode attempts for that credential, including risk-denied attempts, so retries cannot evade the daily cap by changing a terminal state.
- TradingCoreOS also claims its existing persistent broker idempotency record, generates a deterministic internal client order ID, records `INTENT` and `SUBMITTED`, and sends the deterministic client tag through the fixed-IP gateway.
- Broker timeout or uncertain acceptance becomes `UNKNOWN` / `RECOVERY_REQUIRED`. Those states are not retried automatically; reconcile with FYERS orders/trades first.
- A success response with `state: "ACKNOWLEDGED"` means the broker accepted the request, **not** that it filled. Partial fill, fill price, cancel, rejection and terminal state are sourced from the existing FYERS order WebSocket/REST reconciliation.
- Audit records include request/event correlation IDs, risk checks and the client/broker order identifiers. Credentials and broker access tokens are never written to the external response payload.

## Security boundary

External automation is a requestor, not the execution authority. It can read only the capabilities explicitly granted by its token and can ask for an order, but it cannot supply its own risk verdict, omit idempotency, change its symbols/caps, or call a browser broker adapter directly. The server re-loads automation ownership and lifecycle on each request, and the existing broker state engine remains the canonical order-state source.

Run `npm run test:contracts`, `npm run typecheck`, and `npm run build` after applying the migration and configuring deployment secrets. Verify the relevant FYERS margin payload against a paper account first; unavailable or unrecognized margin results fail closed rather than allowing live submission.

# Phase 13 — Security, Reliability & Execution Efficiency

## Security implemented
- Broker access tokens are encrypted in process memory when `TOKEN_ENCRYPTION_KEY` is configured with a Fernet key.
- Tokens are never returned by API responses; a short fingerprint is retained only for diagnostics.
- Opaque, high-entropy session identifiers replace predictable UUID hex IDs.
- Rate limiting protects HTTP endpoints against basic burst abuse.
- Security headers: CSP, frame denial, MIME sniffing protection, strict referrer policy, restrictive permissions policy, and same-origin isolation headers.
- Sensitive API responses are marked `no-store, private`.
- Live orders still require a broker session and server-side contract/risk/idempotency validation.

## Reliability/UI
- Repaired optional-control null crashes that could stop later button wiring.
- Added guarded async button state, duplicate-click protection, toasts and resilient overlay dismissal.
- Wired CE/PE order actions to the backend order endpoint with LIVE confirmation.
- Theme selection persists locally.
- Limit-price control now responds to order type.
- Added browser-frame scheduling helper for high-frequency UI work.

## Latency reality
TradingCore can reduce *its own* overhead by keeping WebSockets persistent, avoiding page reloads, batching/coalescing UI work, caching candles, and measuring broker round-trip latency. It cannot honestly guarantee execution faster than the broker/exchange, because final order acceptance and exchange routing occur outside this application.

## Production configuration
Set a valid `TOKEN_ENCRYPTION_KEY` in the server environment before production. Use a managed secret store, HTTPS/WSS, authenticated application users, and user-to-broker-session ownership checks backed by persistent storage. Do not expose broker client secrets or token-encryption keys to the browser.

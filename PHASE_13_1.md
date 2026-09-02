# V30.3 — Execution Path & Overall Optimization

- Persistent HTTP connection pooling for Upstox adapter.
- Fixed encrypted-token contract resolution bug.
- Fixed null optional-control crash that could halt all frontend initialization.
- Added bounded rate limiter and optional trusted-proxy mode.
- Request-size guard, conditional HSTS, and production encryption requirement flag.
- Added latency endpoint and order hot-path timing.
- Non-blocking audit hook that never records access tokens.
- rAF-coalesced high-frequency chart rendering, fetch timing, and account reconnect backoff.

Latency is measured separately from broker round-trip; broker/exchange latency is not bypassed.

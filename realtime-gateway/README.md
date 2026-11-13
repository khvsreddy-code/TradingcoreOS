# TradingCoreOS realtime gateway

This service owns long-lived FYERS realtime connections. It is intentionally outside the Vercel request/response function.

## Topology

```text
Browser
  │
  │ HTTPS request for short-lived ticket
  ▼
Vercel request plane
  │
  │ signed ticket
  ▼
Realtime gateway /ws
  │
  ├── Redis owner election + subscriptions
  ├── one FYERS owner per user
  └── Redis Pub/Sub fanout
       │
       ▼
Browser clients on any gateway instance
```

## Required environment

```text
REALTIME_GATEWAY_PORT=8080
REALTIME_GATEWAY_SHARED_SECRET=<same secret used by Vercel>
REALTIME_REDIS_REST_URL=<Upstash REST endpoint>
REALTIME_REDIS_REST_TOKEN=<Upstash server token>
SUPABASE_URL=<TradingCore Supabase URL>
SUPABASE_SERVICE_ROLE_KEY=<server-side Supabase key>
FYERS_CLIENT_ID=<server-side FYERS app id>
```

The Redis token and realtime shared secret are server secrets. Do not expose either to browser code.

## Deployment

Build the repository with the root Node 24 runtime and start:

```text
npm install --no-audit --no-fund
npm run realtime:gateway
```

Expose `/ws` for WebSocket upgrades and `/healthz` for load-balancer health checks.

## Ownership model

A Redis key `tco:realtime:owner:<userId>` elects exactly one gateway instance as the FYERS broker-socket owner for that user. The owner renews the lease every 5 seconds with a 15-second TTL. If the owner disappears, another gateway can acquire the lease after expiration.

Browser subscriptions are short-lived Redis records with heartbeats. This means a connection can reconnect onto another gateway instance without losing the desired symbol set.

## Safety model

Redis is coordination state, not the durable system of record. Broker sessions and application state remain in Supabase. The gateway may safely lose all local maps and reconstruct broker subscriptions from Redis when a process restarts.


## Outbound backpressure and delivery policy

Each browser WebSocket has two independent outbound lanes:

- **Market price ticks:** latest-value queue keyed by instrument. A newer quote replaces an unsent quote for the same instrument. The queue is capped at 128 instrument keys / 1 MiB of queued wire data (subscriptions themselves are capped at 100).
- **Reliable events:** strict FIFO for order updates, trades/fills, position/funds updates, market status, errors and control messages. These events are never coalesced. The queue is capped at 256 messages / 1 MiB; if the client cannot drain it, the gateway closes that socket with WebSocket code `1013` and the reconnect path must resynchronize state. This is an explicit slow-consumer failure, not a silent drop.

The gateway checks `bufferedAmount` before sending. It starts applying backpressure at 512 KiB and disconnects a socket if the buffered amount reaches 2 MiB or remains above the soft watermark for 4 seconds. A bounded 20 ms scheduler drains queued messages, prioritizing reliable events while preserving their FIFO order.

The event JSON is serialized once per user broadcast and the exact wire string is shared across matching sockets. `/healthz` reports per-client reliable/market queue depths, queued bytes, `bufferedAmount`, slow-client disconnects, coalesced/dropped quote counts, send errors and bounded per-user fan-out/write latency aggregates. User identifiers are HMAC-redacted before appearing in telemetry.

Fan-out latency measures server-side enqueue time; socket-write latency measures time until the WebSocket library reports the frame written to its underlying transport. Neither is a client acknowledgement. Order-state correctness continues to rely on the existing sequenced order event stream and REST reconciliation/snapshot path.

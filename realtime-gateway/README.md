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

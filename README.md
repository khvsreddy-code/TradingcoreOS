# TradingCoreOS

**Current packaged build:** v1.3.0 — Account Selection & Persistence

See `CHANGELOG.md` for the exact changes in this version.


TradingCoreOS is a broker-connected trading workspace for Indian markets, with live charts, broker-aware market data, option-chain/OI analytics, indicators, automation templates, portfolio analytics, and broker execution.

## Architecture

- React + TypeScript + Vite frontend
- Express API deployed on Vercel
- Supabase authentication and persistent broker sessions
- Broker adapters for Upstox and FYERS
- Broker-specific WebSocket feeds and historical data
- Active-broker routing for market data, history, portfolio, funds, orders, and execution
- Incremental live updates with reconnect handling

## Broker/account isolation

Upstox and FYERS are independent account/data sources. When multiple accounts are connected, the selected **PRIMARY** broker is the active route. Switching the primary broker immediately changes live market data and account-state requests. Late responses from a previous broker must never overwrite active-broker state.

Broker access tokens remain server-side and are encrypted at rest. Browser storage is only a preference for the already-authenticated primary broker; it is never treated as proof of authentication.

## Market-data pipeline

Live ticks use broker WebSockets. REST is used for snapshots and historical data. Intraday charts are session-aware and use the current India trading date; the live feed updates the unfinished candle. Historical responses are broker-scoped and briefly cached to reduce repeated navigation/chart requests without hiding meaningful market changes.

Available data includes ticks, OHLCV candles, volume, market depth, option-chain/OI, VWAP, ATR, session structure, levels, positions, holdings, orders, trades, and funds.

## Derived analytics

The existing runtime can derive:

- Trend/regime and volatility state
- VWAP and ATR context
- Session highs/lows and structure levels
- OI strength, ΔOI pressure, PCR, OI walls, OI flips and max-pain context
- Support/resistance candidates from price structure and OI
- Portfolio/day P&L and rolling broker-snapshot history
- Automation signal inputs and execution telemetry

Future derived services can add liquidity/imbalance scores, execution-quality metrics, stale-feed detection, anomaly detection, signal confidence, and cross-timeframe context without changing the UI.

## Performance principles

1. Use persistent WebSocket streams for live data instead of high-frequency REST polling.
2. Deduplicate identical in-flight requests.
3. Scope caches by broker, instrument and timeframe; invalidate on broker/session changes.
4. Abort or discard stale requests after broker/symbol/timeframe changes.
5. Coalesce high-frequency tick updates before React renders.
6. Keep expensive analytics out of navigation and render-critical paths.
7. Code-split heavy workspace modules so navigation does not download the chart engine when it is not needed.
8. Batch independent broker snapshot calls when a single fast snapshot endpoint is unavailable.
9. Keep Vercel execution in `bom1` for proximity to Indian broker infrastructure.
10. Measure broker RTT, feed reconnects, stale ticks, request failures, and order latency rather than guessing about performance.

TradingCoreOS cannot guarantee lower execution latency than a broker's own native terminal because exchange/broker gateways remain in the execution path. The objective is to minimize latency added by TradingCoreOS itself.

## Safe engineering constraint

**Do not redesign or rearrange the existing UI unless explicitly requested.** Performance, data-quality, broker-routing, caching, and analytics improvements should be implemented underneath the existing UI contracts.

## Security

- Non-custodial broker integration
- No broker trading PINs stored by TradingCoreOS
- Broker tokens encrypted at rest with AES-256-GCM
- Server-side broker sessions keyed to the authenticated TradingCore user
- Supabase row-level security for user-owned profile/workspace data

## Local development

Use the project's existing npm scripts. Configure the required Supabase, Upstox, FYERS, and encryption environment variables for the target environment. Production deployment is handled by Vercel from the `main` branch.

## Production configuration

Typical server/client variables include:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
UPSTOX_CLIENT_ID=your-upstox-client-id
UPSTOX_CLIENT_SECRET=your-upstox-client-secret
UPSTOX_REDIRECT_URI=https://your-domain/auth/broker-callback
FYERS_CLIENT_ID=your-fyers-app-id
FYERS_CLIENT_SECRET=your-fyers-app-secret
FYERS_REDIRECT_URI=https://your-domain/auth/broker-callback
ENCRYPTION_SECRET=use-a-long-random-secret
```

Never commit real credentials or production secrets.

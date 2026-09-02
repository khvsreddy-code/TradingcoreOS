# TradingCore OS — Vercel Performance / Deployment Checklist

## Vercel Build & Deployment page

Leave these fields as Vercel auto-detects them from `package.json`:

- Framework Preset: **Vite**
- Build Command: **leave blank**
- Output Directory: **leave blank**
- Install Command: **leave blank**
- Development Command: **leave blank**
- Root Directory: `./`

`vercel.json` explicitly pins the framework to Vite and the API Function region to `bom1` (Mumbai). That file therefore controls the region even if the dashboard still shows an older project-level region.

## Required environment variables

Keep the existing production environment variables already used by the project, including the Vite Supabase variables and the server-side broker/encryption variables. Do not put broker client secrets or access tokens in `VITE_*` variables.

After changing an environment variable, redeploy.

## What was optimized

- Google/Supabase session recognition no longer waits on a profile DB query.
- Removed the artificial 400 ms auth delay.
- Broker restoration runs in the background and is shared/deduplicated.
- Clicking Launch Platform is an in-memory route change when the broker is already restored.
- OAuth callback no longer performs a second five-endpoint broker verification before showing the ready screen; it confirms the persisted session with one session lookup.
- Portfolio data uses one authenticated snapshot request and parallel broker reads.
- Portfolio/positions/orders/funds update automatically every 5 seconds while the workspace is open; manual Sync remains available.
- Live market data remains stream-based; the browser does not open the broker socket directly.
- Live chart indicators are not fully rebuilt on every tick. Rebuilds happen on new candles; analytics are throttled.
- OI lines are refreshed from the broker option chain periodically, while spot-driven OI wall state updates happen from live ticks.
- Synthetic/random latency values were removed. The workspace header shows measured API RTT.
- Restored broker adapters are now registered with the trading engine and marked authenticated, fixing the post-refresh restored-session execution path.

## Important latency reality

Vercel can reduce latency by placing the Function close to the broker/data dependencies, but it cannot guarantee exchange/broker-grade execution latency. The lowest-latency production architecture is: Vercel for the static/UI layer + a persistent Mumbai-region execution/market-data gateway for broker traffic.

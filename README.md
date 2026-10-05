# TradingCoreOS

TradingCoreOS is a **CoreSpirit-first trading platform + modified Vela chart engine + TCO-owned market data, compute and broker systems**.

## Simple architecture

```
Fyers / TCO data
      ↓
Canonical columnar market data
      ↓
CoreSpirit compute
      ↓
RenderPacket / chart patches
      ↓
TCO Vela adapter
      ↓
Modified Vela native renderer
```

## Locked decisions

- CoreSpirit is the only TradingCoreOS scripting language.
- No PineScript, PineTS or Pine compatibility layer.
- Vela is the production chart renderer behind the TCO chart contract.
- Initial history is 5,000 candles; older demand pages are 5,000.
- Live candles use append / replace-last mutations.
- Compatible CoreSpirit series chains use one chronological fused traversal with bounded state.
- SharedArrayBuffer is deferred until ownership and revision rules are proven.

## Documentation

Start with [docs/README.md](docs/README.md). The documentation is grouped into four canonical batches.

## CoreSpirit example

```corespirit
data market = market("NSE:NIFTY50-INDEX", "5m")

let fast = ema(close, 20)
let slow = ema(close, 50)

when fast > slow
  show line(fast, "Fast", "#7c5cff", 2)

show line(slow, "Slow", "#94a3b8", 2)
```

Think **DATA → LET → WHEN/IF → SHOW** first. MODEL and AUTOMATE are advanced layers.

## Performance rule

Keep typed arrays canonical. Ordinary candle objects are compatibility boundaries, not the preferred hot path.

## Runtime architecture

TradingCoreOS separates the short-lived request plane from the realtime plane:

```text
                         ┌────────────────────┐
                         │      Vercel CDN    │
                         │   web application   │
                         └──────────┬─────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
              request plane                   realtime plane
                    │                               │
              Vercel Functions              realtime gateway
                    │                               │
             auth / REST / DB                Redis coordination
                    │                               │
                broker APIs                     FYERS
                    │                               │
             bounded responses              normalized ticks
                    │                               │
                    └──────────── canonical data ──┘
                                     │
                              CoreSpirit / Vela
```

Vercel is the control/request boundary. Long-lived broker WebSockets are owned by the dedicated realtime gateway, with Redis used for cross-instance ownership, subscription metadata and event fanout. Supabase remains the durable system of record.

During rollout, the browser can fall back to the bounded legacy HTTP stream when the realtime gateway is not configured.

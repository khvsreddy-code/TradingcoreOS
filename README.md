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

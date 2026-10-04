# CoreSpirit v26 — rich data/execution contract

CoreSpirit v26 deliberately separates **language capability** from **data transport**.

## Data access

```corespirit
nifty = request("NSE:NIFTY", "5", "close")
micro = lowerTf("1", "close")
delta = footprintDelta()
imbalance = depthImbalance()
```

The runtime never opens a broker socket or performs HTTP. A host adapter implements `CoreSpiritDataResolver` and may source values from cache, REST, WebSocket aggregation, Supabase snapshots, or another permitted provider.

## Footprint

The normalized footprint contract contains bar-level buy/sell/delta/POC/VAH/VAL plus optional rows. This mirrors the useful conceptual surface of modern footprint APIs while remaining provider-neutral.

## Granular execution

`executeTick()` lets the same VM evaluate an open bar repeatedly. Execution context includes an explicit policy so later replay/backtest engines can distinguish bar-close, realtime-tick and historical-tick semantics.

## Editor ergonomics

`languageService.ts` exposes dependency-free completions, signatures, formatting and structured diagnostics. It is intentionally a service layer so the React coder can later replace it with incremental parsing without changing the VM contract.


## v26 deepening

### Quote/depth snapshot

```corespirit
b = bid()
a = ask()
spread = spread()
mid = mid()
```

### Intrabar aggregation

```corespirit
count = intrabarCount("1")
volume = intrabarSum("1", "volume")
hi = intrabarHigh("1", "high")
lo = intrabarLow("1", "low")
delta = intrabarDelta("1")
```

### Footprint rows

```corespirit
rows = footprintRows()
poc = footprintPoc()
rowDelta = footprintRowDelta(0)
rowImbalance = footprintRowImbalance(0)
```

These functions intentionally expose scalar projections first. CoreSpirit will add first-class collections later, once arrays/objects are part of the language rather than pretending a provider payload is already a safe language value.

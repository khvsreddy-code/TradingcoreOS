# v115 — Canonical MarketData Transport and Vela Workspace

Date: 2026-10-04

## What changed

v115 is a consolidation release. It does not add another market-data runtime or another scripting runtime. It tightens ownership around the existing canonical market-data plane and activates the vendored Vela multi-chart workspace that was already present in the repository.

## 1. Main-thread data path

Before this pass, the canonical store existed but several hot paths still carried `HistoricalCandle[]` through chart coordination and worker messages.

The new path is:

```text
Broker/history
    ↓
ChartDataPlane
    ↓
normalized HistoricalCandle[]          ← current external broker ABI
    ↓ direct write
CanonicalDataPlane / MarketDataStore
    ↓
CanonicalMarketView
    ├── worker packet transport
    ├── analytics
    ├── indicator compute
    └── Vela adapter
```

The second `MarketDataPoint[]` allocation pass was removed. `MarketDataStore.replaceHistoricalCandleRows()` writes normalized OHLCV rows directly into its typed columns.

## 2. Worker transport

The new `CanonicalMarketDataPacket` contains six bounded `Float64Array` channels:

```text
time open high low close volume
```

The coordinator creates a bounded packet and transfers the underlying six `ArrayBuffer`s to the worker. This means:

- no structured-cloned `HistoricalCandle[]` crosses the worker boundary;
- packet ownership is explicit;
- snapshot windows are bounded before dispatch;
- incremental updates can use a one-row packet after priming;
- a full packet is used for snapshot/seed/reset cases.

The packet is transfer-based rather than SharedArrayBuffer-based. Shared memory is deferred until worker lifetime, mutation, revision and reclamation rules are formally locked.

## 3. Worker compatibility seam

Existing indicator and analytics kernels still take `HistoricalCandle[]`. Rather than forcing a risky all-at-once rewrite, the workers convert the transferred numeric packet into candle objects locally.

That creates a clean migration sequence:

```text
v115
Canonical typed arrays
      ↓
transferable packet
      ↓
worker compatibility materializer
      ↓
legacy kernels

next
Canonical typed arrays
      ↓
CoreSpirit typed series / kernel ABI
      ↓
no candle-object materialization
```

The second stage is the real zero-object hot path target.

## 4. Vela provider

`TcoVelaDataProvider` now resolves `broker:symbol:timeframe` through the shared `ChartDataPlane` and reads the canonical typed view. It performs a binary search over the typed timestamp channel for Vela's requested range.

Ordinary `OHLCV` objects are created only at the `DataProvider` boundary because the current Vela provider contract uses ordinary bars.

## 5. Live workspace

`LiveTradingWorkspace` now runs `VelaWorkspace` in four-cell mode. The cells are initially seeded to NIFTY 50, NIFTY BANK, SENSEX and FINNIFTY.

The workspace keeps Vela's shared multi-chart shell rather than rebuilding those surfaces in React. The app now exposes:

- layout switching;
- active-cell projection;
- indicator picker;
- object tree/panels;
- drawings + shared drawing toolbar;
- crosshair synchronization;
- bottom bar and status surfaces;
- screenshot/action infrastructure;
- workspace persistence;
- Vela's WebGL/canvas cell budget.

A versioned persistence key prevents an older single-chart persisted document from forcing the new workspace back into single-cell mode.

## 6. TCO indicator wheel

TradingCoreOS adds an application-level radial quick picker triggered while `Alt` is held. It requests supported native indicators from the active Vela chart, shows up to eight quick choices, tracks the pointer sector and commits the selected native indicator on `Alt` release.

This is a host interaction feature. It does not create a new indicator engine or bypass the Vela native-indicator registry.

## 7. Why SAB is not part of v115

A SharedArrayBuffer can remove copies, but it also creates shared mutable state. Before using SAB, TCO must specify:

```text
owner → writer → revision → dirty range → reader lifetime → reclamation
```

Without those rules, SAB would make races and stale views easier to create, not harder. v115 therefore establishes transfer ownership first.

## 8. What remains

The remaining high-value work is deliberately narrower:

1. Replace the worker compatibility materializer with CoreSpirit typed-series inputs.
2. Give broker adapters an optional columnar history ABI.
3. Add a Vela-facing typed/retained-buffer ingestion path.
4. Bind TCO LOD directly to Vela viewport state.
5. Make CoreSpirit RenderPacket the only chart-facing derived-output transport.
6. Add browser stress gates for 1/2/4/8-cell sessions and real FYERS tick rates.

These are consolidation steps, not new parallel architectures.

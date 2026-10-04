# TradingCoreOS Documentation

## Active documents
1. `01_CORESPIRIT.md` — CoreSpirit language, compiler and runtime.
2. `02_DATA_AND_PERFORMANCE.md` — market data, incremental compute, history and performance.
3. `03_VELA_AND_CHARTING.md` — Vela boundary, columnar tape, rendering and history paging.
4. `04_INDICATORS_AND_PLATFORM.md` — indicators, settings, dependency graph and public scripts.
5. `CORESPIRIT_BUILD_TRACKER.md` — living implementation tracker and explicit open architectural debt.

Do not create another architecture markdown file for a subsystem already covered here. Superseded notes belong under `docs/archive/history/`.

## Runtime path
FYERS compact columns → TCO canonical data plane → Vela ColumnarHistoryTape → CoreSpirit stateful kernels → causal dirty range → retained Vela patch → frame/backend telemetry.

## History policy
- First load: **5,000 candles**.
- Left-edge demand: **5,000 older candles** per page.
- Retention cap: **50,000 candles**.

## v130 performance rule
Production bounded rolling mathematics has one canonical kernel owner. `seriesVector.ts` orchestrates kernels; it does not duplicate their state algorithms. Period-sized window construction inside historical loops is prohibited when a bounded kernel expresses the same calculation.

## Documentation truth
Source contracts and CI are structural evidence. They are not substitutes for authenticated browser, network or GPU measurements.

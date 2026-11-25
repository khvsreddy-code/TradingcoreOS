# TradingCoreOS performance baseline

**Baseline anchor:** `main` at `f12c2b26a11e91452de4ee582960f5f0104754f4`  
**Audit date:** 2026-11-25  
**Rule:** do not turn a target into a pass until the same workload has a measured baseline and a reproducible run artifact.

## Evidence already captured

The GitHub Actions WASM benchmark for the baseline commit ran on 2026-11-24, with five iterations per kernel and a 250,000-bar input. The table reports CPU median, time inside the WASM kernel, and full WASM call median. All values are milliseconds.

| Kernel | CPU median | WASM kernel median | WASM end-to-end median |
| --- | ---: | ---: | ---: |
| rollingMean | 2.668 | 0.556 | 1.593 |
| rollingSum | 2.623 | 0.603 | 1.678 |
| rollingVariance | 5.418 | 3.365 | 4.594 |
| rollingStd | 6.020 | 3.443 | 3.844 |
| rollingMin | 3.062 | 1.159 | 2.221 |
| rollingMax | 3.991 | 1.249 | 2.497 |

Source: GitHub Actions run `45328540392`, job `138223856600`, artifact `core-spirit-wasm-benchmark-f12c2b26a11e91452de4ee582960f5f0104754f4`. WASM kernel time is not user-visible execution time: buffer hand-off and call overhead must be included when evaluating a backend. All six kernels passed CPU/WASM numerical parity in that run.

This is a kernel microbenchmark—not evidence of chart frame time, realtime FYERS latency, indicator scaling, history backfill throughput or live execution latency.

## Browser baseline status

The authenticated browser matrix already records chart-cell count, frame p95, frame-budget miss rate, heap trend, long tasks, WebGL context state, shared-memory state, market/compute/render rates, tick-to-compute/patch/render p95, initial history load and older-history prepend metrics.

The layout URL builder supports 1–8 chart cells. CI now exercises **1, 4, 5 and 8**. The matrix has not yet produced a valid browser baseline: the latest independent soak run (`45415211466`) failed during ephemeral Supabase login with `Invalid login credentials`, before Chromium reached the terminal. The regular CI run (`45328540392`) was blocked earlier by the stale journal source contract. Neither failure is a measured browser-performance regression.

Do not fill browser baseline values from a skipped or unauthenticated run. Restore the dedicated CI test user's credentials and rerun the browser matrix before accepting any browser latency number.

## Measurements required before optimization

| Workload | Required evidence | Current status |
| --- | --- | --- |
| Initial live workspace load | navigation start, Vela mount, first usable chart, first confirmed candle, p50/p95/p99 | Not yet captured by authenticated browser run |
| Chart switching | symbol/timeframe switch to first correct chart update, p50/p95/p99 | Not yet captured |
| Realtime candle path | source freshness, tick-to-compute/patch/render p50/p95/p99, forming-bar replace count | Telemetry exists; authenticated baseline pending |
| 5 / 50 / 100 active indicators | calculate + render time, worker queue delay, memory, frame p95, output parity | Not yet covered as a scale matrix; existing pipeline cohort benchmark contains three distinct workloads |
| 1 / 4 / 5 / 8 chart cells | per-cell fps/frame p95, aggregate memory, long tasks and update latency | Matrix implemented; authenticated run pending |
| Historical backfill | bars/sec, time-to-first-page, full completion, memory and provider provenance | Not yet captured in a comparable benchmark artifact |
| CoreSpirit compilation | cold compile, incremental cold/warm, source-change compile, diagnostics | Existing pipeline benchmark covers these; CI artifact will establish the next baseline |
| CoreSpirit execution | reference vs optimized VM parity, historical p50/p95/p99, live append/replace latency, retained memory | Existing pipeline benchmark covers three real workloads; CI artifact will establish the next baseline |
| WASM numerical kernels | CPU vs kernel vs end-to-end time and parity at 50k/250k/1m bars | 50k and 250k evidence exists; 1m not yet captured in CI |
| Multi-chart drawing-heavy scenes | object count, update cost, renderer frame p95 and context-loss events | Not yet captured |

## Reproduction

- Browser layout matrix: `TCO_BROWSER_LAYOUTS=1,4,5,8 npm run verify:browser:strict`
- Longer browser soak: set `TCO_BROWSER_SOAK_MS` (milliseconds) and retain the same authenticated account, data fixture, deployed build and Chromium flags across compared runs.
- CoreSpirit pipeline: `TCO_BENCH_BAR_COUNTS=2000,5000 TCO_BENCH_UPDATE_ITERATIONS=40 npm run benchmark:corespirit:pipeline`
- WASM parity/performance: `TCO_BENCH_BAR_COUNTS=50000,250000,1000000 TCO_BENCH_ITERATIONS=5 npm run benchmark:corespirit:wasm`

Record the commit SHA, runner/browser version, market fixture/provider, chart count, active-indicator count, bar count, warm/cold state and benchmark artifact with every result. Compare like-for-like runs; do not set performance budgets from unrepeatable developer-machine measurements.

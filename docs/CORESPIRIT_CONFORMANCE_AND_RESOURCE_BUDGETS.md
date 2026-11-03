# CoreSpirit execution safety, conformance and resource budgets

This document describes the production contracts added around the existing CoreSpirit compiler, dirty graph, VM, output collector and Vela adapter. It does not add a second chart engine or claim to execute TradingView Pine bytecode inside TradingCoreOS.

## 1. Bar execution phases

Every emitted CoreSpirit object now carries `metadata.coreSpiritExecution`:

| Field | Meaning |
| --- | --- |
| `barPhase` | `historical`, `forming`, `confirmed`, `correction` or `replay` |
| `executionMode` | Host mode: historical, realtime, replay, backtest or historicalTick |
| `isRealtime` / `isConfirmed` | Host-derived state for that evaluation |
| `causality` | Static repaint analysis: causal, noncausal, future-dependent, repainting or unknown |
| `lookahead` | false, true or unknown |
| `realtimeSafe` | true, false or unknown |
| `backtestLiveEquivalent` | Static equivalence assessment |

The runtime may update a `forming` bar repeatedly. Each update is a replacement of that bar's state and retained visual identities, not an additional confirmed candle. On bar close, the runtime rolls back the speculative state and re-evaluates the final OHLC once with `barPhase=confirmed`; only then is the realtime state/event transaction committed.

Historical corrections execute as `correction` and read-only replays as `replay`. They may reproduce strategy outputs for deterministic analysis, but cannot authorize live broker effects.

### Live automation gate

Two independent gates apply:

1. The runtime routes live strategy/order events only for a confirmed realtime revision with `causality=causal`, `lookahead=false` and `realtimeSafe=true`.
2. The automation orchestrator independently checks the same host-stamped semantics before risk evaluation. Missing or unknown proof fails closed.

An indicator can still expose a provisional value on a forming candle. That value is marked as forming in its output metadata and cannot silently become a confirmed trading signal.

## 2. Pine reference conformance laboratory

`src/services/coreSpirit/coreSpiritConformanceLab.ts` compares two independently captured execution traces:

- `pine-reference`: a pinned TradingView/Pine reference capture.
- `corespirit`: the same bars, symbol, timeframe, inputs and parameters executed by CoreSpirit.

The lab compares:

- Bar identity and revision order, including repeated forming-bar revisions and the final confirmed revision.
- Every exported series value, numerical tolerance and NA/initialization state.
- Higher/lower-timeframe samples, symbol/timeframe, as-of timestamp, sample close timestamp and confirmed/developing state. A developing or future-closing MTF sample is rejected as an alignment failure.
- Ordered drawing lifecycle operations: create, update, extend and delete, including stable IDs, anchors and geometry.
- Alert and strategy event timing, phase, confirmation and side.

The comparator is deliberately an adapter/conformance harness, not an embedded Pine interpreter. A reference capture must come from a pinned, independent Pine execution environment. The fixture must retain the Pine version/build and checksums for the input dataset and parameters.

### Trace capture requirements

For each bar, include:

- Stable `barIndex` and exchange-aligned timestamp.
- Increasing `revision` for each forming update of that same bar.
- `phase` and every series output, including explicit `null` for Pine `na`.
- Pivot series and confirmation flags/offsets where applicable.

For each MTF sample, include `symbol`, `timeframe`, `field`, `asOfTimestamp`, `sampleTimestamp`, `closeTimestamp`, `confirmation` and `value`.

For drawings and events, preserve sequence numbers and stable object/event IDs. Do not reduce a create/update/extend/delete history to only the final picture; doing so would hide lifecycle and repaint differences.

A fixture can be evaluated with:

```ts
import { compareCoreSpiritConformance } from './coreSpiritConformanceLab';

// pineTrace is captured by the pinned reference adapter.
// coreSpiritTrace is exported by the CoreSpirit test/runtime adapter.
const result = compareCoreSpiritConformance(pineTrace, coreSpiritTrace, {
  numericTolerance: 1e-9,
  maxMismatches: 200,
});
if (!result.passed) {
  throw new Error(JSON.stringify(result.mismatches, null, 2));
}
```

### LuxAlgo SMC acceptance

Keep LuxAlgo Smart Money Concepts as the integration acceptance test. It must cover swing/internal pivots, BOS/CHoCH, equal highs/lows, order-block creation and mitigation, FVGs, premium/discount, MTF alignment, labels, boxes, extensions and deletion, historical correction/replay, and stable Vela scene identity.

Numerical/semantic trace comparison and visual screenshot comparison are separate gates. A similar screenshot cannot certify numerical values or alert timing, and a numerically correct trace cannot certify that Vela retained the right objects.

## 3. Golden screenshot regression

The existing `tools/verify-core-spirit-smc-browser.mjs` browser test already captures the real Vela chart, checks retained objects/recompile identity, exercises zoom/pan and resize/multipane behaviour, and provides a PNG pixel comparator.

To make an approved screenshot mandatory, provide a golden PNG:

```sh
TCO_BROWSER_URL=http://localhost:5173/live \
TCO_SMC_REQUIRE_GOLDEN_IMAGE=true \
TCO_SMC_GOLDEN_IMAGE=./testdata/golden/smc-nifty-5m.png \
TCO_SMC_GOLDEN_MAX_CHANGED_RATIO=0.02 \
node tools/verify-core-spirit-smc-browser.mjs
```

Capture the golden using the same browser CSS viewport, device scale factor, chart panel layout, instrument, timeframe, visible bar range, theme, price-scale mode and zoom as the test. The runner rejects PNG dimension mismatches and compares pixels inside the chart canvas region. A different viewport or scale is a different golden fixture; do not loosen the pixel budget to conceal it.

Golden files are reviewed test fixtures. The repository does not contain an approved proprietary TradingView/LuxAlgo screenshot baseline by default; set `TCO_SMC_REQUIRE_GOLDEN_IMAGE=true` in a golden-enabled environment only after an authorized reference image has been approved and committed.

## 4. Runtime-enforced resource budgets

`CoreSpiritResourceGovernor` is attached to the runtime, both VM instruction loops, capability host and output collector. It enforces per-bar/revision caps plus whole-execution caps so a 5,000-bar replay cannot reset its aggregate budget at every bar.

Default limits are conservative and may be overridden per runtime:

| Resource | Per revision | Whole execution |
| --- | ---: | ---: |
| VM instructions | 10,000 | 20,000,000 |
| Declared lookback | 50,000 bars | 50,000 bars |
| Visual object identities | 1,500 | 100,000 |
| Retained/estimated payload memory | 24 MiB | 128 MiB |
| Data requests | 128 | 10,000 |
| Model calls | 32 | 500 |
| Active dependencies | 1,024 | 1,024 |
| Distinct additional symbols | 16 | bounded by run data-request limit |
| Distinct additional timeframes | 16 | bounded by run data-request limit |
| Execution time | 150 ms | 30 seconds |

The VM charges actual executed instructions. Lookback and dependency counts are checked when a program is loaded. Data and model requests are charged at the resolver boundary. Visual identity creation and output memory are charged before retaining output. Time and cancellation are checked by VM execution checkpoints and after each bar pass. Exceeding a limit raises `CORESPIRIT_RESOURCE_LIMIT_EXCEEDED` and terminates that execution rather than merely adding an editor warning.

Memory numbers are conservative retained-payload estimates, not an operating-system heap profiler. Browser performance and memory telemetry remain separate validation requirements.

## 5. Incremental execution path

The existing CoreSpirit dirty graph and state snapshots remain the incremental execution mechanism. A forming-bar update uses the graph-derived affected instruction set, compatible state/kernel snapshots and retained output IDs. Unaffected pure instructions can reuse values; emitted objects with the same ID are updated instead of multiplied.

Historical correction is different: restore a compatible checkpoint and replay the affected suffix, or use the existing safe full-replay fallback when no compatible checkpoint exists. The runtime must not reuse stale state merely because a checkpoint has the right bar index.

The expected hot path remains:

`new tick -> affected dependency nodes -> changed output values/objects -> retained Vela patch`

A browser benchmark should separately report cold/warm compile, first plot, same-bar replacement, bar confirmation, historical correction, multi-indicator scaling, retained object count and heap growth.

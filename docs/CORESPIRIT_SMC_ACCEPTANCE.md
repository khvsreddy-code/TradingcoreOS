# CoreSpirit Smart Money Concepts acceptance

## Why SMC is the acceptance indicator

The bundled Smart Money Concepts conversion is deliberately treated as a staged acceptance target, not as a declaration of source-equivalence to LuxAlgo Pine v5. It exercises stateful swing/internal structure, confirmed BOS/CHoCH, EQH/EQL labels, order-block/FVG zones, price/time anchoring, scene replacement and Vela renderer lifecycle.

The known conversion boundary remains explicit: multi-timeframe `request.security` alignment, the full original historical order-block/mitigation model, strong/weak swing rules, the original display modes, and exchange-calendar session semantics are not yet a parity claim. Do not promote it as an exact LuxAlgo replacement until those semantics have matching fixtures.

## Deterministic acceptance

Run:

```sh
npm run verify:critical-contracts
```

The SMC acceptance test compiles the bundled source into an executable artifact and executes it against fixed synthetic history with planted structure/gap events. It checks:

- no compile errors or fatal runtime diagnostics, and worker-boundary output validation;
- deterministic full replay and reference-versus-optimized output parity;
- BOS/CHoCH, confirmed swing labels, equal-high/equal-low output, order-block zones, FVGs and premium/discount zones;
- pivot confirmation delay, actual pivot anchor time/price, and exact bullish/bearish FVG left/right/top/bottom boundaries;
- FVG visibility input behavior, forming-bar replacement, unique drawing IDs and historical-correction replay;
- Vela timestamp adaptation and native visual-ABI projection;
- stable chart-instance identity: identical source reuses one instance, while changed source only replaces the previous valid instance after the new instance reports ready.

These fixtures test the port's documented contract. They do **not** prove parity with every behavior in the original LuxAlgo source.

## Browser visual acceptance

Start the app with chart history available, then run:

```sh
TCO_BROWSER_URL=http://localhost:5173/live npm run verify:corespirit:smc:browser
```

For an authenticated workspace, set `TCO_REQUIRE_AUTH=true` and use an existing logged-in `agent-browser` session. The browser test writes the bundled SMC source to the browser's existing local editor-draft keys, opens the CoreSpirit dock, clicks **Compile & Run**, and fails unless all of the following occur:

1. the active Vela chart accepts the runnable indicator;
2. the post-commit native scene contains chart-target drawing objects such as lines, zones, boxes or labels;
3. the screenshot of the actual Vela plot differs from the pre-compile screenshot by a minimum number of pixels inside the chart-plot region;
4. a second screenshot comparison proves the plot changed after a wheel zoom and horizontal drag;
5. recompiling the same SMC source leaves exactly one stable active-chart instance and does not grow the retained visual inventory;
6. the source saved by the actual Compile & Run path is restored exactly after a page reload.

The screenshot comparator reads the browser-produced PNG files, decodes RGB/RGBA pixels, and compares only the overlap of the largest visible Vela chart canvas region. The pass threshold is deliberately a *change detector*, not a similarity score: it confirms that the native drawing commit affected pixels and that viewport gestures caused a plot update. It does not assert that the drawing is semantically correct at every coordinate by itself; that is covered by the separate fixed-history fixtures.

This is a rendered-pixel smoke gate, not yet a baseline screenshot-diff suite. There are no stored golden images, and it does not yet provide expected-image comparisons for every viewport size, pane, color scheme or instrument.

## Performance baseline

Run a comparable pipeline sample and persist its JSON report:

```sh
TCO_BENCH_BAR_COUNTS=2000,5000 \
TCO_BENCH_UPDATE_ITERATIONS=100 \
TCO_BENCH_OUTPUT_FILE=artifacts/corespirit-pipeline.json \
npm run benchmark:corespirit:pipeline
```

The report includes a capture timestamp and environment; cold/warm compilation and cache hits; historical replay and same-bar live-update p50/p95/p99; output-ready throughput; forming-bar replacement correctness; historical-correction throughput checked against a clean replay; changed-input and changed-source runs; reference-versus-optimized output fingerprints; output-kind counts; retained heap/ArrayBuffer deltas; a combined three-workload active-indicator output-ready sample with isolated-vs-cohort fingerprint parity; and a bounded Gaussian-HMM inference latency sample checked against an independent model following the same history. The HMM result explicitly isolates frozen-parameter inference after training; it is not claimed as a full compiled model-backed chart-indicator benchmark. The multi-indicator cohort is measured as synchronous serial execution in the Node process, so it is an aggregate workload budget rather than proof of browser worker-pool contention or UI paint latency. The report's retained-memory measurements are deltas, not allocation counts. Historical-correction latency is now also checked against a clean runtime replay of the exact corrected input; the benchmark fails on output mismatch instead of reporting that timing as valid.

For the actual fused-series dispatcher path (rather than only invoking the WASM kernel directly), run:

```sh
TCO_BENCH_BAR_COUNTS=50000,250000 \\
TCO_BENCH_ITERATIONS=5 \\
TCO_BENCH_OUTPUT_FILE=artifacts/corespirit-backends.json \\
npm run benchmark:corespirit:backends
```

This compiles a two-stage rolling-mean graph, finds the corresponding real fused IR group, loads the bundled WASM backend and benchmarks the CPU reference against the production dispatcher. It reports the backend that actually executed, includes end-to-end dispatch/allocation cost, and checks numerical parity with missing values. The correctness section additionally exercises histories shorter than the warm-up period, NaN/Infinity gaps, a historical correction, forming-bar replacement, the live-context CPU-only rule, unavailable executors, and a simulated accelerator failure after a partial write. A missing or failed accelerator must fall back to CPU and must never expose partially-written output.

For the numerical-kernel CPU/WASM comparison:

```sh
TCO_BENCH_BAR_COUNTS=50000,250000 \
TCO_BENCH_ITERATIONS=5 \
TCO_WASM_BENCH_OUTPUT_FILE=artifacts/corespirit-wasm.json \
npm run benchmark:corespirit:wasm
```

The WASM benchmark checks numerical parity and reports both kernel-only and end-to-end latency. A kernel is not counted as a speed win merely because its inner WASM loop is faster than CPU; transfer and allocation cost are included in the end-to-end comparison. The optional `TCO_WASM_BENCH_OUTPUT_FILE` persists a timestamped JSON report with Node/platform/architecture metadata, the selected kernel variant, parity result and end-to-end speedup for every size/kernel combination.

Compare reports only on the same machine/runtime with the same workload, settings and bar counts. Do not turn one machine's result into an unsupported Pine Script speed claim or loosen correctness checks to make a backend look faster.

## Commit and runtime safety gates

The native visual commit signal is emitted only after `applyObjects` and the visual ABI store commit succeed. The browser test requires both that scene commit and a change in real Vela plot screenshot pixels, and it also checks that fatal structured runtime diagnostics are rejected before a replacement scene is applied. A failed replacement must leave the previous valid scene intact.

The canonical market-data plane remains the source of truth. The acceptance work does not add an independent OHLCV history store: deterministic test fixtures are owned by tests and benchmark tools, not by the live runtime. Stateful kernels use bounded runtime state and confirmed-bar snapshots; append/forming-bar execution must still match a clean replay of the same final bar. Historical corrections, script changes, model changes, input changes and secondary data revisions must be measured separately because not all of them can safely use the same incremental range.

## Remaining release gates

Do not call the SMC conversion source-equivalent or production-certified until there are explicit semantic fixtures against the original Pine behavior for the documented missing features, a passing authenticated browser run in the target deployment, and repeatable screenshot-diff evidence for pan/zoom/resize and at least one multi-pane layout. The normal build and browser run must also complete successfully; a deployment-provider rate-limit failure is not evidence that the test suite passed or failed.

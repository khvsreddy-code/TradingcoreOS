# CoreSpirit Smart Money Concepts acceptance

## Why SMC is the acceptance indicator

The bundled Smart Money Concepts conversion is deliberately treated as a staged acceptance target, not as a declaration of source-equivalence to LuxAlgo Pine v5. It exercises stateful swing/internal structure, confirmed BOS/CHoCH, EQH/EQL labels, order-block/FVG zones, price/time anchoring, scene replacement and Vela renderer lifecycle.

The known conversion boundary remains explicit: multi-timeframe `request.security` alignment, the full original historical order-block/mitigation model, strong/weak swing rules, the original display modes, and exchange-calendar session semantics are not yet a parity claim. Do not promote it as an exact LuxAlgo replacement until those semantics have matching fixtures.

## Runtime semantics release gate

Multi-timeframe planning is not, by itself, Pine-compatible execution. The language parity matrix intentionally marks multi-timeframe support as **partial** until the runtime has passing fixtures for all of these observable behaviors:

- higher-timeframe values are not exposed as confirmed until the source bar is confirmed under the selected lookahead policy;
- gaps and missing source bars follow an explicit `gaps` policy rather than silently carrying values forward;
- lower-timeframe requests aggregate child bars in stable timestamp order and respect parent-bar/session boundaries;
- exchange sessions and timezone transitions do not leak bars across session boundaries;
- replay and live execution produce the same final confirmed outputs from the same ordered event history;
- late, duplicate and corrected events invalidate the affected dependent ranges without preserving stale outputs;
- developing-bar updates are provisional and replace the existing bar/object by identity rather than appending duplicates.

A language feature must not be marked implemented solely because the parser, namespace, planner or IR can represent it. Update the parity matrix only after compiler diagnostics, runtime behavior, output adaptation and deterministic tests agree.

## Visual object lifecycle release gate

Chart drawings are semantic objects anchored to bar/time and price, not pixel overlays. For every supported object kind, acceptance must prove:

- stable IDs across same-source recalculation and forming-bar replacement;
- in-place updates when a zone boundary, label position or style changes;
- deterministic removal when an object disappears from the next valid snapshot;
- correction-range invalidation for drawings downstream of corrected bars;
- no duplicate retained objects after repeated Compile & Run;
- failed compilation or scene commit preserves the last valid scene.

The existing browser test is a chart-change smoke test, not a golden-image suite. It cannot substitute for fixed-history assertions over exact time/price coordinates and retained-object identity.

## Editor contract

The live dock currently uses a textarea while the full Coder surface is described as having richer editor integrations. Do not claim editor parity until both surfaces share the same editor adapter/model, compiler worker, immutable source revisions, diagnostics and completion/hover/definition providers. A shared adapter must reject stale compile responses and must not turn the selected authoring level into a runtime permission.

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
- bullish and bearish order-block lifecycle: active zones fade on mitigation, same-bar wick corrections restore active styling, replayed mitigation preserves the same drawing identity and original price bounds;
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
5. recompiling the same SMC source repeatedly leaves exactly one stable active-chart instance and does not grow the retained visual inventory;
6. the source saved by the actual Compile & Run path is restored exactly after a page reload.

The screenshot comparator reads the browser-produced PNG files, decodes RGB/RGBA pixels, and compares only the overlap of the largest visible Vela chart canvas region. The pass threshold is deliberately a *change detector*, not a similarity score: it confirms that the native drawing commit affected pixels and that viewport gestures caused a plot update. It does not assert that the drawing is semantically correct at every coordinate by itself; that is covered by the separate fixed-history fixtures.

This is a rendered-pixel smoke gate, not yet a baseline screenshot-diff suite. There are no stored golden images, and it does not yet provide expected-image comparisons for every viewport size, pane, color scheme or instrument.

The browser harness also accepts an approved PNG baseline through `TCO_SMC_GOLDEN_IMAGE=/absolute/path/to/smc-golden.png`. It compares only the active chart-canvas region and requires the stored PNG dimensions to match the captured browser screenshot. Unlike the pre/post smoke check, the golden comparison is a similarity gate: it fails when the percentage of chart pixels whose RGB delta exceeds 24 is greater than `TCO_SMC_GOLDEN_MAX_CHANGED_RATIO` (default `0.02`, valid range `0..1`). The harness never creates or blesses a golden automatically: the image must come from a reviewed, known-good run with a recorded browser, viewport, symbol, timeframe, history and input set. No golden PNG is currently checked into the repository, so the normal command remains a smoke gate unless that variable is supplied.

Worker telemetry is collected from the live persistent pool when that execution path emits its diagnostic events. It reports admission wait, main-thread `postMessage`-to-result round-trip, and dispatch-to-result p50/p95/max, split by historical versus incremental work and cold artifact installation versus warm reuse. Round-trip includes worker execution, transfers and message scheduling; it is not presented as pure kernel CPU time. An empty worker-metric sample is visible in the report rather than silently treated as a measured zero.

The browser report now includes first-plot-ready time (from the Compile & Run click to the native visual-commit event), repeated warm recompile-to-visual-commit samples with nearest-rank p50/p95, device concurrency/memory hints, Chromium JS heap samples where `performance.memory` is exposed, and main-thread responsiveness samples collected during the compile/execute/scene-commit window. The responsiveness sample reports requestAnimationFrame gap p50/p95/max, frames over 33 ms and 50 ms, and `PerformanceObserver` long-task counts/durations when the browser supports that API. These are diagnostic samples; the harness does not impose hardware-specific pass thresholds and does not infer GPU time, dropped physical display frames or process memory from them. Repeated recompiles also assert that the same instance and native object-kind inventory are retained. Run against the same browser, instrument, timeframe, history length and viewport when comparing reports.

## Performance baseline

The separately exported `CoreSpiritLaneScheduler` utility now uses cursor-based O(1) dequeue with keyed tombstones and amortized compaction instead of per-task `Array.shift()` and queue scans. Its deterministic contract covers cross-lane supersession, FIFO scheduling while a task enqueues more work, budget exhaustion, queue clearing during an active flush and repeated keyed replacements. This helper is not the dispatch implementation used by the persistent `CoreSpiritWorkerPool`; do not count the utility optimization as a live chart speedup. The worker pool remains the owner of actual worker admission, queue priority and context rotation. End-to-end performance claims still require browser responsiveness and multi-indicator workload reports on representative hardware.

The persistent worker pool now uses a conservative resource budget based on browser device hints. Devices reporting 4 GiB or less are capped at one worker and three retained contexts per worker; devices above 4 GiB and up to 8 GiB are capped at two workers and five contexts; larger-memory devices may use up to four workers (still leaving one reported hardware thread free) and eight contexts. When device memory is unavailable, the pool stays at two workers and four contexts. These values are admission guards, not measurements of available free RAM; browsers often expose only coarse device-memory buckets.

A workload containing at least 20,000 market-data points (bars plus graph-node points) runs exclusively: existing worker jobs drain before it starts, and small jobs do not refill the pool until it finishes. Normal smaller workloads retain the existing priority-based worker parallelism. This is intended to avoid simultaneous large history copies and retained execution state on low-memory browsers. The threshold must be tuned from real browser evidence; it is not a universal optimal bar count.

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

This compiles six two-stage graphs (rolling mean, sum, variance, standard deviation, minimum and maximum), finds each matching fused IR group, loads the bundled WASM backend and benchmarks the CPU reference against the real dispatcher. It fails the measurement if WASM did not actually execute and reports the executed backend, kernel variant, p50/p95/p99 and end-to-end dispatch/allocation latency. It checks numerical parity including missing values. The correctness section exercises histories shorter than the warm-up period, NaN/Infinity gaps, a historical correction, forming-bar replacement, the live-context CPU-only rule, unavailable executors, and a simulated accelerator failure after a partial write. A missing or failed accelerator must fall back to CPU and must never expose partially-written output. Set `TCO_BENCH_MIN_WASM_WORK_UNITS=1` only when running the small correctness gate: it overrides the benchmark dispatch threshold for verification and does not alter the production scheduler threshold.

For the numerical-kernel CPU/WASM comparison:

```sh
TCO_BENCH_BAR_COUNTS=50000,250000 \
TCO_BENCH_ITERATIONS=5 \
TCO_WASM_BENCH_OUTPUT_FILE=artifacts/corespirit-wasm.json \
npm run benchmark:corespirit:wasm
```

The WASM benchmark checks numerical parity for rolling mean/sum/variance/std/min/max and reports both kernel-only and end-to-end latency. It also checks short histories, NaN/Infinity gaps, a historical correction, and a changed forming-bar value against the CPU reference for every supported WASM kernel. A kernel is not counted as a speed win merely because its inner WASM loop is faster than CPU; transfer and allocation cost are included in the end-to-end comparison. The optional `TCO_WASM_BENCH_OUTPUT_FILE` persists a timestamped JSON report with Node/platform/architecture metadata, the selected kernel variant, parity result and end-to-end speedup for every size/kernel combination.

Compare reports only on the same machine/runtime with the same workload, settings and bar counts. Do not turn one machine's result into an unsupported Pine Script speed claim or loosen correctness checks to make a backend look faster.

## Commit and runtime safety gates

The native visual commit signal is emitted only after `applyObjects` and the visual ABI store commit succeed. The browser test requires both that scene commit and a change in real Vela plot screenshot pixels, and it also checks that fatal structured runtime diagnostics are rejected before a replacement scene is applied. A failed replacement must leave the previous valid scene intact.

The canonical market-data plane remains the source of truth. The acceptance work does not add an independent OHLCV history store: deterministic test fixtures are owned by tests and benchmark tools, not by the live runtime. Stateful kernels use bounded runtime state and confirmed-bar snapshots; append/forming-bar execution must still match a clean replay of the same final bar. Historical corrections, script changes, model changes, input changes and secondary data revisions must be measured separately because not all of them can safely use the same incremental range.

## Remaining release gates

Do not call the SMC conversion source-equivalent or production-certified until there are explicit semantic fixtures against the original Pine behavior for the documented missing features, a passing authenticated browser run in the target deployment, and repeatable screenshot-diff evidence for pan/zoom/resize and at least one multi-pane layout. The normal build and browser run must also complete successfully; a deployment-provider rate-limit failure is not evidence that the test suite passed or failed.

# CoreSpirit multi-backend execution and numerical kernels

## The language/backend boundary

CoreScript semantics remain backend-independent:

`source → lexer/parser → typed AST → semantic graph → optimizer → Core IR → backend plan → executor`

Backend capabilities are selected after optimization. A backend is not considered available because a browser has a GPU or because a planner contains a GPU branch. WASM SIMD is eligible only when a loaded module exposes the requested SIMD kernel. WebGPU and remote research are eligible only when an executable adapter is registered and reports itself available.

The capability planner exposes five logical destinations: `js-scalar`, `cpu-optimized`, `wasm-simd`, `webgpu`, and `remote-research`. A bridge maps only live/registered capabilities into the existing CPU/WASM/GPU planner contracts, preserving compatibility with current call sites.

## CPU numerical library

`numericalKernels.ts` supplies bounded typed-array primitives for rolling mean/variance/std/min/max, EMA/RMA/WMA, ATR/RSI, rolling linear regression, covariance/correlation, z-score, dot product, row-major matrix multiplication, LU decomposition, softmax and log-sum-exp. It does not mutate caller arrays. Rolling outputs align to the window's right edge and use NaN for warm-up/incomplete windows; non-finite samples invalidate windows rather than masquerading as zero. Stateful smoothers reset after data gaps.

The library uses typed arrays, one-pass rolling accumulators for linear-time kernels, monotonic deques for rolling extrema, and cache-friendly i-k-j matrix multiplication. More compute-heavy routines have explicit input bounds. Numerical outputs should still be compared with a trusted reference over market-specific edge cases before production use. Rolling variance uses add/remove Welford updates rather than `E[x²] - E[x]²`, avoiding catastrophic cancellation when small price moves sit on a large absolute price level; sliding-window regression tests cover this case.

## Dispatch policies

- **Live chart / realtime:** keep compute local. Stateful recurrence remains chronological on the CPU path to avoid accelerator launch/transfer latency and ordering hazards.
- **Historical stateless series:** prefer CPU for small work; use WASM SIMD only when the exact kernel is registered and work crosses its threshold.
- **Very large stateless workloads:** WebGPU may be planned only with a real adapter. Since GPU results may vary by implementation, deterministic mode rejects a non-deterministic profile.
- **Training:** remains a research-job responsibility, never chart inference. Remote research execution is disabled unless both a real adapter is registered and the caller explicitly opts in. Model inference stays pinned to a model artifact hash and is not a training entry point.

## Live-bundle boundary

The series dispatcher imports only the tiny `kernelOperationMap.ts` ABI map. It does not import the numerical implementation or backend registry into the chart hot path just to check operation support. The fuller kernel library and capability planner stay on the compiler/research planning path, and the existing series-fusion implementation remains the runtime correctness reference until operation-by-operation parity is approved.

## Planned execution versus actual execution

`compilerPipeline.ts` records a distinct `backend-planner` stage for new artifacts and still accepts old v1 traces. `numericalKernelExecutor.ts` plans using operation identity and input shape, dispatches only exact registered WASM kernels or an executable WebGPU adapter, validates result shape, and returns accelerated output only after successful execution. Missing executors, malformed outputs, traps and adapter failures fall back to the CPU numerical reference and may emit fallback telemetry.

The current WASM ABI supports equal-length `Float64Array` series inputs and outputs. Reductions and matrix routines with different output shapes (such as dot product and matrix multiplication) remain on CPU until a shape-aware ABI exists. A planned backend is never reported as executed acceleration.

## Current implementation boundary

CPU kernels and capability planning are implemented. The WASM loader already accepts host-provided compiled modules, but this change does not add/ship a production SIMD binary. No WebGPU compute adapter or remote research executor is shipped; their registry slots therefore stay unavailable by default. The planner must not be read as claiming GPU acceleration is deployed. A future WebGPU/remote adapter must pass correctness parity, memory/size limits, timeout/cancellation, deterministic-mode and profiling tests before being enabled.

The legacy whole-program planner intersects caller-supplied profiles with the live capability registry and only selects an accelerator when all recognized numerical kernels have non-fallback plans for the same registered backend. A fabricated `available: true` profile cannot enable an absent adapter. The dispatcher reports the backend that actually ran. A planner selection without a matching executor safely falls back to CPU rather than returning a misleading WASM/GPU label. Accelerator output is staged until success; traps/errors fall back to CPU without publishing partial writes and can be observed through a fallback hook. Per-kernel plans are explicit scheduling metadata—not a promise that the executor has already run. The currently shipping series-fusion CPU path remains the semantic oracle until parity tests certify each replacement kernel. Broker, risk and order-intent operations remain outside numerical backends.

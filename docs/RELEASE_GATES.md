# TradingCoreOS release gates

This document is the operational contract for merging changes into `main`. A green source-level contract suite is necessary, but it is not evidence that a live chart remains smooth in Chromium under an active market feed.

## Performance acceptance

| Measurement | Enforced threshold |
| --- | ---: |
| Render-frame p95 (60 Hz target) | ≤ 16.7 ms |
| Tick-to-compute p95 | ≤ 8 ms |
| Tick-to-patch p95 | ≤ 16.7 ms |
| Tick-to-render p95 | ≤ 16.7 ms |
| Long tasks (browser Long Tasks API, each ≥ 50 ms) during steady state | 0 |
| WebGL context losses | 0 |
| Heap trend growth during a 30-minute soak | ≤ 32 MiB |
| Chart layouts covered by the fast CI browser matrix | 1, 4 and 8 cells |
| Long-duration heap soak | 30 minutes at 8 cells |

These are proposed acceptance thresholds, not claims about current observed performance. A run is valid only if it reports fresh `__TCO_PERF__` telemetry, identifies an active chart backend, has a non-stale market stream, and contains the required heap samples. A missing heap metric is a failure, not a pass with an omitted field.

The browser verifier does not wait for `networkidle`: the terminal intentionally maintains live WebSocket/polling connections. It waits for DOM readiness and the Vela workspace instead.

### What each browser workflow proves

- `TradingCoreOS CI / browser-performance` runs the authenticated 1 / 4 / 8 cell matrix with a 30-second steady-state interval on pull requests and main pushes, once enabled.
- `TradingCoreOS Browser Performance Soak / browser-performance-soak` runs a 30-minute 8-cell soak on weekdays at 09:30 India time (04:00 UTC). The dense layout is used for the long heap-growth test; 1 and 4 cell behavior is covered by the fast matrix.
- Both workflows archive machine-readable verifier output. The scheduled soak is the 30-minute evidence; the fast CI matrix must not be described as a 30-minute memory test.

### Required repository configuration

Before enabling the browser CI gate, configure these repository settings:

1. Repository variable `TCO_BROWSER_PERF_ENABLED=true`.
2. Repository variable `TCO_BROWSER_BASE_URL`, set to the authenticated production/live terminal origin and path, for example the production `/live` URL.
3. Repository secret `TCO_BROWSER_STATE_BASE64`, containing the base64-encoded agent-browser storage-state JSON for a dedicated performance-test account.

Use a dedicated least-privilege test account. Refresh the state when its authentication expires. Do not commit storage-state files, Supabase tokens, broker credentials, or session cookies. The browser runner adds Chromium's `--enable-precise-memory-info` flag and fails when heap metrics are unavailable.

Until those repository variables/secrets are configured, the browser jobs are intentionally skipped. That means live-browser acceptance is not yet enforced by the hosted CI check; it must not be represented as a passing browser run.

## Main branch protection

The following GitHub settings should be configured on branch `main` in [Settings → Branches](https://github.com/khvsreddy-code/TradingcoreOS/settings/branches) or the repository rulesets page:

- Require a pull request before merging; prohibit direct pushes to `main`.
- Require the `TradingCoreOS CI / validate` check.
- After the authenticated browser gate is enabled and observed green, require `TradingCoreOS CI / browser-performance` as well.
- Require branches to be up to date before merging.
- Require review approval where a second maintainer is available; require conversation resolution.
- Disable force pushes and branch deletion for `main`.
- Keep administrator bypass disabled where operationally practical; any emergency bypass must be documented in the PR/release record.

**Repository protection is not self-enforced by this documentation or by a passing workflow.** The GitHub connection used for this change can read the branch/ruleset state but does not expose the administration write action needed to apply protection. A repository owner/admin must apply and verify these settings before claiming `main` is protected.

## Vercel service routing

The service name declared under `vercel.json.services` is the source of truth for each service rewrite. The contract suite now checks that every rewrite points to a declared service and that both realtime health and WebSocket endpoints point to the same container service (root `.`, entrypoint `Dockerfile`, runtime `container`). A service rename must update the declaration and all dependent rewrites atomically.

At the time this release policy was added, checked-in `main` used the service identifier `realtimegatewayfresh`; PR #72 proposed `realtimegateway`. A Git diff or a READY web-app deployment does not prove that a Vercel container service exists, has a healthy image, or is receiving traffic. Before changing the identifier, verify the service in the Vercel project and exercise both `/api/realtime/healthz` and `/api/realtime/ws` on the resulting deployment. Keep the prior service/image available for rollback until the new route is confirmed healthy.

## PR #72 disposition

PR #72 is still draft. It must be rebased onto current `main`, the `vela-workspace-ux` top-bar chart-settings contract must pass, all merge conflicts must be resolved, the Vercel service identifier must be checked against the live project, and the current full CI plus browser checks must pass before it is marked ready. Do not merge a stale READY preview as evidence for its current head.

## Summary

Describe the user-visible and architectural changes.

## Risk and rollback

- **Affected paths/services:**
- **Data/schema or environment changes:**
- **Failure modes considered:**
- **Rollback plan:**

## Verification

- [ ] Relevant contract tests added/updated and passing.
- [ ] Typecheck passing.
- [ ] Production build and bundle budgets passing.
- [ ] WASM/backend parity checks passing where applicable.
- [ ] No credentials, session state, or user data committed.

## Browser performance evidence

- [ ] Authenticated Chromium run used a current live market feed.
- [ ] 1-cell layout evidence attached.
- [ ] 4-cell layout evidence attached.
- [ ] 8-cell layout evidence attached.
- [ ] Frame p95 ≤ 16.7 ms; tick-to-compute p95 ≤ 8 ms; patch/render p95 ≤ 16.7 ms.
- [ ] Zero ≥50 ms long tasks during the measured steady-state interval.
- [ ] Zero WebGL context losses.
- [ ] 30-minute heap soak at 8 cells completed with ≤32 MiB robust heap-trend growth (attach artifact/run link).
- **Workflow run / artifact:**

## Vercel service routing

- [ ] Every service rewrite targets a declared service in `vercel.json`.
- [ ] Realtime health and WebSocket routes target the same verified gateway service.
- [ ] Current preview/deployment ID and commit SHA recorded.
- [ ] Health endpoint checked and WebSocket connection/reconnect tested.
- [ ] Rollback deployment/service identified.

## Release status

- [ ] No stale preview or outdated CI run is being used as approval evidence.
- [ ] Main branch protection requirements are satisfied.

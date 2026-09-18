# TradingCoreOS Merge Notes

Merged sources:
- TradingCoreOS-unified.zip
- TradingCoreOS-unified-v0.0.19-ai-clear-pine-compatible (1).zip

## Merge policy
The v0.0.19 archive is treated as the current source-of-truth where a file exists
in both archives, because its release notes and diffs contain the newer reliability,
NIFTY symbol-resolution, AI-clear, cloud-persistence, and Pine-compatible runtime work.

Older-archive files were added only when they were not generated artifacts.
Python __pycache__ files and CatBoost run/log artifacts were intentionally excluded:
they are generated build/training outputs rather than application source.

## Comparison
- Older archive: 188 normalized files
- v0.0.19 archive: 181 normalized files
- Identical files shared: 168
- Source files differing between versions: 8
- Newer-only files: 5
- Older-only generated artifacts excluded: 12
- Older-only non-generated files preserved: 0

## Important v0.0.19 additions retained
- src/services/marketData/pineRuntime.ts
- supabase/ensure_user_cloud_rows_on_signup.sql
- release notes for v0.0.17, v0.0.18 and v0.0.19
- NIFTY / BANKNIFTY / SENSEX canonical symbol handling
- chart-value sanitization for indicator series
- safer persisted drawings
- AI prediction clear/stale-job invalidation
- cloud settings row materialization

## Next browser-OS integration targets
The merged project should use the useful ideas from the external TradingView-API
project as an adapter/reference layer, not as the TradingCoreOS chart, broker,
execution, or proprietary runtime core.

Candidate capabilities to adapt conceptually:
1. replay / historical-value workflows
2. indicator-result validation and compatibility testing
3. chart drawing/object interoperability research
4. screener / market-discovery style adapters
5. TradingView-style study parameter and time-series semantics where legally and
   technically appropriate

Do not make live order execution depend on an unofficial TradingView client.
Core Chart Engine, CoreSpirit, broker adapters, and the event bus remain first-party
TradingCoreOS components.

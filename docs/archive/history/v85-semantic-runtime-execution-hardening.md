# CoreSpirit v85 — Semantic + Runtime + Execution Hardening

Date: 2026-09-27

Baseline: v84.

This cycle consolidates operational correctness around the existing CoreSpirit architecture rather than expanding the language surface. It adds durable SHA-256 artifact identity and run manifests, explicit execution environments and deployment states, capability-aware runtime metadata, market-data provenance and calendar metadata, atomic audit-log chaining, order recovery states, request tracing and rate limits, HMAC-authenticated fixed-IP gateway calls, reproducible Supabase foundations, workspace tenancy foundations, CoreSpirit inspection CLI commands, CI contracts, and removal of duplicate legacy DOM hotfix entrypoints.

No new general-purpose function/record/named-argument language was introduced; those remain deliberately staged until their semantic model can be specified without destabilizing the canonical compiler → IR → VM pipeline.

# Phase 0 — Evidence-backed repository baseline

**Repository:** khvsreddy-code/TradingcoreOS  
**Branch:** main  
**Audited revision:** `8dd1dfb171e96848bcbe31a368f026e0228979f6`  
**Audit date:** 2026-11-28  
**State:** PARTIAL — complete tracked-file index; targeted high-risk source review; Phase 0 is not declared complete.

## Evidence rules

- Source files and executable tests are implementation evidence.
- README files, Markdown plans, changelogs and roadmap constants are inventoried but are not evidence that a capability exists.
- A registry row, interface, completion or planner result is not proof of an executable runtime implementation.
- A registered test is not a passing test. Only observed test results on the audited revision are recorded as passed.
- Files marked tree-inventoried-only have not received line-by-line source review.

## Repository counts

- Tracked files: 1542
- Source/code files (extension inventory): 1350
- CoreSpirit source-area files: 326
- CoreSpirit test files: 82
- Primary contract registrations: 249
- Pine-specific contract registrations: 6
- Unregistered CoreSpirit test files: 11
- Directly source-reviewed files in this first pass: 46

## Initial findings

1. Pine v6 remains a production frontend and is coupled to shared parser mode, AST/IR metadata, semantic analysis, runtime builtin dispatch, editor completions, public exports, namespace metadata and strategy simulation.
2. The Pine feature registry has 31 definitions. The Pine builtin registry has 167 catalog-only helper registrations (registration counts, not unique executable APIs).
3. CoreSpirit already has a real compiler/IR/optimizer/reference VM/optimized VM/runtime/worker/columnar data/output-to-Vela architecture. It is a meaningful foundation, but not yet a clean zero-Pine architecture.
4. On the audited CI run, the first contract passed and the second contract failed. The sequential fail-fast runner did not reach the later entries.
5. TypeScript typecheck passed; chart bundle budget failed at 663.0 KB gzip against a 650 KB hard limit and 550 KB optimization target.
6. The authenticated browser soak failed before measurement because Supabase rejected the CI account with Invalid login credentials.
7. Many prediction catalogue entries are described in source as heuristic proxies, not trained model artifacts.
8. Execution planning does not itself prove GPU adapter availability or actual device execution.

## Artifacts

- `source-inventory.json`: complete tracked-file path/blob index, with domain and review status.
- `source-review.json`: targeted direct source findings for compiler/runtime/Pine/data/Vela/strategy/automation/model/IDE paths.
- `dependency-graph.json` and `dependency-graph.mmd`: native architecture graph and integration edges.
- `capability-registry.json`: vendor-neutral capabilities using the requested status taxonomy.
- `test-feature-mapping.json`: 249 contract registrations, observed fail-fast position and unregistered CoreSpirit tests.
- `pine-dependency-graph.json`: production Pine consumers and safe removal sequence.
- `technical-debt.json`: prioritized evidence-backed issues.

## Phase 0 completion gate

Phase 0 remains open until every relevant first-party source file has an actual responsibility/dependency/consumer/test/performance review; import edges are generated from source; capability APIs and statuses have runtime evidence; all contract suites execute with aggregated results; the bundle and authenticated browser gates pass; and the production Pine dependency graph reaches zero before removal begins.

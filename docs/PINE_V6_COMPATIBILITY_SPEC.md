# Pine Script v6 compatibility specification

## Canonical source of truth

The executable compatibility registry is `src/services/coreSpirit/pine/pineFeatureRegistry.ts`. Its contract and shared types live in `pineCompatibilityTypes.ts`; executable source fixtures live in `pineConformanceFixtures.ts`; runtime semantic contracts live in `pineRuntimeContracts.ts`.

Do not add a second Pine feature matrix. Editor completions call `getPineFeatureEditorCompletions`; implementation progress calls `getPineFeatureRegistry` and `getPineFeatureProgressSummary`. Both are projections of the same feature definitions and the same optional fixture evidence.

## Status policy

| Status | Evidence rule |
| --- | --- |
| `not_implemented` | No implementation files are registered |
| `implemented_unverified` | Implementation exists, but the complete fixture set has not passed |
| `partially_conformant` | A fixture fails or known semantic differences remain |
| `conformant` | Every registered fixture passes and no known differences remain |
| `host_limited` | Language support exists but a fixture proves that a required host capability is unavailable |
| `not_applicable` | The feature is explicitly inapplicable or all fixtures report not applicable |

Status labels are derived. Definitions must never store an optimistic status string. The registry validator checks duplicate IDs, official reference links, fixture/implementation references, prerequisite existence, and prerequisite cycles.

## Implemented conformance slice

The Pine ternary operator now has a first-class conditional-expression AST node. Parsing is right-associative and lower precedence than boolean operators. Semantic analysis validates a boolean condition and compatible branch types, retaining series qualification when the condition is a series. IR lowering emits conditional jumps and a shared result register, so the unselected arm is not executed. The same contract executes in the reference VM and optimized VM and checks selected values plus `[1]` series history.

## Phase 4 implementation order and acceptance gates

1. **Script declarations:** validate declaration kind, allowed arguments, global scope and program-specific capabilities; reject strategy-only operations in indicator/library programs.
2. **Variables:** complete normal/typed declarations, `var`, `varip`, reassignment, declaration lists and tuple declarations. Validate initialization and rollback independently.
3. **Expressions:** complete ternary, compound assignment, casts, precedence and missing-value propagation across reference VM, optimized VM and WASM.
4. **Conditionals:** add Pine `switch` expression/statement forms and return-value behavior without erasing series qualifiers.
5. **Loops:** complete numeric ranges, `for ... in`, `while`, `break`, `continue`, loop result semantics and bounded execution.
6. **Functions:** support Pine arrow declarations, parameter defaults, scope/overload rules, tuples, methods and stable call-site history; preserve tuple element types.
7. **Types and objects:** complete enum/UDT semantics, typed collection APIs, reference identity, history interaction and drawing-object lifecycle/rollback.

Every item graduates to `conformant` only when its fixtures cover the required modes and pass on both reference and optimized execution. Strategy fill behavior, request.* alignment, external financial/economic data, and chart-object behavior remain separate domains; availability must be reported as `host_limited` rather than simulated silently.

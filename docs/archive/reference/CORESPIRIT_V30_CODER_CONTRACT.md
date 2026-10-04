# CoreSpirit v31 — Stage 4 Coder completion contract

## Completed

- Real Monaco editor adapter with CDN-loaded Monaco and graceful classic-editor fallback.
- Context-aware completion and hover hooks connected to the Monaco language provider.
- Incremental AST service with structural node reuse across edits.
- Type inference for core values, series and CoreSpirit UDT declarations.
- `type Name { field: type }` declarations are parsed into the language AST and semantic model.
- Member-aware UDT completion (`signal.` -> declared fields).
- Transactional hot reload controller: compile off to the side, validate, preserve compatible runtime checkpoint, then atomically swap the active runtime.
- Compiler source maps from IR instructions back to source spans.
- Runtime checkpoint export/import for state-preserving reloads.
- Stage 4 regression contract test.

## Safety rules

1. A failed compile never replaces the active runtime.
2. An obsolete compile can be cancelled before commit.
3. Runtime state is restored only after the candidate artifact validates.
4. Monaco is an adapter; language semantics remain DOM-independent.
5. Source maps are serialized in the IR so runtime diagnostics can eventually point back to exact source spans.

## Deliberate follow-up

- Richer UDT constructors/methods.
- Full inferred generic/collection types.
- Language-server protocol transport.
- Local Monaco bundle instead of CDN-only bootstrap.
- Hot-reload state migration policies for changed variable types.

# CoreSpirit v31 — Stage 4 Coder Contract

## Editor model
`CoreSpiritEditorModel` is the canonical DOM-free editor state boundary. It owns source versions, bounded undo/redo, cached compilation, diagnostics, semantic tokens, definitions, folding ranges, contextual completions and code actions. UI adapters must consume this service rather than reimplementing language semantics.

## Contextual intelligence
Completions are no longer prefix-only. The language service identifies global, call/argument and member contexts. Definitions resolve local variables and built-ins. Folding ranges are derived from block structure.

## Code actions
Diagnostics may expose deterministic quick fixes such as inserting a missing closing delimiter, removing an unexpected character, or inserting a missing variable name. Fixes are explicit edits and never silently mutate source.

## Editor surface
The current UI uses a textarea adapter with a synchronized syntax-highlight layer. The language service is independent of that adapter so Monaco/CodeMirror/native adapters can be introduced later.

## Hot reload boundary
Stage 4 v31 does not claim full atomic hot reload. The model now has versioned edits and cached compilation, which are prerequisites for a transactional compile -> validate -> swap pipeline in Stage 5.

# CoreSpirit v41 — Deep Stages 1–2

## Stage 1 — Language foundation

CoreSpirit's language core is versioned independently from the chart/runtime. The compiler contract is:

`source -> lex -> parse -> AST -> name resolution -> type check -> semantic validation -> IR`

The language foundation now defines stable language versioning, AST versioning, diagnostic versioning, keyword/operator inventories, compiler phase names, diagnostic codes, source-addressable spans, and non-goals/capability invariants.

Important rule: adding a language feature requires a lexer/parser/AST/compiler contract before editor exposure. Unknown functions/identifiers and future indexing fail before runtime execution.

## Stage 2 — Visual scene runtime

CoreSpirit visuals are no longer modeled as isolated plot calls. They become declarative scene nodes grouped into semantic layers:

- price
- indicator
- structure
- order
- data
- UI

A scene has stable identity, pane, z-order, visibility, interaction flags, source identity, anchors, time ranges, style, and renderer-neutral payload.

The chart renderer owns pixels, transforms, hit-testing, interaction and device coordinates. The CoreSpirit VM owns only the declarative output.

### Scene lifecycle

`outputs -> scene -> validate -> diff -> renderer`

Realtime revisions update scene nodes by stable id. Removed nodes are represented by the scene diff rather than forcing a complete chart rebuild.

### Visual programming model

A future indicator can create a scene containing many objects at once: lines, zones, labels, shapes, bands, footprints, tables, backgrounds and order markers. The 30-function CoreSpirit standard library remains unchanged; these APIs are visual extension capabilities.

### Quotas

Scenes are quota-limited by node count, labels, tables, polyline points and serialized payload size. This is part of the sandbox contract.

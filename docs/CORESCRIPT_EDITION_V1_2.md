# CoreScript source edition 1.2

Status: **implemented foundation / deliberately limited surface slice**.

CoreScript's source edition is separate from the CoreScript language identifier and the stable VM/IR ABI version. The compiler continues to emit `language: "CoreScript"` and `languageVersion: 1`; it additionally records `languageEdition: "1.0" | "1.2"` on newly compiled IR.

## Edition selection

A file may begin with exactly one edition directive:

```corescript
edition@1.2
```

Blank lines and `//` comments may precede it. No directive means edition `1.0`. The directive must be the first non-empty, non-comment line. Unsupported editions, malformed directives, misplaced directives and duplicate directives are compile errors; invalid-edition source must not produce an executable artifact.

The directive is removed before parsing, with its line and character positions preserved as whitespace. This keeps the edition marker out of the canonical AST and retains downstream line coordinates.

## Implemented v1.2 compact plot surface

The first v1.2 shorthand is a compact plot declaration:

```corescript
edition@1.2
plot vwap() color=white width=1 style=line
```

It lowers to the existing canonical call form:

```corescript
plot(vwap(), "white", 1, 0, null);
```

Supported trailing attributes are:

| Attribute | Values | Default |
|---|---|---|
| `color` | CSS color name, hex color, or quoted color string | runtime default |
| `width` | integer from 1 to 5 | 2 |
| `style` | `line`, `solid`, `dashed`, `dotted` | `line` |
| `title` | identifier-like title or quoted string | runtime default |

Style lowering is `line`/`solid` → `0`, `dashed` → `1`, `dotted` → `2`, matching the existing plot runtime call contract. Named colors are emitted as strings. Invalid or unknown trailing attributes are not silently consumed; the line remains subject to the normal parser/semantic diagnostics.

Compact and expanded forms must normalize to the same source, parse to the same canonical AST, and compile to the same VM instructions. The shorthand does not add a new AST node, VM opcode, renderer or chart lifecycle.

## Backwards compatibility

- Unversioned source defaults to `1.0`.
- Explicit `edition@1.0` retains the v1 surface grammar.
- The compact v1.2 plot form is not enabled in v1.0.
- Existing v1 programs remain parsed, compiled and executed through the same normalizer, AST, semantic analysis, IR, artifact and worker path.
- The source edition is recorded in IR/artifact identity so caches cannot confuse different source editions.
- The existing languageVersion, IR format/version, worker ABI and runtime ABI are not bumped.

## Explicit scope limits

This is the first edition foundation, not full CoreScript v1.2 completion. It currently adds edition detection/validation and one style-aware compact plot syntax only.

In particular:
- It does not add general named function arguments.
- It does not change VWAP calculation semantics. The current VWAP kernel is session-anchored and uses its existing HLC3 calculation; it does not yet honor arbitrary `source=` or `anchor=` parameters.
- It does not add arbitrary expression-level style modifiers, collections, functions, modules, Python blocks or other planned v1.2 syntax.
- It does not claim Pine feature parity merely because a surface form or library name exists.

These features must be specified and implemented in separate, testable changes. Every shorthand must lower through the shared compiler and pass the same semantic, temporal-safety, resource, execution and Vela-output contracts as its expanded equivalent.

## Verification

`src/coreScriptProgressiveLanguageContract.test.mjs` covers:
- default and explicit edition resolution;
- compact-versus-expanded normalized source and AST equivalence;
- identical v1.2 VM instructions;
- emitted IR edition metadata while preserving languageVersion 1;
- unversioned and explicit v1.0 compatibility;
- rejection of unsupported, malformed, duplicate and misplaced edition headers;
- rejection of v1.2 plot shorthand when the source explicitly selects v1.0.

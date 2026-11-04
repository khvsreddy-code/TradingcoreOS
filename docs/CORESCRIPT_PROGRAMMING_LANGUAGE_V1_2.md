# CoreScript v1.2 programming-language surface

Status: **incremental implementation on the canonical compiler/VM path**.

CoreScript v1.2 extends the existing source edition. It does not introduce a second parser, interpreter, runtime, chart renderer or broker API. New source forms lower into the established CoreSpirit AST/IR/VM, and all execution continues to use the normal compiler checks, sandbox, instruction quota and retained output path.

## Edition

A file opts in with:

```corescript
edition@1.2
```

Unversioned files continue to use edition 1.0. Edition 1.0 does not gain v1.2-only syntax implicitly.

## Typed pure functions

The existing typed `fn` surface is supported for pure expression functions:

```corescript
fn doubled(value: number) -> number {
  let result = value * 2
  return result
}

plot(doubled(close))
```

Functions are lowered through the existing bounded inliner before parsing. Parameters and local expressions are substituted into the expression tree; the generated source then goes through the canonical parser, semantic analyser, compiler and VM.

**Current limit:** recursive calls are rejected. Function bodies are limited to local declarations followed by a single return expression. Stateful/effectful functions, early returns, loops and general control-flow bodies are not supported yet. This is not a general call-frame/stack implementation.

## Arrays

Array literals and bounded operations:

```corescript
let values = [10, 20, 30]
values.push(40)
let second = values[1]
let count = values.length
plot(second + count)
```

Supported array methods: `push`, `pop`, `shift`, `unshift`, `get`, `set`, `includes`, `indexOf`, and `slice`. Arrays expose `length`, `first`, and `last`.

Array operations reject out-of-range indexes and collections larger than 16,384 elements.

## Maps

Map literals require string or identifier keys:

```corescript
let settings = {
  period: 20,
  source: "close"
}

settings.set("enabled", true)
let period = settings.get("period")
let enabled = settings["enabled"]
```

Supported map methods: `get`, `set`, `has`, `delete`, `keys`, `values`, and `entries`. Maps expose `size`. The map is bounded to 16,384 entries. Duplicate keys in a literal are rejected.

Map iteration with `for (let key in settings)` iterates keys.

## Enums

Enums are currently value-only declarations lowered to scalar constants:

```corescript
enum Direction {
  Long,
  Short
}

let side = Direction.Long
```

Members default to their names as string values. Explicit string and integer literal values are supported. Enum member access is resolved at compile time.

**Current limit:** this is not yet a nominal enum type system; no pattern matching, exhaustive switch, associated values or enum methods are provided.

## Loops

Supported loop forms:

```corescript
let values = [1, 2, 3, 4]
let total = 0

for (let value in values) {
  if (value == 2) {
    continue
  }
  total := total + value
}

let counter: state<int> = 0
while (counter < 3) {
  counter := counter + 1
}

plot(total)
plot(counter)
```

`for-in` supports arrays, maps (keys), strings and vectors. `while`, `break`, and `continue` lower to existing conditional and jump IR instructions.

All loop work is subject to the VM's existing per-bar instruction budget and abort checks. There is no unbounded native loop escape hatch.

**Current limit:** C-style loops, range expressions and asynchronous iteration are not part of this slice.

## Collection methods and matrices

Collection method dispatch is explicit and allow-listed; it does not expose arbitrary object reflection or prototype access.

Matrices retain the existing dense numerical kernels and are now accessible through methods:

```corescript
let values = matrix(2, 2, 1, 2, 3, 4)
let element = values.get(1, 0)
let transposed = values.transpose()
let doubled = values.scale(2)
plot(element)
plot(transposed.get(0, 1))
```

Matrix methods: `get`, `transpose`, `scale`, `add`, and `multiply`. Matrix construction retains existing shape rules: each dimension is bounded to 1..256 and the matrix to 65,536 cells. Shape mismatches fail at the numerical kernel boundary.

Vector `dot` is available through the same collection-method surface. Tensor construction and existing tensor kernels remain unchanged.

**Current limit:** this slice does not provide user-defined classes, arbitrary object methods, operator overloading, implicit matrix/scalar broadcasting or a general object model.

## Built-in module imports

Imports resolve only against registered CoreScript standard-library namespaces:

```corescript
import { abs as magnitude, sqrt } from "math"
import * as statistics from "stats"

plot(magnitude(-5) + sqrt(16))
plot(statistics.mean(10, 20))
```

Named imports support aliases; namespace imports retain qualified member access. Imports are source-level aliases and lower to existing registered namespace calls.

**Security boundary:** this is not a filesystem/package manager. Relative paths, user files, URLs, dynamic imports and arbitrary host modules are not loaded. The VM still has no filesystem/network capability.

## Verification

The progressive CoreScript contract contains compile-and-execute cases for:
- array and map literals, methods, indexing and iteration;
- while/for-in with break and continue;
- existing typed pure functions;
- enum lowering;
- built-in named and namespace imports;
- matrix indexing/method dispatch through the quant kernels.

Equivalent code must still pass the same semantic, temporal/repaint, capability, IR, VM and execution contracts as ordinary CoreScript source.

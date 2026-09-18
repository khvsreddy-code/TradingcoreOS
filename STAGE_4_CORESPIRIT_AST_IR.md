# TradingCoreOS Stage 4 — CoreSpirit AST / IR

## Goal
Establish the native CoreSpirit language representation without coupling the language implementation to the Core Chart Engine.

## Pipeline

```text
Source → Lexer → Parser → AST → Semantic Analysis → IR → Compiler Boundary → Runtime
```

## Files

- `src/services/coreSpirit/ast.ts`
- `src/services/coreSpirit/lexer.ts`
- `src/services/coreSpirit/parser.ts`
- `src/services/coreSpirit/semanticAnalyzer.ts`
- `src/services/coreSpirit/ir.ts`
- `src/services/coreSpirit/compiler.ts`
- `src/services/coreSpirit/coreSpiritPipeline.ts`

## Example

```text
let fast = sma(close, 20);
if (close > open) {
  signal("bull");
}
```

The parser produces a structured AST; semantic analysis validates identifiers/functions and lookback rules; the compiler lowers the program to deterministic IR instructions.

## No-lookahead foundation

`close[3]` is treated as three bars of historical lookback. Constant future indexing such as `close[-1]` is rejected during semantic analysis.

This is only the foundation. Dynamic-index and complete runtime enforcement remain later compiler/runtime work.

## Architecture boundary

CoreSpirit does not render charts. It can compile chart-independent output intents, which later runtime/event contracts can publish for Core Chart or other consumers.

## Validation

The changed CoreSpirit language files were compiled successfully with TypeScript 5.8.3. Smoke tests verified:

- a valid program compiles to IR
- `close[3]` records lookback depth 3
- `close[-1]` produces a semantic diagnostic

## Not claimed complete

This stage does not claim a finished CoreSpirit runtime, full compiler optimization, semantic trading primitives, Pine compatibility, replay/backtest integration, or live execution.

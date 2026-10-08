/**
 * CoreSpirit language foundation contract — Stage 41.
 *
 * The language core is intentionally renderer/broker independent. It owns
 * source text, tokens, AST, source spans, symbols, types and diagnostics.
 * Visual scene objects are emitted later by the output layer.
 */

export const CORE_SPIRIT_LANGUAGE_VERSION = 1 as const;
export const CORE_SPIRIT_AST_VERSION = 1 as const;
export const CORE_SPIRIT_DIAGNOSTIC_VERSION = 1 as const;

export const CORE_SPIRIT_KEYWORDS = Object.freeze([
  'let', 'if', 'else', 'type', 'true', 'false', 'null', 'and', 'or',
] as const);

export const CORE_SPIRIT_OPERATOR_LEXEMES = Object.freeze([
  '+', '-', '*', '/', '%', '!', '=', '==', '!=', '<', '<=', '>', '>=',
] as const);

export type CoreSpiritDiagnosticSeverity = 'error' | 'warning' | 'info';

export type CoreSpiritDiagnosticCode =
  | 'SYNTAX_ERROR'
  | 'UNKNOWN_IDENTIFIER'
  | 'DUPLICATE_VARIABLE'
  | 'DUPLICATE_TYPE'
  | 'TYPE_DECLARATION'
  | 'TYPE_IF_CONDITION'
  | 'TYPE_ARGUMENT'
  | 'TYPE_SIGNAL'
  | 'TYPE_INDEX'
  | 'FUTURE_INDEX'
  | 'UNKNOWN_FUNCTION'
  | 'WRONG_ARG_COUNT'
  | 'UNSUPPORTED_FEATURE'
  | 'CAPABILITY_REQUIRED'
  | 'SEMANTIC_ERROR';

export type CoreSpiritSourceSpan = {
  start: number;
  end: number;
  line: number;
  column: number;
};

export type CoreSpiritDiagnostic = {
  version: typeof CORE_SPIRIT_DIAGNOSTIC_VERSION;
  code: CoreSpiritDiagnosticCode;
  severity: CoreSpiritDiagnosticSeverity;
  message: string;
  span?: CoreSpiritSourceSpan;
  related?: readonly { message: string; span?: CoreSpiritSourceSpan }[];
};

export type CoreSpiritLanguagePhase =
  | 'lex'
  | 'parse'
  | 'resolve'
  | 'typecheck'
  | 'semantic'
  | 'lower'
  | 'optimize';

export const CORE_SPIRIT_LANGUAGE_PHASES = Object.freeze([
  'lex', 'parse', 'resolve', 'typecheck', 'semantic', 'lower', 'optimize',
] as const);

export const CORE_SPIRIT_LANGUAGE_INVARIANTS = Object.freeze([
  'AST nodes are language data and do not own chart/rendering state.',
  'Every diagnostic is source-addressable when a source span exists.',
  'Type checking completes before executable IR is produced.',
  'Unknown identifiers/functions are compiler errors, not runtime guesses.',
  'Future series indexing is rejected before runtime execution.',
  'The language core has no filesystem, network, DOM, broker, or process capability.',
  'New syntax requires a lexer/parser/AST/compiler contract before UI exposure.',
] as const);

export function makeCoreSpiritDiagnostic(
  code: CoreSpiritDiagnosticCode,
  severity: CoreSpiritDiagnosticSeverity,
  message: string,
  span?: CoreSpiritSourceSpan,
): CoreSpiritDiagnostic {
  return { version: CORE_SPIRIT_DIAGNOSTIC_VERSION, code, severity, message, span };
}

export function isCoreSpiritKeyword(value: string): boolean {
  return (CORE_SPIRIT_KEYWORDS as readonly string[]).includes(value);
}

export function validateCoreSpiritLanguageFoundation(): string[] {
  const errors: string[] = [];
  if (CORE_SPIRIT_LANGUAGE_VERSION !== 1) errors.push('unsupported CoreSpirit language version');
  if (CORE_SPIRIT_AST_VERSION !== 1) errors.push('unsupported CoreSpirit AST version');
  if (CORE_SPIRIT_LANGUAGE_PHASES.length !== 7) errors.push('language phase contract changed unexpectedly');
  return errors;
}

import { CoreSpiritAst } from '../../coreSpirit/ast';
import { CoreSpiritParser } from '../../coreSpirit/parser';
import { CoreSpiritCompiler, CoreSpiritCompileResult } from '../../coreSpirit/compiler';
import { CoreSpiritProgram } from '../../coreSpirit/types';

export type PineCompatibilitySeverity = 'error' | 'warning';
export type PineCompatibilityDiagnostic = {
  severity: PineCompatibilitySeverity;
  message: string;
  line?: number;
};

export type PineCompatibilityResult = {
  sourceId: string;
  version?: number;
  normalizedSource: string;
  ast?: CoreSpiritAst;
  program?: CoreSpiritProgram;
  compilation?: CoreSpiritCompileResult;
  diagnostics: PineCompatibilityDiagnostic[];
  supported: boolean;
};

/**
 * Supported Pine subset. This is intentionally a translator, not a Pine runtime.
 * Unsupported Pine constructs fail closed instead of being silently reinterpreted.
 */
const UNSUPPORTED_PATTERNS: Array<[RegExp, string]> = [
  [/\bstrategy\s*\(/, 'strategy scripts are not supported by the Pine compatibility layer'],
  [/\brequest\s*\./, 'request.* multi-symbol/timeframe calls require an explicit CoreSpirit market context'],
  [/\bsecurity\s*\(/, 'security() requires an explicit CoreSpirit market context'],
  [/=>/, 'user-defined Pine functions are not supported in this compatibility subset'],
  [/\?[^:\n]+:/, 'Pine ternary expressions are not supported in this compatibility subset'],
  [/\bfor\s+\w+\s*=|\bwhile\s*\(/, 'Pine loops are not supported in this compatibility subset'],
  [/\barray\./, 'Pine arrays are not supported in this compatibility subset'],
  [/\btable\./, 'Pine tables are not supported in this compatibility subset'],
];

const BUILTIN_RENAMES: Record<string, string> = {
  'ta.sma': 'sma', 'ta.ema': 'ema', 'ta.rsi': 'rsi', 'ta.atr': 'atr',
  'ta.vwap': 'vwap', 'ta.highest': 'highest', 'ta.lowest': 'lowest',
  'ta.change': 'change', 'ta.crossover': 'crossover', 'ta.crossunder': 'crossunder',
  'math.max': 'max', 'math.min': 'min', 'math.abs': 'abs', 'math.sqrt': 'sqrt',
  'math.pow': 'pow', 'nz': 'nz',
};

export function translatePineToCoreSpirit(source: string, sourceId = 'pine-import'): PineCompatibilityResult {
  const diagnostics: PineCompatibilityDiagnostic[] = [];
  const versionMatch = source.match(/@version\s*=\s*(\d+)/);
  const version = versionMatch ? Number(versionMatch[1]) : undefined;

  for (const [pattern, message] of UNSUPPORTED_PATTERNS) {
    const match = source.match(pattern);
    if (match) diagnostics.push({ severity: 'error', message, line: lineAt(source, match.index ?? 0) });
  }

  if (diagnostics.some(d => d.severity === 'error')) {
    return { sourceId, version, normalizedSource: '', diagnostics, supported: false };
  }

  let normalized = source
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\b(?:indicator|study)\s*\([^\n]*\)\s*;?/g, '')
    .replace(/\b(?:strategy\.entry|strategy\.exit|strategy\.close|strategy\.order)\s*\([^\n]*\)\s*;?/g, '');

  // Pine declarations/inputs become CoreSpirit lets. The first literal argument is
  // intentionally retained; dynamic input metadata is represented outside the language.
  normalized = normalized.replace(/\b(?:input\.int|input\.float|input\.bool|input\.string|input)\s*\(([^,\)]+)(?:,[^\)]*)?\)/g, '$1');

  // Pine history syntax is already represented by CoreSpirit's series indexing.
  for (const [from, to] of Object.entries(BUILTIN_RENAMES)) normalized = normalized.replaceAll(from, to);

  // Named Pine plot arguments are presentation metadata. Core Chart owns those settings.
  normalized = rewritePineCalls(normalized, 'plot', args => `plot(${firstPositional(args)})`);
  normalized = rewritePineCalls(normalized, 'plotshape', args => {
    const condition = firstPositional(args);
    return `if (${condition}) { marker(close); }`;
  });
  normalized = rewritePineCalls(normalized, 'alertcondition', args => {
    const condition = firstPositional(args);
    const title = positionalArgs(args)[1] ?? '"pine_alert"';
    return `if (${condition}) { signal(${title}); }`;
  });

  // Pine permits bare assignments; CoreSpirit uses explicit immutable-by-default lets.
  normalized = normalized.replace(/^\s*([A-Za-z_]\w*)\s*=\s*(?![=])(.+?)\s*;?\s*$/gm, 'let $1 = $2;');
  normalized = normalized.replace(/\bvar\s+(?:float|int|bool|string)?\s*/g, 'let ');
  normalized = normalized.replace(/\bvarip\s+(?:float|int|bool|string)?\s*/g, 'let ');

  const unsupportedAfter = normalized.match(/\b(?:plotchar|plotarrow|bgcolor|barcolor|fill|hline|label|line|box|linefill)\s*\(/);
  if (unsupportedAfter) {
    diagnostics.push({ severity: 'warning', message: `Pine visual output '${unsupportedAfter[0]}' is not translated; use CoreSpirit drawing primitives.` });
  }

  let ast: CoreSpiritAst | undefined;
  let program: CoreSpiritProgram | undefined;
  let compilation: CoreSpiritCompileResult | undefined;
  try {
    ast = new CoreSpiritParser(normalized).parse();
    program = { version: 1, id: sourceId, source: normalized, ast };
    compilation = new CoreSpiritCompiler().compile(ast, sourceId);
    for (const d of compilation.diagnostics) diagnostics.push({ severity: d.severity, message: d.message, line: d.line });
  } catch (error) {
    diagnostics.push({ severity: 'error', message: error instanceof Error ? error.message : String(error) });
  }

  return {
    sourceId,
    version,
    normalizedSource: normalized.trim(),
    ast,
    program,
    compilation,
    diagnostics,
    supported: !diagnostics.some(d => d.severity === 'error'),
  };
}

function rewritePineCalls(source: string, name: string, rewrite: (args: string) => string): string {
  let out = '';
  let cursor = 0;
  const needle = `${name}(`;
  while (cursor < source.length) {
    const start = source.indexOf(needle, cursor);
    if (start < 0) { out += source.slice(cursor); break; }
    out += source.slice(cursor, start);
    let i = start + needle.length;
    let depth = 1;
    let quote: string | undefined;
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (quote) { if (c === quote && source[i - 1] !== '\\') quote = undefined; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    if (depth !== 0) { out += source.slice(start); break; }
    out += rewrite(source.slice(start + needle.length, i - 1));
    cursor = i;
  }
  return out;
}

function positionalArgs(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let quote: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (quote) { if (c === quote && args[i - 1] !== '\\') quote = undefined; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { pushPositional(out, args.slice(start, i)); start = i + 1; }
  }
  pushPositional(out, args.slice(start));
  return out;
}

function pushPositional(out: string[], value: string): void {
  const trimmed = value.trim();
  if (trimmed && !/^[A-Za-z_]\w*\s*=/.test(trimmed)) out.push(trimmed);
}

function firstPositional(args: string): string {
  return positionalArgs(args)[0] ?? 'close';
}

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

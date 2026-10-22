import type { CoreSpiritSurfaceMetadata } from './languageConcepts';
import type { CoreSpiritSemanticResult } from './semanticAnalyzer';
import type { CoreSpiritDiagnostic } from './semanticAnalyzer';
import type { CoreSpiritAst } from './ast';
import { CoreSpiritParser } from './parser';
import { analyzeCoreSpirit } from './semanticAnalyzer';
import { normalizeCoreSpiritSource } from './syntax';
import type { CoreSpiritProgramLayer } from './layeredPlatformContract';
import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';

/**
 * Diagnostic/editor-only result from the lightweight compilation-unit builder.
 * This contract intentionally has no IR/artifact field and is not executable.
 * Production runners must use CoreSpiritCompiler/compileCoreSpirit and validate
 * the resulting CoreSpiritExecutableArtifact at the VM boundary.
 */
/**
 * Canonical diagnostic shape shared by editor, CLI and executable compilation.
 * The fallback code is intentionally stage-neutral but stable; producers should
 * supply more specific codes whenever they know the violated contract.
 */
export function normalizeCoreSpiritDiagnostics(
  diagnostics: readonly CoreSpiritDiagnostic[],
  source: string,
): CoreSpiritDiagnostic[] {
  const text = String(source ?? '');
  const lineStarts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) lineStarts.push(index + 1);
  }
  const clamp = (value: number) => Math.max(0, Math.min(text.length, Math.trunc(value)));
  return diagnostics.map((diagnostic) => {
    const requestedLine = Number.isInteger(diagnostic.line) && (diagnostic.line ?? 0) > 0
      ? Math.min(diagnostic.line as number, lineStarts.length)
      : 1;
    const requestedColumn = Number.isInteger(diagnostic.column) && (diagnostic.column ?? 0) > 0
      ? diagnostic.column as number
      : 1;
    const start = clamp(Number.isInteger(diagnostic.start)
      ? diagnostic.start as number
      : lineStarts[requestedLine - 1] + requestedColumn - 1);
    const end = clamp(Number.isInteger(diagnostic.end) && (diagnostic.end as number) >= start
      ? diagnostic.end as number
      : start < text.length ? start + 1 : start);
    let low = 0;
    let high = lineStarts.length;
    while (low + 1 < high) {
      const middle = (low + high) >>> 1;
      if (lineStarts[middle] <= start) low = middle;
      else high = middle;
    }
    return {
      ...diagnostic,
      code: diagnostic.code || (diagnostic.severity === 'warning' ? 'COMPILER_WARNING' : 'COMPILER_ERROR'),
      start,
      end,
      line: low + 1,
      column: start - lineStarts[low] + 1,
    };
  });
}

export type CoreSpiritCompilationUnit = {
  kind: 'partial';
  executable: false;
  source: string;
  normalizedSource: string;
  ast: CoreSpiritAst;
  semantic: CoreSpiritSemanticResult | null;
  syntaxDiagnostics: Array<{message:string; line:number; column:number; start:number; end:number}>;
  diagnostics: Array<{
    severity:'error'|'warning';
    message:string;
    line?:number;
    column?:number;
    start?:number;
    end?:number;
    code?:string;
  }>;
};

export function createCoreSpiritCompilationUnit(
  source: string,
  options: { layer?: CoreSpiritProgramLayer; surface?: CoreSpiritSurfaceMetadata; components?: CoreSpiritComponentRegistryLike } = {},
): CoreSpiritCompilationUnit {
  const original = String(source ?? '');
  const normalizedSource = normalizeCoreSpiritSource(original);
  const parsed = new CoreSpiritParser(normalizedSource).parseDetailed();
  const syntaxDiagnostics = parsed.diagnostics.map(d => ({ ...d, code: 'SYNTAX_ERROR' }));
  const semantic = syntaxDiagnostics.length ? null : analyzeCoreSpirit(parsed.ast, options);
  const diagnostics = normalizeCoreSpiritDiagnostics([
    ...syntaxDiagnostics.map(d => ({ severity:'error' as const, code:d.code, message:d.message, line:d.line, column:d.column, start:d.start, end:d.end })),
    ...(semantic?.diagnostics ?? []),
  ], normalizedSource);
  return { kind: 'partial', executable: false, source: original, normalizedSource, ast: parsed.ast, semantic, syntaxDiagnostics, diagnostics };
}


export const CORE_SPIRIT_COMPILER_PIPELINE_VERSION = 3 as const;
const CORE_SPIRIT_COMPILER_STAGE_ORDER_V1 = Object.freeze([
  'source','cst','ast','semantic-analysis','semantic-graph','typed-ir','dependency-graph','optimizer','execution-plan',
] as const);
const CORE_SPIRIT_COMPILER_STAGE_ORDER_V2 = Object.freeze([
  'source','lexer','parser','typed-ast','name-resolution','semantic-analysis','semantic-graph',
  'dependency-graph','core-ir','optimizer','backend-planner','execution-plan',
] as const);
// The trace follows the actual implementation: semantic facts precede lowering;
// reactive/dependency graphs are derived from optimized IR before backend planning.
export const CORE_SPIRIT_COMPILER_STAGE_ORDER = Object.freeze([
  'source','lexer','parser','name-resolution','semantic-analysis','semantic-graph','core-ir',
  'optimizer','dependency-graph','specialized-planner','trading-native-planner','research-analysis',
  'safety-analysis','backend-planner','execution-plan',
] as const);
export type CoreSpiritCompilerStage =
  | typeof CORE_SPIRIT_COMPILER_STAGE_ORDER[number]
  | typeof CORE_SPIRIT_COMPILER_STAGE_ORDER_V1[number]
  | typeof CORE_SPIRIT_COMPILER_STAGE_ORDER_V2[number];
export type CoreSpiritCompilerPipelineTrace = Readonly<{
  version: 1 | 2 | typeof CORE_SPIRIT_COMPILER_PIPELINE_VERSION;
  stages: readonly CoreSpiritCompilerStage[];
  runtimeBoundary: 'CoreSpiritExecutionVM';
}>;
export function makeCoreSpiritCompilerPipelineTrace(): CoreSpiritCompilerPipelineTrace {
  return Object.freeze({version:CORE_SPIRIT_COMPILER_PIPELINE_VERSION,stages:CORE_SPIRIT_COMPILER_STAGE_ORDER,runtimeBoundary:'CoreSpiritExecutionVM' as const});
}
function sameStages(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length===expected.length && actual.every((stage,index)=>stage===expected[index]);
}
export function validateCoreSpiritCompilerPipelineTrace(value: unknown): value is CoreSpiritCompilerPipelineTrace {
  const trace=value as CoreSpiritCompilerPipelineTrace|undefined;
  if(!trace || trace.runtimeBoundary!=='CoreSpiritExecutionVM' || !Array.isArray(trace.stages)) return false;
  if(trace.version===1) return sameStages(trace.stages,CORE_SPIRIT_COMPILER_STAGE_ORDER_V1);
  if(trace.version===2) return sameStages(trace.stages,CORE_SPIRIT_COMPILER_STAGE_ORDER_V2);
  if(trace.version===CORE_SPIRIT_COMPILER_PIPELINE_VERSION) return sameStages(trace.stages,CORE_SPIRIT_COMPILER_STAGE_ORDER);
  return false;
}

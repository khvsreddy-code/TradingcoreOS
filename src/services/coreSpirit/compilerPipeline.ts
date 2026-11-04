import type { CoreSpiritSurfaceMetadata } from './languageConcepts';
import type { CoreSpiritSemanticResult } from './semanticAnalyzer';
import type { CoreSpiritAst } from './ast';
import { CoreSpiritParser } from './parser';
import { analyzeCoreSpirit } from './semanticAnalyzer';
import { normalizeCoreSpiritSource } from './syntax';
import { readCoreScriptEdition } from './languageEdition.js';
import type { CoreSpiritProgramLayer } from './layeredPlatformContract';
import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';

/** Editor-only result. This value may contain a recovered/partial AST and is never executable. */
export type CoreSpiritCompilationUnit = {
  kind: 'partial-diagnostics';
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
  const edition = readCoreScriptEdition(original);
  const normalizedSource = normalizeCoreSpiritSource(original);
  const parsed = new CoreSpiritParser(normalizedSource).parseDetailed();
  const syntaxDiagnostics = [
    ...edition.diagnostics.map(item => ({ message:item.message, line:item.line, column:item.column, start:item.start, end:item.end })),
    ...parsed.diagnostics,
  ];
  const semantic = syntaxDiagnostics.length ? null : analyzeCoreSpirit(parsed.ast, options);
  const diagnostics = [
    ...syntaxDiagnostics.map(d => ({ severity:'error' as const, message:d.message, line:d.line, column:d.column, start:d.start, end:d.end })),
    ...(semantic?.diagnostics ?? []),
  ];
  return { kind: 'partial-diagnostics', executable: false, source: original, normalizedSource, ast: parsed.ast, semantic, syntaxDiagnostics, diagnostics };
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

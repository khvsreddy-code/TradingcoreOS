import type { CoreSpiritSurfaceMetadata } from './languageConcepts';
import type { CoreSpiritSemanticResult } from './semanticAnalyzer';
import type { CoreSpiritAst } from './ast';
import { CoreSpiritParser } from './parser';
import { analyzeCoreSpirit } from './semanticAnalyzer';
import { normalizeCoreSpiritSource } from './syntax';
import type { CoreSpiritProgramLayer } from './layeredPlatformContract';
import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';

export type CoreSpiritCompilationUnit = {
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
  const syntaxDiagnostics = parsed.diagnostics;
  const semantic = syntaxDiagnostics.length ? null : analyzeCoreSpirit(parsed.ast, options);
  const diagnostics = [
    ...syntaxDiagnostics.map(d => ({ severity:'error' as const, message:d.message, line:d.line, column:d.column, start:d.start, end:d.end })),
    ...(semantic?.diagnostics ?? []),
  ];
  return { source: original, normalizedSource, ast: parsed.ast, semantic, syntaxDiagnostics, diagnostics };
}


export const CORE_SPIRIT_COMPILER_PIPELINE_VERSION = 1 as const;
export const CORE_SPIRIT_COMPILER_STAGE_ORDER = Object.freeze([
  'source',
  'cst',
  'ast',
  'semantic-analysis',
  'semantic-graph',
  'typed-ir',
  'dependency-graph',
  'optimizer',
  'execution-plan',
] as const);
export type CoreSpiritCompilerStage = typeof CORE_SPIRIT_COMPILER_STAGE_ORDER[number];

export type CoreSpiritCompilerPipelineTrace = Readonly<{
  version: typeof CORE_SPIRIT_COMPILER_PIPELINE_VERSION;
  stages: readonly CoreSpiritCompilerStage[];
  runtimeBoundary: 'CoreSpiritExecutionVM';
}>;

export function makeCoreSpiritCompilerPipelineTrace(): CoreSpiritCompilerPipelineTrace {
  return Object.freeze({
    version: CORE_SPIRIT_COMPILER_PIPELINE_VERSION,
    stages: CORE_SPIRIT_COMPILER_STAGE_ORDER,
    runtimeBoundary: 'CoreSpiritExecutionVM' as const,
  });
}

export function validateCoreSpiritCompilerPipelineTrace(value: unknown): value is CoreSpiritCompilerPipelineTrace {
  const trace=value as CoreSpiritCompilerPipelineTrace|undefined;
  if(!trace || trace.version!==CORE_SPIRIT_COMPILER_PIPELINE_VERSION || trace.runtimeBoundary!=='CoreSpiritExecutionVM' || !Array.isArray(trace.stages)) return false;
  return trace.stages.length===CORE_SPIRIT_COMPILER_STAGE_ORDER.length &&
    trace.stages.every((stage,index)=>stage===CORE_SPIRIT_COMPILER_STAGE_ORDER[index]);
}

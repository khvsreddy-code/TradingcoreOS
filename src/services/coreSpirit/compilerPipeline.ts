import type { CoreSpiritSurfaceMetadata } from './languageConcepts';
import type { CoreSpiritSemanticResult } from './semanticAnalyzer';
import type { CoreSpiritAst } from './ast';
import { CoreSpiritParser } from './parser';
import { analyzeCoreSpirit } from './semanticAnalyzer';
import { normalizeCoreSpiritSource } from './syntax';
import type { CoreSpiritProgramLayer } from './layeredPlatformContract';

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

/**
 * Canonical source-to-semantics gateway.
 *
 * This is intentionally not a second compiler. It makes the source lifecycle
 * explicit so editor/tooling callers can consume one parsed + semantically
 * analyzed program instead of independently rescanning source text.
 */
export function createCoreSpiritCompilationUnit(
  source: string,
  options: { layer?: CoreSpiritProgramLayer; surface?: CoreSpiritSurfaceMetadata } = {},
): CoreSpiritCompilationUnit {
  const original = String(source ?? '');
  const normalizedSource = normalizeCoreSpiritSource(original);
  const parsed = new CoreSpiritParser(normalizedSource).parseDetailed();
  const syntaxDiagnostics = parsed.diagnostics;
  const semantic = syntaxDiagnostics.length
    ? null
    : analyzeCoreSpirit(parsed.ast, options);
  const diagnostics = [
    ...syntaxDiagnostics.map(d => ({
      severity:'error' as const,
      message:d.message,
      line:d.line,
      column:d.column,
      start:d.start,
      end:d.end,
    })),
    ...(semantic?.diagnostics ?? []),
  ];
  return {
    source: original,
    normalizedSource,
    ast: parsed.ast,
    semantic,
    syntaxDiagnostics,
    diagnostics,
  };
}

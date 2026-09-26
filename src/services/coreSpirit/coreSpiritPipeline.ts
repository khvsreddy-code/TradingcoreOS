import { CoreSpiritProgram } from './types';
import { CoreSpiritParser } from './parser';
import { CoreSpiritCompiler } from './compiler';
import type { CoreSpiritCompileResult } from './compiler';
import { CoreSpiritRuntime, CoreSpiritExecutionResult } from './runtime';
import type { CoreSpiritMarketBar } from './marketData';
import { normalizeCoreSpiritSource } from './syntax';

export function normalizeCoreSpirit(source: string) { return normalizeCoreSpiritSource(source); }
export function parseCoreSpirit(source: string) { return new CoreSpiritParser(normalizeCoreSpiritSource(source)).parse(); }
export function parseCoreSpiritDetailed(source: string) {
  try { return new CoreSpiritParser(normalizeCoreSpiritSource(source)).parseDetailed(); }
  catch (error) { const e=error as any; return { ast:{type:'program',body:[]} as any, diagnostics:[{message:e?.message || String(error),line:e?.position?.line || 1,column:e?.position?.column || 1,start:e?.position?.offset || 0,end:(e?.position?.offset || 0)+1}] }; }
}
export function compileCoreSpirit(source: string, sourceId = 'coreSpirit'): CoreSpiritCompileResult {
  const parsed=parseCoreSpiritDetailed(source);
  if(parsed.diagnostics.length) return { diagnostics: parsed.diagnostics.map(d=>({severity:'error' as const,message:d.message,line:d.line,column:d.column,start:d.start,end:d.end,code:'SYNTAX_ERROR'})) };
  return new CoreSpiritCompiler().compile(parsed.ast, sourceId);
}
export function makeCoreSpiritProgram(source: string, id = 'coreSpirit'): CoreSpiritProgram { return { version:1,id,source:normalizeCoreSpiritSource(source),ast:parseCoreSpirit(source) }; }
export function executeCoreSpirit(source: string, bars: CoreSpiritMarketBar[], sourceId='coreSpirit'): CoreSpiritExecutionResult {
  const program=makeCoreSpiritProgram(source,sourceId); const runtime=new CoreSpiritRuntime({sourceId});
  return runtime.executeIr(runtime.loadProgram(program),bars);
}

import { CoreSpiritProgram } from './types';
import { CoreSpiritParser } from './parser';
import { CoreSpiritCompiler } from './compiler';
import type { CoreSpiritCompileResult } from './compiler';
import { CoreSpiritRuntime, CoreSpiritExecutionResult } from './runtime';
import type { CoreSpiritMarketBar } from './marketData';
import { normalizeCoreSpiritSource } from './syntax';
import { describeCoreSpiritSurface } from './surfaceForms';
import { coreSpiritChecksum } from './artifact';
import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';

export function normalizeCoreSpirit(source: string) { return normalizeCoreSpiritSource(source); }
export function parseCoreSpirit(source: string) { return new CoreSpiritParser(normalizeCoreSpiritSource(source)).parse(); }
export function parseCoreSpiritDetailed(source: string) {
  try { return new CoreSpiritParser(normalizeCoreSpiritSource(source)).parseDetailed(); }
  catch (error) { const e=error as any; return { ast:{type:'program',body:[]} as any, diagnostics:[{message:e?.message || String(error),line:e?.position?.line || 1,column:e?.position?.column || 1,start:e?.position?.offset || 0,end:(e?.position?.offset || 0)+1}] }; }
}
const compileCache = new Map<string, CoreSpiritCompileResult>();
const COMPILE_CACHE_MAX = 64;

export function clearCoreSpiritCompileCache(): void { compileCache.clear(); }

export function compileCoreSpirit(source: string, sourceId = 'coreSpirit', options: { components?: CoreSpiritComponentRegistryLike } = {}): CoreSpiritCompileResult {
  const componentKey = options.components ? coreSpiritChecksum(options.components instanceof Object && 'listContracts' in options.components ? (options.components as any).listContracts() : options.components) : 'default';
  const cacheKey = `${sourceId}:${coreSpiritChecksum(source)}:${componentKey}`;
  const cached = compileCache.get(cacheKey);
  if (cached) {
    compileCache.delete(cacheKey);
    compileCache.set(cacheKey, cached);
    return cached;
  }
  const parsed=parseCoreSpiritDetailed(source);
  if(parsed.diagnostics.length) return { diagnostics: parsed.diagnostics.map(d=>({severity:'error' as const,message:d.message,line:d.line,column:d.column,start:d.start,end:d.end,code:'SYNTAX_ERROR'})) };
  const result = new CoreSpiritCompiler().compile(parsed.ast, sourceId, { surface: describeCoreSpiritSurface(source, options), components: options.components });
  compileCache.set(cacheKey, result);
  while (compileCache.size > COMPILE_CACHE_MAX) compileCache.delete(compileCache.keys().next().value!);
  return result;
}
export function makeCoreSpiritProgram(source: string, id = 'coreSpirit'): CoreSpiritProgram {
  return { version:1,id,source:normalizeCoreSpiritSource(source),ast:parseCoreSpirit(source),surface:describeCoreSpiritSurface(source) };
}
export function executeCoreSpirit(source: string, bars: CoreSpiritMarketBar[], sourceId='coreSpirit'): CoreSpiritExecutionResult {
  const program=makeCoreSpiritProgram(source,sourceId); const runtime=new CoreSpiritRuntime({sourceId});
  return runtime.executeIr(runtime.loadProgram(program),bars);
}

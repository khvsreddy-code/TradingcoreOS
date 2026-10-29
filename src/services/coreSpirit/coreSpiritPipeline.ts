import { CoreSpiritProgram } from './types';
import { CoreSpiritParser } from './parser';
import { analyzeCoreSpirit } from './semanticAnalyzer';
import { CoreSpiritCompiler } from './compiler';
import { buildCoreSpiritArtifactLookupIdentity } from './artifactLookupIdentity';
export { buildCoreSpiritArtifactLookupIdentity } from './artifactLookupIdentity';
import type { CoreSpiritCompileResult } from './compiler';
import { CoreSpiritRuntime, CoreSpiritExecutionResult } from './runtime';
import type { CoreSpiritMarketBar } from './marketData';
import { normalizeCoreSpiritSource } from './syntax';
import { describeCoreSpiritSurface } from './surfaceForms';

import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';
import type { CoreSpiritExecutableArtifact } from './artifact';

export type { CoreSpiritCompileResult };

export function normalizeCoreSpirit(source: string) { return normalizeCoreSpiritSource(source); }
export function parseCoreSpirit(source: string) { return new CoreSpiritParser(normalizeCoreSpiritSource(source)).parse(); }
export function parseCoreSpiritDetailed(source: string) {
  try {
    return new CoreSpiritParser(normalizeCoreSpiritSource(source)).parseDetailed();
  } catch (error) {
    const e = error as any;
    return {
      ast:{type:'program',body:[]} as any,
      diagnostics:[{
        message:e?.message || String(error),
        line:e?.position?.line || 1,
        column:e?.position?.column || 1,
        start:e?.position?.offset || 0,
        end:(e?.position?.offset || 0)+1,
      }],
    };
  }
}

/**
 * Fast in-memory artifact cache.
 *
 * The cached value is the executable artifact itself, not the compilation
 * result wrapper. Diagnostics are retained separately because warnings are
 * editor metadata, not executable state.
 */
const artifactCache = new Map<string, CoreSpiritExecutableArtifact>();
const diagnosticsCache = new Map<string, CoreSpiritCompileResult['diagnostics']>();
const symbolsCache = new Map<string, CoreSpiritCompileResult['symbols']>();
const COMPILE_CACHE_MAX = 64;

export function clearCoreSpiritCompileCache(): void {
  artifactCache.clear();
  diagnosticsCache.clear();
  symbolsCache.clear();
}

export function compileCoreSpirit(
  source: string,
  sourceId = 'coreSpirit',
  options: { components?: CoreSpiritComponentRegistryLike; layer?: any } = {},
): CoreSpiritCompileResult {
  const traceSmcPipeline = (stage: string): void => {
    if (sourceId === 'luxalgo-smc-port-contract') console.log('SMC_PIPELINE_TRACE', stage);
  };
  traceSmcPipeline('start');
  traceSmcPipeline('identity:start');
  const identity=buildCoreSpiritArtifactLookupIdentity(source,sourceId,options);
  traceSmcPipeline('identity:done');
  const cached=artifactCache.get(identity.key);
  if(cached){
    artifactCache.delete(identity.key);
    artifactCache.set(identity.key,cached);
    return {
      ir:cached.ir,
      artifact:cached,
      diagnostics:diagnosticsCache.get(identity.key) ?? [],
      symbols:symbolsCache.get(identity.key) ?? [],
    };
  }

  traceSmcPipeline('surface:start');
  const surface=describeCoreSpiritSurface(source,options as any);
  traceSmcPipeline('surface:done');
  traceSmcPipeline('compileSource:start');
  const result=new CoreSpiritCompiler().compileSource(source,sourceId,{
    components:options.components,
    layer:options.layer,
    surface,
  });
  traceSmcPipeline('compileSource:done');

  if(result.artifact){
    artifactCache.set(identity.key,result.artifact);
    diagnosticsCache.set(identity.key,result.diagnostics);
    symbolsCache.set(identity.key,result.symbols ?? []);
    while(artifactCache.size>COMPILE_CACHE_MAX){
      const oldest=artifactCache.keys().next().value as string|undefined;
      if(oldest===undefined) break;
      artifactCache.delete(oldest);
      diagnosticsCache.delete(oldest);
      symbolsCache.delete(oldest);
    }
  }

  return result;
}

export function makeCoreSpiritProgram(source: string, id = 'coreSpirit'): CoreSpiritProgram {
  return {
    version:1,
    id,
    source:normalizeCoreSpiritSource(source),
    ast:parseCoreSpirit(source),
    surface:describeCoreSpiritSurface(source),
  };
}

export function executeCoreSpirit(
  source: string,
  bars: CoreSpiritMarketBar[],
  sourceId='coreSpirit',
): CoreSpiritExecutionResult {
  // This convenience entry point must use the same canonical executable
  // compiler/artifact boundary as editor, CLI and production runners. The
  // authoring AST/program shape is not an executable fallback.
  const compiled = compileCoreSpirit(source, sourceId);
  if (!compiled.ir || !compiled.artifact) {
    const detail = compiled.diagnostics.map(item => item.message).join('\n');
    throw new Error(detail || 'CoreSpirit compilation failed; no executable artifact was produced.');
  }
  const runtime = new CoreSpiritRuntime({ sourceId });
  return runtime.executeIr(compiled.ir, bars);
}


export function inspectCoreSpiritSemantics(
  source: string,
  options: { layer?: any; components?: CoreSpiritComponentRegistryLike } = {},
) {
  const normalized = normalizeCoreSpiritSource(source);
  const ast = new CoreSpiritParser(normalized).parse();
  const surface = describeCoreSpiritSurface(source, options as any);
  const semantic = analyzeCoreSpirit(ast, { layer: options.layer, surface, components: options.components });
  return Object.freeze({
    diagnostics: semantic.diagnostics,
    maxLookback: semantic.maxLookback,
    symbols: Object.freeze(Object.fromEntries([...semantic.symbols.entries()])),
    semanticEnvironment: Object.freeze(Object.fromEntries(
      [...semantic.semanticSymbols.entries()].map(([name, type]) => [name, Object.freeze({ ...type })]),
    )),
  });
}

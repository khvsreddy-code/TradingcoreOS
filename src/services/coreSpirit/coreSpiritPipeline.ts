import { CoreSpiritProgram } from './types';
import { CoreSpiritParser } from './parser';
import { analyzeCoreSpirit } from './semanticAnalyzer';
import { CoreSpiritCompiler } from './compiler';
import { buildCoreSpiritArtifactLookupIdentity, buildCoreSpiritSemanticFingerprint, coreSpiritComponentFingerprint } from './artifactLookupIdentity';
export { buildCoreSpiritArtifactLookupIdentity } from './artifactLookupIdentity';
import type { CoreSpiritCompileResult } from './compiler';
import { CoreSpiritRuntime, CoreSpiritExecutionResult } from './runtime';
import type { CoreSpiritMarketBar } from './marketData';
import { normalizeCoreSpiritSource } from './syntax';
import { describeCoreSpiritSurface } from './surfaceForms';

import { CORE_SPIRIT_COMPILER_VERSION } from './VERSION';
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
  const identity=buildCoreSpiritArtifactLookupIdentity(source,sourceId,options);
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

  const normalizedSource=normalizeCoreSpiritSource(source);
  const semanticFingerprint=JSON.stringify({
    compiler:CORE_SPIRIT_COMPILER_VERSION,
    semantic:buildCoreSpiritSemanticFingerprint({
      layer:options.layer,
      components:options.components,
    }),
    componentSet:coreSpiritComponentFingerprint(options),
  });

  const surface=describeCoreSpiritSurface(source,options as any);
  const result=new CoreSpiritCompiler().compileSource(source,sourceId,{
    components:options.components,
    layer:options.layer,
    surface,
    artifactContext:{
      source,
      normalizedSource,
      semanticFingerprint,
    },
  });

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
  const program=makeCoreSpiritProgram(source,sourceId);
  const runtime=new CoreSpiritRuntime({sourceId});
  return runtime.executeIr(runtime.loadProgram(program),bars);
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

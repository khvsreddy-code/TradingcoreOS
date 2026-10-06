import { CoreSpiritProgram } from './types';
import { CoreSpiritParser } from './parser';
import { CoreSpiritCompiler, buildCoreSpiritSemanticFingerprint } from './compiler';
import type { CoreSpiritCompileResult } from './compiler';
import { CoreSpiritRuntime, CoreSpiritExecutionResult } from './runtime';
import type { CoreSpiritMarketBar } from './marketData';
import { normalizeCoreSpiritSource } from './syntax';
import { describeCoreSpiritSurface } from './surfaceForms';
import { sha256HexSync } from './artifactIdentity';
import { CORE_SPIRIT_COMPILER_VERSION, CORE_SPIRIT_RUNTIME_ABI, CORE_SPIRIT_OPTIMIZER_ABI } from './VERSION';
import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';
import { coreSpiritComponentRegistry } from './coreSpiritComponents';
import type { CoreSpiritExecutableArtifact } from './artifact';

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
const COMPILE_CACHE_MAX = 64;

export function clearCoreSpiritCompileCache(): void {
  artifactCache.clear();
  diagnosticsCache.clear();
}

function componentFingerprint(options: { components?: CoreSpiritComponentRegistryLike }): string {
  const components = options.components ?? coreSpiritComponentRegistry;
  if (components && typeof components === 'object' && 'listContracts' in components) {
    return JSON.stringify((components as any).listContracts());
  }
  return JSON.stringify(components);
}

export function buildCoreSpiritArtifactLookupIdentity(
  source:string,
  sourceId:string,
  options:{components?:CoreSpiritComponentRegistryLike; layer?:string},
): { key:string; sourceHash:string; normalizedHash:string; semanticHash:string } {
  const normalizedSource=normalizeCoreSpiritSource(source);
  const sourceHash=sha256HexSync(source);
  const normalizedHash=sha256HexSync(normalizedSource);
  const semanticFingerprint=JSON.stringify({
    compiler:CORE_SPIRIT_COMPILER_VERSION,
    semantic:buildCoreSpiritSemanticFingerprint({
      layer:options.layer as any,
      components:options.components,
    }),
    componentSet:componentFingerprint(options),
    runtimeABI:CORE_SPIRIT_RUNTIME_ABI,
    optimizerABI:CORE_SPIRIT_OPTIMIZER_ABI,
  });
  const semanticHash=sha256HexSync(`${normalizedHash}\n${semanticFingerprint}`);
  return {
    key:`${sourceId}:${semanticHash}`,
    sourceHash,
    normalizedHash,
    semanticHash,
  };
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
    };
  }

  const normalizedSource=normalizeCoreSpiritSource(source);
  const semanticFingerprint=JSON.stringify({
    compiler:CORE_SPIRIT_COMPILER_VERSION,
    semantic:buildCoreSpiritSemanticFingerprint({
      layer:options.layer,
      components:options.components,
    }),
    componentSet:componentFingerprint(options),
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
    while(artifactCache.size>COMPILE_CACHE_MAX){
      const oldest=artifactCache.keys().next().value as string|undefined;
      if(oldest===undefined) break;
      artifactCache.delete(oldest);
      diagnosticsCache.delete(oldest);
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

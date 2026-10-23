import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';
import { coreSpiritComponentRegistry } from './coreSpiritComponents';
import { sha256HexSync } from './artifactIdentity';
import { normalizeCoreSpiritSource } from './syntax';
import { CORE_SPIRIT_COMPILER_VERSION, CORE_SPIRIT_RUNTIME_ABI, CORE_SPIRIT_OPTIMIZER_ABI } from './VERSION';

export function coreSpiritComponentFingerprint(options:{components?:CoreSpiritComponentRegistryLike}):string{
  const components=options.components ?? coreSpiritComponentRegistry;
  if(components && typeof components==='object' && 'listContracts' in components)return JSON.stringify((components as any).listContracts());
  return JSON.stringify(components);
}

/** Kept in a light module so cache identity lookup doesn't eagerly load the compiler/VM graph. */
export function buildCoreSpiritSemanticFingerprint(options:{layer?:string;components?:CoreSpiritComponentRegistryLike}={}):string{
  const componentSource=options.components ?? coreSpiritComponentRegistry;
  const componentContracts=componentSource && typeof componentSource==='object' && 'listContracts' in componentSource
    ? (componentSource as any).listContracts()
    : componentSource;
  return JSON.stringify({compilerPipeline:'semantic-v4',layer:options.layer || 'script',components:componentContracts});
}

export function buildCoreSpiritArtifactLookupIdentity(
  source:string,
  sourceId:string,
  options:{components?:CoreSpiritComponentRegistryLike;layer?:string}={},
):{key:string;sourceHash:string;normalizedHash:string;semanticHash:string}{
  const normalizedSource=normalizeCoreSpiritSource(source);
  const sourceHash=sha256HexSync(source);
  const normalizedHash=sha256HexSync(normalizedSource);
  const semanticFingerprint=JSON.stringify({
    compiler:CORE_SPIRIT_COMPILER_VERSION,
    semantic:buildCoreSpiritSemanticFingerprint({layer:options.layer,components:options.components}),
    componentSet:coreSpiritComponentFingerprint(options),
    runtimeABI:CORE_SPIRIT_RUNTIME_ABI,
    optimizerABI:CORE_SPIRIT_OPTIMIZER_ABI,
  });
  const semanticHash=sha256HexSync(`${normalizedHash}\n${semanticFingerprint}`);
  return {key:`${sourceId}:${semanticHash}`,sourceHash,normalizedHash,semanticHash};
}

import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';
import { coreSpiritComponentRegistry } from './coreSpiritComponents';
import { sha256HexSync } from './artifactIdentity';
import { normalizeCoreSpiritSource } from './syntax';
import {
  CORE_SPIRIT_COMPILER_VERSION,
  CORE_SPIRIT_ARTIFACT_SCHEMA_VERSION,
  CORE_SPIRIT_IR_FORMAT,
  CORE_SPIRIT_IR_VERSION,
  CORE_SPIRIT_RUNTIME_ABI,
  CORE_SPIRIT_OPTIMIZER_ABI,
} from './VERSION';
import { CORE_SPIRIT_COMPILER_PIPELINE_VERSION } from './compilerPipeline';
import { CORE_SCRIPT_LANGUAGE, CORE_SCRIPT_LANGUAGE_VERSION, CORE_SCRIPT_REQUIRED_CAPABILITIES } from './coreScriptLanguagePolicy';
import { CORE_SPIRIT_STANDARD_LIBRARY } from './standardLibrary';

export function coreSpiritComponentFingerprint(options:{components?:CoreSpiritComponentRegistryLike}):string{
  const components=options.components ?? coreSpiritComponentRegistry;
  if(components && typeof components==='object' && 'listContracts' in components)return JSON.stringify((components as any).listContracts());
  return JSON.stringify(components);
}

function coreSpiritBuiltinContracts(): readonly Record<string, unknown>[] {
  // The standard library contract changes executable semantics even when script
  // source is unchanged. Hash signatures and execution metadata, not function
  // bodies or UI catalogue text.
  return CORE_SPIRIT_STANDARD_LIBRARY.map(builtin => ({
    name: builtin.name,
    minArgs: builtin.minArgs,
    maxArgs: builtin.maxArgs ?? null,
    returnType: builtin.returnType,
    pure: builtin.pure,
    capability: builtin.capability ?? null,
    emitKind: builtin.emitKind ?? null,
    category: builtin.category,
    seriesExecution: builtin.seriesExecution ?? null,
    temporalSafety: builtin.temporalSafety ?? null,
  })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** Kept in a light module so cache identity lookup doesn't eagerly load the compiler/VM graph. */
export function buildCoreSpiritSemanticFingerprint(options:{layer?:string;components?:CoreSpiritComponentRegistryLike}={}):string{
  const componentSource=options.components ?? coreSpiritComponentRegistry;
  const componentContracts=componentSource && typeof componentSource==='object' && 'listContracts' in componentSource
    ? (componentSource as any).listContracts()
    : componentSource;
  return JSON.stringify({
    compilerPipeline: 'semantic-v3',
    compilerPipelineVersion: CORE_SPIRIT_COMPILER_PIPELINE_VERSION,
    language: CORE_SCRIPT_LANGUAGE,
    languageVersion: CORE_SCRIPT_LANGUAGE_VERSION,
    capabilities: CORE_SCRIPT_REQUIRED_CAPABILITIES,
    builtins: coreSpiritBuiltinContracts(),
    layer: options.layer || 'script',
    components: componentContracts,
  });
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
    compiler: CORE_SPIRIT_COMPILER_VERSION,
    artifactSchemaVersion: CORE_SPIRIT_ARTIFACT_SCHEMA_VERSION,
    irFormat: CORE_SPIRIT_IR_FORMAT,
    irVersion: CORE_SPIRIT_IR_VERSION,
    semantic: buildCoreSpiritSemanticFingerprint({ layer: options.layer, components: options.components }),
    componentSet: coreSpiritComponentFingerprint(options),
    runtimeABI: CORE_SPIRIT_RUNTIME_ABI,
    optimizerABI: CORE_SPIRIT_OPTIMIZER_ABI,
  });
  const semanticHash=sha256HexSync(`${normalizedHash}\n${semanticFingerprint}`);
  return {key:`${sourceId}:${semanticHash}`,sourceHash,normalizedHash,semanticHash};
}

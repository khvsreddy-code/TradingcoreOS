/**
 * CoreSpirit's language maturity is owned by its own versioned contract.
 * Pine remains a separate import-compatibility frontend and cannot define the
 * CoreSpirit language grammar, type system, or feature status.
 */
import {
  CORE_SPIRIT_AUTHORING_LEVELS,
  CORE_SPIRIT_LANGUAGE_FEATURES,
  getCoreSpiritLanguageFeature,
  validateCoreSpiritLanguageDefinition,
  type CoreSpiritLanguageFeatureStatus,
} from './coreSpiritLanguageDefinition';
import { PINE_FEATURE_REGISTRY, getPineFeature, validatePineFeatureRegistry } from './pine/pineFeatureRegistry';

export type CoreSpiritParityStatus = CoreSpiritLanguageFeatureStatus;
export type CoreSpiritParityDomain = 'language'|'types'|'collections'|'functions'|'events'|'runtime'|'authoring';
export type CoreSpiritFeatureParity = Readonly<{
  id: string;
  domain: CoreSpiritParityDomain;
  status: CoreSpiritParityStatus;
  semantics: string;
}>;

const DOMAIN_BY_FEATURE: Readonly<Record<string,CoreSpiritParityDomain>> = Object.freeze({
  variables:'language', constants:'language', functions:'functions', parameters:'functions',
  'return-values':'functions', 'multiple-return-values':'functions', tuples:'types',
  enums:'types', 'user-defined-record-types':'types', methods:'functions', generics:'types',
  'interfaces-traits':'types', 'conditional-expressions':'language', 'switch-expressions':'language',
  loops:'language', iterators:'collections', closures:'functions', namespaces:'language',
  'imports-exports':'runtime', libraries:'runtime', 'error-handling':'language',
  'type-inference':'types', 'lexical-scope':'language', 'operator-overloading':'types',
  nullability:'types', 'symbol-timeframe-types':'types', 'temporal-qualifiers':'types',
  'external-data-provenance':'runtime', 'prediction-feature-blocks':'collections',
});

export const CORE_SPIRIT_LANGUAGE_FEATURE_MATRIX: readonly CoreSpiritFeatureParity[] = Object.freeze(
  CORE_SPIRIT_LANGUAGE_FEATURES.map(feature => Object.freeze({
    id:feature.id,
    domain:DOMAIN_BY_FEATURE[feature.id] ?? 'language',
    status:feature.status,
    semantics:feature.semantics,
  })),
);

export const CORE_SPIRIT_AUTHORING_SURFACES = Object.freeze({
  beginner:Object.freeze({id:'beginner',description:'Readable declarations, basic conditions, built-in market series and visual output.',parser:'CoreSpiritParser',ast:'CoreSpiritAst',compiler:'CoreSpiritCompiler',runtime:'CoreSpiritExecutionVM'}),
  trader:Object.freeze({id:'trader',description:'Indicators, symbols, timeframes, multi-timeframe operations and broker-neutral strategy intent.',parser:'CoreSpiritParser',ast:'CoreSpiritAst',compiler:'CoreSpiritCompiler',runtime:'CoreSpiritExecutionVM'}),
  quant:Object.freeze({id:'quant',description:'Statistics, typed numerical structures, models, experiments and research workflows.',parser:'CoreSpiritParser',ast:'CoreSpiritAst',compiler:'CoreSpiritCompiler',runtime:'CoreSpiritExecutionVM'}),
  system:Object.freeze({id:'system',description:'Events, policy-controlled automation, external modules, custom kernels and deployment.',parser:'CoreSpiritParser',ast:'CoreSpiritAst',compiler:'CoreSpiritCompiler',runtime:'CoreSpiritExecutionVM'}),
  // Compatibility names; these are not separate parsers or compilers.
  simple:Object.freeze({id:'simple',description:'Compatibility alias for beginner/trader surface syntax.',parser:'CoreSpiritParser',ast:'CoreSpiritAst',compiler:'CoreSpiritCompiler',runtime:'CoreSpiritExecutionVM'}),
  advanced:Object.freeze({id:'advanced',description:'Compatibility alias for quant/system surface syntax.',parser:'CoreSpiritParser',ast:'CoreSpiritAst',compiler:'CoreSpiritCompiler',runtime:'CoreSpiritExecutionVM'}),
} as const);

export const CORE_SPIRIT_AUTHORING_LEVELS_CONTRACT = CORE_SPIRIT_AUTHORING_LEVELS;

/** Pine feature status is deliberately exposed under a Pine-specific name only. */
export const CORE_SPIRIT_PINE_FEATURE_MATRIX = PINE_FEATURE_REGISTRY;

export function getCoreSpiritFeatureParity(id:string):CoreSpiritFeatureParity|undefined {
  const feature=getCoreSpiritLanguageFeature(id);
  return feature ? Object.freeze({
    id:feature.id,
    domain:DOMAIN_BY_FEATURE[feature.id] ?? 'language',
    status:feature.status,
    semantics:feature.semantics,
  }) : undefined;
}

export function validateCoreSpiritFeatureMatrix():string[] {
  const errors=validateCoreSpiritLanguageDefinition();
  const ids=new Set<string>();
  for(const feature of CORE_SPIRIT_LANGUAGE_FEATURE_MATRIX){
    if(ids.has(feature.id)) errors.push('Duplicate CoreSpirit language feature: '+feature.id);
    ids.add(feature.id);
    if(!feature.semantics.trim()) errors.push('CoreSpirit language feature has no semantics: '+feature.id);
  }
  return errors;
}

export function validateCoreSpiritPineCompatibilityMatrix():string[] {
  return validatePineFeatureRegistry();
}

export function getCoreSpiritPineCompatibilityFeature(id:string) {
  return getPineFeature(id);
}

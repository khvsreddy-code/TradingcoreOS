/**
 * Compatibility adapter retained for older CoreSpirit consumers.
 * The canonical Pine feature registry lives in ./pine/pineFeatureRegistry.
 */
import { PINE_FEATURE_REGISTRY, getPineFeature, validatePineFeatureRegistry, type PineFeatureContract, type PineFeatureStatus, type PineFeatureDomain } from './pine/pineFeatureRegistry';

export type CoreSpiritParityStatus=PineFeatureStatus;
export type CoreSpiritParityDomain=PineFeatureDomain;
export type CoreSpiritFeatureParity=PineFeatureContract;

export const CORE_SPIRIT_AUTHORING_SURFACES=Object.freeze({
  simple:Object.freeze({id:'simple',description:'Concise trading surface: DATA / LET / WHEN / SHOW.',parser:'CoreSpiritParser',ast:'CoreSpiritAst',compiler:'CoreSpiritCompiler',runtime:'CoreSpiritExecutionVM'}),
  advanced:Object.freeze({id:'advanced',description:'Explicit quantitative/system surface: types, functions, models, events, state and research.',parser:'CoreSpiritParser',ast:'CoreSpiritAst',compiler:'CoreSpiritCompiler',runtime:'CoreSpiritExecutionVM'}),
} as const);

/** Alias only: no second feature list or independent status vocabulary is maintained. */
export const CORE_SPIRIT_PINE_FEATURE_MATRIX=PINE_FEATURE_REGISTRY;
export function getCoreSpiritFeatureParity(id:string){return getPineFeature(id);}
export function validateCoreSpiritFeatureMatrix():string[]{return validatePineFeatureRegistry();}

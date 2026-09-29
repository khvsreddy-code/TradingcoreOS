import { CORE_SPIRIT_AUTHORING_LEVELS, type CoreSpiritAuthoringLevel } from './coreSpiritExecutionModel';

export const CORE_SPIRIT_AUTHORING_FEATURES = Object.freeze([
  'core-data',
  'simple-visuals',
  'reactive-conditions',
  'component-composition',
  'model-declarations',
  'multi-symbol',
  'multi-timeframe',
  'custom-visuals',
  'automation',
  'execution-targets',
  'component-contracts',
  'ir-inspection',
  'runtime-inspection',
  'research',
  'backtesting',
  'optimization',
  'stdlib-namespaces',
  'complexity-absorber',
  'model-component-abi',
  'semantic-lineage',
] as const);
export type CoreSpiritAuthoringFeature = typeof CORE_SPIRIT_AUTHORING_FEATURES[number];

export type CoreSpiritAuthoringProfile = Readonly<{
  level: CoreSpiritAuthoringLevel;
  label: string;
  description: string;
  features: readonly CoreSpiritAuthoringFeature[];
  showAdvancedGraph: boolean;
  showRuntimeDetails: boolean;
  showCapabilities: boolean;
  showIr: boolean;
  showComponentContracts: boolean;
  showPerformanceControls: boolean;
  showLibraryNamespaces: boolean;
  showComplexityLayers: boolean;
  showModelComponentAbi: boolean;
}>;

const SIMPLE_FEATURES: readonly CoreSpiritAuthoringFeature[] = Object.freeze([
  'core-data', 'simple-visuals', 'reactive-conditions',
]);
const ADVANCED_FEATURES: readonly CoreSpiritAuthoringFeature[] = Object.freeze([
  ...SIMPLE_FEATURES, 'component-composition', 'model-declarations', 'multi-symbol', 'multi-timeframe', 'custom-visuals', 'automation', 'stdlib-namespaces',
]);
const PROFESSIONAL_FEATURES: readonly CoreSpiritAuthoringFeature[] = Object.freeze([
  ...ADVANCED_FEATURES, 'execution-targets', 'component-contracts', 'ir-inspection', 'runtime-inspection', 'research', 'backtesting', 'optimization', 'complexity-absorber', 'model-component-abi', 'semantic-lineage',
]);

function authoringProfile(level: CoreSpiritAuthoringLevel): CoreSpiritAuthoringProfile {
  if (level === 'simple') return Object.freeze({
    level, label:'Simple', description:'Start with readable data, visuals and reactive conditions.', features:SIMPLE_FEATURES,
    showAdvancedGraph:false, showRuntimeDetails:false, showCapabilities:false, showIr:false, showComponentContracts:false, showPerformanceControls:false, showLibraryNamespaces:false, showComplexityLayers:false, showModelComponentAbi:false,
  });
  if (level === 'advanced') return Object.freeze({
    level, label:'Advanced', description:'Compose calculations, components, models and richer realtime logic on the same language.', features:ADVANCED_FEATURES,
    showAdvancedGraph:true, showRuntimeDetails:false, showCapabilities:false, showIr:false, showComponentContracts:false, showPerformanceControls:false, showLibraryNamespaces:true, showComplexityLayers:false, showModelComponentAbi:false,
  });
  return Object.freeze({
    level, label:'Professional', description:'Expose the full composition, execution, research and inspection surfaces without changing the language.', features:PROFESSIONAL_FEATURES,
    showAdvancedGraph:true, showRuntimeDetails:true, showCapabilities:true, showIr:true, showComponentContracts:true, showPerformanceControls:true, showLibraryNamespaces:true, showComplexityLayers:true, showModelComponentAbi:true,
  });
}

export function detectCoreSpiritAuthoringLevel(source:string): CoreSpiritAuthoringLevel {
  const text = String(source ?? '').trim();
  if (!text) return 'simple';
  const advanced = /\b(model|automate|market\(|timeframe\(|request\(|multi|predict|scan\.|regime\(|volatility\(|motion\()\b/i.test(text);
  const professional = /\b(type\b|gpu|wasm|worker|capabilit|order\b|risk\b|research\b|replay\b|optimization\b|backtest\b|component\b|pipeline\b|ir\b)\b/i.test(text);
  return professional ? 'professional' : advanced ? 'advanced' : 'simple';
}

export function getCoreSpiritAuthoringProfile(source:string): CoreSpiritAuthoringProfile {
  return authoringProfile(detectCoreSpiritAuthoringLevel(source));
}

export function getCoreSpiritAuthoringProfileForLevel(level: CoreSpiritAuthoringLevel): CoreSpiritAuthoringProfile {
  return authoringProfile(level);
}

export { CORE_SPIRIT_AUTHORING_LEVELS };

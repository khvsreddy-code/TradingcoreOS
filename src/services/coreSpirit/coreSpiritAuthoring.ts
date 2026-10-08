import { CORE_SPIRIT_AUTHORING_LEVELS, type CoreSpiritAuthoringLevel } from './coreSpiritExecutionModel';
import { inferCoreScriptLevel } from './coreScriptLanguagePolicy';

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
  'programmable-indicators',
  'declarative-indicator-artifacts',
  'matrix',
  'tensor',
  'system-events',
  'explicit-capabilities',
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

const BEGINNER_FEATURES: readonly CoreSpiritAuthoringFeature[] = Object.freeze([
  'core-data', 'simple-visuals', 'reactive-conditions',
]);
const TRADER_FEATURES: readonly CoreSpiritAuthoringFeature[] = Object.freeze([
  ...BEGINNER_FEATURES, 'component-composition', 'model-declarations', 'multi-symbol', 'multi-timeframe', 'custom-visuals', 'automation', 'stdlib-namespaces',
]);
const QUANT_FEATURES: readonly CoreSpiritAuthoringFeature[] = Object.freeze([
  ...TRADER_FEATURES, 'programmable-indicators', 'declarative-indicator-artifacts', 'matrix', 'tensor', 'execution-targets', 'component-contracts', 'ir-inspection', 'runtime-inspection', 'research', 'backtesting', 'optimization', 'complexity-absorber', 'model-component-abi', 'semantic-lineage',
]);

function authoringProfile(level: CoreSpiritAuthoringLevel): CoreSpiritAuthoringProfile {
  if (level === 'beginner') return Object.freeze({
    level, label:'Beginner', description:'Start with readable data, indicators, visuals and reactive conditions.', features:BEGINNER_FEATURES,
    showAdvancedGraph:false, showRuntimeDetails:false, showCapabilities:false, showIr:false, showComponentContracts:false, showPerformanceControls:false, showLibraryNamespaces:false, showComplexityLayers:false, showModelComponentAbi:false,
  });
  if (level === 'trader') return Object.freeze({
    level, label:'Trader', description:'Compose multi-symbol calculations, strategies and richer realtime conditions on the same language.', features:TRADER_FEATURES,
    showAdvancedGraph:true, showRuntimeDetails:false, showCapabilities:false, showIr:false, showComponentContracts:false, showPerformanceControls:false, showLibraryNamespaces:true, showComplexityLayers:false, showModelComponentAbi:false,
  });
  if (level === 'quant') return Object.freeze({
    level, label:'Quant', description:'Use first-class features, predictions, models, research and backtesting without leaving CoreSpirit.', features:QUANT_FEATURES,
    showAdvancedGraph:true, showRuntimeDetails:true, showCapabilities:true, showIr:true, showComponentContracts:true, showPerformanceControls:true, showLibraryNamespaces:true, showComplexityLayers:true, showModelComponentAbi:true,
  });
  return Object.freeze({
    level, label:'System Builder', description:'Compose events and automation around the host-owned risk and execution authority boundary.', features:Object.freeze([...QUANT_FEATURES, 'automation'] as CoreSpiritAuthoringFeature[]),
    showAdvancedGraph:true, showRuntimeDetails:true, showCapabilities:true, showIr:true, showComponentContracts:true, showPerformanceControls:true, showLibraryNamespaces:true, showComplexityLayers:true, showModelComponentAbi:true,
  });
}

export function detectCoreSpiritAuthoringLevel(source:string): CoreSpiritAuthoringLevel {
  const text = String(source ?? '').trim();
  if (!text) return 'beginner';
  return inferCoreScriptLevel({
    hasModel: /\bmodel\s+/i.test(text) || /\b(?:predict|probability|featureSet|trainingData|modelArtifact)\b/i.test(text),
    hasResearch: /\b(?:research|backtest|evaluate|optimi[sz]e|experiment|trainingData)\b/i.test(text),
    hasMatrix: /\bmatrix(?:<|\s*\()/i.test(text),
    hasTensor: /\btensor(?:<|\s*\()/i.test(text),
    hasMultiSymbol: /\bmarket\s*\(/i.test(text) && (text.match(/\bmarket\s*\(/gi)?.length ?? 0) > 1),
    hasMultiTimeframe: /\.timeframe\s*\(|\btimeframe\s*\(/i.test(text),
    hasSystemEvent: /\bon\s+(?:market\.tick|order\.fill|position\.update)\b/i.test(text),
    hasAutomation: /\b(?:automate\s+|automation\.)/i.test(text),
    hasOrderIntent: /\b(?:entry|exit|buy|sell)\s*(?:\(|(?:long|short|flat)\b)/i.test(text) || /\border\s*\(/i.test(text),
  });
}

export function getCoreSpiritAuthoringProfile(source:string): CoreSpiritAuthoringProfile {
  return authoringProfile(detectCoreSpiritAuthoringLevel(source));
}

export function getCoreSpiritAuthoringProfileForLevel(level: CoreSpiritAuthoringLevel): CoreSpiritAuthoringProfile {
  return authoringProfile(level);
}

export { CORE_SPIRIT_AUTHORING_LEVELS };

import {
  CORE_SPIRIT_AUTHORING_LEVELS,
  inferCoreSpiritRequiredLevel,
  type CoreSpiritAuthoringLevel,
  type CoreSpiritAuthoringLevelFacts,
} from './coreSpiritExecutionModel';
import type { CoreSpiritProgramLayer } from './layeredPlatformContract';
import { CoreSpiritParser } from './parser';
import { normalizeCoreSpiritSource } from './syntax';
import { describeCoreSpiritSurface } from './surfaceForms';
import { analyzeCoreSpirit } from './semanticAnalyzer';
import { buildCoreSpiritSemanticDependencyGraph } from './semanticDependencyGraph';
import { buildCoreSpiritTradingNativePlan } from './tradingNativePlan';
import { buildCoreSpiritResearchPlan } from './researchSurface';
import { coreSpiritComponentRegistry } from './coreSpiritComponents';

export const CORE_SPIRIT_AUTHORING_FEATURES = Object.freeze([
  'core-data', 'simple-visuals', 'reactive-conditions', 'component-composition',
  'model-declarations', 'multi-symbol', 'multi-timeframe', 'custom-visuals', 'automation',
  'execution-targets', 'component-contracts', 'ir-inspection', 'runtime-inspection',
  'research', 'backtesting', 'optimization', 'stdlib-namespaces', 'complexity-absorber',
  'model-component-abi', 'semantic-lineage', 'programmable-indicators',
  'declarative-indicator-artifacts', 'strategy', 'models', 'matrix', 'tensor',
  'system-events', 'explicit-capabilities',
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

export type CoreSpiritAuthoringSourceAnalysis = Readonly<{
  level: CoreSpiritAuthoringLevel;
  syntaxValid: boolean;
  diagnostics: readonly string[];
  reasons: readonly string[];
  facts: CoreSpiritAuthoringLevelFacts;
}>;

const BEGINNER_FEATURES: readonly CoreSpiritAuthoringFeature[] = Object.freeze([
  'core-data', 'simple-visuals', 'reactive-conditions',
]);
const TRADER_FEATURES: readonly CoreSpiritAuthoringFeature[] = Object.freeze([
  ...BEGINNER_FEATURES, 'component-composition', 'multi-symbol', 'multi-timeframe',
  'custom-visuals', 'strategy', 'stdlib-namespaces',
]);
const QUANT_FEATURES: readonly CoreSpiritAuthoringFeature[] = Object.freeze([
  ...TRADER_FEATURES, 'model-declarations', 'programmable-indicators',
  'declarative-indicator-artifacts', 'matrix', 'tensor', 'models', 'research',
  'execution-targets', 'component-contracts', 'ir-inspection', 'runtime-inspection',
  'backtesting', 'optimization', 'complexity-absorber', 'model-component-abi', 'semantic-lineage',
]);

function authoringProfile(level: CoreSpiritAuthoringLevel): CoreSpiritAuthoringProfile {
  if (level === 'beginner') return Object.freeze({
    level, label:'Beginner',
    description:'Start with readable market data, common indicators, guided conditions and editable signals. The source remains ordinary CoreScript.',
    features:BEGINNER_FEATURES,
    showAdvancedGraph:false, showRuntimeDetails:false, showCapabilities:false, showIr:false,
    showComponentContracts:false, showPerformanceControls:false, showLibraryNamespaces:false,
    showComplexityLayers:false, showModelComponentAbi:false,
  });
  if (level === 'trader') return Object.freeze({
    level, label:'Trader',
    description:'Build strategies and multi-symbol/timeframe calculations. Inspect signal and bar context, then validate costs and execution assumptions.',
    features:TRADER_FEATURES,
    showAdvancedGraph:true, showRuntimeDetails:false, showCapabilities:false, showIr:false,
    showComponentContracts:false, showPerformanceControls:false, showLibraryNamespaces:true,
    showComplexityLayers:false, showModelComponentAbi:false,
  });
  if (level === 'quant') return Object.freeze({
    level, label:'Quant',
    description:'Inspect typed features, rolling windows, models, backtests, experiment inputs and repaint/leakage diagnostics without changing languages.',
    features:QUANT_FEATURES,
    showAdvancedGraph:true, showRuntimeDetails:true, showCapabilities:true, showIr:true,
    showComponentContracts:true, showPerformanceControls:true, showLibraryNamespaces:true,
    showComplexityLayers:true, showModelComponentAbi:true,
  });
  return Object.freeze({
    level, label:'System Builder',
    description:'Compose event-driven workflows, explicit capabilities and automation around host-owned risk and execution controls.',
    features:Object.freeze([...QUANT_FEATURES, 'automation', 'system-events', 'explicit-capabilities'] as CoreSpiritAuthoringFeature[]),
    showAdvancedGraph:true, showRuntimeDetails:true, showCapabilities:true, showIr:true,
    showComponentContracts:true, showPerformanceControls:true, showLibraryNamespaces:true,
    showComplexityLayers:true, showModelComponentAbi:true,
  });
}

const analysisCache = new Map<string, CoreSpiritAuthoringSourceAnalysis>();
const MAX_ANALYSIS_CACHE = 32;

function cacheAnalysis(key: string, analysis: CoreSpiritAuthoringSourceAnalysis): CoreSpiritAuthoringSourceAnalysis {
  analysisCache.delete(key);
  analysisCache.set(key, analysis);
  while (analysisCache.size > MAX_ANALYSIS_CACHE) analysisCache.delete(analysisCache.keys().next().value!);
  return analysis;
}

/**
 * Infer source-required authoring level from the normalized AST, typed semantic
 * values and dependency plans. A display estimate is never a permission grant:
 * compiler capability requirements and the runtime sandbox are validated separately.
 */
export function analyzeCoreSpiritAuthoringSource(
  source: string,
  layer: CoreSpiritProgramLayer = 'script',
): CoreSpiritAuthoringSourceAnalysis {
  const text = String(source ?? '');
  const cacheKey = layer + '\0' + text;
  const cached = analysisCache.get(cacheKey);
  if (cached) {
    analysisCache.delete(cacheKey);
    analysisCache.set(cacheKey, cached);
    return cached;
  }
  const fallbackFacts: CoreSpiritAuthoringLevelFacts = Object.freeze({});
  if (!text.trim()) {
    return cacheAnalysis(cacheKey, Object.freeze({
      level:'beginner', syntaxValid:true, diagnostics:Object.freeze([]),
      reasons:Object.freeze(['A new program starts in the guided Beginner view.']),
      facts:fallbackFacts,
    }));
  }
  try {
    const surface = describeCoreSpiritSurface(text, { components:coreSpiritComponentRegistry });
    const parsed = new CoreSpiritParser(normalizeCoreSpiritSource(text)).parseDetailed();
    if (parsed.diagnostics.length > 0) {
      return cacheAnalysis(cacheKey, Object.freeze({
        level:'beginner', syntaxValid:false,
        diagnostics:Object.freeze(parsed.diagnostics.map(item => item.message)),
        reasons:Object.freeze(['Fix syntax errors before relying on a source-required level estimate.']),
        facts:fallbackFacts,
      }));
    }
    const semantic = analyzeCoreSpirit(parsed.ast, { layer, surface, components:coreSpiritComponentRegistry });
    const graph = buildCoreSpiritSemanticDependencyGraph(parsed.ast, semantic, surface);
    const tradingPlan = buildCoreSpiritTradingNativePlan(parsed.ast, surface);
    const researchPlan = buildCoreSpiritResearchPlan(text, surface);
    const semanticTypeNames = [
      ...[...semantic.symbols.values()].map(type => String(type)),
      ...[...semantic.udts.values()].flatMap(declaration => declaration.fields.map(field => String(field.type))),
    ];
    const semanticContainers = [...semantic.semanticSymbols.values()].map(type => type.container).filter(Boolean);
    const hasModel = researchPlan.models.length > 0 ||
      graph.nodes.some(node => node.kind === 'model' || node.kind === 'model-output');
    const hasResearch = researchPlan.backtests.length > 0 || researchPlan.modelSpecs.length > 0;
    const hasMatrix = semanticContainers.includes('matrix') || semanticTypeNames.some(type => /^matrix(?:<|$)/i.test(type));
    const hasTensor = semanticContainers.includes('tensor') || semanticTypeNames.some(type => /^tensor(?:<|$)/i.test(type));
    const hasMultiSymbol = tradingPlan.dataDependencies
      .map(dependency => dependency.symbol)
      .filter(symbol => symbol !== 'current')
      .filter((symbol, index, all) => all.indexOf(symbol) === index).length > 1;
    const hasMultiTimeframe = tradingPlan.dataDependencies.some(dependency => dependency.timeframe !== 'chart');
    const hasSystemEvent = graph.nodes.some(node => node.kind === 'event');
    const hasAutomation = graph.nodes.some(node => node.kind === 'automation') ||
      surface.declarations.some(declaration => declaration.kind === 'automation');
    const hasOrderIntent = graph.nodes.some(node => node.kind === 'order-intent');
    const hasStrategy = surface.declarations.some(declaration => declaration.kind === 'indicator' && declaration.role === 'strategy') ||
      hasOrderIntent;
    const facts: CoreSpiritAuthoringLevelFacts = Object.freeze({
      model:hasModel, research:hasResearch, matrix:hasMatrix, tensor:hasTensor,
      multiSymbol:hasMultiSymbol, multiTimeframe:hasMultiTimeframe, strategy:hasStrategy,
      systemEvent:hasSystemEvent, automation:hasAutomation, orderIntent:hasOrderIntent,
    });
    const reasons = [
      ...(hasMultiSymbol ? ['Multiple market symbols'] : []),
      ...(hasMultiTimeframe ? ['Explicit timeframe data'] : []),
      ...(hasStrategy || hasOrderIntent ? ['Strategy or order-intent semantics'] : []),
      ...(hasModel ? ['Model or prediction declaration'] : []),
      ...(hasResearch ? ['Backtest/research declarations'] : []),
      ...(hasMatrix ? ['Typed matrix computation'] : []),
      ...(hasTensor ? ['Typed tensor computation'] : []),
      ...(hasSystemEvent ? ['Event-driven source'] : []),
      ...(hasAutomation ? ['Automation source'] : []),
    ];
    return cacheAnalysis(cacheKey, Object.freeze({
      level:inferCoreSpiritRequiredLevel(facts),
      syntaxValid:true,
      diagnostics:Object.freeze([]),
      reasons:Object.freeze(reasons.length ? reasons : ['CoreScript uses the guided indicator/data surface.']),
      facts,
    }));
  } catch (error) {
    return cacheAnalysis(cacheKey, Object.freeze({
      level:'beginner', syntaxValid:false,
      diagnostics:Object.freeze([error instanceof Error ? error.message : String(error)]),
      reasons:Object.freeze(['Source analysis is unavailable; compiler diagnostics and host capability checks still apply.']),
      facts:fallbackFacts,
    }));
  }
}

export function detectCoreSpiritAuthoringLevel(source: string): CoreSpiritAuthoringLevel {
  return analyzeCoreSpiritAuthoringSource(source).level;
}

export function getCoreSpiritAuthoringProfile(source: string): CoreSpiritAuthoringProfile {
  return authoringProfile(detectCoreSpiritAuthoringLevel(source));
}

export function getCoreSpiritAuthoringProfileForLevel(level: CoreSpiritAuthoringLevel): CoreSpiritAuthoringProfile {
  return authoringProfile(level);
}

export { CORE_SPIRIT_AUTHORING_LEVELS };

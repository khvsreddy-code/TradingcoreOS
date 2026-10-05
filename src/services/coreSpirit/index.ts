/** CoreSpirit architecture authority: docs/CORESPIRIT.md */
export * from './types';
export * from './ast';
export * from './lexer';
export * from './parser';
export { analyzeCoreSpirit } from './semanticAnalyzer';
export type { CoreSpiritDiagnostic, CoreSpiritUdt, CoreSpiritSemanticOptions, CoreSpiritSemanticResult } from './semanticAnalyzer';

export * from './ir';
export * from './compiler';
export * from './standardLibrary';
export * from './standardLibraryNamespaces';
export * from './callContract';
export * from './memberRegistry';
export * from './surfaceForms';
export * from './languageConcepts';
export * from './nameResolver';
export * from './optimizer';
export { lexCoreSpirit, parseCoreSpiritStage, resolveCoreSpiritStage, typeCheckCoreSpiritStage, lowerCoreSpiritStage, compileCoreSpiritStages, serializeCoreSpiritAst } from './pipelineStages';
export * from './indicatorEngine';
export * from './coreSpiritPipeline';
export * from './runtime';
export * from './outputDispatcher';
export * from './chartOutputController';
export * from './chartRegistry';
export * from './chartRunner';
export * from './dataPlanner';
export * from './editorModel';
export * from './dataCache';
export * from './timeframeAlignment';
export * from './footprintScene';

export * from './incrementalAst';
export * from './hotReload';
export * from './monacoAdapter';
export * from './languageSpec';
export * from './temporalTypes';
export * from './repaintSafety';
export * from './profiler';
export * from './typeSystem';

export * from './executionContext';
export * from './seriesEngine';
export * from './seriesVector';
export * from './seriesFusion';
export * from './session';
export * from './irContract';
export * from './replay';
export * from './coreSpiritRoadmap';
export { CORE_SPIRIT_DEFAULT_SANDBOX, validateCoreSpiritSandboxPolicy } from './sandboxPolicy';
export type { CoreSpiritSandboxPolicy, CoreSpiritCapability as CoreSpiritPolicyCapability } from './sandboxPolicy';
export * from './executionProtocol';
export * from './sourceMetadata';
export * from './strategyContract';
export * from './debuggerContract';
export { CORE_SPIRIT_REPLAY_VERSION, replayIsDeterministic } from './replayContract';
export * from './signalBoundary';

export * from './layeredPlatformContract';
export * from './languageFoundation';
export * from './visualCoordinates';

export * from './runtimeKernel';
export * from './modelAbi';
export * from './modelSurface';

export * from './executionAuthority';
export * from './explainability';
export * from './ideRuntimeBridge';
export * from './marketData';
export * from './executionHost';
export * from './executionTarget';
export * from './scanner';
export * from './signalEngine';
export * from './executionAdapter';
export * from './architectureContract';
export * from './platformRuntime';

export * from './canonicalTradingModel';

export * from './uiRuntime';
export * from './visualMetadata';

export * from './visualAdvanced';

export * from './visualApp';
export * from './multiSymbolTimeframe';

export * from './modelOrchestration';
export * from './researchApiContract';

export * from './aiModel';
export * from './modelVisualization';

export * from './visualDebugger';

export * from './semanticGraph';
export * from './reactiveEngine';

export * from './executionPlanner';
export { CORE_SPIRIT_SANDBOX_LIMITS, CoreSpiritCapabilityDeniedError, CoreSpiritSandboxQuotaError, CoreSpiritCapabilitySandbox, createCoreSpiritSandbox, validateCoreSpiritSandboxArchitecture, computeCapabilityForBackend } from './capabilitySandbox';
export type { CoreSpiritSandboxCapability, CoreSpiritForbiddenCapability as CoreSpiritSandboxForbiddenCapability, CoreSpiritSandboxLimits, CoreSpiritCapabilitySandboxOptions } from './capabilitySandbox';
export * from './coreSpiritV1Runtime';

export * from './visualProjection';

export * from './orderIntent';
export * from './eventSurface';
export * from './automationSurface';
export * from './eventSystem';
export * from './eventEngine';

export * from './composability';

export * from './surfaceCst';
export * from './compilerPipeline';

export * from './semanticDependencyGraph';

export * from './sourceInspector';
export * from './artifactIdentity';
export * from './runManifest';
export * from './executionEnvironment';
export * from './sessionCalendar';
export * from './storageSchema';

export * from './deploymentLifecycle';
export * from './reconciliation';


export { CORE_SPIRIT_AUTHORING_LEVELS, CORE_SPIRIT_EXECUTION_CONTEXTS, CORE_SPIRIT_VALUE_KINDS, CORE_SPIRIT_NODE_CLASSES, CORE_SPIRIT_COMPONENT_BACKENDS, classifyCoreSpiritValueKind, executionLaneForNode, executionClassForNode, deriveCoreSpiritNodeExecutionDescriptor } from './coreSpiritExecutionModel';
export type { CoreSpiritAuthoringLevel, CoreSpiritValueKind, CoreSpiritNodeClass, CoreSpiritValueType, CoreSpiritComponentBackend, CoreSpiritComponentExecutionProfile, CoreSpiritComponentStateProfile, CoreSpiritComponentDocumentation, CoreSpiritComponentPort, CoreSpiritComponentContract, CoreSpiritExecutionLane, CoreSpiritNodeExecutionDescriptor } from './coreSpiritExecutionModel';

export * from './coreSpiritPerformance';

export * from './coreSpiritComponents';

export * from './incrementalCompiler';

export * from './artifactCache';

export * from './coreSpiritLineage';

export * from './coreSpiritPackage';

export * from './coreSpiritAuthoring';
export * from './coreSpiritComplexityAbsorber';
export * from './semanticComponentAdapters';


export * from './coreSpiritIndicatorComponent';

export * from './semanticTypeSystem';

export * from './indicatorPresetSystem';

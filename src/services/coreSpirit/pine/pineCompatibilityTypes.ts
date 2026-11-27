import type { CoreSpiritProgramKind, CoreSpiritPineDeclarationMetadata } from '../ast';

export const PINE_FEATURE_STATUSES = Object.freeze([
  'not_implemented',
  'implemented_unverified',
  'partially_conformant',
  'conformant',
  'host_limited',
  'not_applicable',
] as const);

export type PineFeatureStatus = typeof PINE_FEATURE_STATUSES[number];
export type PineFeatureDomain = 'language'|'types'|'collections'|'functions'|'visuals'|'data'|'strategy'|'libraries'|'runtime'|'events';
export type PineFeatureMode = 'compile'|'historical'|'realtime'|'replay'|'reference-vm'|'optimized-vm';
export type PineExecutionMode = 'historical'|'realtime'|'replay';
export type PineScriptKind = Extract<CoreSpiritProgramKind,'indicator'|'strategy'|'library'>;
export type PineDeclarationMode = 'default'|'var'|'varip';
export type PineStateClass = 'bar-local'|'committed-persistent'|'intrabar-persistent'|'series-history'|'drawing-reference'|'function-call-site'|'external-model';
export type PineFixtureOutcome = 'passed'|'failed'|'host_limited'|'not_applicable';
export type PineFixtureEvidence = Readonly<Record<string,PineFixtureOutcome>>;
export type PineEditorCompletion = Readonly<{label:string;kind:'function'|'keyword'|'type';insertText:string;detail:string}>;

export interface PineFeatureContract {
  id: string;
  domain: PineFeatureDomain;
  officialReference: string;
  implementationFiles: string[];
  prerequisites: string[];
  testFixtures: string[];
  supportedModes: PineFeatureMode[];
  status: PineFeatureStatus;
  knownDifferences: string[];
  editorCompletions?: readonly PineEditorCompletion[];
}

export type PineFeatureDefinition = Omit<PineFeatureContract,'status'> & Readonly<{applicable?:boolean}>;

export type PineConformanceFixture = Readonly<{
  id:string;
  featureId:string;
  description:string;
  source:string;
  frontend:'pine-v6';
  mode:PineExecutionMode;
  parseOnly?:boolean;
  expectedProgramKind?:'indicator'|'strategy'|'library';
  expectedDiagnostic?:string;
}>;

export type PineRuntimeContract = Readonly<{
  scriptKind:PineScriptKind;
  mode:PineExecutionMode;
  declaration:CoreSpiritPineDeclarationMetadata;
  seriesHistoryIsCausal:true;
  outputsAreRevisioned:true;
}>;

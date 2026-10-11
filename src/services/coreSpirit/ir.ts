import type { CoreSpiritGraphBundle } from './semanticGraph';
import type { CoreSpiritSurfaceMetadata } from './languageConcepts';
import type { CoreSpiritSemanticDependencyGraph } from './semanticDependencyGraph';
import type { CoreSpiritOptimizationPlan } from './optimizer';
import type { CoreSpiritExecutionPlan } from './executionPlanner';
import type { CoreSpiritCompilerPipelineTrace } from './compilerPipeline';
import type { CoreSpiritIrEmitKind } from './callContract';
import type { CoreSpiritSpecializedPlan } from './specializedPlan';
import type { CoreSpiritTradingNativePlan } from './tradingNativePlan';
import type { CoreSpiritRepaintSafetyReport } from './repaintSafety';
import type { CoreSpiritCausalityReport } from './causalityAnalysis';
import type { CoreSpiritExecutionPlanVisualization } from './executionPlanVisualizer';
import type { CoreSpiritResearchPlan } from './researchSurface';
import type { CoreSpiritAuthoringLevel } from './coreSpiritExecutionModel';
import type { CoreSpiritSemanticType } from './semanticTypeSystem';
import type { CoreScriptLanguageFeature, CoreScriptRequiredCapability, CoreScriptCapabilityRequirement, CoreScriptLanguagePolicy } from './coreScriptLanguagePolicy';

export type CoreSpiritIrValueType = 'number' | 'boolean' | 'string' | 'null' | 'unknown';
export type CoreSpiritIrValue = { kind:'const'; value:number|string|boolean|null } | { kind:'series'; name:string; offset:number } | { kind:'local'; name:string };

export type CoreSpiritIrInstructionOrigin = {
  sourceNodeId: string;
  start: number;
  end: number;
  line: number;
  column: number;
};

export type CoreSpiritIrInstruction =
  | { op:'const'; dest:string; value:number|string|boolean|null; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'loadSeries'; dest:string; name:string; offset:number; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'loadState'; dest:string; name:string; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'move'; dest:string; source:string; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'unary'; dest:string; operator:'!'|'+'|'-'; operand:string; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'binary'; dest:string; operator:string; left:string; right:string; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'call'; dest:string; name:string; args:string[]; seriesArgs?:string[]; seriesSources?:Array<{ ref:string; field:'open'|'high'|'low'|'close'|'volume'|'time' }>; callId?:string; componentId?:string; componentPure?:boolean; componentStateful?:boolean; componentDeterministic?:boolean; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'index'; dest:string; target:string; index:string; seriesName?:string; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'setLocal'; name:string; source:string; series?: boolean; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'setState'; name:string; source:string; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'eventGate'; eventName:string; target:number; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'jumpIfFalse'; condition:string; target:number; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'jump'; target:number; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'emit'; kind:CoreSpiritIrEmitKind; args:string[]; outputId?:string; origin?:CoreSpiritIrInstructionOrigin };

export type CoreSpiritIrBlock = { instructions:CoreSpiritIrInstruction[] };
export type CoreSpiritSourceMapEntry = { instruction:number; sourceNodeId?:string; start:number; end:number; line:number; column:number; kind:string };
export type CoreSpiritSourceMap = { version:1; sourceId:string; entries:CoreSpiritSourceMapEntry[] };

export function coreSpiritSourceMapFromInstructions(
  sourceId: string,
  instructions: readonly CoreSpiritIrInstruction[],
): CoreSpiritSourceMap {
  return {
    version: 1,
    sourceId,
    entries: instructions.flatMap((instruction,index) => instruction.origin ? [{
      instruction:index,
      sourceNodeId:instruction.origin.sourceNodeId,
      start:instruction.origin.start,
      end:instruction.origin.end,
      line:instruction.origin.line,
      column:instruction.origin.column,
      kind:
        instruction.op === 'emit' ? 'emit:' + instruction.kind :
        instruction.op === 'call' ? 'call:' + instruction.name :
        instruction.op,
    }] : []),
  };
}

export type CoreSpiritIrProgram = {
  version:1;
  sourceId:string;
  entry:CoreSpiritIrBlock;
  locals:string[];
  maxLookback:number;
  diagnostics:string[];
  sourceMap:CoreSpiritSourceMap;
  graphs?:CoreSpiritGraphBundle;
  surface?:CoreSpiritSurfaceMetadata;
  semanticDependencyGraph?:CoreSpiritSemanticDependencyGraph;
  optimizationPlan?:CoreSpiritOptimizationPlan;
  executionPlan?:CoreSpiritExecutionPlan;
  specializedPlan?:CoreSpiritSpecializedPlan;
  tradingNativePlan?:CoreSpiritTradingNativePlan;
  repaintSafety?:CoreSpiritRepaintSafetyReport;
  /** Static source-level temporal evidence; diagnostic metadata, never runtime authority. */
  causalityAnalysis?:CoreSpiritCausalityReport;
  executionPlanVisualization?:CoreSpiritExecutionPlanVisualization;
  researchPlan?:CoreSpiritResearchPlan;
  authoringLevel?:CoreSpiritAuthoringLevel;
  languageCapabilities?: readonly string[];
  languageFeatures?: readonly CoreScriptLanguageFeature[];
  requiredCapabilities?: readonly CoreScriptRequiredCapability[];
  capabilityRequirements?: readonly CoreScriptCapabilityRequirement[];
  languagePolicy?: CoreScriptLanguagePolicy;
  language?: 'CoreScript';
  languageVersion?: 1;
  /** Inferred semantic facts retained on the executable artifact for advanced inspection. */
  semanticEnvironment?: Readonly<Record<string, CoreSpiritSemanticType>>;
  compilerPipeline?:CoreSpiritCompilerPipelineTrace;
};

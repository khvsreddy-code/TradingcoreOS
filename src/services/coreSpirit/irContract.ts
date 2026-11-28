import type { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import { validateCoreSpiritCompilerPipelineTrace } from './compilerPipeline';
import { CORE_SPIRIT_AUTHORING_LEVELS } from './coreSpiritExecutionModel';
import { validateCoreSpiritIrInstructionShape } from './irSpecification';

/**
 * Stable CoreSpirit VM contract. The VM executes this contract, never AST nodes.
 * Keep opcode names and operand meaning backwards compatible within this version.
 */
export const CORE_SPIRIT_IR_FORMAT = 'coreSpirit-ir' as const;
export const CORE_SPIRIT_IR_VERSION = 1 as const;

export const CORE_SPIRIT_IR_OPCODES = [
  'const','loadSeries','loadState','move','unary','binary','call','index','setLocal','setState',
  'eventGate','jumpIfFalse','jump','emit',
] as const;
export type CoreSpiritIrOpcode = typeof CORE_SPIRIT_IR_OPCODES[number];

function hasValidInstructionOrigin(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const origin=value as Record<string,unknown>;
  const start=origin.start; const end=origin.end; const line=origin.line; const column=origin.column;
  return typeof origin.sourceNodeId === 'string' &&
    typeof start === 'number' && typeof end === 'number' &&
    typeof line === 'number' && typeof column === 'number' &&
    Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start &&
    Number.isInteger(line) && line >= 1 && Number.isInteger(column) && column >= 1;
}

export function isCoreSpiritIrInstruction(value: unknown): value is CoreSpiritIrInstruction {
  const instruction = value as CoreSpiritIrInstruction | undefined;
  return !!instruction && validateCoreSpiritIrInstructionShape(instruction) &&
    (CORE_SPIRIT_IR_OPCODES as readonly string[]).includes(instruction.op) &&
    (instruction.origin === undefined || hasValidInstructionOrigin(instruction.origin));
}

export function validateCoreSpiritIr(program: unknown): program is CoreSpiritIrProgram {
  const p = program as CoreSpiritIrProgram | undefined;
  if (!p || p.version !== CORE_SPIRIT_IR_VERSION || typeof p.sourceId !== 'string') return false;
  const programKinds=['indicator','strategy','automation','prediction','library','script'] as const;
  if (p.programKind !== undefined && !(programKinds as readonly string[]).includes(p.programKind)) return false;
  if (p.programTitle !== undefined && (typeof p.programTitle !== 'string' || !p.programTitle.trim() || p.programTitle.length > 160)) return false;
  if (p.programTitle !== undefined && p.programKind === undefined) return false;
  if (p.programLayer !== undefined && !(['script','model','strategy','automation'] as const).includes(p.programLayer)) return false;
  if (p.programKind !== undefined && p.programLayer !== undefined) {
    const expectedLayer = p.programKind === 'strategy' ? 'strategy'
      : p.programKind === 'automation' ? 'automation'
      : p.programKind === 'prediction' ? 'model'
      : 'script';
    if (p.programKind !== 'library' && p.programKind !== 'script' && p.programLayer !== expectedLayer) return false;
  }
  if (p.languageEdition !== undefined && p.languageEdition !== '1.0' && p.languageEdition !== '1.2') return false;
  if (!p.entry || !Array.isArray(p.entry.instructions) || !Array.isArray(p.locals)) return false;
  if (!Number.isInteger(p.maxLookback) || p.maxLookback < 0) return false;
  if (p.graphs && (p.graphs.semantic.version !== 1 || p.graphs.execution.version !== 1 || p.graphs.visual.version !== 1 || p.graphs.reactive.version !== 1)) return false;
  if (p.semanticDependencyGraph && p.semanticDependencyGraph.version !== 1) return false;
  if (p.optimizationPlan && p.optimizationPlan.version !== 1) return false;
  if (p.executionPlan && p.executionPlan.version !== 1) return false;
  if (p.repaintSafety && p.repaintSafety.version !== 1) return false;
  if (p.executionPlanVisualization && p.executionPlanVisualization.version !== 1) return false;
  if (p.compilerPipeline && !validateCoreSpiritCompilerPipelineTrace(p.compilerPipeline)) return false;
  if (p.authoringLevel !== undefined &&
      !(CORE_SPIRIT_AUTHORING_LEVELS as readonly string[]).includes(p.authoringLevel)) return false;
  if (p.languagePolicy) {
    if (p.languagePolicy.language !== 'CoreScript' ||
        !(CORE_SPIRIT_AUTHORING_LEVELS as readonly string[]).includes(p.languagePolicy.level)) return false;
    if (p.authoringLevel !== undefined && p.languagePolicy.level !== p.authoringLevel) return false;
    if (p.requiredCapabilities && p.languagePolicy.requiredCapabilities) {
      const required = [...new Set(p.requiredCapabilities)].sort();
      const policyRequired = [...new Set(p.languagePolicy.requiredCapabilities)].sort();
      if (required.length !== policyRequired.length ||
          required.some((capability, index) => capability !== policyRequired[index])) return false;
    }
  }
  if (!p.entry.instructions.every(isCoreSpiritIrInstruction)) return false;
  const instructionCount=p.entry.instructions.length;
  return p.entry.instructions.every(instruction =>
    instruction.op !== 'jump' && instruction.op !== 'jumpIfFalse' && instruction.op !== 'eventGate'
      ? true
      : instruction.target <= instructionCount
  );
}

/** Stable structural representation used by caches, replay and worker transport. */
export function serializeCoreSpiritIr(program: CoreSpiritIrProgram): string {
  if (!validateCoreSpiritIr(program)) throw new Error('Invalid CoreSpirit IR');
  return stableStringify(program);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
}

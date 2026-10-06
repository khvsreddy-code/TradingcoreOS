import type { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import { validateCoreSpiritCompilerPipelineTrace } from './compilerPipeline';

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
  return !!instruction && typeof instruction === 'object' &&
    typeof (instruction as any).op === 'string' &&
    (CORE_SPIRIT_IR_OPCODES as readonly string[]).includes((instruction as any).op) &&
    ((instruction as any).origin === undefined || hasValidInstructionOrigin((instruction as any).origin));
}

export function validateCoreSpiritIr(program: unknown): program is CoreSpiritIrProgram {
  const p = program as CoreSpiritIrProgram | undefined;
  if (!p || p.version !== CORE_SPIRIT_IR_VERSION || typeof p.sourceId !== 'string') return false;
  if (!p.entry || !Array.isArray(p.entry.instructions) || !Array.isArray(p.locals)) return false;
  if (!Number.isInteger(p.maxLookback) || p.maxLookback < 0) return false;
  if (p.graphs && (p.graphs.semantic.version !== 1 || p.graphs.execution.version !== 1 || p.graphs.visual.version !== 1 || p.graphs.reactive.version !== 1)) return false;
  if (p.semanticDependencyGraph && p.semanticDependencyGraph.version !== 1) return false;
  if (p.optimizationPlan && p.optimizationPlan.version !== 1) return false;
  if (p.executionPlan && p.executionPlan.version !== 1) return false;
  if (p.repaintSafety && p.repaintSafety.version !== 1) return false;
  if (p.executionPlanVisualization && p.executionPlanVisualization.version !== 1) return false;
  if (p.compilerPipeline && !validateCoreSpiritCompilerPipelineTrace(p.compilerPipeline)) return false;
  return p.entry.instructions.every(isCoreSpiritIrInstruction);
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

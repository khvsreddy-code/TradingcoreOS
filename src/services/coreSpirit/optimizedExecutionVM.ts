import type { CoreSpiritIrInstruction } from './ir';
import type { CoreSpiritOutputCollector } from './outputCollector';
import type { CoreSpiritExecutionVMHost } from './executionVM';
import { CoreSpiritExecutionVM } from './executionVM';
import { CoreSpiritSlotValueStore } from './executionValueStore';
import type { CoreSpiritSeriesRegistry } from './seriesRegistry';
import type { CoreSpiritSpecializedInstruction, CoreSpiritSpecializedPlan } from './specializedPlan';
import { buildCoreSpiritSpecializedPlan } from './specializedPlan';

type FastInstruction = CoreSpiritSpecializedInstruction;
export type CoreSpiritExecutionCacheVersions = Readonly<{
  compilerVersion?: string | number;
  componentDefinitionVersion?: string | number;
  executionConfigurationVersion?: string | number;
}>;
type ReusableStoreLease = {
  readonly store: CoreSpiritSlotValueStore;
  inUse: boolean;
  /** True only after a complete successful run has populated every register on its executed paths. */
  hasValidValues: boolean;
};
interface CompiledPlan {
  readonly instructions: readonly FastInstruction[];
  readonly slotByName: ReadonlyMap<string, number>;
  readonly slotCount: number;
  readonly cacheVersion: string;
  /** Reuse is scoped to an execution context; an in-flight/re-entrant run gets a private scratch store. */
  readonly reusableStores: WeakMap<object, ReusableStoreLease>;
}

function cacheVersion(versions: CoreSpiritExecutionCacheVersions = {}): string {
  return JSON.stringify([
    versions.compilerVersion ?? 'corescript-ir-v1',
    versions.componentDefinitionVersion ?? 'components-default',
    versions.executionConfigurationVersion ?? 'execution-default',
  ]);
}

function assertSlot(plan: CoreSpiritSpecializedPlan, register: string, actual: number, where: string): void {
  const expected = plan.slotByName.get(register);
  if (expected === undefined || expected !== actual) throw new Error(`specialized plan has stale slot mapping for '${register}' at ${where}`);
}

/** Fail closed if a caller supplied a plan compiled for another IR or compiler configuration. */
function validateSpecializedPlan(
  source: readonly CoreSpiritIrInstruction[],
  plan: CoreSpiritSpecializedPlan,
): void {
  if (plan.version !== 1 || plan.instructions.length !== source.length) throw new Error('specialized plan version/instruction count mismatch');
  if (!Number.isInteger(plan.slotCount) || plan.slotCount < 0 || plan.slotByName.size !== plan.slotCount) {
    throw new Error('specialized plan has an invalid slot table');
  }
  const slots = [...plan.slotByName.values()];
  if (slots.some(slot => !Number.isInteger(slot) || slot < 0 || slot >= plan.slotCount) ||
      new Set(slots).size !== plan.slotCount) {
    throw new Error('specialized plan slot table is not a dense unique mapping');
  }

  for (let index = 0; index < source.length; index += 1) {
    const original = source[index]!;
    const lowered = plan.instructions[index]!;
    if (lowered.op !== original.op) throw new Error(`specialized plan opcode mismatch at instruction ${index}`);
    if ('dest' in original) {
      if (!('dest' in lowered) || typeof lowered.dest !== 'number') throw new Error(`specialized plan missing destination slot at instruction ${index}`);
      assertSlot(plan, original.dest, lowered.dest, `instruction ${index} destination`);
    }

    switch (original.op) {
      case 'const':
        if (lowered.op !== 'const' || !Object.is(lowered.value, original.value)) throw new Error(`specialized constant is stale at instruction ${index}`);
        break;
      case 'loadSeries':
        if (lowered.op !== 'loadSeries' || lowered.name !== original.name || lowered.offset !== original.offset) throw new Error(`specialized series load is stale at instruction ${index}`);
        break;
      case 'loadState':
        if (lowered.op !== 'loadState' || lowered.name !== original.name) throw new Error(`specialized state load is stale at instruction ${index}`);
        break;
      case 'move':
        if (lowered.op !== 'move' || lowered.source !== original.source) throw new Error(`specialized move is stale at instruction ${index}`);
        break;
      case 'setLocal':
        if (lowered.op !== 'setLocal' || lowered.name !== original.name || lowered.series !== (original.series !== false)) {
          throw new Error(`specialized setLocal metadata is stale at instruction ${index}`);
        }
        assertSlot(plan, original.source, lowered.source, `instruction ${index} local source`);
        break;
      case 'setState':
        if (lowered.op !== 'setState' || lowered.name !== original.name) throw new Error(`specialized setState metadata is stale at instruction ${index}`);
        assertSlot(plan, original.source, lowered.source, `instruction ${index} state source`);
        break;
      case 'unary':
        if (lowered.op !== 'unary' || lowered.operator !== original.operator) throw new Error(`specialized unary metadata is stale at instruction ${index}`);
        assertSlot(plan, original.operand, lowered.operand, `instruction ${index} operand`);
        break;
      case 'binary':
        if (lowered.op !== 'binary' || lowered.operator !== original.operator) throw new Error(`specialized binary metadata is stale at instruction ${index}`);
        assertSlot(plan, original.left, lowered.left, `instruction ${index} left operand`);
        assertSlot(plan, original.right, lowered.right, `instruction ${index} right operand`);
        break;
      case 'call':
        if (lowered.op !== 'call' || lowered.instruction !== original || lowered.name !== original.name ||
            lowered.args.length !== original.args.length) throw new Error(`specialized call metadata is stale at instruction ${index}`);
        original.args.forEach((name, argIndex) => assertSlot(plan, name, lowered.args[argIndex]!, `instruction ${index} argument ${argIndex}`));
        break;
      case 'index':
        if (lowered.op !== 'index' || lowered.instruction !== original) throw new Error(`specialized index metadata is stale at instruction ${index}`);
        assertSlot(plan, original.index, lowered.index, `instruction ${index} index`);
        assertSlot(plan, original.target, lowered.target, `instruction ${index} target`);
        break;
      case 'eventGate':
        if (lowered.op !== 'eventGate' || lowered.eventName !== original.eventName || lowered.target !== original.target) {
          throw new Error(`specialized event gate is stale at instruction ${index}`);
        }
        break;
      case 'jumpIfFalse':
        if (lowered.op !== 'jumpIfFalse' || lowered.target !== original.target) throw new Error(`specialized conditional jump is stale at instruction ${index}`);
        assertSlot(plan, original.condition, lowered.condition, `instruction ${index} condition`);
        break;
      case 'jump':
        if (lowered.op !== 'jump' || lowered.target !== original.target) throw new Error(`specialized jump is stale at instruction ${index}`);
        break;
      case 'emit':
        if (lowered.op !== 'emit' || lowered.instruction !== original ||
            lowered.args.length !== Math.max(0, original.args.length - 1)) throw new Error(`specialized emit metadata is stale at instruction ${index}`);
        original.args.slice(1).forEach((name, argIndex) => assertSlot(plan, name, lowered.args[argIndex]!, `instruction ${index} emitted argument ${argIndex}`));
        break;
    }
  }
}

function instructionReads(instruction: CoreSpiritIrInstruction): readonly string[] {
  switch (instruction.op) {
    case 'setLocal':
    case 'setState': return [instruction.source];
    case 'unary': return [instruction.operand];
    case 'binary': return [instruction.left, instruction.right];
    case 'call': return instruction.args;
    case 'index': return [instruction.index, instruction.target];
    case 'jumpIfFalse': return [instruction.condition];
    case 'emit': return instruction.args;
    default: return [];
  }
}

function isComputationalInstruction(instruction: CoreSpiritIrInstruction): boolean {
  return instruction.op === 'const' || instruction.op === 'loadSeries' ||
    instruction.op === 'loadState' || instruction.op === 'move' ||
    instruction.op === 'unary' || instruction.op === 'binary' ||
    instruction.op === 'call' || instruction.op === 'index';
}

/**
 * Only skip pure deterministic expressions whose input registers have known-good
 * retained values. State, locals, and unclassified calls are always executed.
 */
function isSafeToSkipDirty(instruction: CoreSpiritIrInstruction): boolean {
  switch (instruction.op) {
    case 'const':
    case 'loadSeries':
    case 'unary':
    case 'binary':
    case 'index':
      return true;
    case 'call':
      return instruction.componentPure === true &&
        instruction.componentDeterministic === true &&
        instruction.componentStateful !== true;
    default:
      return false;
  }
}

/**
 * Extend a caller's invalidation set through register consumers. This is
 * deliberately conservative: reused register names and control-flow joins
 * over-invalidate rather than permit a dependent expression to read stale data.
 * An invalid index disables incremental skipping and requests a full run.
 */
function expandDirtyInstructionSet(
  instructions: readonly CoreSpiritIrInstruction[],
  requested: ReadonlySet<number>,
): Set<number> | undefined {
  const dirty = new Set<number>();
  for (const index of requested) {
    if (!Number.isInteger(index) || index < 0 || index >= instructions.length) return undefined;
    dirty.add(index);
  }

  const consumers = new Map<string, number[]>();
  for (let index = 0; index < instructions.length; index += 1) {
    for (const register of instructionReads(instructions[index]!)) {
      const list = consumers.get(register) ?? [];
      list.push(index);
      consumers.set(register, list);
    }
    // Loads from mutable state/locals and calls without an explicit pure,
    // deterministic contract may change on every tick; propagate their
    // invalidation to downstream expressions even if the caller omitted them.
    const instruction = instructions[index]!;
    if (isComputationalInstruction(instruction) && !isSafeToSkipDirty(instruction)) dirty.add(index);
  }

  // Event gates can change independently of bar fields. A dirty conditional
  // means the taken CFG path may have changed, so we must rebuild all live
  // registers on that pass rather than reuse values from the opposite branch.
  for (let index = 0; index < instructions.length; index += 1) {
    if (instructions[index]?.op === 'eventGate') dirty.add(index);
  }
  const queue = [...dirty];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const instruction = instructions[queue[cursor]!];
    if (!instruction || !('dest' in instruction) || typeof instruction.dest !== 'string') continue;
    for (const dependent of consumers.get(instruction.dest) ?? []) {
      if (dirty.has(dependent)) continue;
      dirty.add(dependent);
      queue.push(dependent);
    }
  }
  if ([...dirty].some(index => {
    const instruction = instructions[index];
    return instruction?.op === 'jumpIfFalse' || instruction?.op === 'eventGate';
  })) return undefined;
  return dirty;
}

function compilePlan(
  instructions: readonly CoreSpiritIrInstruction[],
  seriesRegistry: CoreSpiritSeriesRegistry | undefined,
  specializedPlan: CoreSpiritSpecializedPlan | undefined,
  version: string,
): CompiledPlan {
  const plan = specializedPlan ?? buildCoreSpiritSpecializedPlan(instructions, seriesRegistry);
  validateSpecializedPlan(instructions, plan);
  const boundInstructions = seriesRegistry
    ? plan.instructions.map((instruction) => {
      if (instruction.op === 'setLocal' && instruction.series && instruction.seriesId < 0) {
        return { ...instruction, seriesId: seriesRegistry.idFor(instruction.name) };
      }
      if (instruction.op === 'index' && instruction.seriesId < 0 && instruction.instruction.seriesName) {
        return { ...instruction, seriesId: seriesRegistry.idFor(instruction.instruction.seriesName) };
      }
      return instruction;
    })
    : plan.instructions;
  return {
    instructions: Object.freeze(boundInstructions),
    slotByName: plan.slotByName,
    slotCount: plan.slotCount,
    cacheVersion: version,
    reusableStores: new WeakMap<object, ReusableStoreLease>(),
  };
}

/** Optimized scalar executor with guarded plans and context-isolated numeric registers. */
export class CoreSpiritOptimizedExecutionVM {
  private readonly plans = new WeakMap<object, WeakMap<object, CompiledPlan>>();
  private readonly reference = new CoreSpiritExecutionVM();

  prepare(
    instructions: readonly CoreSpiritIrInstruction[],
    seriesRegistry?: CoreSpiritSeriesRegistry,
    specializedPlan?: CoreSpiritSpecializedPlan,
    versions: CoreSpiritExecutionCacheVersions = {},
  ): void {
    const key = (specializedPlan ?? seriesRegistry ?? this) as object;
    let variants = this.plans.get(instructions as object);
    if (!variants) { variants = new WeakMap<object, CompiledPlan>(); this.plans.set(instructions as object, variants); }
    const version = cacheVersion(versions);
    const current = variants.get(key);
    if (current?.cacheVersion === version) return;
    // A supplied specialization cannot survive a version change. Re-lower the
    // canonical IR unless the caller supplies a different plan object/key.
    const planForVersion = current ? undefined : specializedPlan;
    try { variants.set(key, compilePlan(instructions, seriesRegistry, planForVersion, version)); }
    catch { /* An invalid/stale specialization is deliberately handled by the reference path in run(). */ }
  }

  run(
    instructions: CoreSpiritIrInstruction[],
    barIndex: number,
    host: CoreSpiritExecutionVMHost,
    output: CoreSpiritOutputCollector,
    options: {
      reuseValues?: boolean;
      /** Clear the reusable register file before a complete run, e.g. on a new candle/program pass. */
      resetValues?: boolean;
      dirtyInstructions?: ReadonlySet<number>;
      seriesRegistry?: CoreSpiritSeriesRegistry;
      specializedPlan?: CoreSpiritSpecializedPlan;
      executionContextKey?: object;
    } & CoreSpiritExecutionCacheVersions = {},
  ): void {
    const key = (options.specializedPlan ?? options.seriesRegistry ?? this) as object;
    let variants = this.plans.get(instructions as object);
    if (!variants) { variants = new WeakMap<object, CompiledPlan>(); this.plans.set(instructions as object, variants); }
    const version = cacheVersion(options);
    let plan = variants.get(key);
    if (!plan || plan.cacheVersion !== version) {
      const planForVersion = plan ? undefined : options.specializedPlan;
      try {
        plan = compilePlan(instructions, options.seriesRegistry, planForVersion, version);
        variants.set(key, plan);
      } catch {
        // Do not run a malformed slot plan. The reference VM has no register lowering and is the safe fallback.
        this.reference.run(instructions, barIndex, host, output);
        return;
      }
    }

    let values: CoreSpiritSlotValueStore;
    let lease: ReusableStoreLease | undefined;
    let ownsLease = false;
    if (options.reuseValues === true) {
      const contextKey = options.executionContextKey ?? host;
      lease = plan.reusableStores.get(contextKey);
      if (!lease) {
        lease = { store: new CoreSpiritSlotValueStore(plan.slotByName, plan.slotCount), inUse: false, hasValidValues: false };
        plan.reusableStores.set(contextKey, lease);
      }
      if (lease.inUse) {
        // Re-entrant execution can occur from a component host callback. Never let it mutate
        // the outer run's live registers; use an isolated scratch store for this nested run.
        values = new CoreSpiritSlotValueStore(plan.slotByName, plan.slotCount);
        lease = undefined;
      } else {
        lease.inUse = true;
        ownsLease = true;
        values = lease.store;
      }
    } else {
      values = new CoreSpiritSlotValueStore(plan.slotByName, plan.slotCount);
    }

    try {
      const requestedDirty = options.dirtyInstructions;
      const canReuseDirtyValues = Boolean(
        requestedDirty &&
        options.reuseValues === true &&
        options.resetValues !== true &&
        ownsLease &&
        lease?.hasValidValues,
      );
      // Any failed run leaves a partial register file. Mark it invalid until a
      // full/dirty execution finishes successfully, so the next tick falls back.
      if (ownsLease && lease) lease.hasValidValues = false;
      const dirty = canReuseDirtyValues && requestedDirty
        ? expandDirtyInstructionSet(instructions, requestedDirty)
        : undefined;
      // A missing, stale, or CFG-invalid dirty plan must start from an empty
      // register file. This includes recovery after a prior partial/error run.
      if (options.resetValues === true || !dirty) values.clear();
      let pc = 0;
      let steps = 0;
      while (pc < plan.instructions.length) {
        if (++steps > host.maxStepsPerBar) throw new Error('execution step limit exceeded');
        if ((steps & 1023) === 0) host.throwIfAborted();
        const instructionPc = pc;
        const computational = isComputationalInstruction(instructions[instructionPc]!);
        if (dirty && computational && !dirty.has(instructionPc) && isSafeToSkipDirty(instructions[instructionPc]!)) {
          pc = instructionPc + 1;
          continue;
        }
        const profiler = host.profileInstruction;
        const ins = plan.instructions[instructionPc]!;
        const sourceInstruction = instructions[instructionPc] ?? (ins.op === 'call' || ins.op === 'index' || ins.op === 'emit' ? ins.instruction : null);
        if (sourceInstruction) profiler?.beforeInstruction(instructionPc, sourceInstruction);
        try {
          switch (ins.op) {
            case 'const': values.set(ins.dest, ins.value); pc += 1; break;
            case 'loadSeries': values.set(ins.dest, host.loadSeries(ins.name, ins.offset)); pc += 1; break;
            case 'loadState': values.set(ins.dest, host.loadState(ins.name)); pc += 1; break;
            case 'move': values.set(ins.dest, host.moveLocal(ins.source)); pc += 1; break;
            case 'setLocal':
              if (ins.series !== false && ins.seriesId >= 0 && host.setLocalBySeriesId) host.setLocalBySeriesId(ins.seriesId, ins.name, values.get(ins.source));
              else host.setLocal(ins.name, values.get(ins.source), ins.series !== false);
              pc += 1; break;
            case 'setState': host.setState(ins.name, values.get(ins.source)); pc += 1; break;
            case 'unary': values.set(ins.dest, host.unary(ins.operator, values.get(ins.operand))); pc += 1; break;
            case 'binary': values.set(ins.dest, host.binary(ins.operator, values.get(ins.left), values.get(ins.right))); pc += 1; break;
            case 'call': {
              if (host.tryFused(pc, values, instructions, barIndex)) { pc += 1; break; }
              values.set(ins.dest, host.call(ins.instruction, ins.args.map(arg => values.get(arg))));
              pc += 1; break;
            }
            case 'index': {
              const index = Number(values.get(ins.index));
              if (!Number.isInteger(index) || index < 0) throw new Error('invalid historical index ' + String(index));
              const value = ins.seriesId >= 0 && host.loadIndexedSeriesById
                ? host.loadIndexedSeriesById(ins.seriesId, index)
                : host.loadIndexed(ins.instruction, index, values);
              values.set(ins.dest, value); pc += 1; break;
            }
            case 'eventGate': pc = host.eventActive(ins.eventName) ? pc + 1 : ins.target; break;
            case 'jumpIfFalse': pc = host.truthy(values.get(ins.condition)) ? pc + 1 : ins.target; break;
            case 'jump': pc = ins.target; break;
            case 'emit': host.emit(ins.instruction, values, output); pc += 1; break;
          }
        } finally {
          if (sourceInstruction) profiler?.afterInstruction(instructionPc, sourceInstruction);
        }
      }
      if (ownsLease && lease) lease.hasValidValues = true;
    } finally {
      if (ownsLease && lease) lease.inUse = false;
    }
  }
}

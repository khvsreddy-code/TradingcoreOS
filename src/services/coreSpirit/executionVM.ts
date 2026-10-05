import type { CoreSpiritIrInstruction } from './ir';
import type { CoreSpiritObject, CoreSpiritValue } from './types';
import type { CoreSpiritOutputCollector } from './outputCollector';
import type { CoreSpiritValueStore } from './executionValueStore';

type CoreSpiritCallInstruction = Extract<CoreSpiritIrInstruction, { op: 'call' }>;
type CoreSpiritIndexInstruction = Extract<CoreSpiritIrInstruction, { op: 'index' }>;
type CoreSpiritEmitInstruction = Extract<CoreSpiritIrInstruction, { op: 'emit' }>;

export type CoreSpiritExecutionVMHost = {
  maxStepsPerBar: number;
  throwIfAborted: () => void;
  loadSeries: (name: string, offset: number) => number | null;
  moveLocal: (source: string) => unknown;
  setLocal: (name: string, value: unknown, series: boolean) => void;
  setLocalBySeriesId?: (id: number, name: string, value: unknown) => void;
  unary: (operator: string, value: unknown) => unknown;
  binary: (operator: string, left: unknown, right: unknown) => unknown;
  tryFused: (pc: number, values: CoreSpiritValueStore, instructions: CoreSpiritIrInstruction[], barIndex: number) => boolean;
  call: (instruction: CoreSpiritCallInstruction, args: unknown[]) => unknown;
  loadIndexed: (instruction: CoreSpiritIndexInstruction, index: number, values: CoreSpiritValueStore) => number | null | CoreSpiritValue;
  loadIndexedSeriesById?: (id: number, index: number) => number | null | CoreSpiritValue;
  truthy: (value: unknown) => boolean;
  emit: (instruction: CoreSpiritEmitInstruction, values: CoreSpiritValueStore, output: CoreSpiritOutputCollector) => void;
};

export class CoreSpiritExecutionVM {
  run(
    instructions: CoreSpiritIrInstruction[],
    barIndex: number,
    host: CoreSpiritExecutionVMHost,
    output: CoreSpiritOutputCollector,
  ): void {
    const values = new Map<string, unknown>();
    let pc = 0;
    let steps = 0;
    while (pc < instructions.length) {
      if (++steps > host.maxStepsPerBar) throw new Error('execution step limit exceeded');
      if ((steps & 1023) === 0) host.throwIfAborted();
      const ins = instructions[pc];
      switch (ins.op) {
        case 'const':
          values.set(ins.dest, ins.value);
          pc += 1;
          break;
        case 'loadSeries':
          values.set(ins.dest, host.loadSeries(ins.name, ins.offset));
          pc += 1;
          break;
        case 'move':
          values.set(ins.dest, host.moveLocal(ins.source));
          pc += 1;
          break;
        case 'setLocal':
          host.setLocal(ins.name, values.get(ins.source), ins.series !== false);
          pc += 1;
          break;
        case 'unary':
          values.set(ins.dest, host.unary(ins.operator, values.get(ins.operand)));
          pc += 1;
          break;
        case 'binary':
          values.set(ins.dest, host.binary(ins.operator, values.get(ins.left), values.get(ins.right)));
          pc += 1;
          break;
        case 'call': {
          if (host.tryFused(pc, values, instructions, barIndex)) {
            pc += 1;
            break;
          }
          const args = ins.args.map((name) => values.get(name));
          values.set(ins.dest, host.call(ins, args));
          pc += 1;
          break;
        }
        case 'index': {
          const index = Number(values.get(ins.index));
          if (!Number.isInteger(index) || index < 0) throw new Error(`invalid historical index ${String(index)}`);
          values.set(ins.dest, host.loadIndexed(ins, index, values));
          pc += 1;
          break;
        }
        case 'jumpIfFalse':
          pc = host.truthy(values.get(ins.condition)) ? pc + 1 : ins.target;
          break;
        case 'jump':
          pc = ins.target;
          break;
        case 'emit':
          host.emit(ins, values, output);
          pc += 1;
          break;
      }
    }
  }
}

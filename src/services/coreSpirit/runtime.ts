import { HistoricalCandle } from '../brokers/BrokerAdapter';
import { CoreSpiritObject, CoreSpiritProgram } from './types';

/**
 * Minimal stateful execution contract. The language/compiler can grow behind
 * this boundary without coupling the chart to parser implementation details.
 */
export class CoreSpiritRuntime {
  execute(program: CoreSpiritProgram, bars: HistoricalCandle[]): CoreSpiritObject[] {
    const outputs: CoreSpiritObject[] = [];
    for (let barIndex = 0; barIndex < bars.length; barIndex++) {
      this.executeNode(program.ast, bars, barIndex, outputs);
    }
    return outputs;
  }

  private executeNode(node: any, bars: HistoricalCandle[], index: number, outputs: CoreSpiritObject[]): void {
    if (node?.type === 'program') for (const child of node.body ?? []) this.executeNode(child, bars, index, outputs);
    // Compiler/evaluator implementations plug in here; unsupported syntax is
    // intentionally inert rather than allowed to break chart rendering.
  }
}

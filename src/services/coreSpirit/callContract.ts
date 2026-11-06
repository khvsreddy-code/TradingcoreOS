import type { CoreSpiritType } from './typeSystem';

/** Shared call/lowering contracts. Direct functions and namespaced members use the same descriptor model. */
export type CoreSpiritIrEmitKind =
  | 'plot'|'marker'|'label'|'labelAt'|'line'|'zone'|'box'|'band'|'fill'|'gradient'|'arrow'|'shape'
  | 'heatmap'|'polyline'|'hline'|'bg'|'barcolor'|'table'|'text'|'polygon'|'customVisual'|'plotshape'|'plotchar'|'alertcondition'
  | 'signal'|'entry'|'exit'|'buy'|'sell'|'orderIntent'|'alert'|'webhook'|'event'|'scanCandidate'|'show';

export type CoreSpiritMemberNamespace = 'ui'|'visual'|'app'|'scan'|'panel';

export type CoreSpiritMemberContract = {
  namespace: CoreSpiritMemberNamespace;
  member: string;
  callName: string;
  minArgs: number;
  maxArgs?: number;
  returnType: CoreSpiritType;
  emitKind?: CoreSpiritIrEmitKind;
  actionArgIndices?: readonly number[];
  capability?: 'alert'|'webhook'|'market'|'ai';
  category: 'ui'|'visual'|'app'|'scan';
};

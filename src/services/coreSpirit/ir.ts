import type { CoreSpiritGraphBundle } from './semanticGraph';
import type { CoreSpiritSurfaceMetadata } from './languageConcepts';
import type { CoreSpiritIrEmitKind } from './callContract';
/** CoreSpirit IR is deterministic, serializable, and independent of the chart renderer. */
export type CoreSpiritIrValueType = 'number' | 'boolean' | 'string' | 'null' | 'unknown';
export type CoreSpiritIrValue = { kind:'const'; value:number|string|boolean|null } | { kind:'series'; name:string; offset:number } | { kind:'local'; name:string };

/** Stable source provenance carried directly by each IR instruction. */
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
  | { op:'move'; dest:string; source:string; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'unary'; dest:string; operator:'!'|'+'|'-'; operand:string; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'binary'; dest:string; operator:string; left:string; right:string; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'call'; dest:string; name:string; args:string[]; seriesArgs?:string[]; seriesSources?:Array<{ ref:string; field:'open'|'high'|'low'|'close'|'volume'|'time' }>; callId?:string; componentId?:string; componentPure?:boolean; componentStateful?:boolean; componentDeterministic?:boolean; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'index'; dest:string; target:string; index:string; seriesName?:string; origin?:CoreSpiritIrInstructionOrigin }
  | { op:'setLocal'; name:string; source:string; series?: boolean; origin?:CoreSpiritIrInstructionOrigin }
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
      kind:instruction.op === 'emit' ? 'emit:' + instruction.kind : instruction.op === 'call' ? 'call:' + instruction.name : instruction.op,
    }] : []),
  };
}

export type CoreSpiritIrProgram = { version:1; sourceId:string; entry:CoreSpiritIrBlock; locals:string[]; maxLookback:number; diagnostics:string[]; sourceMap:CoreSpiritSourceMap; graphs?: CoreSpiritGraphBundle; surface?: CoreSpiritSurfaceMetadata };

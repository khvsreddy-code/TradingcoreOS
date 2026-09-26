import type { CoreSpiritGraphBundle } from './semanticGraph';
/** CoreSpirit IR is deterministic, serializable, and independent of the chart renderer. */
export type CoreSpiritIrValueType = 'number' | 'boolean' | 'string' | 'null' | 'unknown';
export type CoreSpiritIrValue = { kind:'const'; value:number|string|boolean|null } | { kind:'series'; name:string; offset:number } | { kind:'local'; name:string };
export type CoreSpiritIrInstruction =
  | { op:'const'; dest:string; value:number|string|boolean|null }
  | { op:'loadSeries'; dest:string; name:string; offset:number }
  | { op:'move'; dest:string; source:string }
  | { op:'unary'; dest:string; operator:'!'|'+'|'-'; operand:string }
  | { op:'binary'; dest:string; operator:string; left:string; right:string }
  | { op:'call'; dest:string; name:string; args:string[]; seriesArgs?:string[]; seriesSources?:Array<{ ref:string; field:'open'|'high'|'low'|'close'|'volume'|'time' }>; callId?:string }
  | { op:'index'; dest:string; target:string; index:string; seriesName?:string }
  | { op:'setLocal'; name:string; source:string; series?: boolean }
  | { op:'jumpIfFalse'; condition:string; target:number }
  | { op:'jump'; target:number }
  | { op:'emit'; kind:'plot'|'marker'|'label'|'labelAt'|'line'|'zone'|'box'|'band'|'fill'|'gradient'|'arrow'|'shape'|'heatmap'|'polyline'|'hline'|'bg'|'barcolor'|'table'|'signal'|'entry'|'exit'|'buy'|'sell'|'alert'|'webhook'|'scanCandidate'; args:string[]; outputId?:string };
export type CoreSpiritIrBlock = { instructions:CoreSpiritIrInstruction[] };
export type CoreSpiritSourceMapEntry = { instruction:number; start:number; end:number; line:number; column:number; kind:string };
export type CoreSpiritSourceMap = { version:1; sourceId:string; entries:CoreSpiritSourceMapEntry[] };
export type CoreSpiritIrProgram = { version:1; sourceId:string; entry:CoreSpiritIrBlock; locals:string[]; maxLookback:number; diagnostics:string[]; sourceMap:CoreSpiritSourceMap; graphs?: CoreSpiritGraphBundle };

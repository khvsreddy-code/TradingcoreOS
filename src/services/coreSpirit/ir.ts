/** CoreSpirit IR is deterministic, serializable, and independent of the chart renderer. */
export type CoreSpiritIrValueType = 'number' | 'boolean' | 'string' | 'null' | 'unknown';
export type CoreSpiritIrValue = { kind:'const'; value:number|string|boolean|null } | { kind:'series'; name:string; offset:number } | { kind:'local'; name:string };
export type CoreSpiritIrInstruction =
  | { op:'const'; dest:string; value:number|string|boolean|null }
  | { op:'loadSeries'; dest:string; name:string; offset:number }
  | { op:'move'; dest:string; source:string }
  | { op:'unary'; dest:string; operator:'!'|'+'|'-'; operand:string }
  | { op:'binary'; dest:string; operator:string; left:string; right:string }
  | { op:'call'; dest:string; name:string; args:string[]; seriesArgs?:string[] }
  | { op:'index'; dest:string; target:string; index:string; seriesName?:string }
  | { op:'setLocal'; name:string; source:string }
  | { op:'jumpIfFalse'; condition:string; target:number }
  | { op:'jump'; target:number }
  | { op:'emit'; kind:'plot'|'marker'|'line'|'zone'|'signal'|'alert'|'webhook'; args:string[] };
export type CoreSpiritIrBlock = { instructions:CoreSpiritIrInstruction[] };
export type CoreSpiritIrProgram = { version:1; sourceId:string; entry:CoreSpiritIrBlock; locals:string[]; maxLookback:number; diagnostics:string[] };

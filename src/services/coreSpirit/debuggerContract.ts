/** CoreSpirit debugger contract: execution inspection, never a second VM. */
export const CORE_SPIRIT_DEBUGGER_VERSION = 1 as const;
export type DebuggerValue = number | boolean | string | null;
export interface DebuggerSourceLocation { line: number; column: number; length?: number; }
export interface DebuggerAstRef { nodeId: string; kind: string; source?: DebuggerSourceLocation; }
export interface DebuggerIrStep { pc: number; opcode: string; args: readonly unknown[]; astNodeId?: string; source?: DebuggerSourceLocation; value?: DebuggerValue; resultRegister?: string; }
export interface DebuggerStateEntry { name: string; value: DebuggerValue; }
export interface DebuggerBarSnapshot {
  barIndex: number; timestamp: number; symbol: string; timeframe: string;
  mode: "historical" | "realtime" | "replay"; confirmed: boolean; revision: number;
  values: readonly DebuggerStateEntry[];
}
export interface DebuggerOutput { kind: "plot" | "signal" | "label" | "diagnostic"; name?: string; value?: DebuggerValue; message?: string; }
export interface DebuggerFrame { bar: DebuggerBarSnapshot; source?: DebuggerSourceLocation; ast?: DebuggerAstRef; ir?: DebuggerIrStep; state: readonly DebuggerStateEntry[]; outputs: readonly DebuggerOutput[]; }
export interface CoreSpiritDebuggerSnapshot { version: typeof CORE_SPIRIT_DEBUGGER_VERSION; programChecksum: string; bar: DebuggerBarSnapshot; frames: readonly DebuggerFrame[]; }
export function createDebuggerSnapshot(input: Omit<CoreSpiritDebuggerSnapshot, "version">): CoreSpiritDebuggerSnapshot { return { version: CORE_SPIRIT_DEBUGGER_VERSION, ...input }; }

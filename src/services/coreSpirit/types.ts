import { HistoricalCandle } from '../brokers/BrokerAdapter';
import { CoreSpiritAst } from './ast';

export type CoreSpiritValue = number | boolean | string | null;
export type CoreSpiritSeries = Array<CoreSpiritValue>;

/** Shared output contract. Rendering remains owned by Core Chart. */
export type CoreSpiritObject =
  | { kind: 'series'; time: number; value: number | null; name?: string }
  | { kind: 'marker'; time: number; price: number; metadata?: Record<string, unknown> }
  | { kind: 'line'; start: { time: number; price: number }; end: { time: number; price: number }; style?: Record<string, unknown> }
  | { kind: 'zone'; left: number; right: number; top: number; bottom: number; state?: 'active' | 'mitigated' | 'broken' }
  | { kind: 'signal'; time: number; type: string; metadata?: Record<string, unknown> };

export type CoreSpiritProgram = {
  version: 1;
  id: string;
  source: string;
  ast: CoreSpiritAst;
};

export type CoreSpiritExecutionContext = {
  bars: HistoricalCandle[];
  barIndex: number;
  outputs: CoreSpiritObject[];
};

export type CoreSpiritCompilationArtifact = {
  sourceId: string;
  program: CoreSpiritProgram;
  irVersion: 1;
  maxLookback: number;
};

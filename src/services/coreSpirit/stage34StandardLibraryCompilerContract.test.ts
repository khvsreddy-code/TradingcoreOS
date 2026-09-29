import { CORE_SPIRIT_STANDARD_LIBRARY, CORE_SPIRIT_CORE_BUILTINS } from './standardLibrary';
import { parseCoreSpiritStage, serializeCoreSpiritAst, serializeCoreSpiritIr, lowerCoreSpiritStage } from './pipelineStages';
import { CoreSpiritRuntime } from './runtime';
import type { HistoricalCandle } from '../brokers/BrokerAdapter';

/** Stage 34: small stdlib + explicit compiler pipeline contracts. */
export function runCoreSpiritStage34ContractTest(): void {
  if (CORE_SPIRIT_STANDARD_LIBRARY.length !== 30) throw new Error(`CoreSpirit core stdlib must stay at 30 primitives; got ${CORE_SPIRIT_STANDARD_LIBRARY.length}`);
  if (new Set(CORE_SPIRIT_STANDARD_LIBRARY.map(x => x.name)).size !== CORE_SPIRIT_STANDARD_LIBRARY.length) throw new Error('CoreSpirit core stdlib contains duplicate names');
  if (!CORE_SPIRIT_CORE_BUILTINS.has('hma') || !CORE_SPIRIT_CORE_BUILTINS.has('stdev') || !CORE_SPIRIT_CORE_BUILTINS.has('crossover')) throw new Error('core stdlib registry is incomplete');

  const source = 'let x = 1 + 2; plot(x);';
  const parsed = parseCoreSpiritStage(source);
  if (parsed.diagnostics.length) throw new Error(`source→AST failed: ${parsed.diagnostics[0].message}`);
  const astGolden = '{"type":"program","body":[{"type":"let","name":"x","expression":{"type":"binary","operator":"+","left":{"type":"number","value":1},"right":{"type":"number","value":2}}},{"type":"expressionStatement","expression":{"type":"call","name":"plot","args":[{"type":"identifier","name":"x"}]}}]}';
  if (serializeCoreSpiritAst(parsed.ast) !== astGolden) throw new Error('source→AST golden mismatch');

  const compiled = lowerCoreSpiritStage(parsed.ast, 'stage34');
  if (!compiled.ir) throw new Error('AST→IR produced no IR');
  const ir = JSON.parse(serializeCoreSpiritIr(compiled.ir));
  if (!ir.entry.instructions.some((x:any) => x.op === 'const' && x.value === 3)) throw new Error('IR optimizer did not fold constant arithmetic');
  if (!ir.entry.instructions.some((x:any) => x.op === 'emit' && x.kind === 'plot')) throw new Error('IR lost plot output');

  const bars: HistoricalCandle[] = [
    { timestamp:'2026-09-25T09:15:00.000Z', open:100, high:103, low:99, close:102, volume:1000 },
    { timestamp:'2026-09-25T09:20:00.000Z', open:102, high:105, low:101, close:104, volume:1200 },
    { timestamp:'2026-09-25T09:25:00.000Z', open:104, high:106, low:103, close:105, volume:1400 },
  ];
  const runtime = new CoreSpiritRuntime({ sourceId:'stage34', timeframe:'5m' });
  runtime.loadProgram({ version:1, id:'stage34', source, ast:parsed.ast });
  const result = runtime.executeIr(compiled.ir, bars);
  if (!result.outputs.some((x:any) => x.kind === 'series' && x.value === 3)) throw new Error('IR→execution did not preserve folded value');
}

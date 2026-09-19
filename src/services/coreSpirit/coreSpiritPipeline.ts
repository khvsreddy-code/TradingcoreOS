import { CoreSpiritProgram } from './types';
import { CoreSpiritParser } from './parser';
import { CoreSpiritCompiler } from './compiler';
import { CoreSpiritRuntime, CoreSpiritExecutionResult } from './runtime';
import { HistoricalCandle } from '../brokers/BrokerAdapter';

export function parseCoreSpirit(source: string) { return new CoreSpiritParser(source).parse(); }
export function compileCoreSpirit(source: string, sourceId = 'coreSpirit') { return new CoreSpiritCompiler().compile(parseCoreSpirit(source), sourceId); }
export function makeCoreSpiritProgram(source: string, id = 'coreSpirit'): CoreSpiritProgram { return { version:1,id,source,ast:parseCoreSpirit(source) }; }
export function executeCoreSpirit(source: string, bars: HistoricalCandle[], sourceId='coreSpirit'): CoreSpiritExecutionResult {
  const program=makeCoreSpiritProgram(source,sourceId); const runtime=new CoreSpiritRuntime({sourceId});
  return runtime.executeIr(runtime.loadProgram(program),bars);
}

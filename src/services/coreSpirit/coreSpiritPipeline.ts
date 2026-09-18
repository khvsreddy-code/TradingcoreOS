import { CoreSpiritProgram } from './types';
import { CoreSpiritParser } from './parser';
import { CoreSpiritCompiler } from './compiler';

export function parseCoreSpirit(source: string) {
  return new CoreSpiritParser(source).parse();
}

export function compileCoreSpirit(source: string, sourceId = 'coreSpirit') {
  const ast = parseCoreSpirit(source);
  return new CoreSpiritCompiler().compile(ast, sourceId);
}

export function makeCoreSpiritProgram(source: string, id = 'coreSpirit'): CoreSpiritProgram {
  return { version: 1, id, source, ast: parseCoreSpirit(source) };
}

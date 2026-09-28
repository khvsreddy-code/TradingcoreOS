import { CoreSpiritLexer, type CoreSpiritToken } from './lexer';
import { CoreSpiritParser } from './parser';
import type { CoreSpiritAst } from './ast';
import { resolveCoreSpiritNames, type CoreSpiritNameResolution } from './nameResolver';
import { analyzeCoreSpirit, type CoreSpiritSemanticResult } from './semanticAnalyzer';
import { CoreSpiritCompiler, type CoreSpiritCompileResult } from './compiler';
import { normalizeCoreSpiritSource } from './syntax';
import type { CoreSpiritIrProgram } from './ir';

export type CoreSpiritLexStage = { source:string; tokens:CoreSpiritToken[] };
export type CoreSpiritParseStage = { ast:CoreSpiritAst; diagnostics:Array<{message:string;line:number;column:number;start:number;end:number}> };

/** Independently testable compiler stages. */
export function lexCoreSpirit(source:string):CoreSpiritLexStage {
  const normalized=normalizeCoreSpiritSource(source);
  return { source:normalized, tokens:new CoreSpiritLexer(normalized).tokenize() };
}

export function parseCoreSpiritStage(source:string):CoreSpiritParseStage {
  const normalized=normalizeCoreSpiritSource(source);
  return new CoreSpiritParser(normalized).parseDetailed();
}

export function resolveCoreSpiritStage(ast:CoreSpiritAst):CoreSpiritNameResolution { return resolveCoreSpiritNames(ast); }
export function typeCheckCoreSpiritStage(ast:CoreSpiritAst):CoreSpiritSemanticResult { return analyzeCoreSpirit(ast); }
export function lowerCoreSpiritStage(ast:CoreSpiritAst, sourceId='coreSpirit'):CoreSpiritCompileResult { return new CoreSpiritCompiler().compile(ast,sourceId); }
export function compileCoreSpiritStages(source:string, sourceId='coreSpirit'):CoreSpiritCompileResult {
  const parsed=parseCoreSpiritStage(source);
  if(parsed.diagnostics.length) return { diagnostics:parsed.diagnostics.map(d=>({severity:'error' as const,message:d.message,line:d.line,column:d.column,start:d.start,end:d.end,code:'SYNTAX_ERROR'})) };
  return lowerCoreSpiritStage(parsed.ast,sourceId);
}

export function serializeCoreSpiritAst(ast:CoreSpiritAst):string {
  return JSON.stringify(stripSpans(ast));
}
export function serializeCoreSpiritIr(ir:CoreSpiritIrProgram):string {
  return JSON.stringify(ir);
}

function stripSpans(value:any):any {
  if(Array.isArray(value)) return value.map(stripSpans);
  if(value && typeof value==='object') {
    const out:any={};
    for(const [key,v] of Object.entries(value)) if(key!=='span') out[key]=stripSpans(v);
    return out;
  }
  return value;
}

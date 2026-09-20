import { CoreSpiritAstNode, CoreSpiritAst } from './ast';
export type CoreSpiritDiagnostic = { severity:'error'|'warning'; message:string; line?:number; column?:number };
export type CoreSpiritSemanticResult = { diagnostics:CoreSpiritDiagnostic[]; symbols:Map<string,string>; maxLookback:number };

const seriesNames=new Set(['open','high','low','close','volume','time']);
const builtins=new Set(['sma','ema','rsi','atr','vwap','highest','lowest','change','crossover','crossunder','nz','max','min','abs','sqrt','pow','plot','marker','line','zone','signal','alert','webhook']);

export function analyzeCoreSpirit(ast:CoreSpiritAst):CoreSpiritSemanticResult {
  const diagnostics:CoreSpiritDiagnostic[]=[]; const symbols=new Map<string,string>(); let maxLookback=0;
  const visit=(n:CoreSpiritAstNode, scope=new Set<string>())=>{
    switch(n.type){
      case 'program': n.body.forEach(x=>visit(x,scope)); break;
      case 'let': if(symbols.has(n.name)) diagnostics.push({severity:'error',message:`Variable '${n.name}' is already declared`,line:n.span?.line,column:n.span?.column}); visit(n.expression,scope); symbols.set(n.name,infer(n.expression)); scope.add(n.name); break;
      case 'expressionStatement': visit(n.expression,scope); break;
      case 'if': visit(n.condition,scope); n.thenBranch.forEach(x=>visit(x,new Set(scope))); n.elseBranch?.forEach(x=>visit(x,new Set(scope))); break;
      case 'identifier': if(!scope.has(n.name)&&!seriesNames.has(n.name)) diagnostics.push({severity:'error',message:`Unknown identifier '${n.name}'`,line:n.span?.line,column:n.span?.column}); break;
      case 'index': { visit(n.target,scope); visit(n.index,scope); const constantIndex=constantNumber(n.index); if(constantIndex!==undefined&&Number.isInteger(constantIndex)){if(constantIndex<0)diagnostics.push({severity:'error',message:'Future indexing is not allowed; index must be >= 0',line:n.span?.line,column:n.span?.column}); else maxLookback=Math.max(maxLookback,constantIndex);} break; }
      case 'call': if(!builtins.has(n.name))diagnostics.push({severity:'error',message:`Unknown function '${n.name}'`,line:n.span?.line,column:n.span?.column}); n.args.forEach(x=>visit(x,scope)); break;
      case 'unary': visit(n.operand,scope); break;
      case 'binary': visit(n.left,scope); visit(n.right,scope); break;
      default: break;
    }
  };
  const constantNumber=(n:CoreSpiritAstNode):number|undefined=>{ if(n.type==='number') return n.value as number; if(n.type==='unary'){const v=constantNumber(n.operand); if(v===undefined)return undefined; if(n.operator==='-')return -v; if(n.operator==='+')return v;} return undefined; };
  const infer=(n:CoreSpiritAstNode):string=>{if(n.type==='number')return'number';if(n.type==='boolean')return'boolean';if(n.type==='string')return'string';if(n.type==='identifier'&&n.name==='time')return'number';return'unknown';};
  visit(ast); return {diagnostics,symbols,maxLookback};
}

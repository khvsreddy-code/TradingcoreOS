import { CoreSpiritAstNode, CoreSpiritAst } from './ast';
import { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import { analyzeCoreSpirit, CoreSpiritDiagnostic } from './semanticAnalyzer';
import { CoreSpiritExecutableArtifact, makeExecutableArtifact } from './artifact';

export type CoreSpiritCompileResult = { ir?: CoreSpiritIrProgram; diagnostics: CoreSpiritDiagnostic[]; artifact?: CoreSpiritExecutableArtifact };

export class CoreSpiritCompiler {
  compile(ast: CoreSpiritAst, sourceId = 'coreSpirit'): CoreSpiritCompileResult {
    const semantic = analyzeCoreSpirit(ast);
    if (semantic.diagnostics.some(d => d.severity === 'error')) return { diagnostics: semantic.diagnostics };
    const instructions: CoreSpiritIrInstruction[] = [];
    const locals: string[] = [];
    let temp = 0;

    const expr = (n: CoreSpiritAstNode): string => {
      switch (n.type) {
        case 'number': case 'string': case 'boolean': case 'null': {
          const dest = `t${temp++}`;
          instructions.push({ op: 'const', dest, value: n.value as number | string | boolean | null }); return dest;
        }
        case 'identifier': {
          const dest = `t${temp++}`;
          if (['open','high','low','close','volume','time'].includes(n.name)) instructions.push({ op:'loadSeries', dest, name:n.name, offset:0 });
          else instructions.push({ op:'move', dest, source:n.name });
          return dest;
        }
        case 'unary': { const operand=expr(n.operand), dest=`t${temp++}`; instructions.push({op:'unary',dest,operator:n.operator,operand}); return dest; }
        case 'binary': { const left=expr(n.left),right=expr(n.right),dest=`t${temp++}`;instructions.push({op:'binary',dest,operator:n.operator,left,right});return dest; }
        case 'call': {
          const args=n.args.map(expr),dest=`t${temp++}`;
          const seriesArgs=n.args.filter(a=>a.type==='identifier'&&['open','high','low','close','volume','time'].includes(a.name)).map(a=>(a as any).name);
          instructions.push({op:'call',dest,name:n.name,args,seriesArgs});
          if(['plot','marker','line','zone','signal','alert','webhook'].includes(n.name)) instructions.push({op:'emit',kind:n.name as any,args:[dest,...args]});
          return dest;
        }
        case 'index': {
          const target=expr(n.target), index=expr(n.index), dest=`t${temp++}`;
          if(n.target.type==='identifier'&&n.index.type==='number'&&typeof n.index.value==='number'&&Number.isInteger(n.index.value)) instructions.push({op:'loadSeries',dest,name:n.target.name,offset:n.index.value});
          else if(n.target.type==='identifier'&&['open','high','low','close','volume','time'].includes(n.target.name)) instructions.push({op:'index',dest,target,index,seriesName:n.target.name});
          else instructions.push({op:'index',dest,target,index});
          return dest;
        }
        default: throw new Error(`Unsupported expression node ${n.type}`);
      }
    };
    const stmt=(n:CoreSpiritAstNode):void=>{
      switch(n.type){
        case 'program': n.body.forEach(stmt); break;
        case 'let': { const source=expr(n.expression); instructions.push({op:'setLocal',name:n.name,source}); if(!locals.includes(n.name))locals.push(n.name); break; }
        case 'expressionStatement': expr(n.expression); break;
        case 'if': {
          const condition=expr(n.condition), jumpFalse=instructions.length; instructions.push({op:'jumpIfFalse',condition,target:-1});
          n.thenBranch.forEach(stmt);
          if(n.elseBranch?.length){const jumpEnd=instructions.length;instructions.push({op:'jump',target:-1});(instructions[jumpFalse] as any).target=instructions.length;n.elseBranch.forEach(stmt);(instructions[jumpEnd] as any).target=instructions.length;}
          else (instructions[jumpFalse] as any).target=instructions.length;
          break;
        }
        default: throw new Error(`Unsupported statement node ${n.type}`);
      }
    };
    try {
      stmt(ast);
      const ir:CoreSpiritIrProgram={version:1,sourceId,entry:{instructions},locals,maxLookback:semantic.maxLookback,diagnostics:[]};
      return {ir,diagnostics:semantic.diagnostics,artifact:makeExecutableArtifact(ir)};
    } catch(error) {
      return {diagnostics:[...semantic.diagnostics,{severity:'error',message:error instanceof Error?error.message:String(error)}]};
    }
  }
}

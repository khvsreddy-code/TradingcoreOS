import { CoreSpiritAstNode, CoreSpiritAst } from './ast';
import { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import { analyzeCoreSpirit, CoreSpiritDiagnostic } from './semanticAnalyzer';

export type CoreSpiritCompileResult={ir?:CoreSpiritIrProgram; diagnostics:CoreSpiritDiagnostic[]};
export class CoreSpiritCompiler {
  compile(ast:CoreSpiritAst, sourceId='coreSpirit'):CoreSpiritCompileResult{
    const semantic=analyzeCoreSpirit(ast); if(semantic.diagnostics.some(d=>d.severity==='error')) return {diagnostics:semantic.diagnostics};
    const instructions:CoreSpiritIrInstruction[]=[]; const locals:string[]=[]; let temp=0;
    const expr=(n:CoreSpiritAstNode):string=>{
      switch(n.type){
        case'number':case'string':case'boolean':case'null':{const d=`t${temp++}`; const value=n.value as number|string|boolean|null; instructions.push({op:'const',dest:d,value});return d;}
        case'identifier':{if(['open','high','low','close','volume','time'].includes(n.name)){const d=`t${temp++}`;instructions.push({op:'loadSeries',dest:d,name:n.name,offset:0});return d;}const d=`t${temp++}`;instructions.push({op:'move',dest:d,source:n.name});return d;}
        case'unary':{const d=`t${temp++}`;instructions.push({op:'unary',dest:d,operator:n.operator,operand:expr(n.operand)});return d;}
        case'binary':{const l=expr(n.left),r=expr(n.right),d=`t${temp++}`;instructions.push({op:'binary',dest:d,operator:n.operator,left:l,right:r});return d;}
        case'call':{const args=n.args.map(expr),d=`t${temp++}`;const seriesArgs=n.args.filter(a=>a.type==='identifier'&&['open','high','low','close','volume','time'].includes(a.name)).map(a=>(a as any).name);instructions.push({op:'call',dest:d,name:n.name,args,seriesArgs});if(['plot','marker','line','zone','signal','alert','webhook'].includes(n.name))instructions.push({op:'emit',kind:n.name as any,args:[d,...args]});return d;}
        case'index':{const target=expr(n.target),idx=expr(n.index),d=`t${temp++}`; if(n.target.type==='identifier'&&n.index.type==='number'&&typeof n.index.value==='number'&&Number.isInteger(n.index.value)){instructions.push({op:'loadSeries',dest:d,name:n.target.name,offset:n.index.value});}else if(n.target.type==='identifier'&&['open','high','low','close','volume','time'].includes(n.target.name)){instructions.push({op:'index',dest:d,target,index:idx,seriesName:n.target.name});}else instructions.push({op:'index',dest:d,target,index:idx});return d;}
        default: throw new Error(`Unsupported expression node ${n.type}`);
      }
    };
    const stmt=(n:CoreSpiritAstNode)=>{switch(n.type){case'program':n.body.forEach(stmt);break;case'let':{const s=expr(n.expression);instructions.push({op:'setLocal',name:n.name,source:s});if(!locals.includes(n.name))locals.push(n.name);break;}case'expressionStatement':expr(n.expression);break;case'if':{const c=expr(n.condition);const jf=instructions.length;instructions.push({op:'jumpIfFalse',condition:c,target:-1});n.thenBranch.forEach(stmt);if(n.elseBranch?.length){const j=instructions.length;instructions.push({op:'jump',target:-1});(instructions[jf] as any).target=instructions.length;n.elseBranch.forEach(stmt);(instructions[j] as any).target=instructions.length;}else (instructions[jf] as any).target=instructions.length;break;}default:throw new Error(`Unsupported statement node ${n.type}`);}};
    stmt(ast); return {ir:{version:1,sourceId,entry:{instructions},locals,maxLookback:semantic.maxLookback,diagnostics:[]},diagnostics:semantic.diagnostics};
  }
}

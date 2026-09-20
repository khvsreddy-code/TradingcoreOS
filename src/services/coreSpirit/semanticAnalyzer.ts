import { CoreSpiritAstNode, CoreSpiritAst } from './ast';
import { CORE_SPIRIT_BUILTINS } from './standardLibrary';
import { CoreSpiritType, compatible, isBooleanType, isNumericType, joinTypes } from './typeSystem';

export type CoreSpiritDiagnostic = { severity:'error'|'warning'; message:string; line?:number; column?:number; start?:number; end?:number; code?:string };
export type CoreSpiritSemanticResult = { diagnostics:CoreSpiritDiagnostic[]; symbols:Map<string,CoreSpiritType>; maxLookback:number };

const seriesNames=new Set(['open','high','low','close','volume','time']);
const specialIdentifiers=new Set(['na']);
const comparisonOps=new Set(['==','!=','<','<=','>','>=']);

export function analyzeCoreSpirit(ast:CoreSpiritAst):CoreSpiritSemanticResult {
  const diagnostics:CoreSpiritDiagnostic[]=[];
  const symbols=new Map<string,CoreSpiritType>();
  let maxLookback=0;
  const report=(n:CoreSpiritAstNode,message:string,code:string)=>diagnostics.push({severity:'error',message,line:n.span?.line,column:n.span?.column,start:n.span?.start,end:n.span?.end,code});

  const infer=(n:CoreSpiritAstNode, scope:Map<string,CoreSpiritType>):CoreSpiritType=>{
    switch(n.type){
      case 'number': return 'number';
      case 'string': return 'string';
      case 'boolean': return 'boolean';
      case 'null': return 'null';
      case 'identifier':
        if (seriesNames.has(n.name)) return 'series<number>';
        if (n.name==='na') return 'null';
        return scope.get(n.name) || 'unknown';
      case 'index': {
        const target=infer(n.target,scope); return target.startsWith('series<') ? target.slice(7,-1) as CoreSpiritType : target;
      }
      case 'unary': {
        const t=infer(n.operand,scope);
        if(n.operator==='!' && !isBooleanType(t)) report(n,'! expects a boolean value','TYPE_UNARY_BOOL');
        if(n.operator!=='!' && !isNumericType(t)) report(n,'Unary + and - expect a number','TYPE_UNARY_NUMBER');
        return n.operator==='!'?'boolean':t;
      }
      case 'binary': {
        const a=infer(n.left,scope), b=infer(n.right,scope);
        if(n.operator==='and'||n.operator==='or'){
          if(!isBooleanType(a)||!isBooleanType(b)) report(n,`${n.operator} expects boolean operands`,'TYPE_LOGICAL');
          return 'boolean';
        }
        if(comparisonOps.has(n.operator)) return 'boolean';
        if(!isNumericType(a)||!isNumericType(b)) report(n,`Operator '${n.operator}' expects numeric operands`,'TYPE_ARITHMETIC');
        return joinTypes(a,b);
      }
      case 'call': {
        const builtin=CORE_SPIRIT_BUILTINS.get(n.name);
        if(!builtin){ report(n,`Unknown function '${n.name}'`,'UNKNOWN_FUNCTION'); n.args.forEach(x=>infer(x,scope)); return 'unknown'; }
        if(n.args.length<builtin.minArgs || (builtin.maxArgs!==undefined && n.args.length>builtin.maxArgs)){
          const max=builtin.maxArgs===undefined?'∞':String(builtin.maxArgs);
          report(n,`${n.name} expects ${builtin.minArgs === builtin.maxArgs ? builtin.minArgs : `${builtin.minArgs}-${max}`} arguments; got ${n.args.length}`,'ARG_COUNT');
        }
        const argTypes=n.args.map(x=>infer(x,scope));
        if(['exp','log','tanh','sigmoid','probability'].includes(n.name) && n.args.length>0 && !isNumericType(argTypes[0])) report(n,`${n.name} expects a numeric input`,'TYPE_MODEL_INPUT');
        if(n.name==='clamp' && [0,1,2].some(i=>!isNumericType(argTypes[i]))) report(n,'clamp expects numeric value, minimum and maximum','TYPE_MODEL_CLAMP');
        if(['predict','score'].includes(n.name)) {
          if(!isNumericType(argTypes[0])) report(n,`${n.name} first argument must be numeric bias`,'TYPE_MODEL_BIAS');
          if(n.args.length < 3 || ((n.args.length - 1) % 2 !== 0)) report(n,`${n.name} expects bias followed by feature/weight pairs`,'TYPE_MODEL_PAIRS');
          for(let i=1;i<n.args.length;i++) if(!isNumericType(argTypes[i])) report(n,`${n.name} feature and weight arguments must be numeric`,'TYPE_MODEL_PAIR');
        }
        if(n.name==='entry') {
          if(!isBooleanType(argTypes[0])) report(n,'entry first argument must be a boolean condition','TYPE_ENTRY_CONDITION');
          if(!compatible('string',argTypes[1])) report(n,'entry side must be a string','TYPE_ENTRY_SIDE');
        }
        if(n.name==='exit' && !isBooleanType(argTypes[0])) report(n,'exit first argument must be a boolean condition','TYPE_EXIT_CONDITION');
        if(['sma','ema','rsi','atr','vwap','highest','lowest','change'].includes(n.name) && n.args.length>0 && !isNumericType(argTypes[0])) report(n,`${n.name} first argument must be numeric`,'TYPE_INDICATOR_INPUT');
        if(['crossover','crossunder'].includes(n.name) && (!isNumericType(argTypes[0])||!isNumericType(argTypes[1]))) report(n,`${n.name} expects two numeric series`,'TYPE_CROSS');
        if(['plot','marker','line','zone','box','band','gradient','arrow','shape','heatmap','polyline','hline'].includes(n.name) && n.args.length>0 && !isNumericType(argTypes[0])) report(n,`${n.name} requires a numeric value`,'TYPE_OUTPUT');
        if(['box','arrow','line'].includes(n.name) && n.args.length>=4 && [0,1,2,3].some(i=>!isNumericType(argTypes[i]))) report(n,`${n.name} coordinate arguments must be numeric`,'TYPE_VISUAL_COORDINATE');
        if(n.name==='zone' && n.args.length>=4 && [0,1,2,3].some(i=>!isNumericType(argTypes[i]))) report(n,'zone coordinates must be numeric','TYPE_VISUAL_COORDINATE');
        if(n.name==='polyline' && (n.args.length<6 || ((n.args.length-2)%2!==0))) report(n,'polyline expects time/price pairs followed by color/width options','TYPE_POLYLINE');
        if(n.name==='hline' && n.args.length>0 && !isNumericType(argTypes[0])) report(n,'hline price must be numeric','TYPE_HLINE');
        if(['bg','barcolor'].includes(n.name) && n.args.length>0 && !compatible('string',argTypes[0])) report(n,`${n.name} color must be a string`,'TYPE_COLOR');
        if(n.name==='table' && n.args.length>=3 && (!isNumericType(argTypes[1])||!isNumericType(argTypes[2]))) report(n,'table row and column must be numeric','TYPE_TABLE_COORD');
        if(['band','fill','gradient'].includes(n.name) && n.args.length>=2 && (!isNumericType(argTypes[0])||!isNumericType(argTypes[1]))) report(n,`${n.name} top and bottom must be numeric`,'TYPE_BAND_BOUNDS');
        if(['shape','heatmap'].includes(n.name) && n.args.length>1 && !compatible('string',argTypes[1])) report(n,`${n.name} symbol/color argument must be a string`,'TYPE_SHAPE');
        if(n.name==='label' && n.args.length>0 && !compatible('string',argTypes[0])) report(n,'label text must be a string','TYPE_LABEL_TEXT');
        if(n.name==='labelAt') { if(n.args.length>0 && !isNumericType(argTypes[0])) report(n,'labelAt price must be numeric','TYPE_LABEL_PRICE'); if(n.args.length>1 && !compatible('string',argTypes[1])) report(n,'labelAt text must be a string','TYPE_LABEL_TEXT'); }
        if(n.name==='label' && n.args.length>1 && !compatible('string',argTypes[1])) report(n,'label position must be a string','TYPE_LABEL_POSITION');
        if(n.name==='labelAt' && n.args.length>2 && !compatible('string',argTypes[2])) report(n,'labelAt position must be a string','TYPE_LABEL_POSITION');
        if(n.name==='signal' && n.args.length>0 && !compatible('string',argTypes[0])) report(n,'signal expects a string type','TYPE_SIGNAL');
        return builtin.returnType as CoreSpiritType;
      }
      default: return 'unknown';
    }
  };

  const visit=(n:CoreSpiritAstNode, scope=new Map(symbols))=>{
    switch(n.type){
      case 'program': n.body.forEach(x=>visit(x,scope)); break;
      case 'let':
        if(symbols.has(n.name)) report(n,`Variable '${n.name}' is already declared`,'DUPLICATE_VARIABLE');
        const type=infer(n.expression,scope); visit(n.expression,scope); symbols.set(n.name,type); scope.set(n.name,type); break;
      case 'expressionStatement': visit(n.expression,scope); infer(n.expression,scope); break;
      case 'if': {
        const condition=infer(n.condition,scope); visit(n.condition,scope);
        if(!isBooleanType(condition)) report(n.condition,'if condition must be boolean','TYPE_IF_CONDITION');
        n.thenBranch.forEach(x=>visit(x,new Map(scope))); n.elseBranch?.forEach(x=>visit(x,new Map(scope))); break;
      }
      case 'identifier': if(!scope.has(n.name)&&!seriesNames.has(n.name)&&!specialIdentifiers.has(n.name)) report(n,`Unknown identifier '${n.name}'`,'UNKNOWN_IDENTIFIER'); break;
      case 'index': {
        visit(n.target,scope); visit(n.index,scope); const constantIndex=constantNumber(n.index);
        if(constantIndex!==undefined&&Number.isInteger(constantIndex)){
          if(constantIndex<0) report(n,'Future indexing is not allowed; index must be >= 0','FUTURE_INDEX');
          else maxLookback=Math.max(maxLookback,constantIndex);
        }
        if(!isNumericType(infer(n.index,scope))) report(n.index,'Historical index must be numeric','TYPE_INDEX');
        break;
      }
      case 'call': visitCall(n,scope); break;
      case 'unary': visit(n.operand,scope); infer(n,scope); break;
      case 'binary': visit(n.left,scope); visit(n.right,scope); infer(n,scope); break;
      default: break;
    }
  };
  const visitCall=(n:Extract<CoreSpiritAstNode,{type:'call'}>,scope:Map<string,CoreSpiritType>)=>{n.args.forEach(x=>visit(x,scope));infer(n,scope);};
  const constantNumber=(n:CoreSpiritAstNode):number|undefined=>{if(n.type==='number')return n.value as number;if(n.type==='unary'){const v=constantNumber(n.operand);if(v===undefined)return undefined;if(n.operator==='-')return -v;if(n.operator==='+')return v;}return undefined;};
  visit(ast);
  return {diagnostics,symbols,maxLookback};
}

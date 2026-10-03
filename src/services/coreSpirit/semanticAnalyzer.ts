import { CoreSpiritAstNode, CoreSpiritAst } from './ast';
import { CORE_SPIRIT_BUILTINS } from './standardLibrary';
import { CoreSpiritType, compatible, isBooleanType, isNumericType, joinTypes } from './typeSystem';
import { componentResultLanguageType, resolveCoreSpiritComponent, validateCoreSpiritComponentInvocation, type CoreSpiritComponentRegistryLike } from './coreSpiritComponents';
import { combineSemanticArithmetic, compareSemanticTypes, semanticSeriesField, semanticScalar, semanticSeries, semanticTypeCompatible, semanticTypeForDeclaredName, semanticTypeToString, scalarize, type CoreSpiritSemanticType } from './semanticTypeSystem';
import { getCoreSpiritMemberContract, CORE_SPIRIT_ROOT_NAMESPACES } from './memberRegistry';
import { canUseCapability } from './layeredPlatformContract';
import type { CoreSpiritSurfaceMetadata } from './languageConcepts';

export type CoreSpiritDiagnostic = { severity:'error'|'warning'; message:string; line?:number; column?:number; start?:number; end?:number; code?:string };
export type CoreSpiritUdt = { name:string; fields:Array<{name:string;type:CoreSpiritType}> };
export type CoreSpiritSemanticOptions = { layer?:string; surface?:unknown; components?:CoreSpiritComponentRegistryLike };
export type CoreSpiritSemanticResult = {
  diagnostics:CoreSpiritDiagnostic[];
  symbols:Map<string,CoreSpiritType>;
  udts:Map<string,CoreSpiritUdt>;
  modelBindings:Map<string,unknown>;
  componentBindings:Map<string,string>;
  maxLookback:number;
  semanticSymbols:Map<string,CoreSpiritSemanticType>;
};

const seriesNames=new Set(['open','high','low','close','volume','time']);
const specialIdentifiers=new Set(['na','bar_index']);
const comparisonOps=new Set(['==','!=','<','<=','>','>=']);

export function analyzeCoreSpirit(ast:CoreSpiritAst, options:CoreSpiritSemanticOptions = {}):CoreSpiritSemanticResult {
  const diagnostics:CoreSpiritDiagnostic[]=[];
  const symbols=new Map<string,CoreSpiritType>();
  const udts=new Map<string,CoreSpiritUdt>();
  const modelBindings=new Map<string,unknown>();
  const componentBindings=new Map<string,string>();
  const semanticSymbols=new Map<string,CoreSpiritSemanticType>();
  const componentSource=options.components;
  let maxLookback=0;
  const report=(n:CoreSpiritAstNode,message:string,code:string)=>diagnostics.push({
    severity:'error',message,line:n.span?.line,column:n.span?.column,start:n.span?.start,end:n.span?.end,code
  });

  const mapDeclaredType=(name:string):CoreSpiritType=>{
    if(name==='number'||name==='float'||name==='int') return 'number';
    if(name==='bool'||name==='boolean') return 'boolean';
    if(name==='string') return 'string';
    if(name==='null'||name==='na') return 'null';
    if(name==='price'||name==='volume'||name==='time'||name==='duration') return 'number';
    if(/^series<(number|float|int|price|volume|time|duration|currency|boolean|string)>$/.test(name)) return name.includes('boolean') ? 'series<boolean>' : name.includes('string') ? 'series<string>' : 'series<number>';
    if(name.startsWith('array<')) return name as CoreSpiritType;
    return `udt:${name}`;
  };

  const infer=(n:CoreSpiritAstNode, scope:Map<string,CoreSpiritType>):CoreSpiritType=>{
    switch(n.type){
      case 'number': return 'number';
      case 'string': return 'string';
      case 'boolean': return 'boolean';
      case 'null': return 'null';
      case 'identifier':
        if(seriesNames.has(n.name)) return 'series<number>';
        if(n.name==='na') return 'null';
        if(n.name==='bar_index') return 'number';
        return scope.get(n.name) || 'unknown';

      case 'member': {
        if(n.target.type==='identifier' && n.target.name==='chart' && ['price','volume','indicator','custom'].includes(n.member)) return `visual:area`;
        if(n.target.type==='identifier' && scope.get(n.target.name)==='market:ref' && ['open','high','low','close','volume','time'].includes(n.member)) return 'number';
        if(n.target.type==='identifier' && scope.get(n.target.name)==='timeframe:ref' && ['open','high','low','close','volume','time'].includes(n.member)) return 'number';
        if(n.target.type==='call' && (n.target.name==='market'||n.target.name==='timeframe')) {
          if(!['open','high','low','close','volume','time'].includes(n.member)) {
            report(n,`Market/timeframe references do not expose member '${n.member}'`,'UNKNOWN_DATA_FIELD');
            return 'unknown';
          }
          return 'number';
        }
        if(n.target.type==='call' && n.target.name==='model') {
          const modelName=n.target.args[0]?.type==='string' ? String(n.target.args[0].value) : undefined;
          const modelDecl=(options.surface as CoreSpiritSurfaceMetadata | undefined)?.declarations?.find((d)=>d.kind==='model' && (!modelName || d.name===modelName));
          if(modelDecl && modelDecl.kind==='model' && modelDecl.outputs.includes(n.member)) {
            const outputType=modelDecl.outputTypes?.[n.member] ?? 'number';
            if(outputType==='string') return 'string';
            if(outputType==='boolean') return 'boolean';
            return 'number';
          }
          if(modelDecl && modelDecl.kind==='model') report(n,`MODEL '${modelDecl.name}' has no output '${n.member}'`,'UNKNOWN_MODEL_OUTPUT');
          return 'unknown';
        }
        const target=infer(n.target,scope);
        if(target==='model:ref') {
          return 'number';
        }
        if(target.startsWith('udt:component:')){
          const componentId=target.slice('udt:component:'.length);
          const component=resolveCoreSpiritComponent(componentSource,componentId);
          if(component){
            const output=component.outputs.find(port=>port.name===n.member);
            if(output) return componentResultLanguageType({ ...component, outputs:[output] });
            report(n,`Component '${component.name}' has no output '${n.member}'`,'UNKNOWN_COMPONENT_OUTPUT');
            return 'unknown';
          }
        }
        if(!target.startsWith('udt:')) { report(n,`'${target}' has no fields`,'TYPE_MEMBER_TARGET'); return 'unknown'; }
        const udt=udts.get(target.slice(4));
        const field=udt?.fields.find(f=>f.name===n.member);
        if(!field) report(n,`Type '${target.slice(4)}' has no member '${n.member}'`,'UNKNOWN_MEMBER');
        return field?.type || 'unknown';
      }

      case 'index': {
        const target=infer(n.target,scope);
        const index=infer(n.index,scope);
        const constantIndex=constantNumber(n.index);
        if(constantIndex!==undefined&&Number.isInteger(constantIndex)){
          if(constantIndex<0) report(n,'Future indexing is not allowed; index must be >= 0','FUTURE_INDEX');
          else maxLookback=Math.max(maxLookback,constantIndex);
        }
        if(!isNumericType(index)) report(n.index,'Historical index must be numeric','TYPE_INDEX');
        return target.startsWith('series<') ? target.slice(7,-1) as CoreSpiritType : target;
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
        const component=resolveCoreSpiritComponent(componentSource,n.name);
        const argTypes=n.args.map(x=>infer(x,scope));
        if(component){
          const errors=validateCoreSpiritComponentInvocation(component,argTypes);
          for(const message of errors) report(n,message,'COMPONENT_INVOCATION');
          return componentResultLanguageType(component);
        }

        const builtin=CORE_SPIRIT_BUILTINS.get(n.name);
        if(['buy','sell','order'].includes(n.name) && !canUseCapability(options.layer || 'script','order-intents')) {
          report(n,`CoreSpirit layer '${options.layer || 'script'}' cannot use capability 'order-intents'`,'CAPABILITY_ORDER_INTENTS');
        }
        if(!builtin){
          report(n,`Unknown function '${n.name}'`,'UNKNOWN_FUNCTION');
          return 'unknown';
        }

        if(n.args.length<builtin.minArgs || (builtin.maxArgs!==undefined && n.args.length>builtin.maxArgs)){
          const max=builtin.maxArgs===undefined?'∞':String(builtin.maxArgs);
          report(n,`${n.name} expects ${builtin.minArgs === builtin.maxArgs ? builtin.minArgs : `${builtin.minArgs}-${max}`} arguments; got ${n.args.length}`,'ARG_COUNT');
        }

        if(['exp','log','tanh','sigmoid','probability'].includes(n.name) && n.args.length>0 && !isNumericType(argTypes[0])) report(n,`${n.name} expects a numeric input`,'TYPE_MODEL_INPUT');
        if(n.name==='clamp' && [0,1,2].some(i=>!isNumericType(argTypes[i]))) report(n,'clamp expects numeric value, minimum and maximum','TYPE_MODEL_CLAMP');
        if(['predict','score'].includes(n.name)) {
          if(!isNumericType(argTypes[0])) report(n,`${n.name} first argument must be numeric bias`,'TYPE_MODEL_BIAS');
          if(n.args.length < 3 || ((n.args.length - 1) % 2 !== 0)) report(n,`${n.name} expects bias followed by feature/weight pairs`,'TYPE_MODEL_PAIRS');
          for(let i=1;i<n.args.length;i++) if(!isNumericType(argTypes[i])) report(n,`${n.name} feature and weight arguments must be numeric`,'TYPE_MODEL_PAIR');
        }
        if(n.name==='entry' && (!isBooleanType(argTypes[0]) || !compatible('string',argTypes[1]))) report(n,'entry expects a boolean condition and a string side','TYPE_ENTRY');
        if(n.name==='exit' && !isBooleanType(argTypes[0])) report(n,'exit first argument must be a boolean condition','TYPE_EXIT_CONDITION');
        if(['sma','ema','rsi','atr','vwap','highest','lowest','change'].includes(n.name) && n.args.length>0 && !isNumericType(argTypes[0])) report(n,`${n.name} first argument must be numeric`,'TYPE_INDICATOR_INPUT');
        if(['crossover','crossunder'].includes(n.name) && (!isNumericType(argTypes[0])||!isNumericType(argTypes[1]))) report(n,`${n.name} expects two numeric series`,'TYPE_CROSS');
        if(['plot','marker','line','zone','box','band','gradient','arrow','shape','heatmap','polyline','hline'].includes(n.name) && n.args.length>0 && !isNumericType(argTypes[0])) report(n,`${n.name} requires a numeric value`,'TYPE_OUTPUT');
        if(['bg','barcolor'].includes(n.name) && n.args.length>0 && !compatible('string',argTypes[0])) report(n,`${n.name} color must be a string`,'TYPE_COLOR');
        if(n.name==='label' && n.args.length>2 && !compatible('string',argTypes[2])) report(n,'label text must be a string','TYPE_LABEL_TEXT');
        if(n.name==='labelAt' && n.args.length>1 && !compatible('string',argTypes[1])) report(n,'labelAt text must be a string','TYPE_LABELAT_TEXT');
        if(n.name==='signal') {
          const valid = (n.args.length>=2 && isBooleanType(argTypes[0]) && compatible('string',argTypes[1])) || (n.args.length>=1 && compatible('string',argTypes[0]));
          if(!valid) report(n,'signal expects a string or a boolean condition followed by a string type','TYPE_SIGNAL');
        }
        return builtin.returnType as CoreSpiritType;
      }

      case 'memberCall': {
        let contract;
        if(n.target.type==='identifier') {
          contract=getCoreSpiritMemberContract(n.target.name==='panel' ? 'panel' : n.target.name,n.member);
        } else if(n.target.type==='member') {
          contract=getCoreSpiritMemberContract(n.target.member==='panel' ? 'ui' : 'panel',n.member);
        }
        if(contract) {
          n.args.forEach((x,index)=>{
            if(contract?.actionArgIndices?.includes(index) && x.type==='identifier' && !scope.has(x.name)) return;
            infer(x,scope);
          });
          return contract.returnType as CoreSpiritType;
        }
        n.args.forEach(x=>infer(x,scope));
        return 'unknown';
      }

      default:
        return 'unknown';
    }
  };

  const constantNumber=(n:CoreSpiritAstNode):number|undefined=>{
    if(n.type==='number') return n.value as number;
    if(n.type==='unary'){
      const v=constantNumber(n.operand);
      if(v===undefined) return undefined;
      if(n.operator==='-') return -v;
      if(n.operator==='+') return v;
    }
    return undefined;
  };


  const semanticBuiltinSeries = new Set(['sma','ema','hma','highest','lowest','sum','mean','stdev','wma','rma','median','rsi','atr','vwap','change','variance']);
  const semanticNumericFunctions = new Set(['abs','min','max','sqrt','pow','round','sign','nz','clamp','exp','log','tanh','sigmoid','probability','normalize','zscore','pctchange']);
  const semanticConversionFunctions = new Map([['toNumber','number'],['toPrice','price'],['toVolume','volume'],['toTime','time'],['toDuration','duration'],['toCurrency','currency']] as const);
  const semanticBooleanFunctions = new Set(['cross','crossover','crossunder','rising','falling','isNa']);
  const inferSemantic = (n:CoreSpiritAstNode, scope:Map<string,CoreSpiritSemanticType>):CoreSpiritSemanticType|undefined=>{
    switch(n.type){
      case 'number': return semanticScalar('number');
      case 'string': return semanticScalar('string');
      case 'boolean': return semanticScalar('boolean');
      case 'null': return undefined;
      case 'identifier': {
        if(n.name==='open'||n.name==='high'||n.name==='low'||n.name==='close'||n.name==='volume'||n.name==='time') return semanticSeriesField(n.name);
        if(n.name==='bar_index') return semanticScalar('number');
        if(n.name==='na') return undefined;
        return scope.get(n.name) || semanticSymbols.get(n.name);
      }
      case 'member': {
        if(n.target.type==='call' && (n.target.name==='market'||n.target.name==='timeframe')) {
          const symbol = n.target.name==='market' && n.target.args[0]?.type==='string' ? String(n.target.args[0].value) : 'current';
          const tf = n.target.name==='timeframe' ? (n.target.args[0]?.type==='string' ? String(n.target.args[0].value) : 'requested') : 'chart';
          return semanticSeriesField(n.member, symbol, tf);
        }
        const target=inferSemantic(n.target,scope);
        if(target?.kind==='series' && ['open','high','low','close','volume','time'].includes(n.member)) return semanticSeriesField(n.member,target.symbol ?? 'current',target.timeframe ?? 'chart');
        return undefined;
      }
      case 'index': {
        const target=inferSemantic(n.target,scope); return target?.kind==='series' ? scalarize(target) : target;
      }
      case 'unary': {
        const operand=inferSemantic(n.operand,scope); return n.operator==='!' ? semanticScalar('boolean') : operand;
      }
      case 'binary': {
        const left=inferSemantic(n.left,scope), right=inferSemantic(n.right,scope);
        if(n.operator==='and'||n.operator==='or') return semanticScalar('boolean');
        if(comparisonOps.has(n.operator)) {
          if(left && right) {
            const comparison=compareSemanticTypes(n.operator as '=='|'!='|'<'|'<='|'>'|'>=',left,right);
            if(!comparison.compatible) report(n,comparison.error ?? `semantic domains '${left.atom}' and '${right.atom}' cannot be compared`,'TYPE_SEMANTIC_COMPARISON');
          }
          return semanticScalar('boolean');
        }
        if(!left||!right) return undefined;
        const combined=combineSemanticArithmetic(n.operator as '+'|'-'|'*'|'/'|'%',left,right);
        if(combined.error) report(n,combined.error,'TYPE_SEMANTIC_ARITHMETIC');
        return combined.type;
      }
      case 'call': {
        const args=n.args.map(x=>inferSemantic(x,scope));
        if(n.name==='market') {
          return semanticSeries('number',{symbol:n.args[0]?.type==='string' ? String(n.args[0].value) : 'current', timeframe:'chart'});
        }
        if(n.name==='timeframe') {
          return semanticSeries('number',{symbol:'current', timeframe:n.args[0]?.type==='string' ? String(n.args[0].value) : 'requested'});
        }
        if(n.name==='bar_index') return semanticScalar('number');
        const component=resolveCoreSpiritComponent(componentSource,n.name);
        if(component){
          const result=componentResultLanguageType(component);
          if(result.startsWith('series<')) return semanticSeries(result.slice(7,-1) as CoreSpiritSemanticType['atom']);
          return result==='boolean' ? semanticScalar('boolean') : semanticScalar('number');
        }
        if(semanticBooleanFunctions.has(n.name)) return semanticScalar('boolean');
        if(semanticConversionFunctions.has(n.name)) {
          const source=args[0];
          const atom=semanticConversionFunctions.get(n.name)! as CoreSpiritSemanticType['atom'];
          const metadata=source ? {symbol: source.symbol, timeframe: source.timeframe, currency: atom === 'currency' ? source.currency : undefined, unit: atom === 'price' ? 'price' : atom === 'volume' ? 'volume' : atom === 'time' ? 'timestamp' : atom === 'duration' ? 'duration' : atom === 'currency' ? 'notional' : undefined, scale: source.scale} : {};
          return source?.kind === 'series' ? semanticSeries(atom, metadata) : semanticScalar(atom, metadata);
        }
        if(n.name==='time') return semanticSeries('time',{unit:'timestamp'});
        if(semanticBuiltinSeries.has(n.name)) {
          const source=args[0];
          if(n.name==='rsi' || n.name==='mfi' || n.name==='cci' || n.name==='roc' || n.name==='stoch') return semanticSeries('number',{unit:'percent'});
          if(n.name==='atr' || n.name==='trueRange' || n.name==='tr') return semanticSeries('price',{unit:'price'});
          if(n.name==='vwap') return semanticSeries('price',{unit:'price'});
          if(source) return source.kind==='series' ? source : semanticSeries('number');
          return semanticSeries('number');
        }
        if(semanticNumericFunctions.has(n.name)) return args[0];
        return undefined;
      }
      case 'memberCall': return undefined;
      default: return undefined;
    }
  };

  const visit=(n:CoreSpiritAstNode, scope=new Map(symbols))=>{
    switch(n.type){
      case 'program':
        n.body.forEach(x=>visit(x,scope));
        break;
      case 'typeDeclaration': {
        if(udts.has(n.name)) report(n,`Type '${n.name}' is already declared`,'DUPLICATE_TYPE');
        const fields=n.fields.map(f=>({name:f.name,type:mapDeclaredType(f.typeName)}));
        udts.set(n.name,{name:n.name,fields});
        break;
      }
      case 'let': {
        if(symbols.has(n.name)) report(n,`Variable '${n.name}' is already declared`,'DUPLICATE_VARIABLE');
        const type=infer(n.expression,scope);
        visit(n.expression,scope);
        const semanticType=inferSemantic(n.expression,semanticSymbols);
        if(n.declaredType){
          const declared=semanticTypeForDeclaredName(n.declaredType);
          if(!declared) report(n,`Unsupported semantic type '${n.declaredType}'`,'TYPE_DECLARATION_SEMANTIC');
          else if(semanticType && !semanticTypeCompatible(declared, semanticType)) report(n,`Declared type '${n.declaredType}' does not match inferred '${semanticTypeToString(semanticType)}'`,'TYPE_DECLARATION_MISMATCH');
          semanticSymbols.set(n.name,declared ?? semanticType ?? semanticScalar('number'));
        } else if(semanticType) semanticSymbols.set(n.name,semanticType);
        symbols.set(n.name,type);
        scope.set(n.name,type);
        if(n.expression.type==='call'){
          const component=resolveCoreSpiritComponent(componentSource,n.expression.name);
          if(component && component.outputs.length>1) componentBindings.set(n.name,component.id);
        }
        break;
      }
      case 'expressionStatement':
        visit(n.expression,scope); infer(n.expression,scope); break;
      case 'if': {
        const condition=infer(n.condition,scope); visit(n.condition,scope);
        if(!isBooleanType(condition)) report(n.condition,'if condition must be boolean','TYPE_IF_CONDITION');
        n.thenBranch.forEach(x=>visit(x,new Map(scope)));
        n.elseBranch?.forEach(x=>visit(x,new Map(scope)));
        break;
      }
      case 'identifier':
        if(!scope.has(n.name)&&!seriesNames.has(n.name)&&!specialIdentifiers.has(n.name)) report(n,`Unknown identifier '${n.name}'`,'UNKNOWN_IDENTIFIER');
        break;
      case 'member':
        infer(n,scope); break;
      case 'memberCall': {
        let contract;
        if(n.target.type==='identifier') contract=getCoreSpiritMemberContract(n.target.name==='panel' ? 'panel' : n.target.name,n.member);
        else if(n.target.type==='member') contract=getCoreSpiritMemberContract(n.target.member==='panel' ? 'ui' : 'panel',n.member);
        n.args.forEach((x,index)=>{
          if(contract?.actionArgIndices?.includes(index) && x.type==='identifier' && !scope.has(x.name)) return;
          visit(x,scope);
        });
        infer(n,scope);
        break;
      }
      case 'index':
        visit(n.target,scope); visit(n.index,scope); break;
      case 'call':
        n.args.forEach(x=>visit(x,scope)); infer(n,scope); break;
      case 'unary':
        visit(n.operand,scope); infer(n,scope); break;
      case 'binary':
        visit(n.left,scope); visit(n.right,scope); infer(n,scope); break;
      default:
        break;
    }
  };

  visit(ast);
  return {diagnostics,symbols,udts,modelBindings,componentBindings,maxLookback,semanticSymbols};
}

import { CoreSpiritAstNode, CoreSpiritAst } from './ast';
import { CORE_SPIRIT_BUILTINS } from './standardLibrary';
import type { CoreSpiritProgramLayer } from './layeredPlatformContract';
import {
  CoreSpiritType,
  compatible,
  elementType,
  isBooleanType,
  isNumericType,
  isSeriesType,
  joinTypes,
  normalizeDeclaredType,
  seriesOf,
} from './typeSystem';

export type CoreSpiritDiagnostic = {
  severity:'error'|'warning';
  message:string;
  line?:number;
  column?:number;
  start?:number;
  end?:number;
  code?:string
};
export type CoreSpiritUdt = { name:string; fields:Array<{name:string;type:CoreSpiritType}> };
export type CoreSpiritSemanticResult = {
  diagnostics:CoreSpiritDiagnostic[];
  symbols:Map<string,CoreSpiritType>;
  udts:Map<string,CoreSpiritUdt>;
  maxLookback:number;
};

const seriesNames=new Set(['open','high','low','close','volume','time']);
const specialIdentifiers=new Set(['na']);
const comparisonOps=new Set(['==','!=','<','<=','>','>=']);
const numericBuiltins=new Set(['abs','sqrt','pow','round','exp','log','tanh','clamp','sigmoid','probability','predict','score']);

function liftedNumericReturn(args:CoreSpiritType[]):CoreSpiritType {
  return args.some(isSeriesType) ? 'series<float>' : 'float';
}

export function analyzeCoreSpirit(ast:CoreSpiritAst, options: { layer?: CoreSpiritProgramLayer } = {}):CoreSpiritSemanticResult {
  const layer: CoreSpiritProgramLayer = options.layer || 'script';
  const diagnostics:CoreSpiritDiagnostic[]=[];
  const symbols=new Map<string,CoreSpiritType>();
  const udts=new Map<string,CoreSpiritUdt>();
  let maxLookback=0;

  const report=(n:CoreSpiritAstNode,message:string,code:string)=>
    diagnostics.push({severity:'error',message,line:n.span?.line,column:n.span?.column,start:n.span?.start,end:n.span?.end,code});

  const infer=(n:CoreSpiritAstNode, scope:Map<string,CoreSpiritType>):CoreSpiritType=>{
    switch(n.type){
      case 'number':
        return Number.isInteger(n.value) ? 'int' : 'float';
      case 'string': return 'string';
      case 'boolean': return 'boolean';
      case 'null': return 'null';

      case 'identifier':
        if (seriesNames.has(n.name)) return 'series<number>';
        if (n.name==='na') return 'unknown';
        if (n.name==='bar_index') return 'number';
        return scope.get(n.name) || 'unknown';

      case 'member': {
        const target=infer(n.target,scope);
        const dataFields = new Set(['open','high','low','close','volume','time']);
        if (target === 'market:ref' || target === 'timeframe:ref') {
          if (!dataFields.has(n.member)) { report(n,`Data reference has no field '${n.member}'`,'UNKNOWN_DATA_FIELD'); return 'unknown'; }
          return 'series<float>';
        }
        if(!target.startsWith('udt:')) {
          report(n,`'${target}' has no fields`,'TYPE_MEMBER_TARGET');
          return 'unknown';
        }
        const udt=udts.get(target.slice(4));
        const field=udt?.fields.find(f=>f.name===n.member);
        if(!field) report(n,`Type '${target.slice(4)}' has no member '${n.member}'`,'UNKNOWN_MEMBER');
        return field?.type || 'unknown';
      }

      case 'memberCall': {
        const targetIsUi = n.target.type === 'identifier' && n.target.name === 'ui';
        const targetIsVisual = n.target.type === 'identifier' && n.target.name === 'visual';
        const targetIsApp = n.target.type === 'identifier' && n.target.name === 'app';
        const targetIsScan = n.target.type === 'identifier' && n.target.name === 'scan';
        const targetType = targetIsUi ? 'ui:root' as CoreSpiritType : targetIsVisual ? 'visual:root' as CoreSpiritType : targetIsApp ? 'app:root' as CoreSpiritType : targetIsScan ? 'scan:root' as CoreSpiritType : infer(n.target, scope);
        const argTypes = n.args.map(x => infer(x, scope));
        if (targetType === 'ui:root') {
          if (n.member !== 'panel') report(n, `ui.${n.member} is not a supported root UI constructor`, 'UI_UNKNOWN_ROOT');
          if (n.member === 'panel' && n.args.length !== 1) report(n, 'ui.panel expects a title', 'UI_PANEL_ARGS');
          if (n.member === 'panel' && n.args.length && !compatible('string', argTypes[0])) report(n, 'ui.panel title must be a string', 'UI_PANEL_TITLE');
          return n.member === 'panel' ? 'ui:panel' : 'unknown';
        }
        if (targetType === 'visual:root') {
          const rules: Record<string, { min:number; max:number; result: CoreSpiritType }> = {
            line: { min:5, max:6, result:'visual:object' },
            zone: { min:3, max:6, result:'visual:object' },
            liquidityZone: { min:5, max:6, result:'visual:object' },
            heatmap: { min:2, max:4, result:'visual:object' },
            liquidityMap: { min:2, max:4, result:'visual:object' },
            depth: { min:2, max:4, result:'visual:object' },
            volumeProfile: { min:2, max:4, result:'visual:object' },
            footprint: { min:2, max:4, result:'visual:object' },
            structureGraph: { min:2, max:4, result:'visual:object' },
            probabilitySurface: { min:2, max:4, result:'visual:object' },
            regimeBand: { min:2, max:4, result:'visual:object' },
            tradePath: { min:2, max:4, result:'visual:object' },
            modelField: { min:2, max:4, result:'visual:object' },
            replayTrace: { min:2, max:4, result:'visual:object' },
          };
          const rule=rules[n.member];
          if(!rule){ report(n, `visual.${n.member} is not a supported declarative visual constructor`, 'VISUAL_UNKNOWN'); return 'unknown'; }
          if(n.args.length<rule.min || n.args.length>rule.max) report(n, `visual.${n.member} expects ${rule.min}-${rule.max} arguments`, 'VISUAL_ARGS');
          if(n.args.length && !compatible('string', argTypes[0])) report(n, `visual.${n.member} id must be a string`, 'VISUAL_ID');
          return rule.result;
        }
        if (targetType === 'scan:root') {
          const rules: Record<string, { min:number; max:number; result: CoreSpiritType }> = {
            universe: { min:1, max:1, result:'scan:root' },
            emit: { min:1, max:3, result:'scan:candidate' },
          };
          const rule=rules[n.member];
          if(!rule){ report(n, `scan.${n.member} is not a supported scanner constructor`, 'SCAN_UNKNOWN'); return 'unknown'; }
          if(n.args.length<rule.min || n.args.length>rule.max) report(n, `scan.${n.member} expects ${rule.min}-${rule.max} arguments`, 'SCAN_ARGS');
          if(n.member === 'universe' && n.args[0] && !compatible('string', argTypes[0])) report(n, 'scan.universe id must be a string', 'SCAN_UNIVERSE_ID');
          if(n.member === 'emit' && n.args[0] && !isNumericType(argTypes[0])) report(n, 'scan.emit score must be numeric', 'SCAN_SCORE');
          return rule.result;
        }
        if (targetType === 'app:root') {
          const rules: Record<string, { min:number; max:number; result: CoreSpiritType }> = {
            create: { min:1, max:2, result:'app:root' },
            chart: { min:0, max:3, result:'app:widget' },
            panel: { min:2, max:5, result:'app:widget' },
            overlay: { min:1, max:3, result:'app:widget' },
            targets: { min:1, max:8, result:'app:root' },
            require: { min:1, max:1, result:'null' },
            bind: { min:2, max:3, result:'null' },
          };
          const rule=rules[n.member];
          if(!rule){ report(n, `app.${n.member} is not a supported workspace constructor`, 'APP_UNKNOWN'); return 'unknown'; }
          if(n.args.length<rule.min || n.args.length>rule.max) report(n, `app.${n.member} expects ${rule.min}-${rule.max} arguments`, 'APP_ARGS');
          return rule.result;
        }
        if (targetType === 'ui:panel') {
          const rules: Record<string, { min:number; max:number; result: CoreSpiritType }> = {
            number: { min:2, max:3, result:'ui:control' },
            button: { min:1, max:2, result:'ui:control' },
            toggle: { min:2, max:3, result:'ui:control' },
            slider: { min:3, max:5, result:'ui:control' },
          };
          const rule = rules[n.member];
          if (!rule) { report(n, `UI panel has no method '${n.member}'`, 'UI_UNKNOWN_METHOD'); return 'unknown'; }
          if (n.args.length < rule.min || n.args.length > rule.max) report(n, `panel.${n.member} expects ${rule.min}-${rule.max} arguments`, 'UI_ARG_COUNT');
          if (n.args[0] && !compatible('string', argTypes[0])) report(n, `panel.${n.member} label must be a string`, 'UI_LABEL');
          if (n.member === 'number' && n.args[1] && !isNumericType(argTypes[1])) report(n, 'panel.number value must be numeric', 'UI_NUMBER_VALUE');
          if (n.member === 'toggle' && n.args[1] && !isBooleanType(argTypes[1])) report(n, 'panel.toggle value must be boolean', 'UI_TOGGLE_VALUE');
          if (n.member === 'slider' && [1,2].some(i => n.args[i] && !isNumericType(argTypes[i]))) report(n, 'panel.slider min and max must be numeric', 'UI_SLIDER_RANGE');
          return rule.result;
        }
        if (targetType === 'ui:control') {
          report(n, `UI control '${n.member}' is not a mutable method; use host interaction events`, 'UI_CONTROL_METHOD');
          return 'unknown';
        }
        report(n, `Cannot call member '${n.member}' on '${targetType}'`, 'TYPE_MEMBER_CALL_TARGET');
        return 'unknown';
      }

      case 'index': {
        const target=infer(n.target,scope);
        const indexType=infer(n.index,scope);
        if(!isNumericType(indexType)) report(n.index,'Historical index must be numeric','TYPE_INDEX');
        const constantIndex=constantNumber(n.index);
        if(constantIndex!==undefined && Number.isInteger(constantIndex)){
          if(constantIndex<0) report(n,'Future indexing is not allowed; index must be >= 0','FUTURE_INDEX');
          else maxLookback=Math.max(maxLookback,constantIndex);
        }
        if(!isSeriesType(target)) {
          report(n,`Cannot index '${target}'; only series values support historical indexing`,'TYPE_INDEX_TARGET');
          return 'unknown';
        }
        return elementType(target);
      }

      case 'unary': {
        const t=infer(n.operand,scope);
        if(n.operator==='!' && !isBooleanType(t)) report(n,'! expects a boolean value','TYPE_UNARY_BOOL');
        if(n.operator!=='!' && !isNumericType(t)) report(n,'Unary + and - expect a number','TYPE_UNARY_NUMBER');
        return n.operator==='!' ? 'boolean' : t;
      }

      case 'binary': {
        const a=infer(n.left,scope), b=infer(n.right,scope);
        if(n.operator==='and'||n.operator==='or'){
          if(!isBooleanType(a)||!isBooleanType(b)) report(n,`${n.operator} expects boolean operands`,'TYPE_LOGICAL');
          return 'boolean';
        }
        if(comparisonOps.has(n.operator)){
          if((isNumericType(a)&&isNumericType(b)) || compatible(a,b) || compatible(b,a)) return 'boolean';
          report(n,`Operator '${n.operator}' requires compatible operands`,'TYPE_COMPARISON');
          return 'boolean';
        }
        if(!isNumericType(a)||!isNumericType(b)) report(n,`Operator '${n.operator}' expects numeric operands`,'TYPE_ARITHMETIC');
        return joinTypes(a,b);
      }

      case 'call': {
        const builtin=CORE_SPIRIT_BUILTINS.get(n.name);
        if(!builtin){
          report(n,`Unknown function '${n.name}'`,'UNKNOWN_FUNCTION');
          n.args.forEach(x=>infer(x,scope));
          return 'unknown';
        }

        if(n.args.length<builtin.minArgs || (builtin.maxArgs!==undefined && n.args.length>builtin.maxArgs)){
          const max=builtin.maxArgs===undefined?'∞':String(builtin.maxArgs);
          report(n,`${n.name} expects ${builtin.minArgs === builtin.maxArgs ? builtin.minArgs : `${builtin.minArgs}-${max}`} arguments; got ${n.args.length}`,'ARG_COUNT');
        }

        const argTypes=n.args.map(x=>infer(x,scope));

        if(['sma','ema','hma','rsi','highest','lowest','sum','mean','stdev','wma','rma','median','variance','change'].includes(n.name) &&
          n.args.length>0 && !isNumericType(argTypes[0]))
          report(n,`${n.name} first argument must be numeric`,'TYPE_INDICATOR_INPUT');

        if(['atr','vwap'].includes(n.name) && n.args.length>0 && !isNumericType(argTypes[0]))
          report(n,`${n.name} argument must be numeric`,'TYPE_INDICATOR_INPUT');

        if(['cross','crossover','crossunder'].includes(n.name) &&
          (!isNumericType(argTypes[0])||!isNumericType(argTypes[1])))
          report(n,`${n.name} expects two numeric series`,'TYPE_CROSS');

        if(n.name==='nz' && n.args.length>0 && !isNumericType(argTypes[0]))
          report(n,'nz expects a numeric value or numeric series','TYPE_NZ');

        if(['rising','falling'].includes(n.name) && n.args.length>0 && !isNumericType(argTypes[0]))
          report(n,`${n.name} expects a numeric series`,'TYPE_RISING_INPUT');

        if(numericBuiltins.has(n.name) && n.args.length>0 && !isNumericType(argTypes[0]))
          report(n,`${n.name} expects a numeric input`,'TYPE_MODEL_INPUT');

        if(['max','min'].includes(n.name) &&
          (!isNumericType(argTypes[0])||!isNumericType(argTypes[1])))
          report(n,`${n.name} expects numeric operands`,'TYPE_NUMERIC_ARGS');

        if(n.name==='clamp' && [0,1,2].some(i=>!isNumericType(argTypes[i])))
          report(n,'clamp expects numeric value, minimum and maximum','TYPE_MODEL_CLAMP');

        if(['predict','score'].includes(n.name)){
          if(!isNumericType(argTypes[0])) report(n,`${n.name} first argument must be numeric bias`,'TYPE_MODEL_BIAS');
          if(n.args.length < 3 || ((n.args.length - 1) % 2 !== 0))
            report(n,`${n.name} expects bias followed by feature/weight pairs`,'TYPE_MODEL_PAIRS');
          for(let i=1;i<n.args.length;i++)
            if(!isNumericType(argTypes[i])) report(n,`${n.name} feature and weight arguments must be numeric`,'TYPE_MODEL_PAIR');
        }

        if(n.name==='entry'){
          if(layer !== 'strategy' && layer !== 'automation') report(n,'entry is not available to script/model programs; emit a signal and let automation create the order intent','CAPABILITY_STRATEGY_EVENTS');
          if(!isBooleanType(argTypes[0])) report(n,'entry first argument must be a boolean condition','TYPE_ENTRY_CONDITION');
          if(!compatible('string',argTypes[1])) report(n,'entry side must be a string','TYPE_ENTRY_SIDE');
        }
        if(n.name==='exit'){
          if(layer !== 'strategy' && layer !== 'automation') report(n,'exit is not available to script/model programs; emit a signal and let automation create the order intent','CAPABILITY_STRATEGY_EVENTS');
          if(!isBooleanType(argTypes[0])) report(n,'exit first argument must be a boolean condition','TYPE_EXIT_CONDITION');
        }
        if(['buy','sell'].includes(n.name) && layer !== 'automation')
          report(n,`${n.name} is automation-only and creates an order intent, never a broker order`,'CAPABILITY_ORDER_INTENTS');

        if(n.name==='webhook' && layer !== 'automation')
          report(n,'webhook delivery is host-owned; only automation may request an event delivery through policy','CAPABILITY_WEBHOOK');

        if(n.name==='meta') {
          if (n.args.length % 2 !== 0) report(n,'meta expects key/value pairs','META_PAIRS');
          for(let i=0;i<n.args.length;i+=2) {
            if(n.args[i] && !compatible('string',argTypes[i])) report(n.args[i],'meta keys must be strings','META_KEY');
          }
          return 'unknown';
        }

        if(['plot','marker','line','zone','box','band','gradient','arrow','shape','heatmap','polyline','hline'].includes(n.name) &&
          n.args.length>0 && !isNumericType(argTypes[0]))
          report(n,`${n.name} requires a numeric value`,'TYPE_OUTPUT');

        if(['box','arrow','line'].includes(n.name) && n.args.length>=4 &&
          [0,1,2,3].some(i=>!isNumericType(argTypes[i])))
          report(n,`${n.name} coordinate arguments must be numeric`,'TYPE_VISUAL_COORDINATE');

        if(n.name==='zone' && n.args.length>=4 &&
          [0,1,2,3].some(i=>!isNumericType(argTypes[i])))
          report(n,'zone coordinates must be numeric','TYPE_VISUAL_COORDINATE');

        if(n.name==='polyline' && (n.args.length<6 || ((n.args.length-2)%2!==0)))
          report(n,'polyline expects time/price pairs followed by color/width options','TYPE_POLYLINE');

        if(n.name==='hline' && n.args.length>0 && !isNumericType(argTypes[0]))
          report(n,'hline price must be numeric','TYPE_HLINE');

        if(['bg','barcolor'].includes(n.name) && n.args.length>0 && !compatible('string',argTypes[0]))
          report(n,`${n.name} color must be a string`,'TYPE_COLOR');

        if(n.name==='table' && n.args.length>=3 &&
          (!isNumericType(argTypes[1])||!isNumericType(argTypes[2])))
          report(n,'table row and column must be numeric','TYPE_TABLE_COORD');

        if(['band','fill','gradient'].includes(n.name) && n.args.length>=2 &&
          (!isNumericType(argTypes[0])||!isNumericType(argTypes[1])))
          report(n,`${n.name} top and bottom must be numeric`,'TYPE_BAND_BOUNDS');

        if(['shape','heatmap'].includes(n.name) && n.args.length>1 && !compatible('string',argTypes[1]))
          report(n,`${n.name} symbol/color argument must be a string`,'TYPE_SHAPE');

        if(n.name==='label' && n.args.length>0 && !compatible('string',argTypes[0]))
          report(n,'label text must be a string','TYPE_LABEL_TEXT');

        if(n.name==='labelAt'){
          if(n.args.length>0 && !isNumericType(argTypes[0])) report(n,'labelAt price must be numeric','TYPE_LABEL_PRICE');
          if(n.args.length>1 && !compatible('string',argTypes[1])) report(n,'labelAt text must be a string','TYPE_LABEL_TEXT');
        }

        if(n.name==='label' && n.args.length>1 && !compatible('string',argTypes[1]))
          report(n,'label position must be a string','TYPE_LABEL_POSITION');
        if(n.name==='labelAt' && n.args.length>2 && !compatible('string',argTypes[2]))
          report(n,'labelAt position must be a string','TYPE_LABEL_POSITION');

        if(n.name==='signal' && n.args.length>0 &&
          !compatible('string',argTypes[0]) && !isBooleanType(argTypes[0]))
          report(n,'signal expects a string name or boolean condition','TYPE_SIGNAL');

        switch(n.name){
          case 'sma': case 'ema': case 'hma': case 'rsi': case 'atr': case 'vwap':
          case 'highest': case 'lowest': case 'sum': case 'mean': case 'stdev': case 'wma': case 'rma': case 'median': case 'variance': case 'change':
            return 'series<float>';
          case 'cross': case 'crossover': case 'crossunder': case 'rising': case 'falling': case 'isNa': case 'na':
            return 'boolean';
          case 'nz':
            return argTypes[0] || 'unknown';
          case 'max': case 'min':
            return joinTypes(argTypes[0] || 'unknown',argTypes[1] || 'unknown');
          case 'bar_index': case 'time':
            return 'number';
          case 'request': case 'requestBatch':
          case 'bid': case 'ask': case 'spread': case 'mid':
          case 'intrabarCount': case 'intrabarSum': case 'intrabarHigh':
          case 'intrabarLow': case 'intrabarDelta':
          case 'depthImbalance': case 'footprintDelta': case 'footprintBuy':
          case 'footprintSell': case 'footprintPoc': case 'footprintVah':
          case 'footprintVal': case 'footprintRows':
          case 'footprintRowPrice': case 'footprintRowBuy':
          case 'footprintRowSell': case 'footprintRowDelta':
          case 'footprintRowImbalance': case 'lowerTf':
            return 'series<float>';
          case 'abs': case 'sqrt': case 'pow': case 'round': case 'sign': case 'exp': case 'log':
          case 'tanh': case 'clamp': case 'sigmoid': case 'probability':
          case 'predict': case 'score':
            return liftedNumericReturn(argTypes);
          default:
            return builtin.returnType === 'event' ? 'unknown' : builtin.returnType;
        }
      }
      default:
        return 'unknown';
    }
  };

  const visit=(n:CoreSpiritAstNode, scope:Map<string,CoreSpiritType>)=>{
    switch(n.type){
      case 'program':
        n.body.forEach(x=>visit(x,scope));
        break;

      case 'typeDeclaration': {
        if(udts.has(n.name)) report(n,`Type '${n.name}' is already declared`,'DUPLICATE_TYPE');
        const fields=n.fields.map(f=>({name:f.name,type:normalizeDeclaredType(f.typeName)}));
        udts.set(n.name,{name:n.name,fields});
        break;
      }

      case 'let': {
        if(symbols.has(n.name)) report(n,`Variable '${n.name}' is already declared`,'DUPLICATE_VARIABLE');
        const inferred=infer(n.expression,scope);
        visit(n.expression,scope);

        let finalType=inferred;
        if(n.declaredType){
          const declared=normalizeDeclaredType(n.declaredType);
          if(!compatible(declared,inferred))
            report(n,`Variable '${n.name}' is declared as ${declared} but expression is ${inferred}`,'TYPE_DECLARATION');
          finalType=declared;
        }

        symbols.set(n.name,finalType);
        scope.set(n.name,finalType);
        break;
      }

      case 'expressionStatement':
        visit(n.expression,scope);
        infer(n.expression,scope);
        break;

      case 'if': {
        const condition=infer(n.condition,scope);
        visit(n.condition,scope);
        if(!isBooleanType(condition)) report(n.condition,'if condition must be boolean','TYPE_IF_CONDITION');
        n.thenBranch.forEach(x=>visit(x,new Map(scope)));
        n.elseBranch?.forEach(x=>visit(x,new Map(scope)));
        break;
      }

      case 'identifier':
        if(!scope.has(n.name)&&!seriesNames.has(n.name)&&!specialIdentifiers.has(n.name))
          report(n,`Unknown identifier '${n.name}'`,'UNKNOWN_IDENTIFIER');
        break;

      case 'member':
        visit(n.target,scope);
        infer(n,scope);
        break;

      case 'memberCall':
        if (!(n.target.type === 'identifier' && ['ui','visual','app','scan'].includes(n.target.name))) visit(n.target,scope);
        n.args.forEach((x,index)=>{
          const actionPosition = (n.member === 'button' && index === 1) || (n.member === 'toggle' && index === 2) || (n.member === 'number' && index === 2) || (n.member === 'slider' && index === 4);
          if (actionPosition && x.type === 'identifier' && !scope.has(x.name)) return;
          visit(x,scope);
        });
        infer(n,scope);
        break;

      case 'index':
        visit(n.target,scope);
        visit(n.index,scope);
        infer(n,scope);
        break;

      case 'call':
        n.args.forEach(x=>visit(x,scope));
        infer(n,scope);
        break;

      case 'unary':
        visit(n.operand,scope);
        infer(n,scope);
        break;

      case 'binary':
        visit(n.left,scope);
        visit(n.right,scope);
        infer(n,scope);
        break;

      default:
        break;
    }
  };

  visit(ast,new Map(symbols));
  return {diagnostics,symbols,udts,maxLookback};
}

function constantNumber(n:CoreSpiritAstNode):number|undefined {
  if(n.type==='number') return n.value as number;
  if(n.type==='unary'){
    const v=constantNumber(n.operand);
    if(v===undefined) return undefined;
    if(n.operator==='-') return -v;
    if(n.operator==='+') return v;
  }
  return undefined;
}

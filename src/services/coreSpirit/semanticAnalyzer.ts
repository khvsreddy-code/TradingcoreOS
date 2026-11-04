import { CoreSpiritAstNode, CoreSpiritAst } from './ast';
import { CORE_SPIRIT_BUILTINS } from './standardLibrary';
import { CoreSpiritType, compatible, isBooleanType, isNumericType, isNumericScalarType, isStateType, joinTypes, normalizeDeclaredType, elementType, isSeriesType } from './typeSystem';
import { componentResultLanguageType, resolveCoreSpiritComponent, validateCoreSpiritComponentInvocation, type CoreSpiritComponentRegistryLike } from './coreSpiritComponents';
import { combineSemanticArithmetic, compareSemanticTypes, mergeSemanticMetadata, semanticSeriesField, semanticScalar, semanticSeries, semanticTypeCompatible, semanticTypeForDeclaredName, semanticTypeToString, scalarize, type CoreSpiritSemanticType } from './semanticTypeSystem';
import { getCoreSpiritMemberContract, CORE_SPIRIT_ROOT_NAMESPACES } from './memberRegistry';
import { isCoreSpiritLibraryNamespace, resolveCoreSpiritLibraryCall } from './standardLibraryNamespaces';
import { canUseCapability, type CoreSpiritProgramLayer } from './layeredPlatformContract';
import type { CoreSpiritSurfaceMetadata } from './languageConcepts';

export type CoreSpiritDiagnostic = { severity:'error'|'warning'; message:string; line?:number; column?:number; start?:number; end?:number; code?:string };
export type CoreSpiritUdt = { name:string; fields:Array<{name:string;type:CoreSpiritType}> };
export type CoreSpiritSemanticOptions = { layer?:CoreSpiritProgramLayer; surface?:unknown; components?:CoreSpiritComponentRegistryLike };
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
const specialIdentifiers=new Set(['na','bar_index','bar']);
const comparisonOps=new Set(['==','!=','<','<=','>','>=']);

export function analyzeCoreSpirit(ast:CoreSpiritAst, options:CoreSpiritSemanticOptions = {}):CoreSpiritSemanticResult {
  const diagnostics:CoreSpiritDiagnostic[]=[];
  const symbols=new Map<string,CoreSpiritType>();
  const udts=new Map<string,CoreSpiritUdt>();
  const modelBindings=new Map<string,unknown>();
  const componentBindings=new Map<string,string>();
  const semanticSymbols=new Map<string,CoreSpiritSemanticType>();
  const componentSource=options.components;
  const modelDeclarations = ((options.surface as CoreSpiritSurfaceMetadata | undefined)?.declarations ?? []).filter(item => item.kind === 'model');
  const modelDeclarationMap = new Map(modelDeclarations.map(item => [item.name, item] as const));
  let maxLookback=0;
  let eventScopeDepth=0;
  let loopDepth=0;
  const report=(n:CoreSpiritAstNode,message:string,code:string)=>diagnostics.push({
    severity:'error',message,line:n.span?.line,column:n.span?.column,start:n.span?.start,end:n.span?.end,code
  });
  for (const declaration of modelDeclarations) {
    if (declaration.kind !== 'model' || !declaration.modelType || !/^HMM(?:<.*>)?$/i.test(declaration.modelType)) continue;
    if (declaration.states !== undefined &&
        (!Number.isInteger(declaration.states) || declaration.states < 2 || declaration.states > 12)) {
      diagnostics.push({ severity:'error', message:'HMM states must be an integer between 2 and 12', code:'TYPE_HMM_STATES' });
    }
    if (declaration.unsupportedEmission) {
      diagnostics.push({ severity:'error', message:"Unsupported HMM emission '" + declaration.unsupportedEmission + "'; currently use emission = gaussian", code:'TYPE_HMM_EMISSION' });
    }
    if (declaration.unsupportedCovariance) {
      diagnostics.push({ severity:'error', message:"Unsupported HMM covariance '" + declaration.unsupportedCovariance + "'; use full or diagonal", code:'TYPE_HMM_COVARIANCE' });
    }
  }

  const mapDeclaredType=(name:string):CoreSpiritType=> normalizeDeclaredType(name);
  const surfaceInputs = (options.surface as CoreSpiritSurfaceMetadata | undefined)?.inputs ?? [];
  const findSurfaceInput = (name: string) => surfaceInputs.find(input => input.key === name);
  const inputLanguageType = (typeValue: unknown): CoreSpiritType => {
    const type = String(typeValue ?? '').toLowerCase();
    if (type === 'source') return 'series<number>';
    if (['int','integer','float','number','price','volume','currency','duration','time'].includes(type)) return 'number';
    if (['bool','boolean'].includes(type)) return 'boolean';
    if (['string','color'].includes(type)) return 'string';
    return 'unknown';
  };

  const infer=(n:CoreSpiritAstNode, scope:Map<string,CoreSpiritType>):CoreSpiritType=>{
    switch(n.type){
      case 'number': return 'number';
      case 'string': return 'string';
      case 'boolean': return 'boolean';
      case 'null': return 'null';
      case 'arrayLiteral': {
        const elementTypes=n.elements.map(item=>infer(item,scope));
        const elementType=elementTypes.length?elementTypes.reduce((current,next)=>current===next?current:joinTypes(current,next)):'unknown';
        return `array<${elementType}>` as CoreSpiritType;
      }
      case 'mapLiteral': {
        const valueTypes=n.entries.map(entry=>infer(entry.value,scope));
        const valueType=valueTypes.length?valueTypes.reduce((current,next)=>current===next?current:joinTypes(current,next)):'unknown';
        return `map<string,${valueType}>` as CoreSpiritType;
      }
      case 'identifier':
        if(seriesNames.has(n.name)) return 'series<number>';
        if(n.name==='na') return 'null';
        if(n.name==='bar_index') return 'number';
        if(n.name==='bar') return 'udt:bar:context';
        const resolved = scope.get(n.name) || 'unknown';
        return isStateType(resolved) ? elementType(resolved) : resolved;

      case 'member': {
        if(n.target.type==='identifier' && n.target.name==='bar' && ['confirmed','developing','realtime','historical','forecast'].includes(n.member)) return 'boolean';
        if(n.target.type==='identifier' && n.target.name==='chart' && ['price','volume','indicator','custom'].includes(n.member)) return `visual:area`;
        if(n.target.type==='identifier' && scope.get(n.target.name)==='market:ref' && ['open','high','low','close','volume','time'].includes(n.member)) return 'number';
        if(n.target.type==='identifier' && scope.get(n.target.name)==='market:ref' && n.member==='trade') return 'trade';
        if(n.target.type==='identifier' && scope.get(n.target.name)==='market:ref' && n.member==='orderbook') return 'orderbook';
        if(n.target.type==='identifier' && scope.get(n.target.name)==='market:ref' && n.member==='footprint') return 'footprint';
        if(n.target.type==='identifier' && scope.get(n.target.name)==='market:ref' && n.member==='volumeProfile') return 'volume-profile';
        if(n.target.type==='identifier' && scope.get(n.target.name)==='timeframe:ref' && ['open','high','low','close','volume','time'].includes(n.member)) return 'number';
        if(n.target.type==='call' && (n.target.name==='market'||n.target.name==='timeframe'||n.target.name==='series')) {
          if(['trade','orderbook','footprint','volumeProfile'].includes(n.member)) return n.member==='trade'?'trade':n.member==='orderbook'?'orderbook':n.member==='footprint'?'footprint':'volume-profile';
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
        if(target.startsWith('array<') && n.member==='length') return 'number';
        if(target.startsWith('map<')) return n.member==='size' ? 'number' : target.slice(target.indexOf(',')+1,-1) as CoreSpiritType;
        if(target.startsWith('matrix<') && ['rows','columns','cols'].includes(n.member)) return 'number';
        if(target.startsWith('vector<') && n.member==='length') return 'number';
        if(target==='string' && n.member==='length') return 'number';
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
        if(target.startsWith('array<')) {
          if(!isNumericScalarType(index)) report(n.index,'Array indexes must be integer numeric values','TYPE_ARRAY_INDEX');
          return target.slice(6,-1) as CoreSpiritType;
        }
        if(target.startsWith('map<')) {
          if(index!=='string' && index!=='unknown') report(n.index,'Map indexes must be string keys','TYPE_MAP_INDEX');
          return target.slice(target.indexOf(',')+1,-1) as CoreSpiritType;
        }
        if(target.startsWith('matrix<') || target.startsWith('vector<')) {
          if(!isNumericScalarType(index)) report(n.index,'Matrix/vector indexes must be integer numeric values','TYPE_NUMERIC_COLLECTION_INDEX');
          return 'number';
        }
        if(target==='string') return 'string';
        const constantIndex=constantNumber(n.index);
        const inputIndex = n.index.type === 'identifier' ? findSurfaceInput(n.index.name) : undefined;
        if(constantIndex!==undefined&&Number.isInteger(constantIndex)){
          if(constantIndex<0) report(n,'Future indexing is not allowed; index must be >= 0','FUTURE_INDEX');
          else maxLookback=Math.max(maxLookback,constantIndex);
        } else if(inputIndex?.type === 'int') {
          const maximum = Number(inputIndex.max ?? inputIndex.defval);
          if(Number.isFinite(maximum) && maximum >= 0) maxLookback=Math.max(maxLookback,Math.floor(maximum));
        }
        if(!isNumericType(index)) report(n.index,'Historical index must be numeric','TYPE_INDEX');
        if(inputIndex && inputIndex.type !== 'int') report(n.index,'Input-based historical index must use an integer input','TYPE_INDEX_INTEGER');
        return target.startsWith('series<') ? target.slice(7,-1) as CoreSpiritType : target;
      }

      case 'unary': {
        const t=infer(n.operand,scope);
        if(n.operator==='!' && !isBooleanType(t)) report(n,'! expects a boolean value','TYPE_UNARY_BOOL');
        if(n.operator!=='!' && !isNumericType(t)) report(n,'Unary + and - expect a number','TYPE_UNARY_NUMBER');
        return n.operator==='!' ? (t.startsWith('series<') ? 'series<boolean>' : 'boolean') : t;
      }

      case 'binary': {
        const a=infer(n.left,scope), b=infer(n.right,scope);
        if(n.operator==='and'||n.operator==='or'){
          if(!isBooleanType(a)||!isBooleanType(b)) report(n,`${n.operator} expects boolean operands`,'TYPE_LOGICAL');
          return isSeriesType(a) || isSeriesType(b) ? 'series<boolean>' : 'boolean';
        }
        if(comparisonOps.has(n.operator)) return isSeriesType(a) || isSeriesType(b) ? 'series<boolean>' : 'boolean';
        if(!isNumericType(a)||!isNumericType(b)) report(n,`Operator '${n.operator}' expects numeric operands`,'TYPE_ARITHMETIC');
        return joinTypes(a,b);
      }

      case 'call': {
        const component=resolveCoreSpiritComponent(componentSource,n.name);
        const argTypes=n.args.map(x=>infer(x,scope));
        if(n.name === '__input') {
          const key = n.args[0]?.type === 'string' ? String(n.args[0].value) : '';
          const definition = findSurfaceInput(key);
          const type = inputLanguageType(definition?.type);
          if(type !== 'unknown') return type;
          return argTypes[1] ?? 'unknown';
        }
        if(component){
          const errors=validateCoreSpiritComponentInvocation(component,argTypes);
          for(const message of errors) report(n,message,'COMPONENT_INVOCATION');
          return componentResultLanguageType(component);
        }

        if(n.name==='place_order' || n.name==='placeOrder' || n.name==='submit_order') {
          report(n,'Direct order submission is host-only. CoreSpirit may emit an order-intent; live execution requires explicit host authorization, risk and policy checks.','CAPABILITY_LIVE_ORDER_HOST_ONLY');
          return 'unknown';
        }

        if(n.name==='model') {
          const name=n.args[0]?.type==='string' ? String(n.args[0].value) : undefined;
          const declaration=name ? modelDeclarationMap.get(name) : undefined;
          if (declaration?.kind==='model' && declaration.modelType) return `model<${declaration.modelType}>` as CoreSpiritType;
        }
        if(n.name==='series') {
          if(n.args.length !== 1 || !compatible('string', argTypes[0])) {
            report(n,'series expects one string timeframe','TYPE_SERIES_TIMEFRAME');
          }
          return 'timeframe:ref';
        }

        const builtin=CORE_SPIRIT_BUILTINS.get(n.name);
        const isMatrix = (type:CoreSpiritType) => type.startsWith('matrix<');
        const isVector = (type:CoreSpiritType) => type.startsWith('vector<');
        if (n.name === 'vector' && argTypes.some(type => !isNumericScalarType(type))) {
          report(n, 'vector expects numeric scalar values; convert series explicitly before constructing a vector', 'TYPE_VECTOR_VALUE');
        }
        if (n.name === 'matrix') {
          if (!isNumericScalarType(argTypes[0] ?? 'unknown') || !isNumericScalarType(argTypes[1] ?? 'unknown')) {
            report(n, 'matrix dimensions must be numeric integer values', 'TYPE_MATRIX_DIMENSIONS');
          }
          if (argTypes.slice(2).some(type => !isNumericScalarType(type))) report(n, 'matrix elements must be numeric scalar values; series require an explicit data/window conversion', 'TYPE_MATRIX_VALUE');
          const rows = constantNumber(n.args[0] ?? n);
          const columns = constantNumber(n.args[1] ?? n);
          if (rows !== undefined && (!Number.isInteger(rows) || rows < 1 || rows > 256)) report(n, 'matrix rows must be an integer from 1 to 256', 'TYPE_MATRIX_ROWS');
          if (columns !== undefined && (!Number.isInteger(columns) || columns < 1 || columns > 256)) report(n, 'matrix columns must be an integer from 1 to 256', 'TYPE_MATRIX_COLUMNS');
          if (rows !== undefined && columns !== undefined && rows * columns > 65_536) report(n, 'matrix exceeds the 65,536-element compile-time limit', 'TYPE_MATRIX_SIZE');
        }
        if (['zeros','identity'].includes(n.name) && argTypes.some(type => !isNumericScalarType(type))) {
          report(n, n.name + ' dimensions must be numeric integer values', 'TYPE_MATRIX_DIMENSIONS');
        }
        if (n.name === 'tensor' && argTypes.slice(1).some(type => !isNumericScalarType(type))) {
          report(n, 'tensor elements must be numeric', 'TYPE_TENSOR_VALUE');
        }
        if (['matmul','matrixAdd'].includes(n.name) && argTypes.some(type => !isMatrix(type))) {
          report(n, `${n.name} expects two matrix<float> operands; use vector/matrix constructors before linear algebra`, 'TYPE_MATRIX_OPERAND');
        }
        if (n.name === 'matrixScale' && (!isMatrix(argTypes[0] ?? 'unknown') || !isNumericScalarType(argTypes[1] ?? 'unknown'))) {
          report(n, 'matrixScale expects matrix<float> and a numeric scalar', 'TYPE_MATRIX_SCALE');
        }
        if (n.name === 'transpose' && !isMatrix(argTypes[0] ?? 'unknown')) report(n, 'transpose expects matrix<float>', 'TYPE_MATRIX_OPERAND');
        if (n.name === 'dot' && (!isVector(argTypes[0] ?? 'unknown') || !isVector(argTypes[1] ?? 'unknown'))) {
          report(n, 'dot expects two vector<float> operands', 'TYPE_VECTOR_OPERAND');
        }
        if (n.name === 'tensor' && !isVector(argTypes[0] ?? 'unknown')) report(n, 'tensor expects a vector<float> shape as its first argument', 'TYPE_TENSOR_SHAPE');
        if (n.name === 'dataset') {
          if (n.args.length % 2 !== 0) report(n, 'dataset expects alternating field names and numeric values', 'TYPE_DATASET_FIELDS');
          for (let i = 0; i < argTypes.length; i += 2) {
            if (argTypes[i] !== 'string') report(n.args[i]!, 'dataset field names must be strings', 'TYPE_DATASET_FIELD_NAME');
            if (argTypes[i + 1] !== undefined && !isNumericType(argTypes[i + 1]!)) report(n.args[i + 1]!, 'dataset feature values must be numeric', 'TYPE_DATASET_FIELD_VALUE');
          }
        }
        if (n.name === 'hmmFit') {
          if (argTypes[0] !== 'string') report(n.args[0] ?? n, 'hmmFit first argument must be the declared model name', 'TYPE_HMM_MODEL_NAME');
          if (!(argTypes[1] ?? '').startsWith('dataset<')) report(n.args[1] ?? n, 'hmmFit expects a dataset<float> feature row', 'TYPE_HMM_DATASET');
        }
        if (['hmmDecode','hmmProbability','hmmPosterior'].includes(n.name) && argTypes[0] !== 'string') {
          report(n.args[0] ?? n, `${n.name} first argument must be the declared model name`, 'TYPE_HMM_MODEL_NAME');
        }
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

        if(n.name==='request' && n.args.length===5){
          const alignment=n.args[4];
          const allowedAlignments=['confirmed','historical','developing','realtime'];
          if(alignment?.type!=='string' || !allowedAlignments.includes(String(alignment.value).toLowerCase())){
            report(n,"request fifth argument must be the literal 'confirmed', 'historical', 'developing' or 'realtime'",'TYPE_REQUEST_ALIGNMENT');
          }
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
        if(n.name==='labelAt' && n.args.length>1) {
          const legacyText = compatible('string',argTypes[1] ?? 'unknown');
          const timeAnchoredText = n.args.length > 2 &&
            isNumericType(argTypes[0] ?? 'unknown') &&
            isNumericType(argTypes[1] ?? 'unknown') &&
            compatible('string',argTypes[2] ?? 'unknown');
          if(!legacyText && !timeAnchoredText) report(n,'labelAt expects (price, text, ...) or (time, price, text, ...)','TYPE_LABELAT_TEXT');
        }
        if(n.name==='signal') {
          const valid = (n.args.length>=2 && isBooleanType(argTypes[0]) && compatible('string',argTypes[1])) || (n.args.length>=1 && compatible('string',argTypes[0]));
          if(!valid) report(n,'signal expects a string or a boolean condition followed by a string type','TYPE_SIGNAL');
        }
        return builtin.returnType as CoreSpiritType;
      }

      case 'memberCall': {
        if (n.target.type==='identifier' && ['broker','execution'].includes(n.target.name) && ['placeOrder','place_order','submitOrder','submit_order'].includes(n.member)) {
          report(n,'Direct broker/execution submission is not a CoreSpirit capability. Emit order-intent and let the host execution authority perform an explicitly authorized action.','CAPABILITY_LIVE_ORDER_HOST_ONLY');
          return 'unknown';
        }
        if (n.member === 'timeframe' || n.member === 'tf') {
          if ((n.target.type === 'call' && n.target.name === 'market') || (n.target.type === 'identifier' && scope.get(n.target.name) === 'market:ref')) {
            if (n.args.length !== 1 || !compatible('string', infer(n.args[0]!, scope))) report(n, 'market(...).timeframe(...) expects one string timeframe', 'TYPE_MARKET_TIMEFRAME');
            return 'market:ref';
          }
        }
        const targetType = infer(n.target, scope);
        if (['confirmed','developing','historical','realtime'].includes(n.member) &&
            ['market:ref','timeframe:ref','series:ref'].includes(targetType)) {
          if(n.args.length!==0) report(n,`market-data temporal selector .${n.member}() does not accept arguments`,'TYPE_MARKET_TEMPORAL_SELECTOR');
          return targetType;
        }
        if (targetType === 'model:ref' || targetType.startsWith('model<')) {
          if (n.member === 'predict' || n.member === 'prediction') {
            n.args.forEach(arg => { if (!isNumericType(infer(arg,scope))) report(n,'model.predict feature arguments must be numeric','TYPE_MODEL_FEATURE'); });
            return 'prediction<number>' as CoreSpiritType;
          }
          if (n.member === 'probability' || n.member === 'confidence') return 'probability';
          const modelName = targetType.startsWith('model<') ? targetType.slice(6,-1) : undefined;
          const declaration = modelName ? modelDeclarationMap.get(modelName) : undefined;
          if (declaration && declaration.outputs.includes(n.member)) return 'prediction<number>' as CoreSpiritType;
          report(n, `Model '${modelName ?? 'runtime'}' does not expose member '${n.member}'`, 'UNKNOWN_MODEL_MEMBER');
          return 'unknown';
        }
        if(targetType.startsWith('array<')) {
          const elementType=targetType.slice(6,-1) as CoreSpiritType;
          const argTypes=n.args.map(arg=>infer(arg,scope));
          const requireCount=(minimum:number,maximum=minimum)=> {
            if(n.args.length<minimum || n.args.length>maximum) report(n,`Array method '${n.member}' expects ${minimum===maximum?minimum:`${minimum}..${maximum}`} arguments`,'ARG_COUNT');
          };
          if(['push','unshift'].includes(n.member)) {
            if(argTypes.some(type=>!compatible(elementType,type))) report(n,`Array method '${n.member}' values must match element type '${elementType}'`,'TYPE_ARRAY_ELEMENT');
            return 'number';
          }
          if(['pop','shift'].includes(n.member)) { requireCount(0); return elementType; }
          if(n.member==='get') { requireCount(1); if(argTypes[0] && !isNumericScalarType(argTypes[0])) report(n.args[0]!, 'Array index must be numeric','TYPE_ARRAY_INDEX'); return elementType; }
          if(n.member==='set') {
            requireCount(2);
            if(argTypes[0] && !isNumericScalarType(argTypes[0])) report(n.args[0]!, 'Array index must be numeric','TYPE_ARRAY_INDEX');
            if(argTypes[1] && !compatible(elementType,argTypes[1])) report(n.args[1]!,`Array value must match element type '${elementType}'`,'TYPE_ARRAY_ELEMENT');
            return elementType;
          }
          if(n.member==='includes') { requireCount(1); if(argTypes[0]&&!compatible(elementType,argTypes[0])) report(n.args[0]!,`Array value must match element type '${elementType}'`,'TYPE_ARRAY_ELEMENT'); return 'boolean'; }
          if(n.member==='indexOf') { requireCount(1); if(argTypes[0]&&!compatible(elementType,argTypes[0])) report(n.args[0]!,`Array value must match element type '${elementType}'`,'TYPE_ARRAY_ELEMENT'); return 'number'; }
          if(n.member==='slice') { requireCount(1,2); if(argTypes.some(type=>!isNumericScalarType(type))) report(n,'Array slice indexes must be numeric','TYPE_ARRAY_INDEX'); return targetType; }
          report(n,`Array method '${n.member}' is not supported`,'UNKNOWN_ARRAY_METHOD'); return 'unknown';
        }
        if(targetType.startsWith('map<')) {
          const valueType=targetType.slice(targetType.indexOf(',')+1,-1) as CoreSpiritType;
          const argTypes=n.args.map(arg=>infer(arg,scope));
          const requireCount=(expected:number)=>{if(n.args.length!==expected)report(n,`Map method '${n.member}' expects ${expected} arguments`,'ARG_COUNT');};
          if(['get','has','delete'].includes(n.member)) {
            requireCount(1);
            if(argTypes[0] && argTypes[0]!=='string' && argTypes[0]!=='unknown') report(n.args[0]!, 'Map key must be a string','TYPE_MAP_KEY');
            if(n.member==='get') return valueType;
            return 'boolean';
          }
          if(n.member==='set') {
            requireCount(2);
            if(argTypes[0] && argTypes[0]!=='string' && argTypes[0]!=='unknown') report(n.args[0]!, 'Map key must be a string','TYPE_MAP_KEY');
            if(argTypes[1] && !compatible(valueType,argTypes[1])) report(n.args[1]!,`Map value must match value type '${valueType}'`,'TYPE_MAP_VALUE');
            return valueType;
          }
          if(['keys','values','entries'].includes(n.member)) {
            requireCount(0);
            if(n.member==='keys') return 'array<string>';
            if(n.member==='values') return `array<${valueType}>` as CoreSpiritType;
            return 'array<array<unknown>>';
          }
          report(n,`Map method '${n.member}' is not supported`,'UNKNOWN_MAP_METHOD'); return 'unknown';
        }
        if(targetType.startsWith('matrix<')) {
          const argTypes=n.args.map(arg=>infer(arg,scope));
          if(n.member==='get') {
            if(n.args.length!==2) report(n,'Matrix get expects row and column indexes','ARG_COUNT');
            if(argTypes.some(type=>!isNumericScalarType(type))) report(n,'Matrix indexes must be numeric','TYPE_MATRIX_INDEX');
            return 'number';
          }
          if(n.member==='transpose') { if(n.args.length!==0) report(n,'Matrix transpose expects no arguments','ARG_COUNT'); return 'matrix<float>'; }
          if(n.member==='scale') { if(n.args.length!==1) report(n,'Matrix scale expects one scalar','ARG_COUNT'); if(argTypes[0]&&!isNumericScalarType(argTypes[0])) report(n.args[0]!, 'Matrix scale factor must be numeric','TYPE_MATRIX_SCALE'); return 'matrix<float>'; }
          if(n.member==='add'||n.member==='multiply') {
            if(n.args.length!==1) report(n,`Matrix ${n.member} expects one matrix`,'ARG_COUNT');
            if(argTypes[0] && !String(argTypes[0]).startsWith('matrix<')) report(n.args[0]!,`Matrix ${n.member} expects a matrix operand`,'TYPE_MATRIX_OPERAND');
            return 'matrix<float>';
          }
          report(n,`Matrix method '${n.member}' is not supported`,'UNKNOWN_MATRIX_METHOD'); return 'unknown';
        }
        if(targetType.startsWith('vector<') && n.member==='dot') {
          const argTypes=n.args.map(arg=>infer(arg,scope));
          if(n.args.length!==1) report(n,'Vector dot expects one vector','ARG_COUNT');
          if(argTypes[0] && !String(argTypes[0]).startsWith('vector<')) report(n.args[0]!, 'Vector dot expects a vector operand','TYPE_VECTOR_OPERAND');
          return 'number';
        }
        if (n.target.type === 'identifier' && isCoreSpiritLibraryNamespace(n.target.name)) {
          const resolved = resolveCoreSpiritLibraryCall(n.target.name, n.member, componentSource);
          if (!resolved || resolved.entry.status === 'catalog') {
            report(n, `Unknown or non-executable library member '${n.target.name}.${n.member}'`, 'UNKNOWN_LIBRARY_MEMBER');
            return 'unknown';
          }
          const builtin = resolved.builtin;
          n.args.forEach(arg => infer(arg,scope));
          if (builtin && (n.args.length < builtin.minArgs || (builtin.maxArgs !== undefined && n.args.length > builtin.maxArgs))) report(n, `Invalid argument count for ${n.target.name}.${n.member}`, 'ARG_COUNT');
          if (n.target.name === 'automation' && !canUseCapability(options.layer || 'script','strategy-events')) report(n, `CoreSpirit layer '${options.layer || 'script'}' cannot emit automation events`, 'CAPABILITY_AUTOMATION');
          if (n.target.name === 'risk' && !canUseCapability(options.layer || 'script','risk-queries')) report(n, `CoreSpirit layer '${options.layer || 'script'}' cannot query risk`, 'CAPABILITY_RISK_QUERIES');
          if (n.target.name === 'background' && !canUseCapability(options.layer || 'script','visuals')) report(n, `CoreSpirit layer '${options.layer || 'script'}' cannot render background`, 'CAPABILITY_VISUALS');
          if (builtin) return builtin.returnType as CoreSpiritType;
        }
        let contract;
        if(n.target.type==='identifier') contract=getCoreSpiritMemberContract(n.target.name==='panel' ? 'panel' : n.target.name,n.member);
        else if(n.target.type==='member') contract=getCoreSpiritMemberContract(n.target.member==='panel' ? 'ui' : 'panel',n.member);
        if(contract) {
          n.args.forEach((x,index)=>{ if(contract?.actionArgIndices?.includes(index) && x.type==='identifier' && !scope.has(x.name)) return; infer(x,scope); });
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
  const semanticConversionFunctions: Readonly<Record<string, CoreSpiritSemanticType['atom']>> = Object.freeze({toNumber:'number',toPrice:'price',toVolume:'volume',toTime:'time',toDuration:'duration',toCurrency:'currency'});
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
        if(n.name==='bar') return semanticScalar('number');
        if(n.name==='na') return undefined;
        if(modelDeclarationMap.has(n.name)) return semanticScalar('number',{valueKind:'model'});
        return scope.get(n.name) || semanticSymbols.get(n.name);
      }
      case 'member': {
        if(n.target.type==='identifier' && n.target.name==='bar' && ['confirmed','developing','realtime','historical','forecast'].includes(n.member)) return semanticScalar('boolean');
        if(n.target.type==='call' && (n.target.name==='market'||n.target.name==='timeframe'||n.target.name==='series')) {
          const symbol = n.target.name==='market' && n.target.args[0]?.type==='string' ? String(n.target.args[0].value) : 'current';
          const tf = (n.target.name==='timeframe'||n.target.name==='series') ? (n.target.args[0]?.type==='string' ? String(n.target.args[0].value) : 'requested') : 'chart';
          if(n.target.name==='market' && n.member==='orderbook') return semanticScalar('orderbook',{valueKind:'observed',symbol,timeframe:tf,phase:'developing',causal:true,lookahead:false,lookback:0});
          if(n.target.name==='market' && n.member==='footprint') return semanticScalar('footprint',{valueKind:'observed',symbol,timeframe:tf,phase:'developing',causal:true,lookahead:false,lookback:0});
          if(n.target.name==='market' && n.member==='volumeProfile') return semanticScalar('number',{valueKind:'observed',symbol,timeframe:tf,unit:'volume-profile',phase:'developing',causal:true,lookahead:false,lookback:0});
          if(n.target.name==='market' && n.member==='trade') return semanticScalar('tick',{valueKind:'observed',symbol,timeframe:tf,phase:'developing',causal:true,lookahead:false,lookback:0});
          return semanticSeriesField(n.member, symbol, tf);
        }
        const target=inferSemantic(n.target,scope);
        if(target?.kind==='series' && ['open','high','low','close','volume','time'].includes(n.member)) return semanticSeriesField(n.member,target.symbol ?? 'current',target.timeframe ?? 'chart');
        return undefined;
      }
      case 'index': {
        const target=inferSemantic(n.target,scope);
        if(!target) return undefined;
        const inherited=mergeSemanticMetadata([target]);
        const constantIndex=constantNumber(n.index);
        const lookback=constantIndex!==undefined && constantIndex>=0 ? Math.max(inherited.lookback,constantIndex) : inherited.lookback;
        return target.kind==='series' ? scalarize({ ...target, ...inherited, lookback }) : target;
      }
      case 'unary': {
        const operand=inferSemantic(n.operand,scope);
        if (n.operator !== '!') return operand;
        return operand?.kind === 'series'
          ? semanticSeries('boolean', mergeSemanticMetadata([operand]))
          : semanticScalar('boolean');
      }
      case 'binary': {
        const left=inferSemantic(n.left,scope), right=inferSemantic(n.right,scope);
        if(n.operator==='and'||n.operator==='or') return left?.kind==='series' || right?.kind==='series' ? semanticSeries('boolean', mergeSemanticMetadata([left,right])) : semanticScalar('boolean');
        if(comparisonOps.has(n.operator)) {
          if(left && right) {
            const comparison=compareSemanticTypes(n.operator as '=='|'!='|'<'|'<='|'>'|'>=',left,right);
            if(!comparison.compatible) report(n,comparison.error ?? `semantic domains '${left.atom}' and '${right.atom}' cannot be compared`,'TYPE_SEMANTIC_COMPARISON');
          }
          return left?.kind==='series' || right?.kind==='series' ? semanticSeries('boolean', mergeSemanticMetadata([left,right])) : semanticScalar('boolean');
        }
        if(!left||!right) return undefined;
        const combined=combineSemanticArithmetic(n.operator as '+'|'-'|'*'|'/'|'%',left,right);
        if(combined.error) report(n,combined.error,'TYPE_SEMANTIC_ARITHMETIC');
        return combined.type;
      }
      case 'call': {
        const args=n.args.map(x=>inferSemantic(x,scope));
        if(n.name === '__input') {
          const key = n.args[0]?.type === 'string' ? String(n.args[0].value) : '';
          const definition = findSurfaceInput(key);
          const type = inputLanguageType(definition?.type);
          if(type === 'series<number>') return semanticSeries('number');
          if(type === 'number') return semanticScalar('number');
          if(type === 'boolean') return semanticScalar('boolean');
          if(type === 'string') return semanticScalar('string');
          return n.args[1] ? inferSemantic(n.args[1], scope) : undefined;
        }
        if(n.name==='market') {
          return semanticSeries('number',{symbol:n.args[0]?.type==='string' ? String(n.args[0].value) : 'current', timeframe:'chart'});
        }
        if(n.name==='timeframe') {
          return semanticSeries('number',{symbol:'current', timeframe:n.args[0]?.type==='string' ? String(n.args[0].value) : 'requested'});
        }
        if(n.name==='series') {
          return semanticSeries('number',{symbol:'current', timeframe:n.args[0]?.type==='string' ? String(n.args[0].value) : 'requested'});
        }
        if(n.name==='model') return semanticScalar('model',{valueKind:'model',phase:'developing',causal:true,lookahead:false,lookback:0});
        if(n.name==='vector') return semanticScalar('number',{container:'vector'});
        if(['matrix','zeros','identity','matrixAdd','matrixScale','matmul','transpose'].includes(n.name)) return semanticScalar('number',{container:'matrix'});
        if(n.name==='tensor') return semanticScalar('number',{container:'tensor'});
        if(n.name==='dataset') return semanticScalar('number',{container:'dataset',valueKind:'dataset'});
        if(n.name==='dot') return semanticScalar('number');
        if(n.name==='hmmFit') return semanticScalar('number',{valueKind:'observed'});
        if(n.name==='hmmDecode') return semanticScalar('number',{valueKind:'prediction'});
        if(n.name==='hmmProbability') return semanticScalar('number',{unit:'probability',scale:'percent',valueKind:'probability'});
        if(n.name==='hmmPosterior') return semanticScalar('number',{container:'distribution',valueKind:'distribution'});
        if(n.name==='market') return semanticScalar('market',{valueKind:'observed',phase:'developing',causal:true,lookahead:false,lookback:0,symbol:n.args[0]?.type==='string'?String(n.args[0].value):'current',timeframe:'chart'});
        if(n.name==='timeframe' || n.name==='series') return semanticScalar('market',{valueKind:'observed',phase:'developing',causal:true,lookahead:false,lookback:0,symbol:'current',timeframe:n.args[0]?.type==='string'?String(n.args[0].value):'requested'});
        if(n.name==='bar_index') return semanticScalar('number',{phase:'developing',causal:true,lookahead:false,lookback:0});
        if(n.name==='signal') return semanticScalar('signalIntent',{valueKind:'signalIntent',phase:'developing',causal:true,lookahead:false,lookback:0});
        const component=resolveCoreSpiritComponent(componentSource,n.name);
        if(component){
          const result=componentResultLanguageType(component);
          if(result.startsWith('series<')) return semanticSeries(result.slice(7,-1) as CoreSpiritSemanticType['atom']);
          return result==='boolean' ? semanticScalar('boolean') : semanticScalar('number');
        }
        if(semanticBooleanFunctions.has(n.name)) return args.some(type => type?.kind === 'series') ? semanticSeries('boolean', mergeSemanticMetadata(args)) : semanticScalar('boolean');
        if(Object.prototype.hasOwnProperty.call(semanticConversionFunctions,n.name)) {
          const source=args[0];
          const atom=semanticConversionFunctions[n.name]!;
          const metadata=source ? {symbol: source.symbol, timeframe: source.timeframe, currency: atom === 'currency' ? source.currency : undefined, unit: atom === 'price' ? 'price' : atom === 'volume' ? 'volume' : atom === 'time' ? 'timestamp' : atom === 'duration' ? 'duration' : atom === 'currency' ? 'notional' : undefined, scale: source.scale} : {};
          return source?.kind === 'series' ? semanticSeries(atom, metadata) : semanticScalar(atom, metadata);
        }
        if(n.name==='time') return semanticSeries('time',{unit:'timestamp'});
        if(semanticBuiltinSeries.has(n.name)) {
          const source=args[0];
          if(n.name==='rsi' || n.name==='mfi' || n.name==='cci' || n.name==='roc' || n.name==='stoch') return semanticSeries('number',{unit:'percent',...mergeSemanticMetadata(args)});
          if(n.name==='atr' || n.name==='trueRange' || n.name==='tr') return semanticSeries('price',{unit:'price',...mergeSemanticMetadata(args)});
          if(n.name==='vwap') return semanticSeries('price',{unit:'price',...mergeSemanticMetadata(args)});
          if(source) return source.kind==='series' ? { ...source, ...mergeSemanticMetadata(args) } : semanticSeries('number',{...mergeSemanticMetadata(args)});
          return semanticSeries('number');
        }
        if(semanticNumericFunctions.has(n.name)) return args[0];
        return undefined;
      }
      case 'memberCall': {
        const targetType = inferSemantic(n.target, scope);
        if (targetType && (targetType as any).valueKind === 'model') {
          if (n.member === 'predict' || n.member === 'prediction') return semanticScalar('number',{valueKind:'prediction'});
          if (n.member === 'probability' || n.member === 'confidence') return semanticScalar('number',{unit:'probability',scale:'percent',valueKind:'probability'});
        }
        if (n.target.type === 'identifier' && isCoreSpiritLibraryNamespace(n.target.name)) {
          const resolved=resolveCoreSpiritLibraryCall(n.target.name,n.member,componentSource);
          if (resolved?.builtin) {
            const argTypes=n.args.map(x=>inferSemantic(x,scope));
            if (resolved.builtin.returnType === 'prediction<number>') return semanticScalar('number',{valueKind:'prediction',phase:'developing',causal:true,lookahead:false,lookback:0});
            if (resolved.builtin.returnType === 'probability') return semanticScalar('number',{unit:'probability',scale:'percent',valueKind:'probability',phase:'developing',causal:true,lookahead:false,lookback:0});
            if (resolved.builtin.returnType === 'signal-intent') return semanticScalar('signalIntent',{valueKind:'signalIntent',phase:'developing',causal:true,lookahead:false,lookback:0});
            if (typeof resolved.builtin.returnType === 'string' && resolved.builtin.returnType.startsWith('series<')) {
              const source=argTypes[0];
              return source?.kind==='series' ? source : semanticSeries('number');
            }
            if (resolved.builtin.returnType === 'boolean') return semanticScalar('boolean');
            if (resolved.builtin.returnType === 'number') {
              const source=argTypes[0];
              return source?.kind==='series' ? source : semanticScalar('number');
            }
            void argTypes;
          }
        }
        if (n.member === 'timeframe') {
          const target = inferSemantic(n.target, scope);
          if (target?.kind === 'series' || (target as any)?.atom === 'market:ref') {
            const timeframe = n.args[0]?.type === 'string' ? String(n.args[0].value) : 'requested';
            const symbol = target?.symbol ?? (n.target.type === 'call' && n.target.name === 'market'
              ? (n.target.args[0]?.type === 'string' ? String(n.target.args[0].value) : 'current')
              : 'current');
            return semanticSeries('number', { symbol, timeframe });
          }
        }
        return undefined;
      }
      default: return undefined;
    }
  };

  const visit=(n:CoreSpiritAstNode, scope=new Map(symbols))=>{
    switch(n.type){
      case 'program':
        n.body.forEach(x=>visit(x,scope));
        break;
      case 'while': {
        const condition=infer(n.condition,scope); visit(n.condition,scope);
        if(!isBooleanType(condition)) report(n.condition,'while condition must be boolean','TYPE_WHILE_CONDITION');
        loopDepth += 1; n.body.forEach(item=>visit(item,new Map(scope))); loopDepth -= 1;
        break;
      }
      case 'forEach': {
        const iterableType=infer(n.iterable,scope); visit(n.iterable,scope);
        let itemType:CoreSpiritType='unknown';
        if(iterableType.startsWith('array<')) itemType=iterableType.slice(6,-1) as CoreSpiritType;
        else if(iterableType.startsWith('map<')) itemType='string';
        else if(iterableType==='string') itemType='string';
        else if(iterableType.startsWith('vector<')) itemType='number';
        else report(n.iterable,'for-in expects an array, map, string or vector','TYPE_FOR_ITERABLE');
        const loopScope=new Map(scope); loopScope.set(n.name,itemType);
        const previousSymbol=symbols.get(n.name);
        symbols.set(n.name,itemType);
        loopDepth += 1; n.body.forEach(item=>visit(item,loopScope)); loopDepth -= 1;
        if(previousSymbol===undefined) symbols.delete(n.name); else symbols.set(n.name,previousSymbol);
        break;
      }
      case 'break': case 'continue':
        if(loopDepth===0) report(n,`${n.type} is only valid inside a loop`,'TYPE_LOOP_CONTROL');
        break;
      case 'arrayLiteral': n.elements.forEach(item=>visit(item,scope)); break;
      case 'mapLiteral': n.entries.forEach(entry=>visit(entry.value,scope)); break;
      case 'typeDeclaration': {
        if(udts.has(n.name)) report(n,`Type '${n.name}' is already declared`,'DUPLICATE_TYPE');
        const fields=n.fields.map(f=>({name:f.name,type:mapDeclaredType(f.typeName)}));
        udts.set(n.name,{name:n.name,fields});
        break;
      }
      case 'let': {
        if(symbols.has(n.name)) report(n,`Variable '${n.name}' is already declared`,'DUPLICATE_VARIABLE');
        const inferredType=infer(n.expression,scope);
        const type=n.declaredType ? mapDeclaredType(n.declaredType) : inferredType;
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
      case 'assignment': {
        const current=scope.get(n.name);
        if(!current) { report(n,`Unknown state variable '${n.name}'`,'UNKNOWN_STATE'); break; }
        if(!isStateType(current)) { report(n,`':=' can only update state<T>; '${n.name}' is '${current}'`,'STATE_ASSIGNMENT_TARGET'); break; }
        const value=infer(n.expression,scope);
        visit(n.expression,scope);
        const expected=elementType(current);
        const assignmentElement=value.startsWith('series<') ? value.slice(7,-1) as CoreSpiritType : value;
        const eventSampleAllowed=eventScopeDepth>0 && value.startsWith('series<');
        if(value!=='unknown' && value!=='null' && !(eventSampleAllowed ? compatible(expected,assignmentElement) : compatible(expected,value))) report(n,`State '${n.name}' expects '${expected}' but received '${value}'`,'STATE_ASSIGNMENT_TYPE');
        break;
      }
      case 'onEvent':
        eventScopeDepth+=1;
        n.body.forEach(x=>visit(x,new Map(scope)));
        eventScopeDepth-=1;
        break;
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

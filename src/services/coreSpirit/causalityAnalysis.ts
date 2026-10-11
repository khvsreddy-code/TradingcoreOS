import type { CoreSpiritAst, CoreSpiritAstNode, CoreSpiritAnnotation } from './ast';

export type CoreSpiritCausalityPhase = 'historical' | 'confirmed' | 'developing' | 'realtime' | 'forecast' | 'unknown';
export type CoreSpiritCausalityDiagnostic = Readonly<{
  severity:'warning'|'error';
  message:string;
  line?:number;
  column?:number;
  start?:number;
  end?:number;
  code:string;
}>;
export type CoreSpiritCausalityDependency = Readonly<{
  kind:'timeframe'|'future-index'|'future-call';
  phase:CoreSpiritCausalityPhase;
  label:string;
  line?:number;
  column?:number;
  start?:number;
  end?:number;
}>;
export type CoreSpiritCausalityReport = Readonly<{
  version:1;
  strictCausality:boolean;
  dependencies:readonly CoreSpiritCausalityDependency[];
  diagnostics:readonly CoreSpiritCausalityDiagnostic[];
}>;

const PHASE_ANNOTATIONS = new Set<CoreSpiritCausalityPhase>(['historical','confirmed','developing','realtime','forecast']);
function annotations(node:CoreSpiritAstNode):readonly CoreSpiritAnnotation[] {
  return 'annotations' in node && Array.isArray(node.annotations) ? node.annotations as readonly CoreSpiritAnnotation[] : [];
}
function children(node:CoreSpiritAstNode):CoreSpiritAstNode[] {
  switch(node.type){
    case 'program': return node.body;
    case 'let': case 'assignment': return [node.expression];
    case 'onEvent': return node.body;
    case 'expressionStatement': return [node.expression];
    case 'if': return [node.condition,...node.thenBranch,...(node.elseBranch??[])];
    case 'unary': return [node.operand];
    case 'binary': return [node.left,node.right];
    case 'call': return node.args;
    case 'memberCall': return [node.target,...node.args];
    case 'index': return [node.target,node.index];
    case 'member': return [node.target];
    default: return [];
  }
}
function sourceFields(node:CoreSpiritAstNode) {
  return { ...(node.span ? {line:node.span.line,column:node.span.column,start:node.span.start,end:node.span.end} : {}) };
}
function negativeIndex(node:CoreSpiritAstNode):boolean {
  return node.type==='unary'&&node.operator==='-'&&node.operand.type==='number'&&Number(node.operand.value)>0;
}
function phaseFrom(annotationsList:readonly CoreSpiritAnnotation[]):CoreSpiritCausalityPhase {
  for(let i=annotationsList.length-1;i>=0;i-=1){
    const name=annotationsList[i]!.name.toLowerCase() as CoreSpiritCausalityPhase;
    if(PHASE_ANNOTATIONS.has(name))return name;
  }
  return 'unknown';
}

/**
 * Performs conservative temporal analysis without executing the source. The
 * selected timeframe alone cannot prove that a value is confirmed at a given
 * chart timestamp, so unqualified cross-timeframe values are never silently
 * treated as causal. @strictCausality promotes those warnings to errors.
 */
export function analyzeCoreSpiritCausality(ast:CoreSpiritAst):CoreSpiritCausalityReport {
  const diagnostics:CoreSpiritCausalityDiagnostic[]=[];
  const dependencies:CoreSpiritCausalityDependency[]=[];
  let strictCausality=false;
  const allNodes:CoreSpiritAstNode[]=[];
  const gather=(node:CoreSpiritAstNode):void=>{
    allNodes.push(node);
    if(annotations(node).some(a=>a.name.toLowerCase()==='strictcausality'))strictCausality=true;
    for(const child of children(node))gather(child);
  };
  gather(ast);

  const visited=new Set<string>();
  const add=(node:CoreSpiritAstNode,kind:CoreSpiritCausalityDependency['kind'],phase:CoreSpiritCausalityPhase,label:string,message:string,code:string,severity:'warning'|'error')=>{
    const dedupeKey=`${code}:${node.span?.start??label}`;
    if(visited.has(dedupeKey))return;
    visited.add(dedupeKey);
    dependencies.push(Object.freeze({kind,phase,label,...sourceFields(node)}));
    diagnostics.push(Object.freeze({
      severity:strictCausality&&severity==='warning'?'error':severity,
      message:strictCausality&&severity==='warning' ? `@strictCausality: ${message}` : message,
      code,...sourceFields(node),
    }));
  };

  const visit=(node:CoreSpiritAstNode,inherited:readonly CoreSpiritAnnotation[]=[]):void=>{
    const effective=[...inherited,...annotations(node)];
    const phase=phaseFrom(effective);
    if(node.type==='call'&&node.name==='timeframe'){
      const label=node.args[0]?.type==='string'?String(node.args[0].value):'dynamic timeframe';
      if(phase==='developing'||phase==='realtime'){
        add(node,'timeframe',phase,label,`Secondary-timeframe data '${label}' is explicitly marked ${phase}; its value may change before the higher-timeframe bar closes.`,'CAUSALITY_DEVELOPING_HTF','warning');
      }else if(phase==='unknown'){
        add(node,'timeframe','unknown',label,`Secondary-timeframe data '${label}' is not explicitly qualified as confirmed or historical. It may include a developing bar and cause backtest/live divergence; the compiler cannot infer runtime alignment from the timeframe string alone.`,'CAUSALITY_UNQUALIFIED_MTF','warning');
      }
    }else if(node.type==='memberCall'&&node.member==='timeframe'){
      const label=node.args[0]?.type==='string'?String(node.args[0].value):'dynamic timeframe';
      if(phase==='developing'||phase==='realtime'){
        add(node,'timeframe',phase,label,`Secondary-timeframe data '${label}' is explicitly marked ${phase}; its value may change before the higher-timeframe bar closes.`,'CAUSALITY_DEVELOPING_HTF','warning');
      }else if(phase==='unknown'){
        add(node,'timeframe','unknown',label,`Secondary-timeframe data '${label}' is not explicitly qualified as confirmed or historical. It may include a developing bar and cause backtest/live divergence; the compiler cannot infer runtime alignment from the timeframe string alone.`,'CAUSALITY_UNQUALIFIED_MTF','warning');
      }
    }
    if(node.type==='index'&&negativeIndex(node.index)){
      add(node,'future-index','unknown','negative series offset',`Future-bar indexing is non-causal. Replace the negative index with a current or historical offset; CoreSpirit will not treat future data as valid history.`,'CAUSALITY_FUTURE_INDEX','error');
    }
    if(node.type==='call'&&/(?:future|forward|lookahead|offset_future)/i.test(node.name)){
      add(node,'future-call','forecast',node.name,`Call '${node.name}' appears to request future-dependent data; verify that it is a forecast output rather than an observed market input.`,'CAUSALITY_FUTURE_CALL',strictCausality?'error':'warning');
    }
    for(const child of children(node))visit(child,effective);
  };
  visit(ast);
  return Object.freeze({
    version:1,
    strictCausality,
    dependencies:Object.freeze(dependencies),
    diagnostics:Object.freeze(diagnostics),
  });
}

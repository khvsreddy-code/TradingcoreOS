import type { CoreSpiritAst, CoreSpiritAstNode, CoreSpiritAnnotation } from './ast';
import type { CoreSpiritBuiltin } from './standardLibrary';
import { getCoreSpiritBuiltin } from './standardLibrary';

export type CoreSpiritCausality =
  | 'causal'
  | 'noncausal'
  | 'future-dependent'
  | 'repainting'
  | 'unknown';

export type CoreSpiritLookahead = 'false' | 'true' | 'unknown';

export type CoreSpiritRepaintAnnotationName =
  | 'causal'
  | 'noncausal'
  | 'futureDependent'
  | 'repainting'
  | 'realtimeSafe'
  | 'lookahead';

export type CoreSpiritRepaintEvidence = Readonly<{
  sourceStart?: number;
  sourceEnd?: number;
  line?: number;
  column?: number;
  node: string;
  reason: string;
}>;

export type CoreSpiritRepaintSafetyNode = Readonly<{
  id: string;
  name: string;
  causality: CoreSpiritCausality;
  lookahead: CoreSpiritLookahead;
  realtimeSafe: boolean | 'unknown';
  evidence: readonly CoreSpiritRepaintEvidence[];
  annotations: readonly CoreSpiritAnnotation[];
}>;

export type CoreSpiritRepaintSafetyReport = Readonly<{
  version: 1;
  causality: CoreSpiritCausality;
  lookahead: CoreSpiritLookahead;
  realtimeSafe: boolean | 'unknown';
  backtestLiveEquivalent: boolean | 'unknown';
  nodes: readonly CoreSpiritRepaintSafetyNode[];
  warnings: readonly string[];
  errors: readonly string[];
}>;

type Safety = {
  causality: CoreSpiritCausality;
  lookahead: CoreSpiritLookahead;
  realtimeSafe: boolean | 'unknown';
  evidence: CoreSpiritRepaintEvidence[];
};

function nodeAnnotations(node: CoreSpiritAstNode): readonly CoreSpiritAnnotation[] {
  return 'annotations' in node && Array.isArray(node.annotations) ? node.annotations as readonly CoreSpiritAnnotation[] : [];
}

const annotationNames = new Set<CoreSpiritRepaintAnnotationName>([
  'causal','noncausal','futureDependent','repainting','realtimeSafe','lookahead',
]);

function spanEvidence(node: CoreSpiritAstNode, reason: string): CoreSpiritRepaintEvidence {
  return {
    sourceStart: node.span?.start,
    sourceEnd: node.span?.end,
    line: node.span?.line,
    column: node.span?.column,
    node: node.type,
    reason,
  };
}

function combineCausality(a: CoreSpiritCausality, b: CoreSpiritCausality): CoreSpiritCausality {
  if (a === 'future-dependent' || b === 'future-dependent') return 'future-dependent';
  if (a === 'repainting' || b === 'repainting') return 'repainting';
  if (a === 'noncausal' || b === 'noncausal') return 'noncausal';
  if (a === 'unknown' || b === 'unknown') return 'unknown';
  return 'causal';
}

function combineLookahead(a: CoreSpiritLookahead, b: CoreSpiritLookahead): CoreSpiritLookahead {
  if (a === 'true' || b === 'true') return 'true';
  if (a === 'unknown' || b === 'unknown') return 'unknown';
  return 'false';
}

function combineRealtimeSafe(a: boolean | 'unknown', b: boolean | 'unknown'): boolean | 'unknown' {
  if (a === false || b === false) return false;
  if (a === 'unknown' || b === 'unknown') return 'unknown';
  return true;
}

function annotatedSafety(annotations: readonly CoreSpiritAnnotation[]): Safety {
  let causality: CoreSpiritCausality = 'causal';
  let lookahead: CoreSpiritLookahead = 'false';
  let realtimeSafe: boolean | 'unknown' = true;
  const evidence: CoreSpiritRepaintEvidence[] = [];

  for (const annotation of annotations) {
    if (!annotationNames.has(annotation.name as CoreSpiritRepaintAnnotationName)) {
      continue;
    }
    if (annotation.name === 'causal') {
      causality = combineCausality(causality, 'causal');
      evidence.push({ sourceStart:annotation.span?.start, sourceEnd:annotation.span?.end, node:'annotation', reason:'@causal assertion' });
    } else if (annotation.name === 'noncausal') {
      causality = 'noncausal';
      evidence.push({ sourceStart:annotation.span?.start, sourceEnd:annotation.span?.end, node:'annotation', reason:'@noncausal declaration' });
    } else if (annotation.name === 'futureDependent') {
      causality = 'future-dependent';
      evidence.push({ sourceStart:annotation.span?.start, sourceEnd:annotation.span?.end, node:'annotation', reason:'@futureDependent declaration' });
    } else if (annotation.name === 'repainting') {
      causality = 'repainting';
      evidence.push({ sourceStart:annotation.span?.start, sourceEnd:annotation.span?.end, node:'annotation', reason:'@repainting declaration' });
    } else if (annotation.name === 'realtimeSafe') {
      realtimeSafe = true;
      evidence.push({ sourceStart:annotation.span?.start, sourceEnd:annotation.span?.end, node:'annotation', reason:'@realtimeSafe assertion' });
    } else if (annotation.name === 'lookahead') {
      const arg = annotation.args[0]?.toLowerCase();
      if (arg === 'false') lookahead = 'false';
      else if (arg === 'true') lookahead = 'true';
      else lookahead = 'unknown';
      evidence.push({ sourceStart:annotation.span?.start, sourceEnd:annotation.span?.end, node:'annotation', reason:`@lookahead(${arg ?? 'unknown'}) assertion` });
    }
  }

  return { causality, lookahead, realtimeSafe, evidence };
}

function builtinSafety(builtin: CoreSpiritBuiltin): Safety {
  if (builtin.temporalSafety) {
    return {
      causality: builtin.temporalSafety.causality,
      lookahead: builtin.temporalSafety.lookahead ? 'true' : 'false',
      realtimeSafe: builtin.temporalSafety.realtimeSafe,
      evidence: [],
    };
  }
  if (builtin.category === 'series' || builtin.category === 'math' || builtin.category === 'condition' || builtin.category === 'state') {
    return {
      causality: 'causal',
      lookahead: 'false',
      realtimeSafe:true,
      evidence: [],
    };
  }
  if (builtin.category === 'market') {
    return {
      causality: 'unknown',
      lookahead: 'unknown',
      realtimeSafe: 'unknown',
      evidence: [],
    };
  }
  if (builtin.category === 'output' || builtin.category === 'extension') {
    return {
      causality: builtin.pure ? 'causal' : 'unknown',
      lookahead: 'false',
      realtimeSafe: builtin.pure ? true : 'unknown',
      evidence: [],
    };
  }
  return { causality:'unknown', lookahead:'unknown', realtimeSafe:'unknown', evidence:[] };
}

function merge(a: Safety, b: Safety, node: CoreSpiritAstNode, reason: string): Safety {
  return {
    causality: combineCausality(a.causality,b.causality),
    lookahead: combineLookahead(a.lookahead,b.lookahead),
    realtimeSafe: combineRealtimeSafe(a.realtimeSafe,b.realtimeSafe),
    evidence: [...a.evidence,...b.evidence,spanEvidence(node,reason)],
  };
}

function inferNode(node: CoreSpiritAstNode, inheritedAnnotations: readonly CoreSpiritAnnotation[] = []): Safety {
  const annotations = [...inheritedAnnotations,...nodeAnnotations(node)];
  const declared = annotatedSafety(annotations);
  let inferred: Safety = { causality:'causal', lookahead:'false', realtimeSafe:true, evidence:[] };

  switch (node.type) {
    case 'number':
    case 'string':
    case 'boolean':
    case 'null':
      break;

    case 'identifier': {
      inferred = {
        causality:'causal',
        lookahead:'false',
        realtimeSafe:true,
        evidence:[spanEvidence(node, ['open','high','low','volume','time','close','bar_index','na','bar'].includes(node.name)
          ? `built-in temporal source '${node.name}'`
          : `local symbol '${node.name}'; producer is analyzed separately`)],
      };
      break;
    }

    case 'member':
      inferred = merge(inferNode(node.target,annotations), {causality:'causal',lookahead:'false',realtimeSafe:true,evidence:[]}, node, `member access '${node.member}'`);
      break;

    case 'index': {
      const base = inferNode(node.target,annotations);
      const index = inferNode(node.index,annotations);
      inferred = merge(base,index,node,'historical indexing remains causal when negative/future indexing is rejected');
      break;
    }

    case 'unary':
      inferred = inferNode(node.operand,annotations);
      break;

    case 'binary':
      inferred = merge(inferNode(node.left,annotations),inferNode(node.right,annotations),node,`binary '${node.operator}'`);
      break;

    case 'call': {
      const child = node.args.map(arg => inferNode(arg,annotations)).reduce<Safety>((acc,next)=>merge(acc,next,node,'argument dependency'),{causality:'causal',lookahead:'false',realtimeSafe:true,evidence:[]});
      const builtin = getCoreSpiritBuiltin(node.name);
      if (builtin) {
        inferred = merge(child,builtinSafety(builtin),node,`builtin '${node.name}'`);
      } else if (['market','timeframe','__market_timeframe'].includes(node.name)) {
        inferred = merge(child,{causality:'causal',lookahead:'false',realtimeSafe:true,evidence:[]},node,`market context '${node.name}'`);
      } else if (['signal','emit','plot','show','marker','label','labelAt','line','zone','box','band','fill','barcolor','order','entry','exit','buy','sell'].includes(node.name)) {
        inferred = merge(child,{causality:'causal',lookahead:'false',realtimeSafe:true,evidence:[spanEvidence(node,`transactional output '${node.name}'`)]},node,'transactional effect');
      } else if (node.name === '__bar_phase' || node.name === 'event') {
        inferred = merge(child,{causality:'causal',lookahead:'false',realtimeSafe:true,evidence:[]},node,`temporal runtime '${node.name}'`);
      } else if (/future|forward|lookahead|offset_future/i.test(node.name)) {
        inferred = merge(child,{causality:'future-dependent',lookahead:'true',realtimeSafe:false,evidence:[spanEvidence(node,`future-oriented call '${node.name}'`)]},node,'future dependency');
      } else {
        inferred = merge(child,{causality:'unknown',lookahead:'unknown',realtimeSafe:'unknown',evidence:[spanEvidence(node,`unknown callable temporal provenance '${node.name}'`)]},node,'unknown callable');
      }
      break;
    }

    case 'memberCall': {
      inferred = node.member === 'timeframe'
        ? merge(inferNode(node.target,annotations),{causality:'causal',lookahead:'false',realtimeSafe:true,evidence:[]},node,'timeframe selection')
        : merge(inferNode(node.target,annotations),node.args.map(arg=>inferNode(arg,annotations)).reduce<Safety>((acc,next)=>merge(acc,next,node,'member argument dependency'),{causality:'causal',lookahead:'false',realtimeSafe:true,evidence:[]}),node,`member call '${node.member}'`);
      break;
    }

    case 'let':
      inferred = inferNode(node.expression,annotations);
      break;

    case 'assignment':
      inferred = inferNode(node.expression,annotations);
      break;

    case 'onEvent':
      inferred = node.body.map(child=>inferNode(child,[...annotations])).reduce<Safety>((acc,next)=>merge(acc,next,node,`event '${node.eventName}' body`),{causality:'causal',lookahead:'false',realtimeSafe:true,evidence:[]});
      break;

    case 'expressionStatement':
      inferred = inferNode(node.expression,annotations);
      break;

    case 'if':
      inferred = merge(inferNode(node.condition,annotations),node.thenBranch.map(child=>inferNode(child,[...annotations])).reduce<Safety>((acc,next)=>merge(acc,next,node,'then branch'),{causality:'causal',lookahead:'false',realtimeSafe:true,evidence:[]}),node,'conditional branch');
      if (node.elseBranch?.length) inferred = merge(inferred,node.elseBranch.map(child=>inferNode(child,[...annotations])).reduce<Safety>((acc,next)=>merge(acc,next,node,'else branch'),{causality:'causal',lookahead:'false',realtimeSafe:true,evidence:[]}),node,'else branch');
      break;

    case 'typeDeclaration':
      break;

    case 'program':
      inferred = node.body.map(child=>inferNode(child,annotations)).reduce<Safety>((acc,next)=>merge(acc,next,node,'program dependency'),{causality:'causal',lookahead:'false',realtimeSafe:true,evidence:[]});
      break;
  }

  const asserted = annotatedSafetynodeAnnotations(node);
  return {
    causality: asserted.causality === 'causal' ? inferred.causality : asserted.causality,
    lookahead: asserted.lookahead === 'false' ? inferred.lookahead : asserted.lookahead,
    realtimeSafe: asserted.realtimeSafe === true ? inferred.realtimeSafe : asserted.realtimeSafe,
    evidence: [...inferred.evidence,...declared.evidence],
  };
}

function hasAnnotation(annotations: readonly CoreSpiritAnnotation[], name: string): CoreSpiritAnnotation | undefined {
  return annotations.find(annotation => annotation.name === name);
}

function validateAssertions(
  node: CoreSpiritAstNode,
  inferred: Safety,
): { warnings:string[]; errors:string[] } {
  const annotations=node.annotations ?? [];
  const warnings:string[]=[];
  const errors:string[]=[];
  const at = node.span ? ` at ${node.span.line}:${node.span.column}` : '';
  if (hasAnnotation(annotations,'causal') && inferred.causality !== 'causal') {
    errors.push(`@causal assertion failed${at}: inferred '${inferred.causality}'.`);
  }
  if (hasAnnotation(annotations,'realtimeSafe') && inferred.realtimeSafe !== true) {
    errors.push(`@realtimeSafe assertion failed${at}: realtime safety is ${String(inferred.realtimeSafe)}.`);
  }
  const lookahead = hasAnnotation(annotations,'lookahead');
  if (lookahead) {
    const expected = lookahead.args[0]?.toLowerCase();
    if (expected === 'false' && inferred.lookahead !== 'false') {
      errors.push(`@lookahead(false) assertion failed${at}: inferred lookahead is '${inferred.lookahead}'.`);
    }
  }
  if (inferred.causality === 'future-dependent') warnings.push(`⚠ Future-dependent data detected${at}; strategy result is not causal.`);
  if (inferred.causality === 'noncausal') warnings.push(`⚠ Non-causal computation detected${at}; backtest/live equivalence is not guaranteed.`);
  if (inferred.causality === 'repainting') warnings.push(`⚠ Repainting dependency detected${at}; signal stability is not guaranteed.`);
  if (inferred.realtimeSafe !== true) warnings.push(`⚠ Realtime safety is not proven${at}; live execution can differ from historical evaluation.`);
  return { warnings, errors };
}

export function analyzeCoreSpiritRepaintSafety(ast: CoreSpiritAst): CoreSpiritRepaintSafetyReport {
  const nodeReports:CoreSpiritRepaintSafetyNode[]=[];
  const warnings:string[]=[];
  const errors:string[]=[];

  const visit=(node:CoreSpiritAstNode, parentAnnotations:readonly CoreSpiritAnnotation[]=[]): Safety => {
    const effectiveAnnotations=[...parentAnnotations,...nodeAnnotations(node)];
    const safety=inferNode(node,parentAnnotations);
    const assertionMessages=validateAssertions(node,safety);
    warnings.push(...assertionMessages.warnings);
    errors.push(...assertionMessages.errors);
    nodeReports.push(Object.freeze({
      id:`repaint:${node.type}:${node.span?.start ?? nodeReports.length}`,
      name:node.type === 'call' ? node.name : node.type === 'member' ? node.member : node.type === 'onEvent' ? `on ${node.eventName}` : node.type,
      causality:safety.causality,
      lookahead:safety.lookahead,
      realtimeSafe:safety.realtimeSafe,
      evidence:Object.freeze(safety.evidence),
      annotations:Object.freeze(effectiveAnnotations),
    }));
    switch(node.type){
      case 'program': node.body.forEach(child=>visit(child,effectiveAnnotations)); break;
      case 'let': visit(node.expression,effectiveAnnotations); break;
      case 'assignment': visit(node.expression,effectiveAnnotations); break;
      case 'onEvent': node.body.forEach(child=>visit(child,effectiveAnnotations)); break;
      case 'expressionStatement': visit(node.expression,effectiveAnnotations); break;
      case 'if': visit(node.condition,effectiveAnnotations); node.thenBranch.forEach(child=>visit(child,effectiveAnnotations)); node.elseBranch?.forEach(child=>visit(child,effectiveAnnotations)); break;
      case 'unary': visit(node.operand,effectiveAnnotations); break;
      case 'binary': visit(node.left,effectiveAnnotations); visit(node.right,effectiveAnnotations); break;
      case 'call': node.args.forEach(child=>visit(child,effectiveAnnotations)); break;
      case 'memberCall': visit(node.target,effectiveAnnotations); node.args.forEach(child=>visit(child,effectiveAnnotations)); break;
      case 'index': visit(node.target,effectiveAnnotations); visit(node.index,effectiveAnnotations); break;
      case 'member': visit(node.target,effectiveAnnotations); break;
      case 'typeDeclaration': break;
      default: break;
    }
    return safety;
  };

  const root=visit(ast);
  const backtestLiveEquivalent=root.causality === 'causal' && root.lookahead === 'false' && root.realtimeSafe === true;

  return Object.freeze({
    version:1,
    causality:root.causality,
    lookahead:root.lookahead,
    realtimeSafe:root.realtimeSafe,
    backtestLiveEquivalent,
    nodes:Object.freeze(nodeReports),
    warnings:Object.freeze([...new Set(warnings)]),
    errors:Object.freeze([...new Set(errors)]),
  });
}

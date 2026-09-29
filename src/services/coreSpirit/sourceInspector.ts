import { compileCoreSpirit, normalizeCoreSpirit } from './coreSpiritPipeline';
import type { CoreSpiritGraphNode } from './semanticGraph';

export type CoreSpiritEffectAnnotation=Readonly<{
  sourceNodeId:string;line:number;column:number;end:number;kind:CoreSpiritGraphNode['kind'];name?:string;
  effectful:boolean;estimatedCost:CoreSpiritGraphNode['estimatedCost'];latencyClass:CoreSpiritGraphNode['latencyClass'];
  stateful:boolean;deterministic:boolean;parallelizable:boolean;
}>;
export type CoreSpiritSourceInspection=Readonly<{
  source:string;normalizedSource:string;diagnostics:ReturnType<typeof compileCoreSpirit>['diagnostics'];
  effectAnnotations:CoreSpiritEffectAnnotation[];instructionCount:number;maxLookback:number;
}>;
export function inspectCoreSpiritSource(source:string,sourceId='inspector'):CoreSpiritSourceInspection{
  const original=String(source??''),normalizedSource=normalizeCoreSpirit(original),result=compileCoreSpirit(original,sourceId);
  const nodes=result.ir?.graphs?.semantic.nodes??[];
  const effectAnnotations=nodes.filter(n=>n.source).map(n=>({
    sourceNodeId:n.id,line:n.source!.line,column:n.source!.column,end:n.source!.end,kind:n.kind,name:n.name,
    effectful:n.effectful,estimatedCost:n.estimatedCost,latencyClass:n.latencyClass,
    stateful:n.stateful,deterministic:n.deterministic,parallelizable:n.parallelizable,
  })).sort((a,b)=>a.line-b.line||a.column-b.column||a.sourceNodeId.localeCompare(b.sourceNodeId));
  return Object.freeze({source:original,normalizedSource,diagnostics:result.diagnostics,effectAnnotations,instructionCount:result.ir?.entry.instructions.length??0,maxLookback:result.ir?.maxLookback??0});
}

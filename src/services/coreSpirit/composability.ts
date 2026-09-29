import type { CoreSpiritAst } from './ast';
import type { CoreSpiritSemanticResult } from './semanticAnalyzer';
import type { CoreSpiritSurfaceMetadata } from './languageConcepts';
import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';
import { buildCoreSpiritSemanticDependencyGraph, type CoreSpiritSemanticDependencyGraph, type CoreSpiritSemanticDependencyNode } from './semanticDependencyGraph';

export type CoreSpiritComposableKind = 'value'|'indicator'|'model'|'model-output'|'component'|'data'|'event'|'condition'|'automation'|'order-intent'|'show';
export type CoreSpiritComposableNode = { id:string; kind:CoreSpiritComposableKind; name:string; contract:'series'|'scalar'|'boolean'|'model-output'|'component'|'data'|'event'|'automation'|'order-intent'|'visual'; source?:{start:number;end:number;line:number;column:number} };
export type CoreSpiritComposableEdge = { from:string; to:string; relation:'feeds'|'triggers'|'renders'|'routes'|'contains' };
export type CoreSpiritCompositionGraph = { version:2; sourceGraphVersion:1; nodes:readonly CoreSpiritComposableNode[]; edges:readonly CoreSpiritComposableEdge[] };

function composableKind(node:CoreSpiritSemanticDependencyNode):CoreSpiritComposableKind|undefined {
  if(node.declarationKind==='indicator') return 'indicator';
  switch(node.kind){
    case 'symbol': return 'value'; case 'model': return 'model'; case 'model-output': return 'model-output'; case 'component': return 'component'; case 'data-source': return 'data';
    case 'event': return 'event'; case 'condition': return 'condition'; case 'automation': return 'automation'; case 'order-intent': return 'order-intent'; case 'visual': return 'show'; default: return undefined;
  }
}
function composableContract(node:CoreSpiritSemanticDependencyNode):CoreSpiritComposableNode['contract'] {
  if(node.kind==='component') return 'component';
  if(node.kind==='data-source') return node.type==='market:ref'||node.type==='timeframe:ref'?'data':'series';
  if(node.kind==='condition') return 'boolean'; if(node.kind==='event') return 'event'; if(node.kind==='automation') return 'automation'; if(node.kind==='order-intent') return 'order-intent'; if(node.kind==='visual') return 'visual'; if(node.kind==='model-output') return 'model-output';
  return node.type==='series<number>'||node.type==='series<float>'?'series':'scalar';
}
function projectNode(node:CoreSpiritSemanticDependencyNode):CoreSpiritComposableNode|undefined {
  const kind=composableKind(node); if(!kind) return undefined;
  return {id:node.declarationKind==='indicator'?'indicator:'+node.name:node.id,kind,name:node.name,contract:composableContract(node),...(node.source?{source:node.source}:{})};
}
function projectRelation(relation:CoreSpiritSemanticDependencyGraph['edges'][number]['relation']):CoreSpiritComposableEdge['relation'] {
  switch(relation){ case 'depends-on': return 'feeds'; case 'renders': return 'renders'; case 'triggers': case 'emits': return 'triggers'; case 'contains': return 'contains'; }
}
export function buildCoreSpiritCompositionGraph(
  ast: CoreSpiritAst,
  semantic: CoreSpiritSemanticResult,
  surface: CoreSpiritSurfaceMetadata,
  options: { components?: CoreSpiritComponentRegistryLike } = {},
): CoreSpiritCompositionGraph {
  const semanticGraph = buildCoreSpiritSemanticDependencyGraph(ast,semantic,surface,options);
  const projectedNodes = new Map<string,CoreSpiritComposableNode>();

  for(const node of semanticGraph.nodes) {
    const projected = projectNode(node);
    if(projected) projectedNodes.set(projected.id,projected);
  }

  const incoming = new Map<string,Array<{from:string;relation:CoreSpiritSemanticDependencyGraph['edges'][number]['relation']}>>();
  for(const edge of semanticGraph.edges) {
    const list=incoming.get(edge.to) ?? [];
    list.push({from:edge.from,relation:edge.relation});
    incoming.set(edge.to,list);
  }

  const projectedEdges:CoreSpiritComposableEdge[] = [];
  const addProjectedEdge=(from:string,to:string,relation:CoreSpiritComposableEdge['relation']) => {
    if(from===to||!projectedNodes.has(from)||!projectedNodes.has(to)) return;
    if(!projectedEdges.some(item=>item.from===from&&item.to===to&&item.relation===relation)) projectedEdges.push({from,to,relation});
  };

  const nearestProjectedAncestors=(sourceId:string,visited=new Set<string>()):string[] => {
    if(visited.has(sourceId)) return [];
    visited.add(sourceId);
    if(projectedNodes.has(sourceId)) return [sourceId];
    const parents=incoming.get(sourceId) ?? [];
    const result:string[]=[];
    for(const parent of parents) {
      for(const ancestor of nearestProjectedAncestors(parent.from,visited)) if(!result.includes(ancestor)) result.push(ancestor);
    }
    return result;
  };

  for(const edge of semanticGraph.edges) {
    if(projectedNodes.has(edge.from)&&projectedNodes.has(edge.to)) {
      addProjectedEdge(edge.from,edge.to,projectRelation(edge.relation));
      continue;
    }
    if(projectedNodes.has(edge.to)) {
      for(const ancestor of nearestProjectedAncestors(edge.from)) addProjectedEdge(ancestor,edge.to,projectRelation(edge.relation));
    }
  }

  return Object.freeze({version:2,sourceGraphVersion:semanticGraph.version,nodes:Object.freeze([...projectedNodes.values()]),edges:Object.freeze(projectedEdges)});
}
export function validateCoreSpiritCompositionGraph(graph:CoreSpiritCompositionGraph):string[] {
  const errors:string[]=[]; const ids=new Set<string>();
  for(const node of graph.nodes){ if(ids.has(node.id)) errors.push("duplicate composition node '"+node.id+"'"); ids.add(node.id); }
  for(const edge of graph.edges){ if(!ids.has(edge.from)) errors.push("composition edge source '"+edge.from+"' does not exist"); if(!ids.has(edge.to)) errors.push("composition edge target '"+edge.to+"' does not exist"); }
  return errors;
}


import type { CoreSpiritAst } from './ast';
import type { CoreSpiritSemanticResult } from './semanticAnalyzer';
import type { CoreSpiritSurfaceMetadata } from './languageConcepts';
import {
  buildCoreSpiritSemanticDependencyGraph,
  type CoreSpiritSemanticDependencyGraph,
  type CoreSpiritSemanticDependencyNode,
} from './semanticDependencyGraph';

export type CoreSpiritComposableKind =
  | 'value'
  | 'indicator'
  | 'model'
  | 'model-output'
  | 'data'
  | 'event'
  | 'condition'
  | 'automation'
  | 'order-intent'
  | 'show';

export type CoreSpiritComposableNode = {
  id: string;
  kind: CoreSpiritComposableKind;
  name: string;
  contract: 'series' | 'scalar' | 'boolean' | 'model-output' | 'data' | 'event' | 'automation' | 'order-intent' | 'visual';
  source?: { start:number; end:number; line:number; column:number };
};

export type CoreSpiritComposableEdge = {
  from: string;
  to: string;
  relation: 'feeds' | 'triggers' | 'renders' | 'routes' | 'contains';
};

export type CoreSpiritCompositionGraph = {
  version: 2;
  sourceGraphVersion: 1;
  nodes: readonly CoreSpiritComposableNode[];
  edges: readonly CoreSpiritComposableEdge[];
};

function composableKind(node: CoreSpiritSemanticDependencyNode): CoreSpiritComposableKind | undefined {
  if (node.declarationKind === 'indicator') return 'indicator';
  switch(node.kind) {
    case 'symbol': return 'value';
    case 'model': return 'model';
    case 'model-output': return 'model-output';
    case 'data-source': return 'data';
    case 'event': return 'event';
    case 'condition': return 'condition';
    case 'automation': return 'automation';
    case 'order-intent': return 'order-intent';
    case 'visual': return 'show';
    default: return undefined;
  }
}

function composableContract(node: CoreSpiritSemanticDependencyNode): CoreSpiritComposableNode['contract'] {
  if (node.kind === 'data-source') return node.type === 'market:ref' || node.type === 'timeframe:ref' ? 'data' : 'series';
  if (node.kind === 'condition') return 'boolean';
  if (node.kind === 'event') return 'event';
  if (node.kind === 'automation') return 'automation';
  if (node.kind === 'order-intent') return 'order-intent';
  if (node.kind === 'visual') return 'visual';
  if (node.kind === 'model-output') return 'model-output';
  return node.type === 'series<number>' || node.type === 'series<float>' ? 'series' : 'scalar';
}

function projectNode(node: CoreSpiritSemanticDependencyNode): CoreSpiritComposableNode | undefined {
  const kind = composableKind(node);
  if (!kind) return undefined;
  return {
    id: node.declarationKind === 'indicator' ? 'indicator:' + node.name : node.id,
    kind,
    name: node.name,
    contract: composableContract(node),
    ...(node.source ? { source: node.source } : {}),
  };
}

function projectRelation(relation: CoreSpiritSemanticDependencyGraph['edges'][number]['relation']): CoreSpiritComposableEdge['relation'] {
  switch(relation) {
    case 'depends-on': return 'feeds';
    case 'renders': return 'renders';
    case 'triggers':
    case 'emits': return 'triggers';
    case 'contains': return 'contains';
  }
}

/**
 * Semantic composition projection.
 *
 * The composition API no longer searches source text for words. It receives
 * the parsed AST, resolved semantic result and explicit surface declarations,
 * then projects the canonical semantic dependency graph into the smaller
 * user-facing composition vocabulary.
 */
export function buildCoreSpiritCompositionGraph(
  ast: CoreSpiritAst,
  semantic: CoreSpiritSemanticResult,
  surface: CoreSpiritSurfaceMetadata,
): CoreSpiritCompositionGraph {
  const semanticGraph = buildCoreSpiritSemanticDependencyGraph(ast,semantic,surface);
  const projectedNodes = new Map<string,CoreSpiritComposableNode>();

  for(const node of semanticGraph.nodes) {
    const projected = projectNode(node);
    if(projected) projectedNodes.set(projected.id,projected);
  }

  const edges: CoreSpiritComposableEdge[] = [];
  const mapId = (id:string): string | undefined => {
    if(projectedNodes.has(id)) return id;
    if(id.startsWith('indicator:')) return id;
    return undefined;
  };

  for(const edge of semanticGraph.edges) {
    const from = mapId(edge.from);
    const to = mapId(edge.to);
    if(!from || !to || !projectedNodes.has(from) || !projectedNodes.has(to)) continue;
    const relation = projectRelation(edge.relation);
    if(!edges.some(item=>item.from===from&&item.to===to&&item.relation===relation)) {
      edges.push({from,to,relation});
    }
  }

  return Object.freeze({
    version:2,
    sourceGraphVersion:semanticGraph.version,
    nodes:Object.freeze([...projectedNodes.values()]),
    edges:Object.freeze(edges),
  });
}

export function validateCoreSpiritCompositionGraph(graph: CoreSpiritCompositionGraph): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for(const node of graph.nodes) {
    if(ids.has(node.id)) errors.push("duplicate composition node '" + node.id + "'");
    ids.add(node.id);
  }
  for(const edge of graph.edges) {
    if(!ids.has(edge.from)) errors.push("composition edge source '" + edge.from + "' does not exist");
    if(!ids.has(edge.to)) errors.push("composition edge target '" + edge.to + "' does not exist");
  }
  return errors;
}

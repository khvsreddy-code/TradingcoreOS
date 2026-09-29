import type { CoreSpiritSemanticDependencyGraph } from './semanticDependencyGraph';

export type CoreSpiritLineageNode = Readonly<{
  id: string;
  name: string;
  kind: string;
  source?: { start:number; end:number; line:number; column:number };
}>;

export type CoreSpiritLineage = Readonly<{
  version: 1;
  nodes: readonly CoreSpiritLineageNode[];
  edges: readonly { from:string; to:string; relation:string }[];
}>;

export function buildCoreSpiritLineage(graph: CoreSpiritSemanticDependencyGraph): CoreSpiritLineage {
  return Object.freeze({
    version: 1,
    nodes: Object.freeze(graph.nodes.map(node => Object.freeze({ id:node.id, name:node.name, kind:node.kind, ...(node.source ? { source:node.source } : {}) }))),
    edges: Object.freeze(graph.edges.map(edge => Object.freeze({ from:edge.from, to:edge.to, relation:edge.relation }))),
  });
}

export function traceCoreSpiritAncestors(lineage: CoreSpiritLineage, targetId: string, maxDepth = 64): readonly string[] {
  const parents = new Map<string, string[]>();
  for (const edge of lineage.edges) (parents.get(edge.to) ?? parents.set(edge.to, []).get(edge.to)!).push(edge.from);
  const result:string[] = [];
  const seen = new Set<string>();
  const queue:Array<{id:string;depth:number}> = [{ id:targetId, depth:0 }];
  while (queue.length) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth || seen.has(current.id)) continue;
    seen.add(current.id);
    for (const parent of parents.get(current.id) ?? []) { result.push(parent); queue.push({ id:parent, depth:current.depth + 1 }); }
  }
  return Object.freeze([...new Set(result)]);
}

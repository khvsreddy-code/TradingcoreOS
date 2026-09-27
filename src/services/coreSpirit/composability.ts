import type { CoreSpiritSurfaceMetadata, CoreSpiritSurfaceDeclaration } from './languageConcepts';

export type CoreSpiritComposableKind = 'value' | 'indicator' | 'model' | 'event' | 'condition' | 'automation' | 'order-intent' | 'show';

export type CoreSpiritComposableNode = {
  id: string;
  kind: CoreSpiritComposableKind;
  name: string;
  contract: 'series' | 'scalar' | 'boolean' | 'model-output' | 'event' | 'automation' | 'order-intent' | 'visual';
};

export type CoreSpiritComposableEdge = {
  from: string;
  to: string;
  relation: 'feeds' | 'triggers' | 'renders' | 'routes';
};

export type CoreSpiritCompositionGraph = {
  version: 1;
  nodes: readonly CoreSpiritComposableNode[];
  edges: readonly CoreSpiritComposableEdge[];
};

const IDENTIFIER = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;

function addNode(nodes: Map<string, CoreSpiritComposableNode>, node: CoreSpiritComposableNode): void {
  if (!nodes.has(node.id)) nodes.set(node.id, node);
}

function declarationNode(declaration: CoreSpiritSurfaceDeclaration): CoreSpiritComposableNode {
  if (declaration.kind === 'model') return { id: `model:${declaration.name}`, kind: 'model', name: declaration.name, contract: 'model-output' };
  if (declaration.kind === 'automation') return { id: `automation:${declaration.name}`, kind: 'automation', name: declaration.name, contract: 'automation' };
  return { id: `indicator:${declaration.name}`, kind: 'indicator', name: declaration.name, contract: 'series' };
}

function extractReferencedNames(text: string): string[] {
  return [...text.matchAll(IDENTIFIER)].map(match => match[0]);
}

/**
 * Builds a serializable composition graph from the same source/surface metadata
 * that already produces the executable artifact. The graph is descriptive: it
 * never executes code, resolves brokers, or creates a second runtime.
 */
export function buildCoreSpiritCompositionGraph(
  source: string,
  surface: CoreSpiritSurfaceMetadata,
): CoreSpiritCompositionGraph {
  const nodes = new Map<string, CoreSpiritComposableNode>();
  const edges: CoreSpiritComposableEdge[] = [];
  const lines = String(source || '').replace(/\r\n?/g, '\n').split('\n');

  for (const declaration of surface.declarations) addNode(nodes, declarationNode(declaration));

  const modelNames = new Set(surface.declarations.filter(d => d.kind === 'model').map(d => d.name));
  const automationNames = new Set(surface.declarations.filter(d => d.kind === 'automation').map(d => d.name));
  const indicatorNames = new Set(surface.declarations.filter(d => d.kind === 'indicator').map(d => d.name));

  let activeIndicator: string | undefined;
  let activeAutomation: string | undefined;
  let emittedEvent: string | undefined;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    const indent = raw.match(/^[ \t]*/)?.[0].replace(/\t/g, '  ').length ?? 0;

    const indicator = trimmed.match(/^indicator\s+(?:"([^"]+)"|'([^']+)')\s*:/i);
    if (indicator) {
      activeIndicator = indicator[1] ?? indicator[2];
      activeAutomation = undefined;
      continue;
    }
    const automation = trimmed.match(/^automate\s+(?:"([^"]+)"|'([^']+)')\s*:/i);
    if (automation) {
      activeAutomation = automation[1] ?? automation[2];
      activeIndicator = undefined;
      continue;
    }
    if (activeIndicator && indent === 0) activeIndicator = undefined;
    if (activeAutomation && indent === 0) activeAutomation = undefined;

    const emit = trimmed.match(/^(?:emit|signal)\s*(?:\(|\s)\s*["']([^"']+)["']/i);
    if (emit) {
      const eventName = emit[1];
      emittedEvent = eventName;
      addNode(nodes, { id: `event:${eventName}`, kind: 'event', name: eventName, contract: 'event' });
      if (activeIndicator) edges.push({ from: `indicator:${activeIndicator}`, to: `event:${eventName}`, relation: 'feeds' });
      continue;
    }

    const when = trimmed.match(/^when\s+(.+?)\s*:\s*$/i);
    if (when) {
      const conditionId = `condition:${when[1].trim()}`;
      addNode(nodes, { id: conditionId, kind: 'condition', name: when[1].trim(), contract: 'boolean' });
      if (activeAutomation) edges.push({ from: conditionId, to: `automation:${activeAutomation}`, relation: 'triggers' });
      if (emittedEvent && /["']/.test(when[1])) {
        const eventName = (when[1].match(/["']([^"']+)["']/)?.[1]) ?? '';
        if (eventName) {
          addNode(nodes, { id: `event:${eventName}`, kind: 'event', name: eventName, contract: 'event' });
          edges.push({ from: `event:${eventName}`, to: conditionId, relation: 'feeds' });
        }
      }
      const refs = extractReferencedNames(when[1]);
      for (const name of refs) {
        if (modelNames.has(name)) edges.push({ from: `model:${name}`, to: conditionId, relation: 'feeds' });
        if (indicatorNames.has(name)) edges.push({ from: `indicator:${name}`, to: conditionId, relation: 'feeds' });
      }
      continue;
    }

    if (/^order\s+/i.test(trimmed) || /^order\s*:/i.test(trimmed)) {
      const automation = activeAutomation ? `automation:${activeAutomation}` : undefined;
      const orderId = `order-intent:${activeAutomation ?? 'anonymous'}`;
      addNode(nodes, { id: orderId, kind: 'order-intent', name: 'order', contract: 'order-intent' });
      if (automation) edges.push({ from: automation, to: orderId, relation: 'routes' });
      continue;
    }

    if (/^show\b/i.test(trimmed)) {
      const showId = `show:${trimmed.slice(4).trim()}`;
      addNode(nodes, { id: showId, kind: 'show', name: trimmed.slice(4).trim(), contract: 'visual' });
      const refs = extractReferencedNames(trimmed.slice(4));
      for (const name of refs) {
        if (indicatorNames.has(name)) edges.push({ from: `indicator:${name}`, to: showId, relation: 'renders' });
        if (modelNames.has(name)) edges.push({ from: `model:${name}`, to: showId, relation: 'renders' });
      }
    }

    const assignment = trimmed.match(/^(?:let\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (assignment) {
      const valueId = `value:${assignment[1]}`;
      addNode(nodes, { id: valueId, kind: 'value', name: assignment[1], contract: /ema|sma|hma|wma|rma|stdev|highest|lowest|vwap/i.test(assignment[2]) ? 'series' : 'scalar' });
      const refs = extractReferencedNames(assignment[2]);
      for (const name of refs) {
        if (modelNames.has(name)) edges.push({ from: `model:${name}`, to: valueId, relation: 'feeds' });
        if (indicatorNames.has(name)) edges.push({ from: `indicator:${name}`, to: valueId, relation: 'feeds' });
      }
    }
  }

  return Object.freeze({
    version: 1,
    nodes: Object.freeze([...nodes.values()]),
    edges: Object.freeze(edges.filter((edge, index, all) => all.findIndex(item => item.from === edge.from && item.to === edge.to && item.relation === edge.relation) === index)),
  });
}

export function validateCoreSpiritCompositionGraph(graph: CoreSpiritCompositionGraph): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) errors.push(`duplicate composition node '${node.id}'`);
    ids.add(node.id);
  }
  for (const edge of graph.edges) {
    if (!ids.has(edge.from)) errors.push(`composition edge source '${edge.from}' does not exist`);
    if (!ids.has(edge.to)) errors.push(`composition edge target '${edge.to}' does not exist`);
  }
  return errors;
}

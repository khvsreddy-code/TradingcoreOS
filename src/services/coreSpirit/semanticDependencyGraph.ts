
import type { CoreSpiritAst, CoreSpiritAstNode } from './ast';
import type { CoreSpiritSemanticResult } from './semanticAnalyzer';
import type { CoreSpiritSurfaceDeclaration, CoreSpiritSurfaceMetadata } from './languageConcepts';
import type { CoreSpiritType } from './typeSystem';

export type CoreSpiritSemanticDependencyNodeKind =
  | 'data-source'
  | 'symbol'
  | 'model'
  | 'model-output'
  | 'expression'
  | 'condition'
  | 'event'
  | 'visual'
  | 'automation'
  | 'order-intent';

export type CoreSpiritSemanticDependencyNode = {
  id: string;
  kind: CoreSpiritSemanticDependencyNodeKind;
  name: string;
  type?: CoreSpiritType | 'event' | 'visual' | 'order-intent';
  source?: { start:number; end:number; line:number; column:number };
  declarationKind?: CoreSpiritSurfaceDeclaration['kind'];
};

export type CoreSpiritSemanticDependencyEdge = {
  from: string;
  to: string;
  relation: 'depends-on' | 'emits' | 'triggers' | 'renders' | 'contains';
};

export type CoreSpiritSemanticDependencyGraph = {
  version: 1;
  nodes: readonly CoreSpiritSemanticDependencyNode[];
  edges: readonly CoreSpiritSemanticDependencyEdge[];
  symbols: Readonly<Record<string,string>>;
};

const SERIES_NAMES = new Set(['open','high','low','close','volume','time']);
const SHOW_CALLS = new Set(['show','plot','marker','label','labelAt','line','zone','box','band','fill','gradient','arrow','shape','heatmap','polyline','hline','bg','barcolor','table','text','polygon','customVisual']);
const EVENT_CALLS = new Set(['emit','signal','alert','webhook']);
const ORDER_CALLS = new Set(['order','entry','exit','buy','sell']);
const NAMESPACE_NAMES = new Set(['ui','visual','app','scan','chart']);

function sourceSpan(n: CoreSpiritAstNode) {
  return n.span ? { start:n.span.start, end:n.span.end, line:n.span.line, column:n.span.column } : undefined;
}

function literalString(n?: CoreSpiritAstNode): string | undefined {
  return n?.type === 'string' && typeof n.value === 'string' ? n.value : undefined;
}

export function buildCoreSpiritSemanticDependencyGraph(
  ast: CoreSpiritAst,
  semantic: CoreSpiritSemanticResult,
  surface: CoreSpiritSurfaceMetadata,
): CoreSpiritSemanticDependencyGraph {
  const nodes = new Map<string, CoreSpiritSemanticDependencyNode>();
  const edges: CoreSpiritSemanticDependencyEdge[] = [];
  const bindings: Record<string,string> = {};
  const modelDecls = new Map(surface.declarations.filter(d => d.kind === 'model').map(d => [d.name, d] as const));

  const addNode = (node: CoreSpiritSemanticDependencyNode): string => {
    if (!nodes.has(node.id)) nodes.set(node.id,node);
    return node.id;
  };

  const addEdge = (
    from: string,
    to: string,
    relation: CoreSpiritSemanticDependencyEdge['relation'],
  ): void => {
    if (from === to || !nodes.has(from) || !nodes.has(to)) return;
    if (!edges.some(e => e.from === from && e.to === to && e.relation === relation)) {
      edges.push({ from, to, relation });
    }
  };

  for (const declaration of surface.declarations) {
    if (declaration.kind === 'model') {
      addNode({
        id: 'model:' + declaration.name,
        kind: 'model',
        name: declaration.name,
        type: 'model:ref',
        declarationKind: declaration.kind,
      });
    } else if (declaration.kind === 'indicator') {
      addNode({
        id: 'indicator:' + declaration.name,
        kind: 'symbol',
        name: declaration.name,
        declarationKind: declaration.kind,
      });
    } else {
      addNode({
        id: 'automation:' + declaration.name,
        kind: 'automation',
        name: declaration.name,
        declarationKind: declaration.kind,
      });
    }
  }

  const resolveIdentifier = (name: string): string => {
    if (bindings[name]) return bindings[name];
    if (SERIES_NAMES.has(name)) {
      return addNode({ id:'data:' + name, kind:'data-source', name, type:'series<number>' });
    }
    if (name === 'bar_index' || name === 'na') {
      return addNode({ id:'data:' + name, kind:'data-source', name, type:name === 'bar_index' ? 'number' : 'unknown' });
    }
    return addNode({ id:'symbol:unresolved:' + name, kind:'symbol', name, type:'unknown' });
  };

  const expression = (node: CoreSpiritAstNode, conditionOwner?: string): string => {
    switch (node.type) {
      case 'number':
      case 'string':
      case 'boolean':
      case 'null':
        return addNode({
          id:'expr:' + (node.span?.start ?? nodes.size),
          kind:'expression',
          name:String(node.value),
          source:sourceSpan(node),
        });

      case 'identifier':
        return resolveIdentifier(node.name);

      case 'member': {
        const targetId = expression(node.target, conditionOwner);
        const modelSymbol = node.target.type === 'identifier' ? bindings[node.target.name] : undefined;
        const directModelLocator = node.target.type === 'call' && node.target.name === 'model'
          ? literalString(node.target.args[0])
          : undefined;
        const directModelDeclaration = directModelLocator ? modelDecls.get(directModelLocator) : undefined;
        const directModelId = directModelDeclaration
          ? 'model:' + directModelDeclaration.name
          : directModelLocator
            ? 'model:' + directModelLocator
            : undefined;
        const resolvedModelId = modelSymbol?.startsWith('model:') ? modelSymbol : directModelId;

        if (resolvedModelId?.startsWith('model:')) {
          const modelName = resolvedModelId.slice('model:'.length);
          addNode({id:resolvedModelId,kind:'model',name:directModelDeclaration?.name ?? modelName,type:'model:ref'});

          const outputId = addNode({
            id:'model-output:' + modelName + ':' + node.member,
            kind:'model-output',
            name:modelName + '.' + node.member,
            source:sourceSpan(node),
          });
          addEdge(resolvedModelId, outputId, 'depends-on');
          return outputId;
        }

        const targetNode = nodes.get(targetId);
        if (targetNode?.kind === 'data-source') {
          const fieldId = addNode({
            id:targetId + '.' + node.member,
            kind:'data-source',
            name:targetNode.name + '.' + node.member,
            type:'series<float>',
            source:sourceSpan(node),
          });
          addEdge(targetId, fieldId, 'depends-on');
          return fieldId;
        }

        const id = addNode({
          id:'expr:' + (node.span?.start ?? nodes.size),
          kind:'expression',
          name:node.member,
          source:sourceSpan(node),
        });
        addEdge(targetId, id, 'depends-on');
        return id;
      }

      case 'index': {
        const target = expression(node.target, conditionOwner);
        const index = expression(node.index, conditionOwner);
        const id = addNode({
          id:'expr:' + (node.span?.start ?? nodes.size),
          kind:'expression',
          name:'index',
          source:sourceSpan(node),
        });
        addEdge(target,id,'depends-on');
        addEdge(index,id,'depends-on');
        return id;
      }

      case 'unary': {
        const operand = expression(node.operand, conditionOwner);
        const id = addNode({
          id:'expr:' + (node.span?.start ?? nodes.size),
          kind:'expression',
          name:node.operator,
          source:sourceSpan(node),
        });
        addEdge(operand,id,'depends-on');
        return id;
      }

      case 'binary': {
        const left = expression(node.left, conditionOwner);
        const right = expression(node.right, conditionOwner);
        const id = addNode({
          id:'expr:' + (node.span?.start ?? nodes.size),
          kind:'expression',
          name:node.operator,
          source:sourceSpan(node),
        });
        addEdge(left,id,'depends-on');
        addEdge(right,id,'depends-on');
        return id;
      }

      case 'call': {
        if (node.name === 'market' || node.name === 'timeframe') {
          const locator = literalString(node.args[0]) ?? '?';
          return addNode({
            id:'data:' + node.name + ':' + locator,
            kind:'data-source',
            name:node.name + '("' + locator + '")',
            type:node.name === 'market' ? 'market:ref' : 'timeframe:ref',
            source:sourceSpan(node),
          });
        }

        if (node.name === 'model') {
          const locator = literalString(node.args[0]) ?? 'unknown';
          const declaration = modelDecls.get(locator);
          const modelId = declaration ? 'model:' + declaration.name : 'model:' + locator;
          return addNode({
            id:modelId,
            kind:'model',
            name:declaration?.name ?? locator,
            type:'model:ref',
            source:sourceSpan(node),
            ...(declaration ? { declarationKind:declaration.kind } : {}),
          });
        }

        if (EVENT_CALLS.has(node.name)) {
          const eventName = literalString(node.args[0]) ?? node.name;
          const eventId = addNode({
            id:'event:' + eventName,
            kind:'event',
            name:eventName,
            type:'event',
            source:sourceSpan(node),
          });
          for (const arg of node.args.slice(1)) addEdge(expression(arg,conditionOwner),eventId,'depends-on');
          if (conditionOwner) addEdge(conditionOwner,eventId,'emits');
          return eventId;
        }

        if (SHOW_CALLS.has(node.name)) {
          const visualId = addNode({
            id:'visual:' + (node.span?.start ?? nodes.size),
            kind:'visual',
            name:node.name,
            type:'visual',
            source:sourceSpan(node),
          });
          for (const arg of node.args) addEdge(expression(arg,conditionOwner),visualId,'renders');
          if (conditionOwner) addEdge(conditionOwner,visualId,'triggers');
          return visualId;
        }

        if (ORDER_CALLS.has(node.name)) {
          const orderId = addNode({
            id:'order-intent:' + (node.span?.start ?? nodes.size),
            kind:'order-intent',
            name:node.name,
            type:'order-intent',
            source:sourceSpan(node),
          });
          for (const arg of node.args) addEdge(expression(arg,conditionOwner),orderId,'depends-on');
          if (conditionOwner) addEdge(conditionOwner,orderId,'triggers');
          return orderId;
        }

        const id = addNode({
          id:'expr:' + (node.span?.start ?? nodes.size),
          kind:'expression',
          name:node.name,
          source:sourceSpan(node),
        });
        for (const arg of node.args) addEdge(expression(arg,conditionOwner),id,'depends-on');
        return id;
      }

      case 'memberCall': {
        const target = NAMESPACE_NAMES.has(node.target.type === 'identifier' ? node.target.name : '')
          ? addNode({
              id:'namespace:' + (node.target.type === 'identifier' ? node.target.name : 'unknown'),
              kind:'expression',
              name:node.target.type === 'identifier' ? node.target.name : 'namespace',
            })
          : expression(node.target,conditionOwner);
        const id = addNode({
          id:'expr:' + (node.span?.start ?? nodes.size),
          kind:'expression',
          name:node.member,
          source:sourceSpan(node),
        });
        addEdge(target,id,'depends-on');
        for (const arg of node.args) addEdge(expression(arg,conditionOwner),id,'depends-on');
        return id;
      }

      default:
        return addNode({
          id:'expr:' + (node.span?.start ?? nodes.size),
          kind:'expression',
          name:node.type,
          source:sourceSpan(node),
        });
    }
  };

  const visit = (node: CoreSpiritAstNode, conditionOwner?: string): void => {
    switch (node.type) {
      case 'program':
        node.body.forEach(child => visit(child,conditionOwner));
        break;

      case 'let': {
        const symbolId = addNode({
          id:'symbol:' + node.name,
          kind:'symbol',
          name:node.name,
          type:semantic.symbols.get(node.name),
          source:sourceSpan(node),
        });
        const valueId = expression(node.expression,conditionOwner);
        addEdge(valueId,symbolId,'depends-on');

        if (node.expression.type === 'call' && node.expression.name === 'model') {
          const locator = literalString(node.expression.args[0]);
          if (locator) {
            const declaration = modelDecls.get(locator);
            const modelId = declaration ? 'model:' + declaration.name : 'model:' + locator;
            bindings[node.name] = modelId;
            addNode({id:modelId,kind:'model',name:declaration?.name ?? locator,type:'model:ref'});
            addEdge(modelId,symbolId,'contains');
          } else {
            bindings[node.name] = symbolId;
          }
        } else {
          bindings[node.name] = symbolId;
        }
        break;
      }

      case 'if': {
        const conditionId = addNode({
          id:'condition:' + (node.span?.start ?? nodes.size),
          kind:'condition',
          name:'condition',
          type:'boolean',
          source:sourceSpan(node),
        });
        const valueId = expression(node.condition,conditionOwner);
        addEdge(valueId,conditionId,'depends-on');
        node.thenBranch.forEach(child => visit(child,conditionId));
        node.elseBranch?.forEach(child => visit(child,conditionId));
        break;
      }

      case 'expressionStatement':
        expression(node.expression,conditionOwner);
        break;

      case 'typeDeclaration':
        break;

      default:
        expression(node,conditionOwner);
        break;
    }
  };

  visit(ast);

  for (const declaration of surface.declarations) {
    if (declaration.kind === 'automation') {
      for (const trigger of declaration.triggers) {
        const eventName = trigger.match(/^["']([^"']+)["']$/)?.[1];
        if (eventName) {
          const eventId = 'event:' + eventName;
          addNode({id:eventId,kind:'event',name:eventName,type:'event'});
          addEdge(eventId,'automation:' + declaration.name,'triggers');
        } else {
          const conditionId = addNode({
            id:'decl-condition:' + declaration.name + ':' + trigger,
            kind:'condition',
            name:trigger,
            type:'boolean',
          });
          addEdge(conditionId,'automation:' + declaration.name,'triggers');
        }
      }
    }
  }

  return Object.freeze({
    version:1,
    nodes:Object.freeze([...nodes.values()]),
    edges:Object.freeze(edges),
    symbols:Object.freeze({...bindings}),
  });
}

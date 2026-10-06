import type { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';

export type CoreSpiritExecutionPlanVisualNodeKind = 'input' | 'compute' | 'control' | 'effect' | 'output' | 'state' | 'event';
export type CoreSpiritExecutionPlanVisualNodeStatus = 'fused' | 'scalar' | 'barrier';

export type CoreSpiritExecutionPlanVisualNode = Readonly<{
  id: string;
  label: string;
  kind: CoreSpiritExecutionPlanVisualNodeKind;
  status: CoreSpiritExecutionPlanVisualNodeStatus;
  instruction: number;
  op: CoreSpiritIrInstruction['op'];
  dependencies: readonly string[];
  sourceInputs: readonly string[];
  estimatedCost: string;
  executionLane?: string;
  backend?: 'cpu' | 'wasm' | 'gpu';
  fusedKernelId?: string;
  source?: { start:number; end:number; line:number; column:number };
}>;

export type CoreSpiritExecutionPlanVisualEdge = Readonly<{
  from: string;
  to: string;
  relation: 'dependency' | 'data-source';
}>;

export type CoreSpiritExecutionPlanVisualKernel = Readonly<{
  id: string;
  label: string;
  backend: 'cpu' | 'wasm' | 'gpu';
  operationCount: number;
  operations: readonly string[];
  instructionIndices: readonly number[];
  nodeIds: readonly string[];
  traversals: number;
  intermediateArrays: number;
  eligibleBackends: readonly ('cpu'|'wasm'|'gpu')[];
  strategy: string;
  status: 'fused' | 'scalar';
}>;

export type CoreSpiritExecutionPlanVisualSummary = Readonly<{
  strategy: string;
  instructionCount: number;
  computeOperationCount: number;
  fusedOperationCount: number;
  kernelCount: number;
  traversalCount: number;
  intermediateArrays: number;
  barrierCount: number;
  maxLookback: number;
}>;

export type CoreSpiritExecutionPlanVisualization = Readonly<{
  version: 1;
  sourceId: string;
  roots: readonly string[];
  outputs: readonly string[];
  nodes: readonly CoreSpiritExecutionPlanVisualNode[];
  edges: readonly CoreSpiritExecutionPlanVisualEdge[];
  kernels: readonly CoreSpiritExecutionPlanVisualKernel[];
  summary: CoreSpiritExecutionPlanVisualSummary;
  executionText: readonly string[];
  ascii: string;
}>;

function lastNumericConstant(instructions: readonly CoreSpiritIrInstruction[], register?: string): number | undefined {
  if (!register) return undefined;
  for (let i = instructions.length - 1; i >= 0; i -= 1) {
    const instruction = instructions[i]!;
    if (instruction.op === 'const' && instruction.dest === register) {
      const value = Number(instruction.value);
      return Number.isFinite(value) ? value : undefined;
    }
    if ('dest' in instruction && instruction.dest === register) return undefined;
  }
  return undefined;
}

function labelFor(
  program: CoreSpiritIrProgram,
  instruction: CoreSpiritIrInstruction,
  fallback: string,
  fusedOperation?: { readonly name:string; readonly length:number },
): string {
  if (instruction.op === 'loadSeries') return instruction.name;
  if (instruction.op === 'loadState') return `state:${instruction.name}`;
  if (instruction.op === 'call') {
    if (fusedOperation) return `${fusedOperation.name.toUpperCase()}(${fusedOperation.length})`;
    const period = lastNumericConstant(program.entry.instructions, instruction.args[1]);
    return period !== undefined ? `${instruction.name.toUpperCase()}(${period})` : instruction.name;
  }
  if (instruction.op === 'emit') return instruction.kind;
  if (instruction.op === 'setState') return `state ${instruction.name}`;
  if (instruction.op === 'setLocal') return instruction.name;
  if (instruction.op === 'eventGate') return `on ${instruction.eventName}`;
  if (instruction.op === 'jumpIfFalse') return 'condition gate';
  return fallback;
}

function visualKind(instruction: CoreSpiritIrInstruction, graphKind: string): CoreSpiritExecutionPlanVisualNodeKind {
  if (graphKind === 'visual' || graphKind === 'signal' || graphKind === 'automation') return 'output';
  switch (instruction.op) {
    case 'loadSeries':
    case 'loadState': return 'input';
    case 'eventGate': return 'event';
    case 'jump':
    case 'jumpIfFalse': return 'control';
    case 'emit': return 'output';
    case 'setState': return 'state';
    case 'setLocal': return 'effect';
    default: return 'compute';
  }
}

function buildAscii(
  roots: readonly string[],
  nodes: readonly CoreSpiritExecutionPlanVisualNode[],
  edges: readonly CoreSpiritExecutionPlanVisualEdge[],
): string {
  const byId = new Map(nodes.map(node => [node.id, node] as const));
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.relation !== 'dependency' && edge.relation !== 'data-source') continue;
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  }
  for (const list of outgoing.values()) list.sort((a,b) => a.localeCompare(b));

  const lines: string[] = [];
  const render = (id: string, prefix: string, branch: string, active: ReadonlySet<string>) => {
    const node = byId.get(id);
    if (!node) return;
    const marker = node.status === 'fused' ? '  [fused]' : node.status === 'barrier' ? '  [barrier]' : '';
    const repeated = active.has(id);
    lines.push(`${prefix}${branch}${repeated ? '↳ ' : ''}${node.label}${marker}`);
    if (repeated) return;
    const children = outgoing.get(id) ?? [];
    if (!children.length) return;
    const nextActive = new Set(active);
    nextActive.add(id);
    children.forEach((child, index) => render(child, prefix + (branch ? (index === children.length - 1 ? '   ' : '│  ') : ''), index === children.length - 1 ? '└── ' : '├── ', nextActive));
  };
  roots.forEach((root, index) => render(root, '', index === roots.length - 1 ? '' : '• ', new Set()));
  return lines.join('\n');
}

export function buildCoreSpiritExecutionPlanVisualization(program: CoreSpiritIrProgram): CoreSpiritExecutionPlanVisualization {
  const graphNodes = program.graphs?.semantic.nodes ?? [];
  const fusion = program.executionPlan?.seriesFusion;
  const backendByNode = new Map<string, 'cpu'|'wasm'|'gpu'>();
  for (const assignment of program.executionPlan?.assignments ?? []) {
    for (const nodeId of assignment.nodeIds) backendByNode.set(nodeId, assignment.backend);
  }

  const kernelByInstruction = new Map<number, string>();
  const kernels: CoreSpiritExecutionPlanVisualKernel[] = [];
  if (fusion) {
    fusion.groups.forEach((group, index) => {
      const backend = group.nodeIds.map(id => backendByNode.get(id)).find(Boolean) ?? group.eligibleBackends[0] ?? 'cpu';
      const id = `kernel:${index + 1}`;
      group.instructions.forEach(instruction => kernelByInstruction.set(instruction, id));
      kernels.push(Object.freeze({
        id,
        label: `${backend.toUpperCase()} fused kernel #${index + 1}`,
        backend,
        operationCount: group.operations.length,
        operations: Object.freeze(group.operations.map(op => `${op.name.toUpperCase()}(${op.length})`)),
        instructionIndices: Object.freeze([...group.instructions]),
        nodeIds: Object.freeze([...group.nodeIds]),
        traversals: 1,
        intermediateArrays: group.intermediateSeriesAllocations,
        eligibleBackends: Object.freeze([...group.eligibleBackends]),
        strategy: group.strategy,
        status: 'fused',
      }));
    });
  }

  const scalarNodes = graphNodes.filter(node =>
    !kernelByInstruction.has(node.instruction) &&
    node.kind === 'compute' &&
    ['unary','binary','call','index'].includes(node.op),
  );
  if (scalarNodes.length) {
    kernels.push(Object.freeze({
      id: 'kernel:scalar',
      label: 'CPU scalar lane',
      backend: 'cpu',
      operationCount: scalarNodes.length,
      operations: Object.freeze(scalarNodes.map(node => node.name ?? node.op)),
      instructionIndices: Object.freeze(scalarNodes.map(node => node.instruction)),
      nodeIds: Object.freeze(scalarNodes.map(node => node.id)),
      traversals: 1,
      intermediateArrays: 0,
      eligibleBackends: Object.freeze(['cpu'] as const),
      strategy: 'specialized scalar execution',
      status: 'scalar',
    }));
  }

  const fusedOperationByInstruction = new Map<number, { name:string; length:number }>();
  for (const group of fusion?.groups ?? []) {
    group.instructions.forEach((instruction, index) => {
      const operation = group.operations[index];
      if (operation) fusedOperationByInstruction.set(instruction, { name:operation.name, length:operation.length });
    });
  }

  const nodes = graphNodes.map(node => {
    const instruction = program.entry.instructions[node.instruction]!;
    const fusedKernelId = kernelByInstruction.get(node.instruction);
    return Object.freeze({
      id: node.id,
      label: labelFor(program, instruction, node.name ?? node.op, fusedOperationByInstruction.get(node.instruction)),
      kind: visualKind(instruction, node.kind),
      status: fusedKernelId ? 'fused' : node.effectful ? 'barrier' : 'scalar',
      instruction: node.instruction,
      op: node.op,
      dependencies: Object.freeze([...node.dependencies]),
      sourceInputs: Object.freeze([...node.sourceInputs]),
      estimatedCost: node.estimatedCost,
      ...(node.executionLane ? { executionLane: node.executionLane } : {}),
      ...(backendByNode.get(node.id) || fusedKernelId ? { backend: backendByNode.get(node.id) ?? kernels.find(k => k.id === fusedKernelId)!.backend } : {}),
      ...(fusedKernelId ? { fusedKernelId } : {}),
      ...(node.source ? { source: node.source } : {}),
    }) as CoreSpiritExecutionPlanVisualNode;
  });

  const byProducer = new Map<string, string>();
  for (const node of nodes) {
    const graphNode = graphNodes.find(candidate => candidate.id === node.id);
    if (graphNode?.dest) byProducer.set(graphNode.dest, node.id);
    if (graphNode?.op === 'setLocal' && graphNode.name) byProducer.set(graphNode.name, node.id);
  }
  const edges: CoreSpiritExecutionPlanVisualEdge[] = [];
  for (const node of nodes) {
    for (const dependency of node.dependencies) {
      const from = byProducer.get(dependency);
      if (from && from !== node.id) edges.push(Object.freeze({ from, to: node.id, relation: 'dependency' }));
    }
  }
  const uniqueEdges = [...new Map(edges.map(edge => [`${edge.from}|${edge.to}|${edge.relation}`, edge])).values()];
  const roots = nodes.filter(node => node.dependencies.length === 0 && node.op !== 'const').map(node => node.id);
  const outputs = nodes.filter(node => node.kind === 'output' || node.kind === 'effect' || node.kind === 'state').map(node => node.id);
  const computeOperationCount = nodes.filter(node => node.kind === 'compute' && node.op !== 'const').length;
  const fusedOperationCount = fusion?.fusedInstructionCount ?? 0;
  const traversalCount = program.executionPlan?.chronologicalPasses ?? (kernels.length ? 1 : 0);
  const intermediateArrays = kernels.reduce((sum, kernel) => sum + kernel.intermediateArrays, 0);

  const summary = Object.freeze({
    strategy: program.executionPlan?.strategy ?? 'cpu-fallback',
    instructionCount: program.entry.instructions.length,
    computeOperationCount,
    fusedOperationCount,
    kernelCount: kernels.length,
    traversalCount,
    intermediateArrays,
    barrierCount: program.executionPlan?.barriers.length ?? graphNodes.filter(node => node.effectful).length,
    maxLookback: program.maxLookback,
  });

  const executionText = Object.freeze([
    'Execution:',
    ...kernels.flatMap(kernel => [
      kernel.label,
      `${kernel.operationCount} operations`,
      `${kernel.traversals} traversal${kernel.traversals === 1 ? '' : 's'}`,
      `${kernel.intermediateArrays} intermediate arrays`,
    ]),
    `${traversalCount} total traversal${traversalCount === 1 ? '' : 's'}`,
    `${intermediateArrays} total intermediate arrays`,
  ]);

  return Object.freeze({
    version: 1,
    sourceId: program.sourceId,
    roots: Object.freeze([...roots]),
    outputs: Object.freeze([...outputs]),
    nodes: Object.freeze(nodes),
    edges: Object.freeze(uniqueEdges),
    kernels: Object.freeze(kernels),
    summary,
    executionText,
    ascii: buildAscii(roots, nodes, uniqueEdges),
  });
}

export function formatCoreSpiritExecutionPlanVisualization(visualization: CoreSpiritExecutionPlanVisualization): string {
  return [visualization.ascii, '', ...visualization.executionText].join('\n');
}

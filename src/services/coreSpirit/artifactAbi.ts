import type { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import { serializeCoreSpiritIr } from './irContract';
import { sha256HexSync, type CoreSpiritArtifactIdentity } from './artifactIdentity';

export const CORE_SPIRIT_ARTIFACT_MAGIC = 'CSPIRIT' as const;
export const CORE_SPIRIT_ARTIFACT_ABI_VERSION = 2 as const;
export const CORE_SPIRIT_RUNTIME_ABI = 5 as const;
export const CORE_SPIRIT_OPTIMIZER_ABI = 3 as const;

export const CORE_SPIRIT_EXECUTION_BACKENDS = [
  'browser-vm',
  'worker-vm',
  'server-vm',
  'backtest-vm',
  'replay-vm',
] as const;

export type CoreSpiritExecutionBackend = typeof CORE_SPIRIT_EXECUTION_BACKENDS[number];

export const CORE_SPIRIT_EXECUTION_CAPABILITIES = [
  'historical',
  'realtime',
  'stateful',
  'event-driven',
  'visual-output',
  'order-routing',
  'multi-timeframe',
] as const;

export type CoreSpiritExecutionCapability = typeof CORE_SPIRIT_EXECUTION_CAPABILITIES[number];

export type CoreSpiritArtifactDebugMap = Readonly<{
  format: 'coreSpirit-source-map';
  version: 1;
  sourceId: string;
  entries: readonly CoreSpiritIrProgram['sourceMap']['entries'][number][];
}>;

export type CoreSpiritArtifactAbi = Readonly<{
  magic: typeof CORE_SPIRIT_ARTIFACT_MAGIC;
  version: typeof CORE_SPIRIT_ARTIFACT_ABI_VERSION;
  runtimeABI: typeof CORE_SPIRIT_RUNTIME_ABI;
  optimizerABI: typeof CORE_SPIRIT_OPTIMIZER_ABI;
  programHash: string;
  sourceHash: string;
  normalizedHash: string;
  semanticHash: string;
  irHash: string;
  artifactHash: string;
  requiredKernels: readonly string[];
  maxLookback: number;
  requiredData: readonly string[];
  executionCapabilities: readonly CoreSpiritExecutionCapability[];
  debugMap: CoreSpiritArtifactDebugMap;
}>;

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function collectRequiredKernels(ir: CoreSpiritIrProgram): string[] {
  return sortedUnique(ir.entry.instructions.flatMap((instruction) => {
    if (instruction.op !== 'call') return [];
    return [instruction.componentId ? `component:${instruction.componentId}` : `builtin:${instruction.name}`];
  }));
}

function collectRequiredData(ir: CoreSpiritIrProgram): string[] {
  return sortedUnique(ir.entry.instructions.flatMap((instruction) => {
    if (instruction.op === 'loadSeries') return [instruction.name];
    if (instruction.op === 'index' && instruction.seriesName) return [instruction.seriesName];
    if (instruction.op === 'call' && instruction.seriesArgs?.length) return instruction.seriesArgs;
    return [];
  }));
}

function collectExecutionCapabilities(ir: CoreSpiritIrProgram): CoreSpiritExecutionCapability[] {
  const capabilities = new Set<CoreSpiritExecutionCapability>(['historical', 'realtime']);
  for (const instruction of ir.entry.instructions) {
    if (instruction.op === 'loadState' || instruction.op === 'setState' || instruction.op === 'setLocal') capabilities.add('stateful');
    if (instruction.op === 'eventGate') capabilities.add('event-driven');
    if (instruction.op === 'call' && instruction.name === '__market_timeframe') capabilities.add('multi-timeframe');
    if (instruction.op === 'emit') {
      capabilities.add('visual-output');
      if (instruction.kind === 'orderIntent') capabilities.add('order-routing');
    }
  }
  return CORE_SPIRIT_EXECUTION_CAPABILITIES.filter((capability) => capabilities.has(capability));
}

function artifactMaterial(abi: Omit<CoreSpiritArtifactAbi, 'artifactHash'>): string {
  // All semantic/runtime/optimizer inputs are already represented by the
  // programHash + IR hash. Keep one canonical final content-address formula.
  return [
    abi.programHash,
    abi.irHash,
    abi.runtimeABI,
    abi.optimizerABI,
  ].join('\n');
}

export function buildCoreSpiritArtifactAbi(
  ir: CoreSpiritIrProgram,
  identity: CoreSpiritArtifactIdentity,
): CoreSpiritArtifactAbi {
  const requiredKernels = collectRequiredKernels(ir);
  const requiredData = collectRequiredData(ir);
  const executionCapabilities = collectExecutionCapabilities(ir);
  const debugMap: CoreSpiritArtifactDebugMap = Object.freeze({
    format: 'coreSpirit-source-map',
    version: 1,
    sourceId: ir.sourceId,
    entries: ir.sourceMap.entries,
  });

  const base: Omit<CoreSpiritArtifactAbi, 'artifactHash'> = Object.freeze({
    magic: CORE_SPIRIT_ARTIFACT_MAGIC,
    version: CORE_SPIRIT_ARTIFACT_ABI_VERSION,
    runtimeABI: CORE_SPIRIT_RUNTIME_ABI,
    optimizerABI: CORE_SPIRIT_OPTIMIZER_ABI,
    programHash: identity.programHash,
    sourceHash: identity.sourceHash,
    normalizedHash: identity.normalizedHash,
    semanticHash: identity.semanticHash,
    irHash: identity.irHash,
    requiredKernels: Object.freeze(requiredKernels),
    maxLookback: ir.maxLookback,
    requiredData: Object.freeze(requiredData),
    executionCapabilities: Object.freeze(executionCapabilities),
    debugMap,
  });

  return Object.freeze({
    ...base,
    artifactHash: sha256HexSync(artifactMaterial(base)),
  });
}

export function artifactIdFor(artifact: { checksum: string; abi?: Pick<CoreSpiritArtifactAbi, 'artifactHash'> }): string {
  return artifact.abi?.artifactHash || artifact.checksum;
}

export function artifactBackendKey(artifactHash: string, backend: CoreSpiritExecutionBackend): string {
  return `${backend}:${artifactHash}`;
}

export function validateCoreSpiritArtifactAbi(value: unknown, ir: CoreSpiritIrProgram): value is CoreSpiritArtifactAbi {
  const abi = value as CoreSpiritArtifactAbi | undefined;
  if (!abi || abi.magic !== CORE_SPIRIT_ARTIFACT_MAGIC || abi.version !== CORE_SPIRIT_ARTIFACT_ABI_VERSION) return false;
  if (abi.runtimeABI !== CORE_SPIRIT_RUNTIME_ABI || abi.optimizerABI !== CORE_SPIRIT_OPTIMIZER_ABI) return false;
  if (!Number.isInteger(abi.maxLookback) || abi.maxLookback !== ir.maxLookback) return false;
  if (!Array.isArray(abi.requiredKernels) || !Array.isArray(abi.requiredData) || !Array.isArray(abi.executionCapabilities)) return false;
  if (!abi.debugMap || abi.debugMap.format !== 'coreSpirit-source-map' || abi.debugMap.version !== 1) return false;

  const identity: CoreSpiritArtifactIdentity = {
    version: 1,
    algorithm: 'SHA-256',
    sourceId: ir.sourceId,
    sourceHash: abi.sourceHash,
    normalizedHash: abi.normalizedHash,
    semanticHash: abi.semanticHash,
    programHash: abi.programHash,
    irHash: abi.irHash,
    artifactHash: abi.artifactHash,
  };

  const expectedIrHash = sha256HexSync(serializeCoreSpiritIr(ir));
  if (identity.irHash !== expectedIrHash) return false;

  const expectedProgramHash = sha256HexSync(`${ir.sourceId}\n${identity.semanticHash}`);
  if (identity.programHash !== expectedProgramHash) return false;

  const rebuilt = buildCoreSpiritArtifactAbi(ir, identity);
  return rebuilt.artifactHash === abi.artifactHash &&
    rebuilt.requiredKernels.join('|') === abi.requiredKernels.join('|') &&
    rebuilt.requiredData.join('|') === abi.requiredData.join('|') &&
    rebuilt.executionCapabilities.join('|') === abi.executionCapabilities.join('|');
}\n
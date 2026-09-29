/**
 * CoreSpirit platform architecture contract (#18).
 *
 * Dependency direction is deliberate:
 *
 *   broker/research/feed adapters -> neutral CoreSpirit host contracts
 *   language -> compiler -> IR -> VM
 *   VM -> signal -> automation -> risk -> policy -> execution adapter -> broker
 *
 * Nothing below the VM should introduce a second language runtime.
 */
export const CORE_SPIRIT_ARCHITECTURE_VERSION = 1 as const;

export type CoreSpiritArchitecturePlane =
  | 'language'
  | 'visual'
  | 'model'
  | 'ir'
  | 'vm'
  | 'data-host'
  | 'canonical-model'
  | 'signal'
  | 'automation'
  | 'risk'
  | 'order-intent'
  | 'execution'
  | 'broker'
  | 'research';

export interface CoreSpiritArchitectureNode {
  id: CoreSpiritArchitecturePlane;
  owner: 'corespirit' | 'tradingcoreos-host' | 'adapter';
  responsibilities: readonly string[];
}

export const CORE_SPIRIT_ARCHITECTURE_NODES: readonly CoreSpiritArchitectureNode[] = [
  { id: 'language', owner: 'corespirit', responsibilities: ['parse', 'resolve', 'type-check', 'capability-check', 'lower'] },
  { id: 'visual', owner: 'corespirit', responsibilities: ['scene graph', 'stable visual identity', 'renderer-neutral output', 'advanced visual data model', 'incremental realtime visual patches'] },
  { id: 'model', owner: 'corespirit', responsibilities: ['typed model ABI', 'feature inputs', 'output contracts'] },
  { id: 'ir', owner: 'corespirit', responsibilities: ['stable executable representation', 'source maps', 'artifact identity'] },
  { id: 'vm', owner: 'corespirit', responsibilities: ['deterministic state', 'series evaluation', 'instruction quotas'] },
  { id: 'data-host', owner: 'tradingcoreos-host', responsibilities: ['feed snapshots', 'historical datasets', 'clock', 'revision lifecycle'] },
  { id: 'canonical-model', owner: 'corespirit', responsibilities: ['instrument identity', 'market/quote/depth vocabulary', 'session context', 'portfolio snapshot contract', 'broker-neutral trading events'] },
  { id: 'signal', owner: 'corespirit', responsibilities: ['normalize VM signals', 'sequence', 'dedupe', 'provenance'] },
  { id: 'automation', owner: 'tradingcoreos-host', responsibilities: ['lifecycle', 'event orchestration', 'order intent creation'] },
  { id: 'risk', owner: 'tradingcoreos-host', responsibilities: ['exposure', 'quantity', 'portfolio risk', 'hard rejection'] },
  { id: 'order-intent', owner: 'tradingcoreos-host', responsibilities: ['approved tradable intent', 'idempotency', 'audit identity'] },
  { id: 'execution', owner: 'tradingcoreos-host', responsibilities: ['policy gate', 'adapter selection', 'submit/receipt'] },
  { id: 'broker', owner: 'adapter', responsibilities: ['credentials', 'venue protocol', 'broker order IDs', 'transport'] },
  { id: 'research', owner: 'tradingcoreos-host', responsibilities: ['datasets', 'replay analysis', 'metrics', 'training orchestration'] },
];

export const CORE_SPIRIT_FORBIDDEN_DEPENDENCIES: readonly [CoreSpiritArchitecturePlane, CoreSpiritArchitecturePlane][] = [
  ['language', 'broker'],
  ['visual', 'broker'],
  ['model', 'broker'],
  ['ir', 'broker'],
  ['vm', 'broker'],
  ['signal', 'broker'],
  ['automation', 'broker'],
  ['risk', 'broker'],
];

export function validateCoreSpiritArchitectureEdges(edges: readonly [CoreSpiritArchitecturePlane, CoreSpiritArchitecturePlane][]): string[] {
  const errors: string[] = [];
  for (const [from, to] of edges) {
    if (CORE_SPIRIT_FORBIDDEN_DEPENDENCIES.some(([a, b]) => a === from && b === to)) {
      errors.push(`forbidden direct dependency: ${from} -> ${to}`);
    }
  }
  return errors;
}

export const CORE_SPIRIT_EXECUTION_GRAPH = Object.freeze([
  'data-host',
  'canonical-model',
  'language',
  'visual',
  'model',
  'ir',
  'vm',
  'signal',
  'automation',
  'risk',
  'order-intent',
  'execution',
  'broker',
] as const);


export const CORE_SPIRIT_PLATFORM_PHILOSOPHY = Object.freeze({
  productCenter: 'trading-system',
  chartCentricity: false,
  canonicalModel: 'CoreSpiritTradingSnapshot',
  compatibilityRule: 'legacy-chart-outputs-adapt-into-scene-graph',
  executionRule: 'all-live-side-effects-remain-host-owned',
} as const);

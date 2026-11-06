/**
 * CoreSpirit platform architecture contract (#18).
 *
 * Dependency direction is deliberate:
 *
 *   market/feed adapters -> neutral CoreSpirit host contracts
 *   language -> compiler -> IR -> VM -> signal -> automation
 *   tradingcoreos-host strategy/risk/order -> order intent -> execution authority
 *   -> execution adapter -> broker
 *
 * CoreSpirit never owns broker access. Vela is a projection/renderer consumer,
 * never the execution authority.
 */
import { CORE_SPIRIT_BROKER_BOUNDARY, validateCoreSpiritBrokerBoundarySource } from './brokerBoundary.ts';

export const CORE_SPIRIT_ARCHITECTURE_VERSION = 1 as const;

export type CoreSpiritArchitecturePlane =
  | 'language'
  | 'visual'
  | 'vela-output-adapter'
  | 'chart-rendering'
  | 'external-compute'
  | 'model'
  | 'ir'
  | 'vm'
  | 'data-host'
  | 'canonical-model'
  | 'signal'
  | 'automation'
  | 'risk'
  | 'order-intent'
  | 'execution-authority'
  | 'execution'
  | 'broker'
  | 'research';

export interface CoreSpiritArchitectureNode {
  id: CoreSpiritArchitecturePlane;
  owner: 'corespirit' | 'tradingcoreos-host' | 'adapter' | 'isolated-host' | 'vela';
  responsibilities: readonly string[];
}

export const CORE_SPIRIT_ARCHITECTURE_NODES: readonly CoreSpiritArchitectureNode[] = [
  { id: 'language', owner: 'corespirit', responsibilities: ['parse', 'resolve', 'type-check', 'capability-check', 'lower'] },
  // CoreSpirit owns the meaning and identity of visual outputs, never chart painting.
  { id: 'visual', owner: 'corespirit', responsibilities: ['plot/fill/shape/drawing semantics', 'stable semantic object identity', 'renderer-neutral output events', 'visual output lifecycle metadata'] },
  // This adapter translates semantic outputs into Vela's native ABI; it is not a renderer.
  { id: 'vela-output-adapter', owner: 'adapter', responsibilities: ['validate visual output ABI', 'map canonical time/price coordinates', 'publish revisioned output patches'] },
  // Vela alone owns chart scene lifecycle, coordinate transforms and pixels.
  { id: 'chart-rendering', owner: 'vela', responsibilities: ['chart scene lifecycle', 'pane/scale/coordinate transforms', 'canvas/webgl painting', 'hit testing and render scheduling'] },
  // External languages compute bounded values in isolated hosts; they do not own semantics or execution.
  { id: 'external-compute', owner: 'isolated-host', responsibilities: ['execute declared numerical exports', 'isolated runtime/process boundary', 'bounded typed tensor inputs and outputs', 'no language/IR/VM/chart/broker authority'] },
  { id: 'model', owner: 'corespirit', responsibilities: ['typed model ABI', 'feature inputs', 'output contracts'] },
  { id: 'ir', owner: 'corespirit', responsibilities: ['stable executable representation', 'source maps', 'artifact identity'] },
  { id: 'vm', owner: 'corespirit', responsibilities: ['canonical IR instruction execution', 'deterministic state', 'series evaluation', 'instruction quotas'] },
  { id: 'data-host', owner: 'tradingcoreos-host', responsibilities: ['feed snapshots', 'historical datasets', 'clock', 'revision lifecycle'] },
  { id: 'canonical-model', owner: 'corespirit', responsibilities: ['instrument identity', 'market/quote/depth vocabulary', 'session context', 'portfolio snapshot contract', 'broker-neutral trading events'] },
  { id: 'signal', owner: 'corespirit', responsibilities: ['normalize VM signals', 'sequence', 'dedupe', 'provenance'] },
  { id: 'automation', owner: 'tradingcoreos-host', responsibilities: ['lifecycle', 'event orchestration', 'order intent creation'] },
  { id: 'risk', owner: 'tradingcoreos-host', responsibilities: ['exposure', 'quantity', 'portfolio risk', 'hard rejection'] },
  { id: 'order-intent', owner: 'tradingcoreos-host', responsibilities: ['approved tradable intent', 'idempotency', 'audit identity'] },
  { id: 'execution-authority', owner: 'tradingcoreos-host', responsibilities: ['single order-intent ingress', 'risk/policy gate', 'idempotent execution authorization', 'audit trail'] },
  { id: 'execution', owner: 'tradingcoreos-host', responsibilities: ['adapter selection', 'submit/receipt', 'reconciliation'] },
  { id: 'broker', owner: 'adapter', responsibilities: ['credentials', 'venue protocol', 'broker order IDs', 'transport'] },
  { id: 'research', owner: 'tradingcoreos-host', responsibilities: ['datasets', 'replay analysis', 'metrics', 'training orchestration'] },
];

export const CORE_SPIRIT_FORBIDDEN_DEPENDENCIES: readonly [CoreSpiritArchitecturePlane, CoreSpiritArchitecturePlane][] = [
  // CoreScript semantics cannot call foreign runtimes directly; the VM host ABI is the only seam.
  ['language', 'external-compute'],
  // A foreign runtime may return typed values only. It cannot compile, execute, draw or trade.
  ['external-compute', 'language'],
  ['external-compute', 'ir'],
  ['external-compute', 'vm'],
  ['external-compute', 'visual'],
  ['external-compute', 'vela-output-adapter'],
  ['external-compute', 'chart-rendering'],
  ['external-compute', 'broker'],
  // CoreSpirit's semantic visual model cannot paint chart pixels or schedule Vela frames.
  ['visual', 'chart-rendering'],
  ['vm', 'chart-rendering'],
  // The output adapter is a one-way conversion boundary, not a compiler or execution host.
  ['vela-output-adapter', 'language'],
  ['vela-output-adapter', 'ir'],
  ['vela-output-adapter', 'vm'],
  ['vela-output-adapter', 'external-compute'],
  // Vela consumes adapted output but never owns CoreScript semantics or VM execution.
  ['chart-rendering', 'language'],
  ['chart-rendering', 'ir'],
  ['chart-rendering', 'vm'],
  ['chart-rendering', 'external-compute'],
  ['chart-rendering', 'broker'],
  // No CoreSpirit semantic/execution plane can reach a broker directly.
  ['language', 'broker'],
  ['visual', 'broker'],
  ['model', 'broker'],
  ['ir', 'broker'],
  ['vm', 'broker'],
  ['signal', 'broker'],
  ['automation', 'broker'],
  ['risk', 'broker'],
  ['order-intent', 'broker'],
  ['execution-authority', 'broker'],
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

export { CORE_SPIRIT_BROKER_BOUNDARY, validateCoreSpiritBrokerBoundarySource };

export const CORE_SPIRIT_EXECUTION_GRAPH = Object.freeze([
  'data-host',
  'canonical-model',
  'language',
  'model',
  'ir',
  'vm',
  'external-compute',
  'visual',
  'vela-output-adapter',
  'chart-rendering',
  'signal',
  'automation',
  'risk',
  'order-intent',
  'execution-authority',
  'execution',
  'broker',
] as const);

export const CORE_SPIRIT_PLATFORM_PHILOSOPHY = Object.freeze({
  productCenter: 'trading-system',
  chartCentricity: false,
  canonicalModel: 'CoreSpiritTradingSnapshot',
  compatibilityRule: 'legacy-chart-outputs-adapt-into-scene-graph',
  languageRule: 'CoreScript owns parsing, name resolution, typing, capability semantics and lowering',
  executionRule: 'the validated canonical CoreSpirit IR is the only executable representation; the CoreSpirit VM owns instruction ordering, control flow and state',
  polyglotRule: 'Python/Rust/C++/Julia/R/ONNX/WASM are isolated compute hosts behind a typed, bounded request/response ABI; they return values and never own language semantics, IR, VM state or side effects',
  visualRule: 'CoreSpirit owns renderer-neutral visual meaning and stable output identity; it does not paint chart pixels or schedule chart frames',
  velaRule: 'Vela owns chart scene lifecycle, panes, scales, coordinate transforms, hit testing, render scheduling and pixel painting; the Vela output adapter is the only CoreSpirit-to-Vela visual boundary and Vela never authorizes broker execution',
  brokerRule: 'CoreSpirit emits broker-neutral order intents; TradingCoreOS execution authority alone may reach broker adapters',
} as const);

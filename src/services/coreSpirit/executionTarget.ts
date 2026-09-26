/**
 * CoreSpirit execution-target contract.
 *
 * Program layer (script/model/strategy/automation) answers what the program is
 * allowed to express. Execution target answers where the same artifact is
 * hosted. Keeping those axes separate prevents Pine-style chart assumptions
 * from becoming language restrictions.
 */
export const CORE_SPIRIT_EXECUTION_TARGET_VERSION = 1 as const;

export type CoreSpiritExecutionTarget =
  | 'chart'
  | 'replay'
  | 'backtest'
  | 'scanner'
  | 'alert'
  | 'server'
  | 'automation'
  | 'research';

export type CoreSpiritTargetCapability =
  | 'series'
  | 'indicators'
  | 'visuals'
  | 'interactive-ui'
  | 'signals'
  | 'market-universe'
  | 'candidate-emission'
  | 'ranking'
  | 'model-output'
  | 'model-inference'
  | 'research-data'
  | 'strategy-events'
  | 'order-intents'
  | 'risk-queries'
  | 'policy-evaluation'
  | 'webhooks'
  | 'multi-symbol-data'
  | 'multi-timeframe-data';

export interface CoreSpiritExecutionTargetProfile {
  readonly target: CoreSpiritExecutionTarget;
  readonly capabilities: readonly CoreSpiritTargetCapability[];
  readonly supportsStatefulSeries: boolean;
  readonly supportsRealtimeRevision: boolean;
  readonly allowsVisualScene: boolean;
  readonly allowsInteractiveUi: boolean;
  readonly allowsOrderIntent: boolean;
}

export const CORE_SPIRIT_EXECUTION_TARGET_PROFILES: Readonly<Record<CoreSpiritExecutionTarget, CoreSpiritExecutionTargetProfile>> = {
  chart: {
    target: 'chart',
    capabilities: ['series', 'indicators', 'visuals', 'interactive-ui', 'signals', 'model-inference', 'multi-symbol-data', 'multi-timeframe-data'],
    supportsStatefulSeries: true,
    supportsRealtimeRevision: true,
    allowsVisualScene: true,
    allowsInteractiveUi: true,
    allowsOrderIntent: false,
  },
  replay: {
    target: 'replay',
    capabilities: ['series', 'indicators', 'visuals', 'interactive-ui', 'signals', 'model-inference', 'multi-symbol-data', 'multi-timeframe-data'],
    supportsStatefulSeries: true,
    supportsRealtimeRevision: false,
    allowsVisualScene: true,
    allowsInteractiveUi: true,
    allowsOrderIntent: false,
  },
  backtest: {
    target: 'backtest',
    capabilities: ['series', 'indicators', 'signals', 'model-inference', 'strategy-events', 'order-intents', 'risk-queries', 'multi-symbol-data', 'multi-timeframe-data'],
    supportsStatefulSeries: true,
    supportsRealtimeRevision: false,
    allowsVisualScene: false,
    allowsInteractiveUi: false,
    allowsOrderIntent: true,
  },
  scanner: {
    target: 'scanner',
    capabilities: ['series', 'indicators', 'signals', 'model-inference', 'market-universe', 'candidate-emission', 'ranking', 'multi-symbol-data', 'multi-timeframe-data'],
    supportsStatefulSeries: true,
    supportsRealtimeRevision: false,
    allowsVisualScene: false,
    allowsInteractiveUi: false,
    allowsOrderIntent: false,
  },
  alert: {
    target: 'alert',
    capabilities: ['series', 'indicators', 'signals', 'model-inference', 'webhooks', 'multi-symbol-data', 'multi-timeframe-data'],
    supportsStatefulSeries: true,
    supportsRealtimeRevision: true,
    allowsVisualScene: false,
    allowsInteractiveUi: false,
    allowsOrderIntent: false,
  },
  server: {
    target: 'server',
    capabilities: ['series', 'indicators', 'signals', 'model-output', 'model-inference', 'webhooks', 'multi-symbol-data', 'multi-timeframe-data'],
    supportsStatefulSeries: true,
    supportsRealtimeRevision: true,
    allowsVisualScene: false,
    allowsInteractiveUi: false,
    allowsOrderIntent: false,
  },
  automation: {
    target: 'automation',
    capabilities: ['signals', 'strategy-events', 'order-intents', 'risk-queries', 'policy-evaluation', 'webhooks'],
    supportsStatefulSeries: false,
    supportsRealtimeRevision: true,
    allowsVisualScene: false,
    allowsInteractiveUi: false,
    allowsOrderIntent: true,
  },
  research: {
    target: 'research',
    capabilities: ['series', 'indicators', 'signals', 'model-output', 'model-inference', 'research-data', 'multi-symbol-data', 'multi-timeframe-data'],
    supportsStatefulSeries: true,
    supportsRealtimeRevision: false,
    allowsVisualScene: false,
    allowsInteractiveUi: false,
    allowsOrderIntent: false,
  },
};

export function canUseExecutionTargetCapability(
  target: CoreSpiritExecutionTarget,
  capability: CoreSpiritTargetCapability,
): boolean {
  return CORE_SPIRIT_EXECUTION_TARGET_PROFILES[target].capabilities.includes(capability);
}

export function validateExecutionTarget(target: CoreSpiritExecutionTarget, requested: readonly CoreSpiritTargetCapability[] = []): string[] {
  const allowed = CORE_SPIRIT_EXECUTION_TARGET_PROFILES[target].capabilities;
  return requested.filter(capability => !allowed.includes(capability)).map(capability => `execution target '${target}' does not allow capability '${capability}'`);
}

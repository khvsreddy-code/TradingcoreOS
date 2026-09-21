import type { CoreSpiritExecutionContext, CoreSpiritExecutionMode } from './types';

export function createCoreSpiritExecutionContext(options: Partial<CoreSpiritExecutionContext> = {}): CoreSpiritExecutionContext {
  const mode: CoreSpiritExecutionMode = options.mode || 'historical';
  const runId = options.runId || `cs-${Date.now().toString(36)}`;
  return {
    mode,
    symbol: options.symbol || '',
    timeframe: options.timeframe || 'unknown',
    timezone: options.timezone || 'Asia/Kolkata',
    startedAt: options.startedAt || Date.now(),
    runId,
    policy: options.policy || { onEveryTick: false, onOrderFill: false, onBarClose: true, onHistoricalTicks: false },
  };
}

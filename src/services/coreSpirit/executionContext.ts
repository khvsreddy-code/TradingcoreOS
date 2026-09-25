import type { CoreSpiritExecutionContext, CoreSpiritExecutionFrame, CoreSpiritExecutionMode } from './types';
import { resolveSession } from './session';

export function createCoreSpiritExecutionContext(options: Partial<CoreSpiritExecutionContext> = {}): CoreSpiritExecutionContext {
  const mode: CoreSpiritExecutionMode = options.mode || 'historical';
  const runId = options.runId || `cs-${Date.now().toString(36)}`;
  const timezone = options.timezone || 'Asia/Kolkata';
  const timestamp = options.frame?.timestamp || options.startedAt || Date.now();
  const session = options.session || resolveSession(timestamp, timezone);
  return {
    mode,
    symbol: options.symbol || '',
    timeframe: options.timeframe || 'unknown',
    timezone,
    startedAt: options.startedAt || Date.now(),
    runId,
    policy: options.policy || { onEveryTick: false, onOrderFill: false, onBarClose: true, onHistoricalTicks: false },
    session,
    frame: options.frame,
  };
}

export function createCoreSpiritExecutionFrame(options: {
  timestamp:number; barIndex:number; symbol:string; timeframe:string; timezone:string; mode:CoreSpiritExecutionMode;
  isRealtime:boolean; isConfirmed:boolean; isNewBar:boolean; revision:number; isFirst:boolean; isLast:boolean;
}): CoreSpiritExecutionFrame & { index:number; time:number; isFirst:boolean; isLast:boolean } {
  return {
    timestamp: options.timestamp,
    barIndex: options.barIndex,
    index: options.barIndex,
    time: options.timestamp,
    symbol: options.symbol,
    timeframe: options.timeframe,
    timezone: options.timezone,
    session: resolveSession(options.timestamp, options.timezone),
    mode: options.mode,
    isRealtime: options.isRealtime,
    isConfirmed: options.isConfirmed,
    isNewBar: options.isNewBar,
    revision: options.revision,
    isFirst: options.isFirst,
    isLast: options.isLast,
  };
}

export type TerminalAlertCondition = 'above' | 'below' | 'crosses_above' | 'crosses_below';

export interface TerminalAlertRuleLike {
  condition: TerminalAlertCondition;
  target_price: number;
  status?: string;
}

export interface TerminalAlertTickLike {
  ltp?: number;
  source?: string;
  receivedAtEpoch?: number;
  receivedAt?: string;
  brokerTimestamp?: number;
  timestamp?: number;
}

/** Only broker-originated, recently received prices can execute a live price alert. */
export function isEligibleTerminalAlertTick(
  tick: TerminalAlertTickLike,
  nowMs = Date.now(),
  maxAgeMs = 30_000,
): boolean {
  const source = String(tick.source || '').toLowerCase();
  if (source !== 'fyers' && source !== 'upstox') return false;

  const price = Number(tick.ltp);
  if (!Number.isFinite(price) || price <= 0) return false;

  // Only the local receive timestamp stamped by TradingCoreRuntime is trusted.
  // Exchange timestamps describe the market event, not when this process received it.
  const receivedAt = Number.isFinite(Number(tick.receivedAtEpoch)) && Number(tick.receivedAtEpoch) > 0
    ? Number(tick.receivedAtEpoch)
    : tick.receivedAt
      ? Date.parse(tick.receivedAt)
      : Number.NaN;
  if (!Number.isFinite(receivedAt) || receivedAt <= 0) return false;

  const normalizedAt = receivedAt < 1_000_000_000_000 ? receivedAt * 1000 : receivedAt;
  const ageMs = nowMs - normalizedAt;
  return ageMs >= -5_000 && ageMs <= Math.max(1_000, maxAgeMs);
}

/** Evaluates a single alert without guessing a prior price for crossover rules. */
export function evaluateTerminalAlertRule(
  rule: TerminalAlertRuleLike,
  previousPrice: number | null | undefined,
  currentPrice: number,
): boolean {
  const target = Number(rule.target_price);
  const current = Number(currentPrice);
  if (rule.status && rule.status !== 'armed') return false;
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(current) || current <= 0) return false;

  switch (rule.condition) {
    case 'above':
      return current > target;
    case 'below':
      return current < target;
    case 'crosses_above': {
      const previous = Number(previousPrice);
      return Number.isFinite(previous) && previous > 0 && previous <= target && current > target;
    }
    case 'crosses_below': {
      const previous = Number(previousPrice);
      return Number.isFinite(previous) && previous > 0 && previous >= target && current < target;
    }
    default:
      return false;
  }
}

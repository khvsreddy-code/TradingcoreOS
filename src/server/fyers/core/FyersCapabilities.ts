/**
 * Trusted, server-side FYERS plan capabilities.
 *
 * FYERS does not expose a reliably documented Prime-entitlement field in the
 * profile response used by TradingCoreOS. Never infer Prime from token shape,
 * user input, headers, query params, or a failed/retried request. Unknown users
 * remain on Standard until an operator configures a verified entitlement.
 */
export type FyersApiPlan = 'standard' | 'prime';
export type FyersCapabilitySource = 'user-override' | 'standard-default';

export type FyersCapabilities = Readonly<{
  plan: FyersApiPlan;
  planSource: FyersCapabilitySource;
  maxQuoteBatch: number;
  maxStreamSymbols: number;
  maxTbtSymbols: number;
  historyDepth: Readonly<{
    /** null means no extra TradingCore date cap; the broker still limits availability and response size. */
    dailyYears: number | null;
    intradayYears: number | null;
    expiredFnoDailyYears: number;
    /** null means governed by the overall Prime Data API quota. */
    expiredFnoIntradayRequestsPerDay: number | null;
  }>;
  secondData: boolean;
  dataApiRateLimits: Readonly<{
    requestsPerSecond: number;
    requestsPerMinute: number;
    requestsPerDay: number;
  }>;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

const STANDARD_CAPABILITIES: Omit<FyersCapabilities, 'planSource'> = Object.freeze({
  plan: 'standard',
  maxQuoteBatch: 50,
  maxStreamSymbols: 50,
  maxTbtSymbols: 1,
  historyDepth: Object.freeze({
    dailyYears: 5,
    intradayYears: 1,
    expiredFnoDailyYears: 2,
    expiredFnoIntradayRequestsPerDay: 10,
  }),
  secondData: false,
  dataApiRateLimits: Object.freeze({
    requestsPerSecond: 5,
    requestsPerMinute: 50,
    requestsPerDay: 5_000,
  }),
});

const PRIME_CAPABILITIES: Omit<FyersCapabilities, 'planSource'> = Object.freeze({
  plan: 'prime',
  maxQuoteBatch: 1_000,
  maxStreamSymbols: 5_000,
  maxTbtSymbols: 15,
  historyDepth: Object.freeze({
    dailyYears: null,
    intradayYears: null,
    expiredFnoDailyYears: 7,
    expiredFnoIntradayRequestsPerDay: null,
  }),
  secondData: true,
  dataApiRateLimits: Object.freeze({
    requestsPerSecond: 10,
    requestsPerMinute: 500,
    requestsPerDay: 500_000,
  }),
});

export const DEFAULT_FYERS_CAPABILITIES: FyersCapabilities = Object.freeze({
  ...STANDARD_CAPABILITIES,
  planSource: 'standard-default',
});

/** Parse only trusted server configuration. Invalid JSON/entries fail closed to Standard. */
function configuredPlanForUser(userId: string, env: Environment): FyersApiPlan | undefined {
  if (!userId.trim()) return undefined;
  const raw = env.FYERS_API_PLAN_BY_USER;
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const plan = (parsed as Record<string, unknown>)[userId.trim()];
    return plan === 'prime' || plan === 'standard' ? plan : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Capabilities are keyed by the authenticated TradingCore user ID, never by
 * a client-supplied plan value. FYERS plan status should be verified by the
 * operator before adding a user to FYERS_API_PLAN_BY_USER.
 */
export function resolveFyersCapabilities(
  userId: string,
  env: Environment = process.env,
): FyersCapabilities {
  const configuredPlan = configuredPlanForUser(userId, env);
  if (configuredPlan === 'prime') {
    return Object.freeze({ ...PRIME_CAPABILITIES, planSource: 'user-override' });
  }
  if (configuredPlan === 'standard') {
    return Object.freeze({ ...STANDARD_CAPABILITIES, planSource: 'user-override' });
  }
  return DEFAULT_FYERS_CAPABILITIES;
}

/** Public, non-secret capability response for diagnostics and clients. */
export function toPublicFyersCapabilities(capabilities: FyersCapabilities) {
  return {
    plan: capabilities.plan,
    planSource: capabilities.planSource,
    maxQuoteBatch: capabilities.maxQuoteBatch,
    maxStreamSymbols: capabilities.maxStreamSymbols,
    maxTbtSymbols: capabilities.maxTbtSymbols,
    historyDepth: capabilities.historyDepth,
    secondData: capabilities.secondData,
    dataApiRateLimits: capabilities.dataApiRateLimits,
  };
}

/** A machine-readable validation error for API-layer capability violations. */
export class FyersCapabilityError extends Error {
  readonly status = 400;
  readonly code: string;
  readonly limit: number;
  readonly plan: FyersApiPlan;

  constructor(message: string, code: string, limit: number, plan: FyersApiPlan) {
    super(message);
    this.name = 'FyersCapabilityError';
    this.code = code;
    this.limit = limit;
    this.plan = plan;
  }
}

export function assertFyersQuoteBatch(
  symbols: readonly string[],
  capabilities: FyersCapabilities,
): void {
  if (symbols.length === 0) {
    throw new FyersCapabilityError('At least one FYERS symbol is required.', 'FYERS_QUOTES_EMPTY', 0, capabilities.plan);
  }
  if (symbols.length > capabilities.maxQuoteBatch) {
    throw new FyersCapabilityError(
      `FYERS ${capabilities.plan} Quotes supports at most ${capabilities.maxQuoteBatch} unique symbols per provider request.`,
      'FYERS_QUOTE_BATCH_LIMIT',
      capabilities.maxQuoteBatch,
      capabilities.plan,
    );
  }
}

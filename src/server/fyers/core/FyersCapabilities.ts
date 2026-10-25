/**
 * Verified server-side FYERS entitlements and conservative API admission budgets.
 * Unknown users always receive Standard capabilities; the browser cannot claim Prime.
 */
export type FyersApiPlan = 'standard' | 'prime';
export type FyersCapabilitySource = 'user-override' | 'standard-default';
export type FyersApiCategory = 'data' | 'user-info' | 'transactions';
export type FyersRequestPriority = 'interactive' | 'normal' | 'background';

export type FyersApiRateLimits = Readonly<{
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerDay: number;
}>;

export type FyersAdmissionBudget = FyersApiRateLimits & Readonly<{
  category: FyersApiCategory;
  safetyMargin: number;
}>;

export type FyersCapabilities = Readonly<{
  plan: FyersApiPlan;
  planSource: FyersCapabilitySource;
  maxQuoteBatch: number;
  maxStreamSymbols: number;
  maxTbtSymbols: number;
  historyDepth: Readonly<{
    dailyYears: number | null;
    intradayYears: number | null;
    expiredFnoDailyYears: number;
    expiredFnoIntradayRequestsPerDay: number | null;
  }>;
  secondData: boolean;
  /** Official FYERS Data API ceilings. */
  dataApiRateLimits: FyersApiRateLimits;
  /** Official FYERS User Info API ceilings. */
  userInfoApiRateLimits: FyersApiRateLimits;
  /** Official FYERS Transaction API ceilings. */
  transactionApiRateLimits: FyersApiRateLimits;
}>;

type Environment = Readonly<Record<string, string | undefined>>;

const STANDARD_CAPABILITIES: Omit<FyersCapabilities, 'planSource'> = Object.freeze({
  plan: 'standard',
  maxQuoteBatch: 50,
  maxStreamSymbols: 100,
  maxTbtSymbols: 1,
  historyDepth: Object.freeze({
    dailyYears: 5,
    intradayYears: 1,
    expiredFnoDailyYears: 2,
    expiredFnoIntradayRequestsPerDay: 10,
  }),
  secondData: false,
  dataApiRateLimits: Object.freeze({ requestsPerSecond: 5, requestsPerMinute: 50, requestsPerDay: 5_000 }),
  userInfoApiRateLimits: Object.freeze({ requestsPerSecond: 10, requestsPerMinute: 200, requestsPerDay: 100_000 }),
  transactionApiRateLimits: Object.freeze({ requestsPerSecond: 10, requestsPerMinute: 200, requestsPerDay: 100_000 }),
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
  dataApiRateLimits: Object.freeze({ requestsPerSecond: 10, requestsPerMinute: 500, requestsPerDay: 500_000 }),
  userInfoApiRateLimits: Object.freeze({ requestsPerSecond: 10, requestsPerMinute: 500, requestsPerDay: 500_000 }),
  transactionApiRateLimits: Object.freeze({ requestsPerSecond: 10, requestsPerMinute: 500, requestsPerDay: 500_000 }),
});

export const DEFAULT_FYERS_CAPABILITIES: FyersCapabilities = Object.freeze({
  ...STANDARD_CAPABILITIES,
  planSource: 'standard-default',
});

/** Keep 20% of each provider ceiling in reserve for retries, reconnects and user actions. */
export const FYERS_ADMISSION_FRACTION = 0.8;

export function resolveFyersAdmissionBudget(
  capabilities: FyersCapabilities,
  category: FyersApiCategory,
): FyersAdmissionBudget {
  const ceilings = category === 'data'
    ? capabilities.dataApiRateLimits
    : category === 'user-info'
      ? capabilities.userInfoApiRateLimits
      : capabilities.transactionApiRateLimits;
  const safe = (value: number) => Math.max(1, Math.floor(value * FYERS_ADMISSION_FRACTION));
  return Object.freeze({
    category,
    requestsPerSecond: safe(ceilings.requestsPerSecond),
    requestsPerMinute: safe(ceilings.requestsPerMinute),
    requestsPerDay: safe(ceilings.requestsPerDay),
    safetyMargin: 0.2,
  });
}

/** Parse only trusted server configuration; invalid values fail closed to Standard. */
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

/** Capabilities come from authenticated TradingCore identity plus trusted server entitlements. */
export function resolveFyersCapabilities(userId: string, env: Environment = process.env): FyersCapabilities {
  const configuredPlan = configuredPlanForUser(userId, env);
  if (configuredPlan === 'prime') return Object.freeze({ ...PRIME_CAPABILITIES, planSource: 'user-override' });
  if (configuredPlan === 'standard') return Object.freeze({ ...STANDARD_CAPABILITIES, planSource: 'user-override' });
  return DEFAULT_FYERS_CAPABILITIES;
}

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
    userInfoApiRateLimits: capabilities.userInfoApiRateLimits,
    transactionApiRateLimits: capabilities.transactionApiRateLimits,
    admissionBudgets: {
      data: resolveFyersAdmissionBudget(capabilities, 'data'),
      userInfo: resolveFyersAdmissionBudget(capabilities, 'user-info'),
      transactions: resolveFyersAdmissionBudget(capabilities, 'transactions'),
    },
  };
}

export class FyersCapabilityError extends Error {
  readonly status = 400;
  readonly code: string;
  readonly limit: number;
  readonly plan: FyersApiPlan;
  readonly requested: number;

  constructor(message: string, code: string, limit: number, plan: FyersApiPlan, requested = 0) {
    super(message);
    this.name = 'FyersCapabilityError';
    this.code = code;
    this.limit = limit;
    this.plan = plan;
    this.requested = requested;
  }
}

export function assertFyersQuoteBatch(symbols: readonly string[], capabilities: FyersCapabilities): void {
  const uniqueCount = new Set(symbols.map(symbol => String(symbol || '').trim()).filter(Boolean)).size;
  if (uniqueCount === 0) {
    throw new FyersCapabilityError('At least one FYERS symbol is required.', 'FYERS_QUOTES_EMPTY', capabilities.maxQuoteBatch, capabilities.plan, 0);
  }
  if (uniqueCount > capabilities.maxQuoteBatch) {
    throw new FyersCapabilityError(
      `FYERS ${capabilities.plan} Quotes supports at most ${capabilities.maxQuoteBatch} unique symbols per provider request.`,
      'FYERS_QUOTE_BATCH_LIMIT',
      capabilities.maxQuoteBatch,
      capabilities.plan,
      uniqueCount,
    );
  }
}

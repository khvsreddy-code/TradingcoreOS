import type { BaseBroker } from '../brokers/adapters/BaseBroker.js';
import type { BrokerOrderPayload } from '../brokers/contracts.js';
import { FyersApiClient } from '../fyers/core/FyersApiClient.js';
import { resolveFyersCapabilities } from '../fyers/core/FyersCapabilities.js';
import { validateFyersManualOrderPreflight } from './fyersOrderExecution.js';
import type { AutomationIntegration } from '../automation/AutomationIntegrationRepository.js';
import { TradingKillSwitchRepository } from '../storage/TradingKillSwitchRepository.js';

export interface AutomationRiskVerdict {
  approved: boolean;
  reason: string;
  checks: Record<string, unknown>[];
  estimatedNotional: number;
  quotedPrice: number;
  projectedSymbolExposure: number;
  projectedAccountExposure: number;
  requiredMargin: number | null;
}

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function findQuote(
  values: Record<string, { ltp: number; timestamp: string }>,
  symbol: string,
): { ltp: number; timestamp: string } | undefined {
  if (values[symbol]) return values[symbol];
  const key = Object.keys(values).find(candidate => candidate.toUpperCase() === symbol.toUpperCase());
  return key ? values[key] : undefined;
}

function readRequiredMargin(value: unknown, depth = 0): number | undefined {
  if (depth > 5 || value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = readRequiredMargin(item, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  for (const key of ['totalMargin', 'total_margin', 'requiredMargin', 'required_margin', 'marginRequired', 'margin_required']) {
    const raw = value[key];
    const number = typeof raw === 'string' && raw.trim() ? Number(raw) : raw;
    if (finite(number) && number >= 0) return number;
  }
  for (const key of ['data', 'result', 'marginDetails', 'margin_details', 'orders', 'order', 'margin']) {
    if (key in value) {
      const found = readRequiredMargin(value[key], depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function fyersOrderType(value: unknown): number {
  const type = String(value ?? 'MARKET').toUpperCase();
  if (type === 'LIMIT') return 1;
  if (type === 'SL') return 3;
  if (type === 'SL-M' || type === 'SLM') return 4;
  return 2;
}

function fyersProduct(value: unknown): string {
  const product = String(value ?? '').toUpperCase();
  return product === 'CNC' ? 'CNC' : product === 'NRML' ? 'MARGIN' : 'INTRADAY';
}

async function estimateFyersRequiredMargin(input: {
  userId: string;
  accessToken: string;
  order: BrokerOrderPayload;
}): Promise<number> {
  const type = fyersOrderType(input.order.orderType);
  const client = new FyersApiClient(
    input.accessToken,
    undefined,
    resolveFyersCapabilities(input.userId),
    input.userId,
  );
  const payload = await client.apiPost<unknown>('/multiorder/margin', {
    data: [{
      symbol: String(input.order.symbol),
      qty: Number(input.order.quantity ?? input.order.qty),
      type,
      side: String(input.order.side).toUpperCase() === 'SELL' ? -1 : 1,
      productType: fyersProduct(input.order.product),
      limitPrice: type === 1 || type === 4 ? Number(input.order.price ?? input.order.limitPrice) : 0,
      stopPrice: type === 3 || type === 4 ? Number(input.order.triggerPrice ?? input.order.stopPrice) : 0,
      disclosedQty: 0,
      validity: String(input.order.validity ?? 'DAY').toUpperCase() === 'IOC' ? 'IOC' : 'DAY',
      offlineOrder: false,
    }],
  });
  const required = readRequiredMargin(payload);
  if (required === undefined) {
    throw new Error('FYERS returned no usable order-margin estimate. Live automation is blocked until margin can be verified.');
  }
  return required;
}

function reject(reason: string, checks: Record<string, unknown>[], values: Partial<AutomationRiskVerdict> = {}): AutomationRiskVerdict {
  return {
    approved: false,
    reason,
    checks,
    estimatedNotional: values.estimatedNotional ?? 0,
    quotedPrice: values.quotedPrice ?? 0,
    projectedSymbolExposure: values.projectedSymbolExposure ?? 0,
    projectedAccountExposure: values.projectedAccountExposure ?? 0,
    requiredMargin: values.requiredMargin ?? null,
  };
}

/**
 * Server-owned automation pre-trade policy. A workflow may request an order but
 * cannot choose its risk limits, skip fresh account/position data, or manufacture
 * a broker margin approval. Every failed/ambiguous prerequisite blocks live submission.
 */
type PreTradeRiskPolicy = Readonly<{
  brokerId: string;
  strategyId?: string;
  allowedSymbols: readonly string[];
  maxOrderQuantity: number;
  maxOrderNotional?: number;
  maxPositionNotional?: number;
  maxAccountExposureNotional?: number;
  marginBufferPercent: number;
}>;

function positiveSetting(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw);
  return finite(value) && value > 0 ? value : fallback;
}

async function evaluatePreTradeRiskWithPolicy(input: {
  userId: string;
  accessToken: string;
  broker: BaseBroker;
  order: BrokerOrderPayload;
  live: boolean;
  policy: PreTradeRiskPolicy;
}): Promise<AutomationRiskVerdict> {
  const checks: Record<string, unknown>[] = [];
  if (input.live) {
    try {
      const activeSwitch = await TradingKillSwitchRepository.activeBlock({
        userId: input.userId,
        brokerId: input.policy.brokerId,
        strategyId: input.policy.strategyId,
      });
      if (activeSwitch) {
        checks.push({ check: 'trading-kill-switch', passed: false, scope: activeSwitch.scope, scopeId: activeSwitch.scopeId });
        return reject(
          `Live order submission is blocked by the active ${activeSwitch.scope} kill switch.${activeSwitch.reason ? ` Reason: ${activeSwitch.reason}` : ''}`,
          checks,
        );
      }
      checks.push({ check: 'trading-kill-switch', passed: true });
    } catch {
      checks.push({ check: 'trading-kill-switch', passed: false, reason: 'unavailable' });
      return reject('Kill-switch state could not be verified. Live order submission is blocked.', checks);
    }
  }
  try {
    if (input.policy.brokerId === 'fyers') {
      validateFyersManualOrderPreflight(input.order);
    } else {
      const manualSymbol = String(input.order.symbol ?? '').trim();
      const manualSide = String(input.order.side ?? '').trim().toUpperCase();
      const manualType = String(input.order.orderType ?? 'MARKET').trim().toUpperCase();
      const manualProduct = String(input.order.product ?? '').trim().toUpperCase();
      const manualQuantity = Number(input.order.quantity ?? input.order.qty);
      if (!/^[A-Z0-9_-]{2,16}:[A-Z0-9&_.-]{1,80}$/i.test(manualSymbol)) throw new Error('Order symbol must be fully qualified.');
      if (manualSide !== 'BUY' && manualSide !== 'SELL') throw new Error('Order side must be BUY or SELL.');
      if (!Number.isSafeInteger(manualQuantity) || manualQuantity < 1) throw new Error('Order quantity must be a positive integer.');
      if (!['MARKET','LIMIT'].includes(manualType)) throw new Error('Unsupported order type for generic pre-trade risk.');
      if (!['CNC','MIS','NRML'].includes(manualProduct)) throw new Error('Unsupported product type for generic pre-trade risk.');
      if (manualType === 'LIMIT' && (!Number.isFinite(Number(input.order.price ?? input.order.limitPrice)) || Number(input.order.price ?? input.order.limitPrice) <= 0)) throw new Error('Limit orders require a positive limit price.');
    }
  } catch (error) {
    return reject(error instanceof Error ? error.message : 'Order payload failed the canonical TradingCore preflight.', checks);
  }

  const symbol = String(input.order.symbol ?? '').trim().toUpperCase();
  const side = String(input.order.side ?? '').trim().toUpperCase();
  const product = String(input.order.product ?? '').trim().toUpperCase();
  const quantity = Number(input.order.quantity ?? input.order.qty);
  if (!input.policy.allowedSymbols.includes(symbol)) return reject('Symbol is outside the integration allowlist.', checks);
  checks.push({ check: 'symbol-allowlist', passed: true });
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > input.policy.maxOrderQuantity) {
    return reject(`Quantity exceeds this integration's per-order cap of ${input.policy.maxOrderQuantity}.`, checks);
  }
  checks.push({ check: 'quantity-cap', passed: true, quantity });

  let quotes: Record<string, { ltp: number; timestamp: string }>;
  let funds: Awaited<ReturnType<BaseBroker['getFunds']>>;
  let positions: Awaited<ReturnType<BaseBroker['getPositions']>>;
  const riskSnapshotStartedAt = Date.now();
  try {
    [quotes, funds, positions] = await Promise.all([
      input.broker.getMarketQuotes(input.accessToken, [symbol]),
      input.broker.getFunds(input.accessToken),
      input.broker.getPositions(input.accessToken),
    ]);
  } catch {
    return reject('Fresh broker quote, funds, and position snapshots are required. The broker risk snapshot could not be verified.', checks);
  }
  const riskSnapshotFetchMs = Date.now() - riskSnapshotStartedAt;
  if (riskSnapshotFetchMs > 8_000) {
    return reject('Broker account and position snapshots took too long to verify. Retry with a fresh snapshot; no order was submitted.', checks);
  }
  checks.push({ check: 'broker-risk-snapshot-latency', passed: true, fetchMs: riskSnapshotFetchMs, maxMs: 8_000 });

  const quoteMaxAgeMs = input.live ? 5_000 : 20_000;
  const validateFreshQuote = (candidate: { ltp: number; timestamp: string } | undefined, label: string) => {
    if (!candidate || !finite(candidate.ltp) || candidate.ltp <= 0) {
      return { ok: false as const, reason: `${label} has no valid broker mark price.` };
    }
    const timestamp = Date.parse(candidate.timestamp);
    const ageMs = Date.now() - timestamp;
    if (!Number.isFinite(timestamp) || ageMs < -2_000 || ageMs > quoteMaxAgeMs) {
      return { ok: false as const, reason: `${label} quote is stale or has an invalid provider timestamp.` };
    }
    return { ok: true as const, ageMs };
  };
  const quote = findQuote(quotes, symbol);
  const targetQuoteCheck = validateFreshQuote(quote, 'Requested symbol');
  if (!targetQuoteCheck.ok) {
    return reject(`${targetQuoteCheck.reason} No order was submitted.`, checks, { quotedPrice: quote?.ltp ?? 0 });
  }
  checks.push({ check: 'fresh-broker-quote', passed: true, ageMs: targetQuoteCheck.ageMs, maxAgeMs: quoteMaxAgeMs });

  if (!finite(funds.availableMargin) || !finite(funds.totalCapital) || funds.availableMargin <= 0 || funds.totalCapital <= 0) {
    return reject('Broker account funds are unavailable or non-positive. Live order submission is blocked.', checks, { quotedPrice: quote.ltp });
  }
  checks.push({ check: 'account-funds-snapshot', passed: true });

  // Manual tickets use conservative server-owned account-relative caps. Automation
  // always supplies stricter integration caps; a caller never controls these values.
  const maxOrderNotional = input.policy.maxOrderNotional
    ?? funds.availableMargin * positiveSetting('TRADINGCORE_MANUAL_MAX_ORDER_MARGIN_MULTIPLE', 2);
  const maxPositionNotional = input.policy.maxPositionNotional
    ?? funds.totalCapital * positiveSetting('TRADINGCORE_MANUAL_MAX_POSITION_CAPITAL_MULTIPLE', 2);
  const maxAccountExposureNotional = input.policy.maxAccountExposureNotional
    ?? funds.totalCapital * positiveSetting('TRADINGCORE_MANUAL_MAX_ACCOUNT_EXPOSURE_MULTIPLE', 5);

  // The returned position LTP is only a convenience display mark, not a safe
  // pre-trade input. Refresh every open position from broker quotes before gross
  // account exposure is computed; absent timestamps/marks cause a hard rejection.
  const otherSymbols = [...new Set(positions
    .filter(position => finite(position.quantity) && position.quantity !== 0)
    .map(position => String(position.symbol ?? '').trim().toUpperCase())
    .filter(positionSymbol => positionSymbol && positionSymbol !== symbol))];
  if (otherSymbols.length > 50) {
    return reject('Account has more than 50 distinct open-position symbols; exposure cannot be refreshed safely within one bounded risk check.', checks, { quotedPrice: quote.ltp });
  }
  let positionQuotes: Record<string, { ltp: number; timestamp: string }> = {};
  if (otherSymbols.length) {
    try {
      positionQuotes = await input.broker.getMarketQuotes(input.accessToken, otherSymbols);
    } catch {
      return reject('Open-position marks could not be refreshed from the broker. Account-wide exposure verification failed; no order was submitted.', checks, { quotedPrice: quote.ltp });
    }
  }
  const totalRiskSnapshotMs = Date.now() - riskSnapshotStartedAt;
  if (totalRiskSnapshotMs > 8_000) {
    return reject('Broker account, position and quote snapshots took too long to verify. Retry with fresh snapshots; no order was submitted.', checks, { quotedPrice: quote.ltp });
  }
  const freshPositionMarks = new Map<string, number>();
  for (const positionSymbol of otherSymbols) {
    const markQuote = findQuote(positionQuotes, positionSymbol);
    const markCheck = validateFreshQuote(markQuote, `Open position ${positionSymbol}`);
    if (!markCheck.ok) {
      return reject(`${markCheck.reason} Account-wide exposure cannot be verified; no order was submitted.`, checks, { quotedPrice: quote.ltp });
    }
    freshPositionMarks.set(positionSymbol, markQuote.ltp);
  }
  checks.push({
    check: 'fresh-open-position-marks',
    passed: true,
    symbolCount: otherSymbols.length,
    totalSnapshotMs: totalRiskSnapshotMs,
    maxSnapshotMs: 8_000,
  });

  const suppliedPrice = Number(input.order.price ?? input.order.limitPrice);
  const orderType = String(input.order.orderType ?? 'MARKET').toUpperCase();
  const basePrice = orderType === 'MARKET' ? quote.ltp : suppliedPrice;
  if (!Number.isFinite(basePrice) || basePrice <= 0) return reject('A positive execution reference price is required.', checks, { quotedPrice: quote.ltp });
  // Market-order risk reserves a 2% adverse-move buffer; limit orders use their
  // hard limit price because the broker cannot execute them beyond that price.
  const riskPrice = orderType === 'MARKET' ? basePrice * 1.02 : basePrice;
  const estimatedNotional = riskPrice * quantity;
  if (!Number.isFinite(estimatedNotional) || estimatedNotional <= 0 || estimatedNotional > maxOrderNotional) {
    return reject(`Estimated order notional exceeds the server-side cap of ${maxOrderNotional}.`, checks, {
      estimatedNotional, quotedPrice: quote.ltp,
    });
  }
  checks.push({ check: 'single-order-notional-cap', passed: true, estimatedNotional });

  const signedQuantity = side === 'SELL' ? -quantity : quantity;
  const existingNetQuantity = positions
    .filter(position => String(position.symbol).toUpperCase() === symbol && finite(position.quantity))
    .reduce((sum, position) => sum + position.quantity, 0);
  const projectedSymbolExposure = Math.abs(existingNetQuantity + signedQuantity) * quote.ltp;
  if (!Number.isFinite(projectedSymbolExposure) || projectedSymbolExposure > maxPositionNotional) {
    return reject(`Projected net exposure exceeds the server-side per-symbol cap of ${maxPositionNotional}.`, checks, {
      estimatedNotional, quotedPrice: quote.ltp, projectedSymbolExposure,
    });
  }
  checks.push({ check: 'projected-position-cap', passed: true, projectedSymbolExposure });

  // Enforce a separate account-wide gross exposure cap. Mark the requested
  // symbol to the fresh quote and every other open position to its broker LTP;
  // missing marks on an open position fail closed instead of silently undercounting.
  let existingGrossExposure = 0;
  let existingSymbolGrossExposure = 0;
  for (const position of positions) {
    if (!finite(position.quantity) || position.quantity === 0) continue;
    const positionSymbol = String(position.symbol).toUpperCase();
    const mark = positionSymbol === symbol ? quote.ltp : freshPositionMarks.get(positionSymbol);
    if (!finite(mark) || mark <= 0) {
      return reject('An open broker position has no valid mark price; account-wide exposure cannot be verified.', checks, {
        estimatedNotional, quotedPrice: quote.ltp, projectedSymbolExposure,
      });
    }
    const exposure = Math.abs(position.quantity) * mark;
    existingGrossExposure += exposure;
    if (positionSymbol === symbol) existingSymbolGrossExposure += exposure;
  }
  const projectedAccountExposure = Math.max(0, existingGrossExposure - existingSymbolGrossExposure + projectedSymbolExposure);
  const accountCapExceeded = projectedAccountExposure > maxAccountExposureNotional;
  const riskReducingWhileOverCap = projectedAccountExposure < existingGrossExposure;
  if (!Number.isFinite(projectedAccountExposure) ||
      (accountCapExceeded && !riskReducingWhileOverCap)) {
    return reject(`Projected account exposure exceeds the server-side account cap of ${maxAccountExposureNotional}.`, checks, {
      estimatedNotional, quotedPrice: quote.ltp, projectedSymbolExposure, projectedAccountExposure,
    });
  }
  checks.push({
    check: 'projected-account-exposure-cap',
    passed: !accountCapExceeded || riskReducingWhileOverCap,
    capExceeded: accountCapExceeded,
    projectedAccountExposure,
    existingGrossExposure,
    riskReducingWhileOverCap,
    reason: accountCapExceeded ? 'Risk-reducing order permitted while exposure is already above its cap.' : 'Projected exposure is within cap.',
  });

  if (product === 'CNC' && side === 'BUY' && estimatedNotional > funds.availableMargin) {
    return reject('Available broker margin is below the conservative cash-delivery notional requirement.', checks, {
      estimatedNotional, quotedPrice: quote.ltp, projectedSymbolExposure,
    });
  }
  if (product === 'CNC' && side === 'SELL') {
    try {
      const holdings = await input.broker.getHoldings(input.accessToken);
      const ownedQuantity = holdings
        .filter(holding => String(holding.symbol).toUpperCase() === symbol && finite(holding.quantity))
        .reduce((sum, holding) => sum + Math.max(0, holding.quantity), 0);
      if (ownedQuantity < quantity) {
        return reject('Cash-delivery sell quantity exceeds the available settled holdings reported by the broker.', checks, {
          estimatedNotional, quotedPrice: quote.ltp, projectedSymbolExposure,
        });
      }
      checks.push({ check: 'delivery-holdings', passed: true, ownedQuantity });
    } catch {
      return reject('Holdings could not be verified for a cash-delivery sell. No order was submitted.', checks, {
        estimatedNotional, quotedPrice: quote.ltp, projectedSymbolExposure, projectedAccountExposure,
      });
    }
  }

  let requiredMargin: number | null = null;
  if (input.live) {
    try {
      if (input.policy.brokerId === 'fyers') {
        requiredMargin = await estimateFyersRequiredMargin({ userId: input.userId, accessToken: input.accessToken, order: input.order });
      } else if (product === 'CNC') {
        // Generic broker adapters do not have a uniform margin-preview contract.
        // For cash delivery we conservatively reserve full buy notional and never
        // infer intraday/derivative margin from an unrelated broker's API shape.
        requiredMargin = side === 'BUY' ? estimatedNotional : 0;
      } else {
        return reject('This broker does not expose a verified margin-preview contract for the requested leveraged product. Live order submission is blocked.', checks, {
          estimatedNotional, quotedPrice: quote.ltp, projectedSymbolExposure, projectedAccountExposure,
        });
      }
    } catch (error) {
      return reject(error instanceof Error ? error.message : 'Broker order-margin check failed.', checks, {
        estimatedNotional, quotedPrice: quote.ltp, projectedSymbolExposure, projectedAccountExposure,
      });
    }
    const bufferedMargin = requiredMargin * (1 + input.policy.marginBufferPercent / 100);
    if (bufferedMargin > funds.availableMargin) {
      return reject('Available broker margin does not cover the broker-calculated requirement plus the configured safety buffer.', checks, {
        estimatedNotional, quotedPrice: quote.ltp, projectedSymbolExposure, projectedAccountExposure, requiredMargin,
      });
    }
    checks.push({
      check: input.policy.brokerId === 'fyers' ? 'broker-calculated-margin' : 'conservative-cash-delivery-margin',
      passed: true,
      marginBufferPercent: input.policy.marginBufferPercent,
      requiredMargin,
      bufferedMargin,
    });
  }

  return {
    approved: true,
    reason: input.live ? 'Configured policy, fresh account/market snapshots, position limits, and broker margin checks passed.' : 'Paper request passed configured policy and fresh broker snapshot checks; no order will be submitted.',
    checks,
    estimatedNotional,
    quotedPrice: quote.ltp,
    projectedSymbolExposure,
    projectedAccountExposure,
    requiredMargin,
  };
}


export async function evaluateAutomationPreTradeRisk(input: {
  userId: string;
  accessToken: string;
  broker: BaseBroker;
  integration: AutomationIntegration;
  order: BrokerOrderPayload;
  live: boolean;
}): Promise<AutomationRiskVerdict> {
  return evaluatePreTradeRiskWithPolicy({
    userId: input.userId,
    accessToken: input.accessToken,
    broker: input.broker,
    order: input.order,
    live: input.live,
    policy: {
      brokerId: input.integration.brokerId,
      strategyId: input.integration.automationId,
      allowedSymbols: input.integration.allowedSymbols,
      maxOrderQuantity: input.integration.maxOrderQuantity,
      maxOrderNotional: input.integration.maxOrderNotional,
      maxPositionNotional: input.integration.maxPositionNotional,
      maxAccountExposureNotional: input.integration.maxAccountExposureNotional,
      marginBufferPercent: input.integration.marginBufferPercent,
    },
  });
}

export async function evaluateManualPreTradeRisk(input: {
  userId: string;
  accessToken: string;
  broker: BaseBroker;
  order: BrokerOrderPayload;
  live: boolean;
}): Promise<AutomationRiskVerdict> {
  const symbol = String(input.order.symbol ?? '').trim().toUpperCase();
  let maxOrderQuantity = Number(process.env.TRADINGCORE_MANUAL_MAX_ORDER_QUANTITY ?? 1000);
  if (input.broker.brokerId === 'fyers') {
    maxOrderQuantity = validateFyersManualOrderPreflight(input.order).maxQuantity;
  } else if (!Number.isSafeInteger(maxOrderQuantity) || maxOrderQuantity < 1) {
    maxOrderQuantity = 1000;
  }
  return evaluatePreTradeRiskWithPolicy({
    userId: input.userId,
    accessToken: input.accessToken,
    broker: input.broker,
    order: input.order,
    live: input.live,
    policy: {
      brokerId: input.broker.brokerId,
      allowedSymbols: [symbol],
      maxOrderQuantity,
      marginBufferPercent: positiveSetting('TRADINGCORE_MANUAL_MARGIN_BUFFER_PERCENT', 20),
    },
  });
}

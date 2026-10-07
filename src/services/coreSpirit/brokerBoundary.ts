/**
 * CoreSpirit broker boundary.
 *
 * CoreSpirit may emit broker-neutral facts, signals, events, and order intents.
 * It must never import broker adapters, broker routes, trading HTTP clients, or
 * invoke broker-side order/account methods directly.
 *
 * The host-owned TradingCoreOS trading plane is the only place where an order
 * intent can enter execution authority and eventually reach a broker adapter.
 */

export const CORE_SPIRIT_BROKER_BOUNDARY_VERSION = 1 as const;

export const CORE_SPIRIT_BROKER_BOUNDARY = Object.freeze({
  owner: 'tradingcoreos-host',
  allowedExecutionOutput: 'orderIntent',
  executionAuthority: 'host-owned',
  brokerAccess: 'adapter-only',
  forbiddenImportFragments: Object.freeze([
    '/services/brokers/',
    '/server/brokers/',
    '../brokers/',
    '../../server/brokers/',
    '/services/engine/',
    '../engine/',
    '/services/http/tradingApi',
    '../http/tradingApi',
    '/server/routes/trading',
    '/server/routes/broker',
    '../../server/routes/trading',
    '../../server/routes/broker',
  ]),
  forbiddenEndpointFragments: Object.freeze([
    '/api/trading',
    '/api/auth/broker',
  ]),
  forbiddenBrokerTypes: Object.freeze([
    'BrokerAdapter',
    'BaseBrokerAdapter',
    'BrokerAdapterRegistry',
    'BrokerManager',
  ]),
  forbiddenBrokerMethods: Object.freeze([
    'placeOrder',
    'modifyOrder',
    'cancelOrder',
    'squareOff',
    'exitAll',
    'subscribeWebSocket',
  ]),
} as const);

function stripCommentsAndStrings(source: string): string {
  return String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, '""');
}

function importSpecifiers(source: string): string[] {
  const specs: string[] = [];
  const importPattern = /\b(?:import|export)\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(source)) !== null) specs.push(match[1]);
  const dynamicImportPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicImportPattern.exec(source)) !== null) specs.push(match[1]);
  return specs;
}

export function validateCoreSpiritBrokerBoundarySource(source: string, filePath = 'CoreSpirit source'): string[] {
  const errors: string[] = [];
  const raw = String(source || '');
  const executable = stripCommentsAndStrings(raw);

  for (const specifier of importSpecifiers(raw)) {
    for (const fragment of CORE_SPIRIT_BROKER_BOUNDARY.forbiddenImportFragments) {
      if (specifier.includes(fragment)) {
        errors.push(`${filePath}: forbidden host/broker dependency import '${specifier}'`);
      }
    }
  }

  for (const typeName of CORE_SPIRIT_BROKER_BOUNDARY.forbiddenBrokerTypes) {
    const pattern = new RegExp(`\\b${typeName}\\b`);
    if (pattern.test(executable)) errors.push(`${filePath}: forbidden broker adapter type/reference '${typeName}'`);
  }

  for (const method of CORE_SPIRIT_BROKER_BOUNDARY.forbiddenBrokerMethods) {
    const pattern = new RegExp(`\\b${method}\\s*\\(`);
    if (pattern.test(executable)) errors.push(`${filePath}: forbidden broker-side method '${method}()'`);
  }

  for (const endpoint of CORE_SPIRIT_BROKER_BOUNDARY.forbiddenEndpointFragments) {
    if (raw.includes(endpoint)) errors.push(`${filePath}: forbidden broker/trading endpoint '${endpoint}'`);
  }

  return [...new Set(errors)];
}

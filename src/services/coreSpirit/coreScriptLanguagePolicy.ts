import type { CoreSpiritAuthoringLevel } from './coreSpiritExecutionModel';
import type { CoreSpiritSurfaceMetadata } from './languageConcepts';

export const CORE_SCRIPT_LANGUAGE = 'CoreScript' as const;
export const CORE_SCRIPT_LANGUAGE_VERSION = 1 as const;

export type CoreScriptRequiredCapability =
  | 'market.tick'
  | 'order.fill'
  | 'position.update'
  | 'risk.evaluate'
  | 'execution.route'
  | 'webhooks'
  | 'automation';

export const CORE_SCRIPT_REQUIRED_CAPABILITIES = Object.freeze([
  'market.tick',
  'order.fill',
  'position.update',
  'risk.evaluate',
  'execution.route',
  'webhooks',
  'automation',
] as const);

export type CoreScriptLanguageFeature =
  | 'beginner'
  | 'trader'
  | 'quant'
  | 'system'
  | 'matrix'
  | 'tensor'
  | 'models'
  | 'research'
  | 'multi-symbol'
  | 'multi-timeframe'
  | 'system-events'
  | 'automation'
  | 'order-intent';

export type CoreScriptCapabilityRequirement = Readonly<{
  capability: CoreScriptRequiredCapability;
  source: string;
  reason: string;
}>;

export type CoreScriptLanguagePolicy = Readonly<{
  language: typeof CORE_SCRIPT_LANGUAGE;
  version: typeof CORE_SCRIPT_LANGUAGE_VERSION;
  level: CoreSpiritAuthoringLevel;
  features: readonly CoreScriptLanguageFeature[];
  requiredCapabilities: readonly CoreScriptRequiredCapability[];
  capabilityRequirements: readonly CoreScriptCapabilityRequirement[];
  beginnerSurface: string;
  traderSurface: string;
  quantSurface: string;
  systemSurface: string;
}>;

const FEATURE_LEVEL: Readonly<Record<CoreScriptLanguageFeature, CoreSpiritAuthoringLevel>> = Object.freeze({
  beginner: 'beginner',
  trader: 'trader',
  quant: 'quant',
  system: 'system',
  matrix: 'quant',
  tensor: 'quant',
  models: 'quant',
  research: 'quant',
  'multi-symbol': 'trader',
  'multi-timeframe': 'trader',
  'system-events': 'system',
  automation: 'system',
  'order-intent': 'trader',
});

const LEVEL_RANK: Readonly<Record<CoreSpiritAuthoringLevel, number>> = Object.freeze({
  beginner: 0,
  trader: 1,
  quant: 2,
  system: 3,
});

const CAPABILITY_ALIASES: Readonly<Record<string, CoreScriptRequiredCapability | undefined>> = Object.freeze({
  'market.tick': 'market.tick',
  'market-events': 'market.tick',
  'order.fill': 'order.fill',
  'order-events': 'order.fill',
  'position.update': 'position.update',
  'position-events': 'position.update',
  'risk.evaluate': 'risk.evaluate',
  risk: 'risk.evaluate',
  'execution.route': 'execution.route',
  'execution-routing': 'execution.route',
  'webhooks': 'webhooks',
  'automation': 'automation',
});

export function normalizeCoreScriptCapability(value: string): CoreScriptRequiredCapability | undefined {
  return CAPABILITY_ALIASES[value.trim().toLowerCase()];
}

export function coreScriptCapabilityForEvent(eventName: string): CoreScriptRequiredCapability | undefined {
  const normalized = eventName.trim().toLowerCase();
  if (normalized === 'market.tick' || normalized.startsWith('market.tick(')) return 'market.tick';
  if (normalized === 'order.fill' || normalized.startsWith('order.fill(')) return 'order.fill';
  if (normalized === 'position.update' || normalized.startsWith('position.update(')) return 'position.update';
  return undefined;
}

function rank(level: CoreSpiritAuthoringLevel): number {
  return LEVEL_RANK[level];
}

function maxLevel(a: CoreSpiritAuthoringLevel, b: CoreSpiritAuthoringLevel): CoreSpiritAuthoringLevel {
  return rank(a) >= rank(b) ? a : b;
}

export function inferCoreScriptLevel(input: {
  baseLevel?: CoreSpiritAuthoringLevel;
  hasModel?: boolean;
  hasResearch?: boolean;
  hasMatrix?: boolean;
  hasTensor?: boolean;
  hasMultiSymbol?: boolean;
  hasMultiTimeframe?: boolean;
  hasSystemEvent?: boolean;
  hasAutomation?: boolean;
  hasOrderIntent?: boolean;
}): CoreSpiritAuthoringLevel {
  let level = input.baseLevel ?? 'beginner';
  if (input.hasMultiSymbol || input.hasMultiTimeframe || input.hasOrderIntent) level = maxLevel(level, 'trader');
  if (input.hasModel || input.hasResearch || input.hasMatrix || input.hasTensor) level = maxLevel(level, 'quant');
  if (input.hasSystemEvent || input.hasAutomation) level = maxLevel(level, 'system');
  return level;
}

export function validateCoreScriptCapabilityRequirements(
  source: string,
  surface: CoreSpiritSurfaceMetadata,
): { requirements: readonly CoreScriptCapabilityRequirement[]; errors: readonly string[] } {
  const requirements: CoreScriptCapabilityRequirement[] = [];
  const errors: string[] = [];
  const declared = new Set(surface.requiredCapabilities ?? []);

  const add = (capability: CoreScriptRequiredCapability, reason: string, sourceText: string): void => {
    requirements.push(Object.freeze({ capability, reason, source: sourceText }));
  };

  for (const line of String(source ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = line.trim();
    const on = trimmed.match(/^on\s+([A-Za-z_][A-Za-z0-9_.]*(?:\([^\n]+\))?)(?:\s*\{)?\s*$/i);
    if (on) {
      const capability = coreScriptCapabilityForEvent(on[1]);
      if (capability) add(capability, `system event '${on[1]}' requires an explicit CoreScript capability`, trimmed);
    }
  }

  if (/\b(?:automation\.route|route\s+order\s+through\s+broker\s*\()/i.test(source)) {
    add('execution.route', 'broker routing is a host-owned execution route and requires explicit execution.route capability', 'execution route');
  }
  if (/\b(?:risk\.allowed|risk\.evaluate)\s*\(/i.test(source)) {
    add('risk.evaluate', 'risk queries cross the host risk boundary and require explicit risk.evaluate capability', 'risk query');
  }
  if (/\bwebhook\s*\(/i.test(source)) {
    add('webhooks', 'webhook delivery requires explicit webhooks capability', 'webhook');
  }
  if (/\bautomation\.notify\s*\(/i.test(source)) {
    add('automation', 'automation notifications require explicit automation capability', 'automation.notify');
  }
  if (/\bautomate\s+(?:["'][^"']+["']|[A-Za-z_][A-Za-z0-9_]*)\s*:/i.test(source)) {
    add('automation', 'automation declarations require explicit automation capability', 'automation declaration');
  }

  const uniqueRequirements = [...new Map(requirements.map(item => [item.capability, item])).values()];
  for (const requirement of uniqueRequirements) {
    if (!declared.has(requirement.capability)) {
      errors.push(`CoreScript capability '${requirement.capability}' is required by ${requirement.source}; declare it with 'requires ${requirement.capability}'.`);
    }
  }
  return {
    requirements: Object.freeze(uniqueRequirements),
    errors: Object.freeze(errors),
  };
}

export function buildCoreScriptLanguagePolicy(input: {
  level: CoreSpiritAuthoringLevel;
  features: readonly CoreScriptLanguageFeature[];
  requiredCapabilities: readonly CoreScriptRequiredCapability[];
  capabilityRequirements: readonly CoreScriptCapabilityRequirement[];
}): CoreScriptLanguagePolicy {
  return Object.freeze({
    language: CORE_SCRIPT_LANGUAGE,
    version: CORE_SCRIPT_LANGUAGE_VERSION,
    level: input.level,
    features: Object.freeze([...new Set(input.features)]),
    requiredCapabilities: Object.freeze([...new Set(input.requiredCapabilities)]),
    capabilityRequirements: Object.freeze([...input.capabilityRequirements]),
    beginnerSurface: 'Readable market data, values, conditions and visuals on the same CoreScript language.',
    traderSurface: 'Inputs, strategies, multi-symbol/timeframe data, signals and broker-neutral order intents on the same CoreScript language.',
    quantSurface: 'Typed features, matrices/tensors, statistics, model declarations, predictions and research on the same CoreScript language.',
    systemSurface: 'Explicit host events, automation and execution routing with declared capabilities on the same CoreScript language.',
  });
}

export function requiredCapabilitiesForSurface(surface: CoreSpiritSurfaceMetadata): readonly CoreScriptRequiredCapability[] {
  return Object.freeze([...(surface.requiredCapabilities ?? [])]);
}

export function isFeatureAllowedForLevel(feature: CoreScriptLanguageFeature, level: CoreSpiritAuthoringLevel): boolean {
  return rank(level) >= rank(FEATURE_LEVEL[feature]);
}

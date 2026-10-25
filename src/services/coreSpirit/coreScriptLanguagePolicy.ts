import type { CoreSpiritAstNode } from './ast';
import { CoreSpiritParser } from './parser';
import { normalizeCoreSpiritSource } from './syntax';
import { coreSpiritAuthoringLevelRank, inferCoreSpiritRequiredLevel, type CoreSpiritAuthoringLevel } from './coreSpiritExecutionModel';
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
  | 'automation'
  | 'ai.invoke';

export const CORE_SCRIPT_REQUIRED_CAPABILITIES = Object.freeze([
  'market.tick',
  'order.fill',
  'position.update',
  'risk.evaluate',
  'execution.route',
  'webhooks',
  'automation',
  'ai.invoke',
] as const);

export type CoreScriptLanguageFeature =
  | 'beginner'
  | 'trader'
  | 'quant'
  | 'system'
  | 'strategy'
  | 'matrix'
  | 'tensor'
  | 'models'
  | 'research'
  | 'multi-symbol'
  | 'multi-timeframe'
  | 'system-events'
  | 'automation'
  | 'order-intent'
  | 'ai-invocation';

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
  strategy: 'trader',
  matrix: 'quant',
  tensor: 'quant',
  models: 'quant',
  research: 'quant',
  'multi-symbol': 'trader',
  'multi-timeframe': 'trader',
  'system-events': 'system',
  automation: 'system',
  'order-intent': 'trader',
  'ai-invocation': 'system',
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
  'ai.invoke': 'ai.invoke',
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
  return coreSpiritAuthoringLevelRank(level);
}

/** Compatibility facade: precedence is owned by coreSpiritExecutionModel. */
export function inferCoreScriptLevel(input: {
  baseLevel?: CoreSpiritAuthoringLevel;
  hasModel?: boolean;
  hasResearch?: boolean;
  hasMatrix?: boolean;
  hasTensor?: boolean;
  hasMultiSymbol?: boolean;
  hasMultiTimeframe?: boolean;
  hasStrategy?: boolean;
  hasSystemEvent?: boolean;
  hasAutomation?: boolean;
  hasOrderIntent?: boolean;
  hasAiInvoke?: boolean;
}): CoreSpiritAuthoringLevel {
  return inferCoreSpiritRequiredLevel({
    baseLevel:input.baseLevel,
    model:input.hasModel,
    research:input.hasResearch,
    matrix:input.hasMatrix,
    tensor:input.hasTensor,
    multiSymbol:input.hasMultiSymbol,
    multiTimeframe:input.hasMultiTimeframe,
    strategy:input.hasStrategy,
    systemEvent:input.hasSystemEvent,
    automation:input.hasAutomation,
    orderIntent:input.hasOrderIntent,
    aiInvoke:input.hasAiInvoke,
  });
}

function astCalleeName(node: CoreSpiritAstNode): string {
  switch (node.type) {
    case 'identifier': return node.name;
    case 'member': return astCalleeName(node.target) + '.' + node.member;
    case 'memberCall': return astCalleeName(node.target) + '.' + node.member;
    default: return '';
  }
}

/**
 * Authoritative capability analysis over the canonical AST. Comments, string literals,
 * formatting and identifier substrings cannot request privileged host capabilities.
 * The semantic dependency nodes supplement the AST for declaration concepts (such as
 * AUTOMATE) whose metadata is emitted by the canonical semantic pass.
 */
export function validateCoreScriptCapabilityRequirementsFromAst(
  ast: CoreSpiritAstNode,
  surface: CoreSpiritSurfaceMetadata,
  semanticNodes: readonly { kind?: string; name?: string }[] = [],
): { requirements: readonly CoreScriptCapabilityRequirement[]; errors: readonly string[] } {
  const requirements: CoreScriptCapabilityRequirement[] = [];
  const errors: string[] = [];
  const declared = new Set(surface.requiredCapabilities ?? []);

  const add = (capability: CoreScriptRequiredCapability, reason: string, sourceText: string): void => {
    requirements.push(Object.freeze({ capability, reason, source: sourceText }));
  };
  const callRequirement = (name: string): void => {
    const normalized = name.toLowerCase();
    if (normalized === 'automation.route' || normalized === 'route order through broker') {
      add('execution.route', 'broker routing is a host-owned execution route and requires explicit execution.route capability', name);
    }
    if (normalized === 'risk.allowed' || normalized === 'risk.evaluate') {
      add('risk.evaluate', 'risk queries cross the host risk boundary and require explicit risk.evaluate capability', name);
    }
    if (normalized === 'webhook' || normalized.endsWith('.webhook')) {
      add('webhooks', 'webhook delivery requires explicit webhooks capability', name);
    }
    if (normalized === 'automation.notify') {
      add('automation', 'automation notifications require explicit automation capability', name);
    }
  };

  const visit = (node: CoreSpiritAstNode): void => {
    switch (node.type) {
      case 'program':
        node.body.forEach(visit);
        return;
      case 'onEvent': {
        const capability = coreScriptCapabilityForEvent(node.eventName);
        if (capability) add(capability, `system event '${node.eventName}' requires an explicit CoreScript capability`, 'on ' + node.eventName);
        node.body.forEach(visit);
        return;
      }
      case 'let':
      case 'assignment':
        visit(node.expression);
        return;
      case 'expressionStatement':
        visit(node.expression);
        return;
      case 'if':
        visit(node.condition);
        node.thenBranch.forEach(visit);
        (node.elseBranch ?? []).forEach(visit);
        return;
      case 'unary':
        visit(node.operand);
        return;
      case 'binary':
        visit(node.left);
        visit(node.right);
        return;
      case 'call':
        callRequirement(node.name);
        node.args.forEach(visit);
        return;
      case 'memberCall':
        callRequirement(astCalleeName(node));
        visit(node.target);
        node.args.forEach(visit);
        return;
      case 'member':
        visit(node.target);
        return;
      case 'index':
        visit(node.target);
        visit(node.index);
        return;
      case 'typeDeclaration':
      case 'number':
      case 'string':
      case 'boolean':
      case 'null':
      case 'identifier':
        return;
      default: {
        const exhaustive: never = node;
        return exhaustive;
      }
    }
  };

  visit(ast);
  if (surface.declarations.some(declaration => declaration.kind === 'automation') ||
      semanticNodes.some(node => node.kind === 'automation')) {
    add('automation', 'AUTOMATE declarations require explicit automation capability', 'automation declaration');
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

/**
 * Compatibility entrypoint for callers that have source but not a compiler AST.
 * The source is normalized and parsed once, then all capability decisions are made
 * from syntax nodes. Parse failure is fail-closed rather than guessing with regex.
 */
export function validateCoreScriptCapabilityRequirements(
  source: string,
  surface: CoreSpiritSurfaceMetadata,
): { requirements: readonly CoreScriptCapabilityRequirement[]; errors: readonly string[] } {
  try {
    const ast = new CoreSpiritParser(normalizeCoreSpiritSource(String(source ?? ''))).parse();
    return validateCoreScriptCapabilityRequirementsFromAst(ast, surface);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      requirements: Object.freeze([]),
      errors: Object.freeze([`Unable to validate CoreScript host capabilities from source syntax: ${message}`]),
    };
  }
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

/**
 * UI affordance check only. It must never be used to authorize compilation,
 * sandbox operations, event subscriptions or broker/order execution. Required
 * capabilities are derived from source and enforced by compiler + host runtime.
 */
export function isFeatureAllowedForLevel(feature: CoreScriptLanguageFeature, level: CoreSpiritAuthoringLevel): boolean {
  return rank(level) >= rank(FEATURE_LEVEL[feature]);
}

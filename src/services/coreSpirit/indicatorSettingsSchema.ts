/**
 * Schema-driven indicator definition/settings contract.
 *
 * The editor must not contain indicator-specific UI knowledge. An indicator
 * publishes a serializable definition; the universal editor renders it.
 * Runtime computation remains separate from this metadata contract.
 */

import { buildIndicatorAppearanceSnapshot } from './indicatorAppearance';

export const INDICATOR_SETTINGS_SCHEMA_VERSION = 3 as const;

export type IndicatorJsonValue = string | number | boolean | null | IndicatorJsonValue[] | { [key: string]: IndicatorJsonValue };
export type IndicatorSettingPrimitive = string | number | boolean;
export type IndicatorSettingValue = IndicatorSettingPrimitive | readonly string[];
export type IndicatorSettingFieldKind = 'integer' | 'number' | 'decimal' | 'select' | 'enum' | 'multi-select' | 'color' | 'range' | 'boolean' | 'text' | 'string' | 'source' | 'timeframe' | 'symbol' | 'session' | 'price' | 'duration';
export type IndicatorParameterType = IndicatorSettingFieldKind;
export type IndicatorSettingsSectionId = 'inputs' | 'style' | 'display' | 'behavior' | 'alerts' | 'visualization';
export type IndicatorPaneMode = 'auto' | 'overlay' | 'separate';
export type IndicatorScaleMode = 'price' | 'percent' | 'indexed' | 'log';

export type IndicatorSettingOption = Readonly<{
  value: IndicatorSettingPrimitive;
  label: string;
}>;

export type IndicatorSettingConditionOperator = 'equals' | 'notEquals' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual' | 'in' | 'notIn' | 'truthy' | 'falsy' | 'between' | 'notBetween' | 'matches' | 'isEmpty' | 'notEmpty';

export type IndicatorSettingCondition =
  | Readonly<{ path: string; operator: IndicatorSettingConditionOperator; value?: IndicatorSettingPrimitive | null; values?: readonly IndicatorSettingPrimitive[] }>
  | Readonly<{ all: readonly IndicatorSettingCondition[] }>
  | Readonly<{ any: readonly IndicatorSettingCondition[] }>
  | Readonly<{ not: IndicatorSettingCondition }>;

/** v2 compatibility alias retained for existing publications. */
export type IndicatorSettingVisibility = Readonly<{
  path: string;
  equals: IndicatorSettingPrimitive | null;
}>;

export type IndicatorSettingValidation = Readonly<{
  required?: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  errorMessage?: string;
}>;

export type IndicatorSettingField = Readonly<{
  id: string;
  path: string;
  label: string;
  kind: IndicatorSettingFieldKind;
  defaultValue: IndicatorSettingValue;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly IndicatorSettingOption[];
  visibleWhen?: IndicatorSettingVisibility;
  dependency?: IndicatorSettingCondition;
  visibilityCondition?: IndicatorSettingCondition;
  enabledWhen?: IndicatorSettingCondition;
  advanced?: boolean;
  readonly?: boolean;
  unit?: string;
  group?: string;
  tooltip?: string;
  placeholder?: string;
  validation?: IndicatorSettingValidation;
}>;

export type IndicatorParameterDefinition = IndicatorSettingField;

export type IndicatorSettingsSection = Readonly<{
  id: IndicatorSettingsSectionId;
  label: string;
  description: string;
  fields: readonly IndicatorSettingField[];
  notes?: readonly string[];
}>;

export type IndicatorDefinitionIdentity = Readonly<{
  kind: string;
  title: string;
  definitionVersion: number;
  source: 'native' | 'corespirit' | 'community';
}>;

export type IndicatorSettingsCapabilities = Readonly<{
  rendererNeutral: true;
  incrementalExecution: boolean;
  multiOutput: boolean;
  alertsSchema: 'declared' | 'not-declared';
  behaviorSchema: 'declared' | 'not-declared';
  visualizationSchema: 'declared' | 'not-declared';
}>;

export type IndicatorSettingsSchema = Readonly<{
  version: typeof INDICATOR_SETTINGS_SCHEMA_VERSION;
  id: string;
  identity: IndicatorDefinitionIdentity;
  layout: Readonly<{
    defaultPane: IndicatorPaneMode;
    allowedPanes: readonly IndicatorPaneMode[];
    defaultScale: IndicatorScaleMode;
    allowedScales: readonly IndicatorScaleMode[];
  }>;
  outputs: readonly string[];
  capabilities: IndicatorSettingsCapabilities;
  sections: readonly IndicatorSettingsSection[];
  /** Calculation parameters only; presentation fields are deliberately excluded. */
  parameters: readonly IndicatorParameterDefinition[];
}>;

export const CORE_PRICE_SOURCE_OPTIONS: readonly IndicatorSettingOption[] = [
  { value: 'close', label: 'Close' },
  { value: 'open', label: 'Open' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
  { value: 'hl2', label: 'HL2 (High+Low)/2' },
  { value: 'hlc3', label: 'HLC3 (Typical)' },
  { value: 'ohlc4', label: 'OHLC4' },
  { value: 'hlcc4', label: 'HLCC4' },
];

const PANE_MODES: readonly IndicatorSettingOption[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'overlay', label: 'Price' },
  { value: 'separate', label: 'Separate pane' },
];
const SCALE_MODES: readonly IndicatorSettingOption[] = [
  { value: 'price', label: 'Price' },
  { value: 'percent', label: 'Percent' },
  { value: 'indexed', label: 'Indexed' },
  { value: 'log', label: 'Log' },
];
const LINE_STYLES: readonly IndicatorSettingOption[] = [
  { value: 0, label: 'Solid' },
  { value: 1, label: 'Dotted' },
  { value: 2, label: 'Dashed' },
];
const ANCHOR_OPTIONS: readonly IndicatorSettingOption[] = [
  { value: 'Swing High', label: 'Swing High' },
  { value: 'Swing Low', label: 'Swing Low' },
  { value: 'Day Start', label: 'Day Start' },
  { value: 'Week Start', label: 'Week Start' },
  { value: 'Month Start', label: 'Month Start' },
  { value: 'Visible Range Start', label: 'Visible Range Start' },
  { value: 'Manual Time', label: 'Manual Time' },
];

const SOURCE_KINDS = new Set([
  'EMA', 'SMA', 'HMA', 'VWAP', 'Bollinger Bands', 'Keltner Channels', 'RSI', 'CCI', 'MFI', 'OBV', 'Anchored VWAP', 'VWAP Deviation Bands',
]);

const PERIOD_DEFAULTS: Readonly<Record<string, { value: number; label?: string; min?: number; max?: number }>> = Object.freeze({
  EMA: { value: 20 }, SMA: { value: 20 }, HMA: { value: 20 }, RSI: { value: 14, min: 2 }, ATR: { value: 14 }, ADX: { value: 14 }, CCI: { value: 20 }, MFI: { value: 14 },
  'Bollinger Bands': { value: 20 }, 'Keltner Channels': { value: 20 }, 'Donchian Channels': { value: 20 }, Supertrend: { value: 10 }, Stochastic: { value: 14 },
  'Market Structure': { value: 3, min: 2 }, 'Swing Levels': { value: 3, min: 2 }, 'Opening Range': { value: 15, label: 'Duration', min: 1, max: 240 }, 'Opening Range Pro': { value: 30, label: 'Duration', min: 1, max: 240 },
  'Equal Highs/Lows': { value: 3, min: 2 }, 'Liquidity Pools': { value: 5, min: 2 }, 'Order Blocks': { value: 5, min: 2 }, 'Order Blocks + Mitigation': { value: 5, min: 2 }, 'Breakout / Retest': { value: 5, min: 2 }, 'Failed Breakout': { value: 5, min: 2 },
  'TradingCore V Price Action': { value: 5, min: 2, max: 50 }, 'Adaptive Ehlers': { value: 20 }, 'ATR Percentile Bands': { value: 14 }, 'CVD Profiles': { value: 20 }, 'Delta Sigma Heatmap': { value: 20 }, 'Dual Phase Reversal': { value: 14 },
  'Fractional EMA Kalman Filter': { value: 20 }, 'Harmonic Lab': { value: 5, min: 2 }, 'HTF 3 Candle System': { value: 3, min: 2 }, 'HTF Volume Spike & Imbalance Projection': { value: 20 }, 'Initial Balance Auction Intelligence': { value: 60, label: 'Duration', min: 1, max: 480 },
  'LTF Volume Microburst Bubbles': { value: 20 }, 'Market Structure Dashboard': { value: 5 }, 'Neural Weight Oscillator': { value: 20 }, 'OrderBlock AI': { value: 5 }, 'Pivot Consolidation Zone': { value: 5 }, 'Stoploss Cascades': { value: 20 },
  'Trend Pressure': { value: 14 }, 'Trend Target Ribbon': { value: 20 }, Trinity: { value: 14 }, 'Volatility Shock Half Life Monitor': { value: 20 }, 'Volume Delta Footprint': { value: 20 }, Wyckoff: { value: 20 },
});

const MULTIPLIER_DEFAULTS: Readonly<Record<string, number>> = Object.freeze({
  'Bollinger Bands': 2, 'Keltner Channels': 2, Supertrend: 3, 'VWAP Deviation Bands': 1, 'TradingCore V Price Action': 2,
  'ATR Percentile Bands': 2, 'HTF Volume Spike & Imbalance Projection': 2, 'Initial Balance Auction Intelligence': 1,
  'LTF Volume Microburst Bubbles': 2, OrderBlockAI: 2, 'OrderBlock AI': 2, 'Stoploss Cascades': 2, 'Trend Target Ribbon': 2,
});

const SIGNAL_COLOR_KINDS = new Set(['MACD', 'Stochastic', 'Supertrend', 'Ichimoku Cloud']);
const CHANNEL_COLOR_KINDS = new Set(['Bollinger Bands', 'Keltner Channels', 'Donchian Channels', 'Ichimoku Cloud', 'VWAP Deviation Bands']);
const DEFAULT_COLORS: Readonly<Record<string, string>> = Object.freeze({ EMA: '#38bdf8', SMA: '#f59e0b', HMA: '#e879f9', VWAP: '#c084fc', RSI: '#f59e0b', MACD: '#38bdf8', ATR: '#22c55e', ADX: '#22c55e', CCI: '#fb7185', OBV: '#60a5fa', MFI: '#a78bfa' });

const OUTPUTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'Bollinger Bands': ['middle', 'upper', 'lower'],
  'Keltner Channels': ['middle', 'upper', 'lower'],
  'Donchian Channels': ['upper', 'lower'],
  MACD: ['macd', 'signal', 'histogram'],
  Stochastic: ['k', 'd'],
  'Ichimoku Cloud': ['tenkan', 'kijun', 'spanA', 'spanB'],
  Supertrend: ['value', 'direction'],
  'Market Structure': ['swingHigh', 'swingLow', 'bos', 'choch'],
  'Fair Value Gaps': ['zones'],
  'Order Blocks': ['zones'],
  'Order Blocks + Mitigation': ['zones', 'mitigation'],
  'FVG + Mitigation': ['zones', 'mitigation'],
  'Signals': ['markers'],
});

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72) || 'indicator';
}

function currentValue(item: Record<string, unknown> | undefined, path: string): unknown {
  let node: unknown = item;
  for (const segment of path.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const SAFE_SETTING_PATH = /^[A-Za-z][A-Za-z0-9._-]{0,95}$/;
const UNSAFE_SETTING_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function isSafeSettingPath(path: string): boolean {
  if (!SAFE_SETTING_PATH.test(path)) return false;
  return path.split('.').every(segment => !UNSAFE_SETTING_SEGMENTS.has(segment));
}

function fieldId(path: string): string { return path.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(); }

const COMMON_TIMEFRAME_OPTIONS: readonly IndicatorSettingOption[] = Object.freeze([
  { value: '1m', label: '1 minute' }, { value: '3m', label: '3 minutes' }, { value: '5m', label: '5 minutes' },
  { value: '10m', label: '10 minutes' }, { value: '15m', label: '15 minutes' }, { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' }, { value: '4h', label: '4 hours' }, { value: '1D', label: '1 day' },
  { value: '1W', label: '1 week' }, { value: '1M', label: '1 month' },
]);

function conditionLeaf(condition: IndicatorSettingCondition): condition is Exclude<IndicatorSettingCondition, { all: readonly IndicatorSettingCondition[] } | { any: readonly IndicatorSettingCondition[] } | { not: IndicatorSettingCondition }> {
  return typeof condition === 'object' && condition !== null && 'path' in condition;
}

export function evaluateIndicatorSettingCondition(item: Record<string, unknown>, condition: IndicatorSettingCondition, depth = 0): boolean {
  if (!condition || typeof condition !== 'object' || depth > 8) return false;
  if (conditionLeaf(condition)) {
    const actual = currentValue(item, condition.path);
    switch (condition.operator) {
      case 'equals': return actual === condition.value;
      case 'notEquals': return actual !== condition.value;
      case 'greaterThan': return Number(actual) > Number(condition.value);
      case 'greaterThanOrEqual': return Number(actual) >= Number(condition.value);
      case 'lessThan': return Number(actual) < Number(condition.value);
      case 'lessThanOrEqual': return Number(actual) <= Number(condition.value);
      case 'in': return Array.isArray(condition.values) && condition.values.length > 0 && condition.values.some(value => actual === value);
      case 'notIn': return Array.isArray(condition.values) && condition.values.length > 0 && !condition.values.some(value => actual === value);
      case 'truthy': return Boolean(actual);
      case 'falsy': return !Boolean(actual);
      case 'between': {
        const bounds = condition.values ?? [];
        return bounds.length === 2 && Number(actual) >= Number(bounds[0]) && Number(actual) <= Number(bounds[1]);
      }
      case 'notBetween': {
        const bounds = condition.values ?? [];
        return bounds.length === 2 && (Number(actual) < Number(bounds[0]) || Number(actual) > Number(bounds[1]));
      }
      case 'matches': {
        if (typeof actual !== 'string' || typeof condition.value !== 'string') return false;
        try { return new RegExp(condition.value).test(actual); } catch { return false; }
      }
      case 'isEmpty': return actual == null || (typeof actual === 'string' && actual.trim() === '') || (Array.isArray(actual) && actual.length === 0);
      case 'notEmpty': return !(actual == null || (typeof actual === 'string' && actual.trim() === '') || (Array.isArray(actual) && actual.length === 0));
    }
  }
  if ('all' in condition) return Array.isArray(condition.all) && condition.all.length > 0 && condition.all.length <= 16 && condition.all.every(child => evaluateIndicatorSettingCondition(item, child, depth + 1));
  if ('any' in condition) return Array.isArray(condition.any) && condition.any.length > 0 && condition.any.length <= 16 && condition.any.some(child => evaluateIndicatorSettingCondition(item, child, depth + 1));
  if ('not' in condition) {
    if (!condition.not || typeof condition.not !== 'object' || depth >= 8) return false;
    return !evaluateIndicatorSettingCondition(item, condition.not, depth + 1);
  }
  return false;
}

function fieldVisibilityCondition(field: IndicatorSettingField): IndicatorSettingCondition | undefined {
  return field.visibilityCondition ?? field.dependency ?? (field.visibleWhen ? { path: field.visibleWhen.path, operator: 'equals' as const, value: field.visibleWhen.equals } : undefined);
}

export function isIndicatorSettingFieldVisible(item: Record<string, unknown>, field: IndicatorSettingField): boolean {
  const condition = fieldVisibilityCondition(field);
  return condition ? evaluateIndicatorSettingCondition(item, condition) : true;
}

export function isIndicatorSettingFieldEnabled(item: Record<string, unknown>, field: IndicatorSettingField): boolean {
  if (field.readonly) return false;
  return field.enabledWhen ? evaluateIndicatorSettingCondition(item, field.enabledWhen) : true;
}

function conditionPaths(condition: IndicatorSettingCondition, out = new Set<string>(), depth = 0): Set<string> {
  if (!condition || depth > 8) return out;
  if (conditionLeaf(condition)) out.add(condition.path);
  else if ('all' in condition) condition.all.forEach(child => conditionPaths(child, out, depth + 1));
  else if ('any' in condition) condition.any.forEach(child => conditionPaths(child, out, depth + 1));
  else if ('not' in condition) conditionPaths(condition.not, out, depth + 1);
  return out;
}

function detectConditionCycles(fields: readonly IndicatorSettingField[]): string[] {
  const graph = new Map<string, Set<string>>();
  for (const field of fields) {
    const refs = new Set<string>();
    if (fieldVisibilityCondition(field)) conditionPaths(fieldVisibilityCondition(field)!, refs);
    if (field.enabledWhen) conditionPaths(field.enabledWhen, refs);
    refs.delete(field.path);
    graph.set(field.path, refs);
  }
  const errors: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const visit = (path: string) => {
    if (visiting.has(path)) {
      const cycle = [...stack.slice(stack.indexOf(path)), path].join(' -> ');
      errors.push(`parameter dependency cycle detected: ${cycle}`);
      return;
    }
    if (visited.has(path)) return;
    visiting.add(path); stack.push(path);
    for (const next of graph.get(path) ?? []) if (graph.has(next)) visit(next);
    stack.pop(); visiting.delete(path); visited.add(path);
  };
  for (const path of graph.keys()) visit(path);
  return [...new Set(errors)];
}

function validateCondition(condition: IndicatorSettingCondition, knownPaths: Set<string>, ownerPath: string, depth = 0, fieldByPath: ReadonlyMap<string, IndicatorSettingField>): string[] {
  if (!condition || typeof condition !== 'object') return [`invalid parameter dependency for '${ownerPath}'`];
  if (depth > 8) return [`parameter dependency for '${ownerPath}' is deeper than the maximum nesting depth`];
  if (conditionLeaf(condition)) {
    const errors: string[] = [];
    const numericOperators = new Set(['greaterThan','greaterThanOrEqual','lessThan','lessThanOrEqual','between','notBetween']);
    const target = fieldByPath.get(condition.path);
    const numericKinds = new Set<IndicatorSettingFieldKind>(['integer','number','decimal','range','price','duration']);
    const selectableKinds = new Set<IndicatorSettingFieldKind>(['select','enum','source','timeframe','multi-select']);
    if (!isSafeSettingPath(condition.path)) errors.push(`invalid dependency path '${condition.path}' for '${ownerPath}'`);
    else if (!knownPaths.has(condition.path)) errors.push(`dependency '${condition.path}' for '${ownerPath}' is not declared`);
    if (numericOperators.has(condition.operator) && target && !numericKinds.has(target.kind)) errors.push(`numeric dependency '${ownerPath}' targets non-numeric '${condition.path}'`);
    if (condition.operator === 'matches' && target && !['text','string','symbol','session'].includes(target.kind)) errors.push(`matches dependency '${ownerPath}' targets non-string '${condition.path}'`);
    if ((condition.operator === 'in' || condition.operator === 'notIn') && target && !selectableKinds.has(target.kind) && !['string','symbol','session'].includes(target.kind)) errors.push(`membership dependency '${ownerPath}' targets unsupported '${condition.path}'`);
    if (condition.path === ownerPath) errors.push(`setting '${ownerPath}' cannot depend on itself`);
    if (['in','notIn','between','notBetween'].includes(condition.operator) && (!Array.isArray(condition.values) || condition.values.length !== (condition.operator === 'between' || condition.operator === 'notBetween' ? 2 : 1) && condition.values.length < 1)) errors.push(`dependency '${ownerPath}' requires valid values for ${condition.operator}`);
    if (['equals','notEquals','greaterThan','greaterThanOrEqual','lessThan','lessThanOrEqual','matches'].includes(condition.operator) && condition.value === undefined) errors.push(`dependency '${ownerPath}' requires a value for ${condition.operator}`);
    if (['isEmpty','notEmpty','truthy','falsy'].includes(condition.operator) && (condition.value !== undefined || condition.values !== undefined)) errors.push(`dependency '${ownerPath}' cannot supply values for ${condition.operator}`);
    if (!['in','notIn','between','notBetween'].includes(condition.operator) && condition.values !== undefined && !['isEmpty','notEmpty','truthy','falsy'].includes(condition.operator)) errors.push(`dependency '${ownerPath}' cannot use values with ${condition.operator}`);
    if (numericOperators.has(condition.operator) && condition.value !== undefined && typeof condition.value !== 'number') errors.push(`numeric dependency '${ownerPath}' requires a numeric value`);
    if (['between','notBetween'].includes(condition.operator) && Array.isArray(condition.values) && condition.values.some(value => typeof value !== 'number')) errors.push(`numeric dependency '${ownerPath}' requires numeric bounds`);
    if (condition.operator === 'matches' && typeof condition.value !== 'string') errors.push(`matches dependency '${ownerPath}' requires a string pattern`);
    return errors;
  }
  if ('all' in condition) return !Array.isArray(condition.all) || condition.all.length === 0 || condition.all.length > 16 ? [`dependency '${ownerPath}' has an invalid all group`] : condition.all.flatMap(child => validateCondition(child, knownPaths, ownerPath, depth + 1, fieldByPath));
  if ('any' in condition) return !Array.isArray(condition.any) || condition.any.length === 0 || condition.any.length > 16 ? [`dependency '${ownerPath}' has an invalid any group`] : condition.any.flatMap(child => validateCondition(child, knownPaths, ownerPath, depth + 1, fieldByPath));
  if ('not' in condition) return validateCondition(condition.not, knownPaths, ownerPath, depth + 1, fieldByPath);
  return [`invalid parameter dependency for '${ownerPath}'`];
}

export function validateIndicatorSettingValue(field: IndicatorSettingField, value: unknown): string | null {
  const emptyString = typeof value === 'string' && value.trim() === '';
  const stringKinds = new Set<IndicatorSettingFieldKind>(['color','text','string','source','timeframe','symbol','session']);
  const numericKinds = new Set<IndicatorSettingFieldKind>(['integer','number','decimal','range','price','duration']);
  if (stringKinds.has(field.kind) && typeof value !== 'string') return `${field.label} must be text.`;
  if (numericKinds.has(field.kind) && typeof value !== 'number') return `${field.label} must be numeric.`;
  if (field.kind === 'boolean' && typeof value !== 'boolean') return `${field.label} must be boolean.`;
  if ((field.kind === 'enum' || field.kind === 'select') && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return `${field.label} has an invalid selection.`;
  if (field.kind === 'multi-select' && !Array.isArray(value)) return `${field.label} must be a multi-selection.`;
  if (field.kind === 'color' && typeof value === 'string' && !/^(?:#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([^)]*\))$/i.test(value.trim())) return `${field.label} must be a valid color value.`;
  if ((field.kind === 'source' || field.kind === 'timeframe' || field.kind === 'symbol') && typeof value === 'string' && value.trim() === '') return `${field.label} cannot be empty.`;
  if (field.kind === 'duration' && typeof value === 'number' && value < 0) return `${field.label} cannot be negative.`;
  if (field.kind === 'session' && typeof value === 'string' && value.trim() !== '' && !/^(?:[01]\d|2[0-3]):?[0-5]\d-(?:[01]\d|2[0-3]):?[0-5]\d$/.test(value.trim())) return `${field.label} must use HHMM-HHMM or HH:MM-HH:MM.`;
  if (field.kind === 'timeframe' && typeof value === 'string' && value.trim() !== '' && !/^(?:[1-9]\d*(?:s|m|h|d|w)?|1D|1W|1M|D|W|M|tick)$/i.test(value.trim())) return `${field.label} has an unsupported timeframe format.`;
  if (field.validation?.required && (value == null || emptyString)) return field.validation.errorMessage ?? `${field.label} is required.`;
  if (typeof value === 'string') {
    if (field.validation?.minLength != null && value.length < field.validation.minLength) return field.validation.errorMessage ?? `${field.label} must be at least ${field.validation.minLength} characters.`;
    if (field.validation?.maxLength != null && value.length > field.validation.maxLength) return field.validation.errorMessage ?? `${field.label} must be at most ${field.validation.maxLength} characters.`;
    if (field.validation?.pattern) {
      try { if (!new RegExp(field.validation.pattern).test(value)) return field.validation.errorMessage ?? `${field.label} has an invalid format.`; }
      catch { return 'Invalid parameter validation pattern.'; }
    }
  }
  if ((field.kind === 'integer' || field.kind === 'number' || field.kind === 'decimal' || field.kind === 'range' || field.kind === 'price' || field.kind === 'duration') && typeof value === 'number') {
    if (!Number.isFinite(value)) return `${field.label} must be finite.`;
    if (field.kind === 'integer' && !Number.isInteger(value)) return `${field.label} must be an integer.`;
    if (field.min != null && value < field.min) return `${field.label} must be ≥ ${field.min}.`;
    if (field.max != null && value > field.max) return `${field.label} must be ≤ ${field.max}.`;
    if (field.step != null && field.min != null) {
      const ratio = (value - field.min) / field.step;
      if (Math.abs(ratio - Math.round(ratio)) > 1e-7) return `${field.label} must use step ${field.step}.`;
    }
  }
  if ((field.kind === 'enum' || field.kind === 'select' || field.kind === 'source' || field.kind === 'timeframe') && field.options?.length) {
    if (!field.options.some(option => option.value === value)) return `${field.label} has an unsupported option.`;
  }
  if (field.kind === 'multi-select' && Array.isArray(value) && field.options?.length) {
    const allowed = new Set(field.options.map(option => String(option.value)));
    if (value.some(entry => !allowed.has(String(entry)))) return `${field.label} contains an unsupported option.`;
  }
  return null;
}


export type IndicatorParameterDependencyGraph = Readonly<{
  order: readonly string[];
  dependencies: Readonly<Record<string, readonly string[]>>;
  dependents: Readonly<Record<string, readonly string[]>>;
}>;

export function buildIndicatorParameterDependencyGraph(schema: IndicatorSettingsSchema): IndicatorParameterDependencyGraph {
  const fields = schema.parameters;
  const dependencies = new Map<string, Set<string>>(fields.map(field => [field.path, new Set<string>()]));
  for (const field of fields) {
    const refs = dependencies.get(field.path)!;
    const collect = (condition?: IndicatorSettingCondition): void => {
      if (!condition) return;
      if (conditionLeaf(condition)) { refs.add(condition.path); return; }
      if ('all' in condition) { condition.all.forEach(child => collect(child)); return; }
      if ('any' in condition) { condition.any.forEach(child => collect(child)); return; }
      if ('not' in condition) collect(condition.not);
    };
    collect(field.dependency); collect(field.visibilityCondition); collect(field.enabledWhen);
    refs.delete(field.path);
  }
  const dependents = new Map<string, Set<string>>(fields.map(field => [field.path, new Set<string>()]));
  for (const [owner, refs] of dependencies) for (const dependency of refs) dependents.get(dependency)?.add(owner);
  const indegree = new Map<string, number>(fields.map(field => [field.path, 0]));
  for (const [owner, refs] of dependencies) indegree.set(owner, [...refs].filter(ref => dependencies.has(ref)).length);
  const queue = fields.map(field => field.path).filter(path => indegree.get(path) === 0);
  const order: string[] = [];
  while (queue.length) {
    const current = queue.shift()!; order.push(current);
    for (const next of dependents.get(current) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1; indegree.set(next, nextDegree);
      if (nextDegree === 0) queue.push(next);
    }
  }
  const fallback = fields.map(field => field.path);
  return Object.freeze({
    order: Object.freeze(order.length === fields.length ? order : fallback),
    dependencies: Object.freeze(Object.fromEntries([...dependencies].map(([key, value]) => [key, Object.freeze([...value])] ))),
    dependents: Object.freeze(Object.fromEntries([...dependents].map(([key, value]) => [key, Object.freeze([...value])] ))),
  });
}

export function getIndicatorParameterDependents(schema: IndicatorSettingsSchema, changedPath: string): readonly string[] {
  const graph = buildIndicatorParameterDependencyGraph(schema);
  const seen = new Set<string>(); const queue = [changedPath];
  while (queue.length) {
    const current = queue.shift()!;
    for (const dependent of graph.dependents[current] ?? []) if (!seen.has(dependent)) { seen.add(dependent); queue.push(dependent); }
  }
  return Object.freeze([...seen].sort());
}

export type ResolvedIndicatorParameterState = Readonly<{
  values: Readonly<Record<string, IndicatorSettingValue>>;
  visible: Readonly<Record<string, boolean>>;
  enabled: Readonly<Record<string, boolean>>;
  errors: Readonly<Record<string, string>>;
  valid: boolean;
  dependencyGraph: IndicatorParameterDependencyGraph;
}>;

export function resolveIndicatorParameterState(schema: IndicatorSettingsSchema, item: Record<string, unknown>): ResolvedIndicatorParameterState {
  const values: Record<string, IndicatorSettingValue> = {};
  const visible: Record<string, boolean> = {};
  const enabled: Record<string, boolean> = {};
  const errors: Record<string, string> = {};
  const dependencyGraph = buildIndicatorParameterDependencyGraph(schema);
  const byPath = new Map(schema.parameters.map(parameter => [parameter.path, parameter] as const));
  // Visibility must be evaluated against the fully default-resolved parameter
  // state, not the sparse persisted object. Otherwise a dependency on another
  // parameter's default can incorrectly appear hidden on first load.
  let evaluationItem: Record<string, unknown> = { ...item };
  for (const parameter of schema.parameters) {
    const value = readIndicatorSettingValue(item, parameter.path);
    const resolved: IndicatorSettingValue = value === undefined ? parameter.defaultValue : value as IndicatorSettingValue;
    values[parameter.path] = resolved;
    if (value === undefined) {
      evaluationItem = { ...evaluationItem, ...writeIndicatorSettingValue(evaluationItem, parameter.path, resolved) };
    }
  }
  for (const path of dependencyGraph.order) {
    const parameter = byPath.get(path);
    if (!parameter) continue;
    const isVisible = isIndicatorSettingFieldVisible(evaluationItem, parameter);
    const isEnabled = isIndicatorSettingFieldEnabled(evaluationItem, parameter);
    visible[parameter.path] = isVisible;
    enabled[parameter.path] = isEnabled;
    if (isVisible) {
      const error = validateIndicatorSettingValue(parameter, values[parameter.path]);
      if (error) errors[parameter.path] = error;
    }
  }
  return Object.freeze({
    values: Object.freeze(values),
    visible: Object.freeze(visible),
    enabled: Object.freeze(enabled),
    errors: Object.freeze(errors),
    valid: Object.keys(errors).length === 0,
    dependencyGraph,
  });
}

function parameterFromField(field: IndicatorSettingField): IndicatorParameterDefinition {
  return Object.freeze({ ...field, group: field.group ?? 'Calculation', tooltip: field.tooltip ?? field.description });
}

function parametersFromSections(sections: readonly IndicatorSettingsSection[]): readonly IndicatorParameterDefinition[] {
  return Object.freeze(sections.filter(section => section.id === 'inputs').flatMap(section => section.fields.map(parameterFromField)));
}

function integerField(path: string, label: string, defaultValue: number, min = 1, max = 500, unit?: string): IndicatorSettingField {
  return { id: fieldId(path), path, label, kind: 'integer', defaultValue, min, max, step: 1, unit };
}
function numberField(path: string, label: string, defaultValue: number, min = 0.1, max = 10, step = 0.1, unit?: string): IndicatorSettingField {
  return { id: fieldId(path), path, label, kind: 'number', defaultValue, min, max, step, unit };
}
function selectField(path: string, label: string, defaultValue: IndicatorSettingPrimitive, options: readonly IndicatorSettingOption[], description?: string): IndicatorSettingField {
  return { id: fieldId(path), path, label, kind: 'select', defaultValue, options, description };
}
function multiSelectField(path: string, label: string, defaultValue: readonly string[], options: readonly IndicatorSettingOption[], description?: string): IndicatorSettingField {
  return { id: fieldId(path), path, label, kind: 'multi-select', defaultValue, options, description };
}
function colorField(path: string, label: string, defaultValue: string, description?: string): IndicatorSettingField {
  return { id: fieldId(path), path, label, kind: 'color', defaultValue, description };
}
function booleanField(path: string, label: string, defaultValue: boolean, description?: string): IndicatorSettingField {
  return { id: fieldId(path), path, label, kind: 'boolean', defaultValue, description };
}
function advanced<T extends IndicatorSettingField>(field: T): T {
  return { ...field, advanced: true };
}

function nativeSchema(kind: string, item?: Record<string, unknown>): IndicatorSettingsSchema {
  const overlay = item?.display && typeof item.display === 'object'
    ? ((item.display as Record<string, unknown>).pane === 'separate' ? false : true)
    : !['RSI', 'MACD', 'ATR', 'ADX', 'Stochastic', 'CCI', 'OBV', 'MFI', 'Neural Weight Oscillator', 'Trend Pressure'].includes(kind);
  const inputs: IndicatorSettingField[] = [];
  if (SOURCE_KINDS.has(kind)) {
    const sourceDefault = kind === 'VWAP' || kind === 'CCI' || kind === 'MFI' ? 'hlc3' : 'close';
    inputs.push({ ...selectField('source', 'Source', sourceDefault, CORE_PRICE_SOURCE_OPTIONS), kind: 'source' });
  }
  const periodSpec = PERIOD_DEFAULTS[kind];
  if (periodSpec) {
    const fallback = periodSpec.value;
    inputs.push(periodSpec.label === 'Duration'
      ? { ...integerField('period', periodSpec.label, fallback, periodSpec.min ?? 1, periodSpec.max ?? 500, 'min'), kind: 'duration' as const }
      : integerField('period', periodSpec.label || 'Period', fallback, periodSpec.min ?? 1, periodSpec.max ?? 500));
  }
  if (kind === 'MACD') {
    inputs.push(integerField('fast', 'Fast', 12, 2, 200));
    inputs.push(integerField('slow', 'Slow', 26, 3, 500));
    inputs.push(integerField('signal', 'Signal', 9, 2, 200));
  }
  if (kind === 'Stochastic') {
    inputs.push(integerField('smooth', '%K Smooth', 3, 1, 50));
    inputs.push(integerField('signal', '%D Smooth', 3, 1, 50));
  }
  if (kind === 'Ichimoku Cloud') {
    inputs.push(integerField('slow', 'Base', 26, 3, 200));
    inputs.push(integerField('displacement', 'Displacement', 26, 1, 200));
  }
  const multiplier = MULTIPLIER_DEFAULTS[kind];
  if (multiplier !== undefined) inputs.push(numberField('multiplier', kind === 'VWAP Deviation Bands' ? 'Deviation Multiplier' : 'Multiplier', multiplier, 0.1, 10, 0.1));
  if (kind === 'Anchored VWAP') inputs.push(selectField('anchor', 'Anchor', 'Swing High', ANCHOR_OPTIONS));
  if (kind === 'Anchored VWAP') inputs.push(integerField('lookback', 'Swing lookback', 5, 2, 100));

  const primary = DEFAULT_COLORS[kind] || '#94a3b8';
  const outputs = OUTPUTS[kind] ?? ['value'];
  const timeframeOptions: readonly IndicatorSettingOption[] = COMMON_TIMEFRAME_OPTIONS;
  const markerKinds = new Set(['Market Structure','BOS / CHOCH','Fair Value Gaps','FVG + Mitigation','Order Blocks','Order Blocks + Mitigation','Signals','Rejection Candles','Inside Bar Breakout','Engulfing Patterns','Pin Bars','NR7 Volatility Contraction','Liquidity Sweeps','Equal Highs/Lows','LTF Volume Microburst Bubbles']);
  const levelKinds = new Set(['Pivot Points','CPR','Key Levels','Opening Range','Opening Range Pro','Weekly Levels','Swing Levels','Gap Levels','Previous Day Levels','Previous Week Levels','Previous Month Levels','CPR R1-R5 / S1-S5','Camarilla Pivots','Fibonacci Pivots','Weekly Pivots','Monthly Pivots','Developing Day High/Low','Dynamic Support/Resistance','Liquidity Pools']);
  const style: IndicatorSettingField[] = [
    colorField('appearance.line.color', 'Line color', primary),
    advanced(numberField('appearance.line.opacity', 'Line opacity', 1, 0.05, 1, 0.05)),
    integerField('appearance.line.width', 'Line width', 2, 1, 8),
    selectField('appearance.line.style', 'Line style', 'solid', [
      { value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' },
    ]),
    booleanField('appearance.line.gradient', 'Line gradient', false),
    advanced(colorField('appearance.line.gradientColor', 'Gradient end color', '#60a5fa')),
    booleanField('appearance.line.glow', 'Glow', false),
    advanced(numberField('appearance.line.glowStrength', 'Glow strength', 0.35, 0.05, 1, 0.05)),
    advanced(integerField('appearance.line.zoomMinBars', 'Show when ≥ bars', 0, 0, 50000)),
    advanced(integerField('appearance.line.zoomMaxBars', 'Show when ≤ bars', 0, 0, 50000)),
    advanced(multiSelectField('appearance.line.timeframes', 'Visible timeframes', [], timeframeOptions, 'Empty means every timeframe.')),
  ];
  if (SIGNAL_COLOR_KINDS.has(kind)) style.push(colorField('signalColor', 'Signal color', '#c084fc'));
  if (CHANNEL_COLOR_KINDS.has(kind)) {
    style.push(colorField('upperColor', 'Upper color', '#60a5fa'));
    style.push(colorField('lowerColor', 'Lower color', '#60a5fa'));
    style.push(booleanField('appearance.fill.enabled', 'Fill enabled', true));
    style.push(colorField('appearance.fill.upperColor', 'Fill upper color', '#60a5fa'));
    style.push(colorField('appearance.fill.lowerColor', 'Fill lower color', '#60a5fa'));
    style.push(advanced(numberField('appearance.fill.opacity', 'Fill opacity', 0.18, 0.02, 1, 0.02)));
    style.push(booleanField('appearance.fill.gradient', 'Fill gradient', true));
    style.push(advanced(booleanField('appearance.fill.conditional', 'Conditional coloring', false)));
    style.push(advanced(colorField('appearance.fill.bullishColor', 'Bullish fill', '#22c55e')));
    style.push(advanced(colorField('appearance.fill.bearishColor', 'Bearish fill', '#ef4444')));
  }
  if (markerKinds.has(kind) || outputs.includes('markers')) {
    style.push(booleanField('appearance.marker.enabled', 'Markers enabled', markerKinds.has(kind)));
    style.push(selectField('appearance.marker.shape', 'Marker shape', 'circle', [
      { value: 'circle', label: 'Circle' }, { value: 'square', label: 'Square' }, { value: 'diamond', label: 'Diamond' },
      { value: 'triangleUp', label: 'Triangle up' }, { value: 'triangleDown', label: 'Triangle down' }, { value: 'arrowUp', label: 'Arrow up' },
      { value: 'arrowDown', label: 'Arrow down' }, { value: 'cross', label: 'Cross' }, { value: 'star', label: 'Star' },
    ]));
    style.push(integerField('appearance.marker.size', 'Marker size', 6, 2, 18));
    style.push(selectField('appearance.marker.position', 'Marker position', 'aboveBar', [
      { value: 'aboveBar', label: 'Above bar' }, { value: 'belowBar', label: 'Below bar' }, { value: 'inBar', label: 'In bar' },
    ]));
    style.push(colorField('appearance.marker.color', 'Marker color', primary));
    style.push(advanced({ ...integerField('appearance.marker.textSize', 'Marker text size', 10, 6, 24), unit: 'px' }));
    style.push(advanced({ ...integerField('appearance.marker.offset', 'Marker offset', 0, -24, 24), unit: 'px' }));
    style.push(advanced({ id: fieldId('appearance.marker.text'), path: 'appearance.marker.text', label: 'Marker text', kind: 'text', defaultValue: '' }));
  }
  if (levelKinds.has(kind)) {
    style.push(colorField('appearance.levels.color', 'Level color', primary));
    style.push(integerField('appearance.levels.width', 'Level width', 1, 1, 6));
    style.push(selectField('appearance.levels.style', 'Level style', 'dashed', [
      { value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' },
    ]));
    style.push(selectField('appearance.levels.extension', 'Level extension', 'both', [
      { value: 'none', label: 'None' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'both', label: 'Both' },
    ]));
    style.push(booleanField('appearance.levels.label', 'Level label', true));
    style.push(advanced(selectField('appearance.levels.labelPlacement', 'Label placement', 'axis', [
      { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'axis', label: 'Axis' }, { value: 'inline', label: 'Inline' },
    ])));
  }

  const display: IndicatorSettingField[] = [
    booleanField('enabled', 'Visible', true),
    booleanField('display.showLegend', 'Show legend', true),
    booleanField('display.showValues', 'Show values', true),
    selectField('appearance.pane.mode', 'Pane', 'auto', PANE_MODES),
    selectField('appearance.pane.scale', 'Scale', 'price', SCALE_MODES),
    advanced(selectField('appearance.pane.scaleMode', 'Scale mode', 'auto', [{ value: 'auto', label: 'Auto' }, { value: 'manual', label: 'Manual' }])),
    advanced({ ...numberField('appearance.pane.min', 'Minimum', 0, -1_000_000_000, 1_000_000_000, 0.01), visibleWhen: { path: 'appearance.pane.scaleMode', equals: 'manual' }, description: 'Manual pane range lower bound.' }),
    advanced({ ...numberField('appearance.pane.max', 'Maximum', 100, -1_000_000_000, 1_000_000_000, 0.01), visibleWhen: { path: 'appearance.pane.scaleMode', equals: 'manual' }, description: 'Manual pane range upper bound.' }),
    advanced(booleanField('appearance.pane.auto', 'Autoscale', true)),
    advanced(booleanField('appearance.pane.inverted', 'Invert scale', false)),
    advanced({ ...integerField('display.precision', 'Precision', 2, 0, 8), visibleWhen: { path: 'display.showValues', equals: true }, description: 'Only relevant when value labels are visible.' }),
  ];

  const multiOutput = outputs.length > 1;
  const sections: IndicatorSettingsSection[] = [
    { id: 'inputs', label: 'Inputs', description: 'Parameters consumed by the indicator calculation.', fields: inputs },
    { id: 'style', label: 'Style', description: 'Renderer-only line, fill, marker and level presentation. Changing these values never changes calculation identity.', fields: style },
    { id: 'display', label: 'Display', description: 'Renderer-only visibility, pane, scale and value presentation. Appearance changes do not recompute indicator math.', fields: display },
    { id: 'behavior', label: 'Behavior', description: 'Lifecycle controls that affect how the host presents or updates the study.', fields: [], notes: [
      'Behavior overrides are intentionally capability-gated. Realtime/incremental execution is owned by the indicator runtime, not the settings UI.',
    ] },
    { id: 'alerts', label: 'Alerts', description: 'Declarative alert capabilities for future indicator-native alert conditions.', fields: [], notes: [
      'No destination, broker action or side effect is stored in indicator settings. Alert execution remains outside the indicator renderer boundary.',
    ] },
    { id: 'visualization', label: 'Visualization', description: 'Output roles and visual capabilities emitted to the renderer-neutral chart layer.', fields: [], notes: [
      `Outputs: ${outputs.join(', ')}. Multi-output=${multiOutput ? 'yes' : 'no'}.`,
      'Visualization metadata is translated into TCO render packets before reaching Vela; indicator code never depends on Vela APIs.',
    ] },
  ];

  const defaultPane: IndicatorPaneMode = overlay ? 'overlay' : 'separate';
  const allowedPanes: readonly IndicatorPaneMode[] = ['auto', 'overlay', 'separate'];
  const allowedScales: readonly IndicatorScaleMode[] = ['price', 'percent', 'indexed', 'log'];
  return Object.freeze({
    version: INDICATOR_SETTINGS_SCHEMA_VERSION,
    id: `native:${slug(kind)}@3`,
    identity: { kind, title: String(currentValue(item, 'customName') ?? kind), definitionVersion: 1, source: 'native' as const },
    layout: { defaultPane, allowedPanes, defaultScale: 'price' as const, allowedScales },
    outputs,
    capabilities: { rendererNeutral: true as const, incrementalExecution: true, multiOutput, alertsSchema: 'not-declared' as const, behaviorSchema: 'not-declared' as const, visualizationSchema: 'declared' as const },
    sections,
    parameters: parametersFromSections(sections),
  });
}

function buildIndicatorSettingsFieldIndex(schema: IndicatorSettingsSchema): ReadonlyMap<string, IndicatorSettingField> {
  const index = new Map<string, IndicatorSettingField>();
  for (const section of schema.sections) {
    for (const field of section.fields) {
      index.set(field.path, field);
    }
  }
  return index;
}

export function validateIndicatorSettingsSchema(schema: IndicatorSettingsSchema): string[] {
  const errors: string[] = [];
  if (!schema || typeof schema !== 'object') return ['settings schema must be an object'];
  if (schema.version !== INDICATOR_SETTINGS_SCHEMA_VERSION) errors.push(`unsupported indicator settings schema version ${String(schema.version)}`);
  if (typeof schema.id !== 'string' || !schema.id.trim()) errors.push('indicator settings schema id must not be empty');
  if (!schema.identity || typeof schema.identity !== 'object') return [...errors, 'indicator settings identity is missing'];
  if (typeof schema.identity.kind !== 'string' || !schema.identity.kind.trim() || schema.identity.kind.length > 128) errors.push('indicator settings identity kind must be a bounded non-empty string');
  if (typeof schema.identity.title !== 'string' || schema.identity.title.length > 160) errors.push('indicator settings identity title must be a bounded string');
  if (!Number.isInteger(schema.identity.definitionVersion) || schema.identity.definitionVersion < 1 || schema.identity.definitionVersion > 1000000) errors.push('indicator settings identity definitionVersion must be a positive bounded integer');
  if (!['native', 'corespirit', 'community'].includes(schema.identity.source)) errors.push('indicator settings identity source is invalid');
  if (!schema.layout || typeof schema.layout !== 'object') errors.push('indicator settings layout is missing');
  else {
    if (!['auto', 'overlay', 'separate'].includes(schema.layout.defaultPane)) errors.push('indicator settings default pane is invalid');
    if (!schema.layout.allowedPanes?.includes(schema.layout.defaultPane)) errors.push('default pane must be included in allowed panes');
    if (!['price', 'percent', 'indexed', 'log'].includes(schema.layout.defaultScale)) errors.push('indicator settings default scale is invalid');
    if (!schema.layout.allowedScales?.includes(schema.layout.defaultScale)) errors.push('default scale must be included in allowed scales');
  }
  if (!Array.isArray(schema.outputs) || schema.outputs.length > 64 || schema.outputs.some(output => typeof output !== 'string' || !isSafeSettingPath(output))) errors.push('indicator settings outputs must be bounded safe IDs');
  if (!schema.capabilities || schema.capabilities.rendererNeutral !== true) errors.push('indicator settings capabilities must remain renderer-neutral');
  if (!Array.isArray(schema.sections) || schema.sections.length > 16) return [...errors, 'indicator settings schema sections must be an array with at most 16 sections'];
  const sectionIds = new Set<string>();
  const fieldIds = new Set<string>();
  const paths = new Set<string>();
  for (const section of schema.sections) {
    if (!section || typeof section !== 'object') { errors.push('invalid settings section'); continue; }
    if (!['inputs', 'style', 'display', 'behavior', 'alerts', 'visualization'].includes(section.id)) errors.push(`unsupported settings section '${String(section.id)}'`);
    if (sectionIds.has(section.id)) errors.push(`duplicate settings section '${section.id}'`);
    sectionIds.add(section.id);
    if (!Array.isArray(section.fields)) { errors.push(`settings section '${section.id}' fields must be an array`); continue; }
    for (const field of section.fields) {
      if (!field || typeof field !== 'object') { errors.push(`invalid setting field in '${section.id}'`); continue; }
      const segments = String(field.path ?? '').split('.');
      if (!isSafeSettingPath(String(field.path ?? '')) || segments.some(segment => UNSAFE_SETTING_SEGMENTS.has(segment))) errors.push(`invalid setting path '${String(field.path)}'`);
      if (fieldIds.has(field.id)) errors.push(`duplicate setting id '${field.id}'`);
      if (paths.has(field.path)) errors.push(`duplicate setting path '${field.path}'`);
      fieldIds.add(field.id);
      paths.add(field.path);
      if ((field.kind === 'select' || field.kind === 'multi-select') && (!field.options || field.options.length === 0)) errors.push(`${field.kind} setting '${field.path}' has no options`);
      if ((field.kind === 'integer' || field.kind === 'number' || field.kind === 'decimal' || field.kind === 'range' || field.kind === 'price' || field.kind === 'duration') && typeof field.defaultValue !== 'number') errors.push(`numeric setting '${field.path}' needs numeric default`);
      if (field.min != null && field.max != null && field.min > field.max) errors.push(`invalid range for '${field.path}'`);
      if (field.min != null && typeof field.defaultValue === 'number' && field.defaultValue < field.min) errors.push(`default for '${field.path}' is below min`);
      if (field.max != null && typeof field.defaultValue === 'number' && field.defaultValue > field.max) errors.push(`default for '${field.path}' is above max`);
      if (field.options && field.options.length > 64) errors.push(`too many options for '${field.path}'`);
      if (field.options) {
        const optionValues = new Set(field.options.map((option: IndicatorSettingOption) => String(option.value)));
        if (optionValues.size !== field.options.length) errors.push(`duplicate options for '${field.path}'`);
        if (field.kind === 'multi-select' && Array.isArray(field.defaultValue)) {
          for (const selected of field.defaultValue) if (!optionValues.has(String(selected))) errors.push(`default for '${field.path}' contains an undeclared option`);
        }
      }
      if (field.visibleWhen && (!field.visibleWhen.path || typeof field.visibleWhen.path !== 'string')) errors.push(`invalid visibility dependency for '${field.path}'`);
      if (field.group != null && (!field.group.trim() || field.group.length > 96)) errors.push(`invalid group for '${field.path}'`);
      if (field.tooltip != null && field.tooltip.length > 320) errors.push(`tooltip for '${field.path}' is too long`);
      if (field.placeholder != null && field.placeholder.length > 160) errors.push(`placeholder for '${field.path}' is too long`);
      if (field.validation?.pattern) { try { new RegExp(field.validation.pattern); } catch { errors.push(`invalid validation pattern for '${field.path}'`); } }
      if (field.validation?.minLength != null && field.validation.minLength < 0) errors.push(`invalid minLength for '${field.path}'`);
      if (field.validation?.maxLength != null && field.validation.maxLength < (field.validation.minLength ?? 0)) errors.push(`invalid maxLength for '${field.path}'`);
    }
  }
  // Build one canonical schema-field index for every dependency validation pass.
  // The same index is reused for target/type validation and cycle detection.
  const allSchemaFields = schema.sections.flatMap(section => section.fields);
  const fieldByPath = buildIndicatorSettingsFieldIndex(schema);

  for (const section of schema.sections) for (const field of section.fields) {
    if (field.visibleWhen && !paths.has(field.visibleWhen.path)) errors.push(`visibility dependency '${field.visibleWhen.path}' for '${field.path}' is not declared`);
    if (field.dependency) errors.push(...validateCondition(field.dependency, paths, field.path, 0, fieldByPath));
    if (field.visibilityCondition) errors.push(...validateCondition(field.visibilityCondition, paths, field.path, 0, fieldByPath));
    if (field.enabledWhen) errors.push(...validateCondition(field.enabledWhen, paths, field.path, 0, fieldByPath));
  }
  errors.push(...detectConditionCycles(allSchemaFields));
  for (const section of schema.sections) for (const field of section.fields) {
    const defaultError = validateIndicatorSettingValue(field, field.defaultValue);
    if (defaultError) errors.push(`default validation for '${field.path}': ${defaultError}`);
  }
  if (!Array.isArray(schema.parameters)) errors.push('indicator parameter schema must be an array');
  else {
    const parameterPaths = new Set<string>();
    for (const parameter of schema.parameters) {
      if (!isSafeSettingPath(parameter.path)) errors.push(`invalid parameter path '${parameter.path}'`);
      if (parameterPaths.has(parameter.path)) errors.push(`duplicate parameter path '${parameter.path}'`);
      parameterPaths.add(parameter.path);
      if (parameter.kind === 'enum' && (!parameter.options || parameter.options.length === 0)) errors.push(`enum parameter '${parameter.path}' requires options`);
      if (parameter.kind === 'source' && (!parameter.options || parameter.options.length === 0)) errors.push(`source parameter '${parameter.path}' requires options`);
      if (parameter.kind === 'timeframe' && (!parameter.options || parameter.options.length === 0)) errors.push(`timeframe parameter '${parameter.path}' requires options`);
    }
    const inputPaths = new Set(schema.sections.find(section => section.id === 'inputs')?.fields.map(field => field.path) ?? []);
    for (const path of parameterPaths) if (!inputPaths.has(path)) errors.push(`parameter '${path}' is not declared by the Inputs section`);
  }
  return errors;
}

function customSchemaFor(kind: string, item?: Record<string, unknown>): IndicatorSettingsSchema | undefined {
  const candidate = item?.settingsSchema;
  if (!candidate || typeof candidate !== 'object') return undefined;
  const raw = candidate as Record<string, unknown>;
  const sections = Array.isArray(raw.sections) ? raw.sections as IndicatorSettingsSection[] : [];
  const parameters = Array.isArray(raw.parameters) ? raw.parameters : parametersFromSections(sections);
  // v1/v2 custom publications remain readable. v3 adds the explicit parameter ABI.
  const schema = { ...raw, version: INDICATOR_SETTINGS_SCHEMA_VERSION, parameters } as IndicatorSettingsSchema;
  if (validateIndicatorSettingsSchema(schema).length || schema.identity.kind !== kind) return undefined;
  return schema;
}

export function getIndicatorSettingsSchema(kind: string, item?: Record<string, unknown>): IndicatorSettingsSchema {
  return customSchemaFor(kind, item) ?? nativeSchema(kind, item);
}

export function readIndicatorSettingValue(item: Record<string, unknown>, path: string): unknown {
  return currentValue(item, path);
}

export function writeIndicatorSettingValue(item: Record<string, unknown>, path: string, value: IndicatorSettingValue): Record<string, unknown> {
  if (!isSafeSettingPath(path)) return {};
  const [head, ...tail] = path.split('.');
  if (!head) return {};
  if (!tail.length) return { [head]: value };
  const existing = item[head];
  const root = existing && typeof existing === 'object' ? { ...(existing as Record<string, unknown>) } : {};
  let node = root;
  for (let index = 0; index < tail.length - 1; index += 1) {
    const segment = tail[index]!;
    const next = node[segment];
    node[segment] = next && typeof next === 'object' ? { ...(next as Record<string, unknown>) } : {};
    node = node[segment] as Record<string, unknown>;
  }
  node[tail.at(-1)!] = value;
  return { [head]: root };
}

export function getIndicatorDefaultPatch(item: Record<string, unknown>, kind: string): Record<string, unknown> {
  const schema = getIndicatorSettingsSchema(kind, item);
  const patch: Record<string, unknown> = {};
  for (const field of schema.parameters) Object.assign(patch, writeIndicatorSettingValue(patch, field.path, field.defaultValue));
  return patch;
}

export function buildIndicatorComputationSnapshot(item: Record<string, unknown>): Record<string, unknown> {
  const kind = String(item.kind ?? 'Custom');
  const schema = getIndicatorSettingsSchema(kind, item);
  const inputs: Record<string, unknown> = {};
  for (const field of schema.parameters) {
    const value = readIndicatorSettingValue(item, field.path);
    inputs[field.path] = value === undefined ? field.defaultValue : value;
  }
  const legacyMath = ['period','fast','slow','signal','smooth','displacement','multiplier','lookback','source','anchor','mtf'].reduce<Record<string, unknown>>((out, key) => {
    if (item[key] !== undefined && out[key] === undefined) out[key] = item[key];
    return out;
  }, {});
  const sourceIdentity = item.sourceHash ?? item.coreSpiritSourceHash ?? item.compiledArtifactHash ?? item.scriptHash ?? item.artifactHash ?? null;
  return { schemaVersion: schema.version, definitionVersion: schema.identity.definitionVersion, kind, id: String(item.id ?? ''), enabled: item.enabled !== false, inputs, legacyMath, sourceIdentity };
}

export function buildIndicatorComputationSignature(item: Record<string, unknown>): string {
  return JSON.stringify(buildIndicatorComputationSnapshot(item));
}

export { buildIndicatorAppearanceSnapshot };

export function buildIndicatorSettingsSnapshot(item: Record<string, unknown>): Record<string, unknown> {
  const kind = String(item.kind ?? 'Custom');
  const schema = getIndicatorSettingsSchema(kind, item);
  const values: Record<string, unknown> = {};
  for (const section of schema.sections) {
    for (const field of section.fields) {
      const value = readIndicatorSettingValue(item, field.path);
      values[field.path] = value === undefined ? field.defaultValue : value;
    }
  }
  return {
    schemaVersion: schema.version,
    schema,
    identity: schema.identity,
    layout: schema.layout,
    outputs: schema.outputs,
    capabilities: schema.capabilities,
    parameters: schema.parameters,
    values,
    parameterState: resolveIndicatorParameterState(schema, item),
    computation: buildIndicatorComputationSnapshot(item),
    appearance: buildIndicatorAppearanceSnapshot(item),
  };
}

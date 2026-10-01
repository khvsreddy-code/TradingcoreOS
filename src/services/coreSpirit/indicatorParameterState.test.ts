import {
  INDICATOR_SETTINGS_SCHEMA_VERSION,
  evaluateIndicatorSettingCondition,
  resolveIndicatorParameterState,
  validateIndicatorSettingValue,
  validateIndicatorSettingsSchema,
  type IndicatorSettingsSchema,
} from './indicatorSettingsSchema';

const adaptiveSchema: IndicatorSettingsSchema = {
  version: INDICATOR_SETTINGS_SCHEMA_VERSION,
  id: 'corespirit:adaptive-test@3',
  identity: { kind: 'Adaptive Test', title: 'Adaptive Test', definitionVersion: 1, source: 'corespirit' },
  layout: { defaultPane: 'overlay', allowedPanes: ['auto', 'overlay', 'separate'], defaultScale: 'price', allowedScales: ['price', 'percent', 'indexed', 'log'] },
  outputs: ['value'],
  capabilities: { rendererNeutral: true, incrementalExecution: true, multiOutput: false, alertsSchema: 'not-declared', behaviorSchema: 'not-declared', visualizationSchema: 'declared' },
  parameters: [],
  sections: [],
};

const fields = [
  { id: 'method', path: 'method', label: 'Method', kind: 'enum' as const, defaultValue: 'fixed', options: [{ value: 'fixed', label: 'Fixed' }, { value: 'adaptive', label: 'Adaptive' }], group: 'Calculation' },
  { id: 'adaptation-length', path: 'adaptationLength', label: 'Adaptation Length', kind: 'integer' as const, defaultValue: 20, min: 2, max: 200, dependency: { path: 'method', operator: 'equals' as const, value: 'adaptive' }, group: 'Adaptive' },
  { id: 'sensitivity', path: 'sensitivity', label: 'Sensitivity', kind: 'decimal' as const, defaultValue: 1, min: 0.1, max: 10, step: 0.1, visibilityCondition: { all: [{ path: 'method', operator: 'equals' as const, value: 'adaptive' }, { path: 'adaptationLength', operator: 'greaterThan' as const, value: 10 }] }, group: 'Adaptive' },
  { id: 'source', path: 'source', label: 'Source', kind: 'source' as const, defaultValue: 'close', options: [{ value: 'close', label: 'Close' }], group: 'Calculation' },
  { id: 'timeframe', path: 'timeframe', label: 'Timeframe', kind: 'timeframe' as const, defaultValue: '5m', options: [{ value: '5m', label: '5 minutes' }], group: 'Context' },
  { id: 'symbol', path: 'symbol', label: 'Symbol', kind: 'symbol' as const, defaultValue: 'NSE:NIFTY50-INDEX', validation: { required: true, minLength: 3 }, group: 'Context' },
  { id: 'session', path: 'session', label: 'Session', kind: 'session' as const, defaultValue: '0915-1530', validation: { pattern: '^[0-9]{4}-[0-9]{4}$' }, group: 'Context' },
  { id: 'price', path: 'price', label: 'Price', kind: 'price' as const, defaultValue: 100, min: 0, step: 0.01, group: 'Context' },
  { id: 'duration', path: 'duration', label: 'Duration', kind: 'duration' as const, defaultValue: 30, min: 1, max: 480, step: 1, unit: 'min', group: 'Context' },
  { id: 'note', path: 'note', label: 'Note', kind: 'string' as const, defaultValue: '', validation: { maxLength: 40 }, group: 'Context' },
];

const schema: IndicatorSettingsSchema = { ...adaptiveSchema, parameters: fields, sections: [{ id: 'inputs', label: 'Inputs', description: 'Parameters', fields }] };
const errors = validateIndicatorSettingsSchema(schema);
if (errors.length) throw new Error(errors.join('; '));
const defaults = resolveIndicatorParameterState(schema, { kind: 'Adaptive Test', symbol: 'NSE:NIFTY50-INDEX' });
if (!defaults.values.method || defaults.values.method !== 'fixed') throw new Error('parameter defaults were not resolved');
if (defaults.visible.adaptationLength || defaults.visible.sensitivity) throw new Error('default method dependency was not applied');
const fixed = resolveIndicatorParameterState(schema, { kind: 'Adaptive Test', method: 'fixed', adaptationLength: 20, symbol: 'NSE:NIFTY50-INDEX' });
if (fixed.visible.adaptationLength || fixed.visible.sensitivity) throw new Error('adaptive parameters must be hidden in fixed mode');
const adaptive = resolveIndicatorParameterState(schema, { kind: 'Adaptive Test', method: 'adaptive', adaptationLength: 20, symbol: 'NSE:NIFTY50-INDEX' });
if (!adaptive.visible.adaptationLength || !adaptive.visible.sensitivity) throw new Error('adaptive parameters must be visible when dependencies match');
if (!evaluateIndicatorSettingCondition({ method: 'adaptive', adaptationLength: 20 }, { any: [{ path: 'method', operator: 'equals', value: 'adaptive' }, { path: 'adaptationLength', operator: 'lessThan', value: 10 }] })) throw new Error('ANY dependency failed');
if (validateIndicatorSettingValue(fields[5]!, '') === null) throw new Error('required parameter validation failed');
if (validateIndicatorSettingValue(fields[6]!, 'oops') === null) throw new Error('pattern validation failed');
if (!adaptive.valid) throw new Error(`resolved parameter state unexpectedly invalid: ${JSON.stringify(adaptive.errors)}`);
console.log('TCO_V112_PARAMETER_RUNTIME_STATE_OK');

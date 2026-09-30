/**
 * Schema-driven indicator definition/settings contract.
 *
 * The editor must not contain indicator-specific UI knowledge. An indicator
 * publishes a serializable definition; the universal editor renders it.
 * Runtime computation remains separate from this metadata contract.
 */

import { buildIndicatorAppearanceSnapshot } from './indicatorAppearance';

export const INDICATOR_SETTINGS_SCHEMA_VERSION = 2 as const;

export type IndicatorJsonValue = string | number | boolean | null | IndicatorJsonValue[] | { [key: string]: IndicatorJsonValue };
export type IndicatorSettingPrimitive = string | number | boolean;
export type IndicatorSettingValue = IndicatorSettingPrimitive | readonly string[];
export type IndicatorSettingFieldKind = 'integer' | 'number' | 'select' | 'multi-select' | 'color' | 'range' | 'boolean' | 'text';
export type IndicatorSettingsSectionId = 'inputs' | 'style' | 'display' | 'behavior' | 'alerts' | 'visualization';
export type IndicatorPaneMode = 'auto' | 'overlay' | 'separate';
export type IndicatorScaleMode = 'price' | 'percent' | 'indexed' | 'log';

export type IndicatorSettingOption = Readonly<{
  value: IndicatorSettingPrimitive;
  label: string;
}>;

export type IndicatorSettingVisibility = Readonly<{
  path: string;
  equals: IndicatorSettingPrimitive | null;
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
  advanced?: boolean;
  readonly?: boolean;
  unit?: string;
}>;

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
    inputs.push(selectField('source', 'Source', sourceDefault, CORE_PRICE_SOURCE_OPTIONS));
  }
  const periodSpec = PERIOD_DEFAULTS[kind];
  if (periodSpec) {
    const fallback = periodSpec.value;
    inputs.push(integerField('period', periodSpec.label || 'Period', fallback, periodSpec.min ?? 1, periodSpec.max ?? 500, periodSpec.label === 'Duration' ? 'min' : undefined));
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
  const timeframeOptions: readonly IndicatorSettingOption[] = [
    { value: '1m', label: '1m' }, { value: '3m', label: '3m' }, { value: '5m', label: '5m' }, { value: '10m', label: '10m' },
    { value: '15m', label: '15m' }, { value: '30m', label: '30m' }, { value: '1h', label: '1h' }, { value: '4h', label: '4h' }, { value: '1D', label: '1D' },
  ];
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

  const outputs = OUTPUTS[kind] ?? ['value'];
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
    id: `native:${slug(kind)}@2`,
    identity: { kind, title: String(currentValue(item, 'customName') ?? kind), definitionVersion: 1, source: 'native' as const },
    layout: { defaultPane, allowedPanes, defaultScale: 'price' as const, allowedScales },
    outputs,
    capabilities: { rendererNeutral: true as const, incrementalExecution: true, multiOutput, alertsSchema: 'not-declared' as const, behaviorSchema: 'not-declared' as const, visualizationSchema: 'declared' as const },
    sections,
  });
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
      if ((field.kind === 'integer' || field.kind === 'number' || field.kind === 'range') && typeof field.defaultValue !== 'number') errors.push(`numeric setting '${field.path}' needs numeric default`);
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
    }
  }
  for (const section of schema.sections) for (const field of section.fields) if (field.visibleWhen && !paths.has(field.visibleWhen.path)) errors.push(`visibility dependency '${field.visibleWhen.path}' for '${field.path}' is not declared`);
  return errors;
}

function customSchemaFor(kind: string, item?: Record<string, unknown>): IndicatorSettingsSchema | undefined {
  const candidate = item?.settingsSchema;
  if (!candidate || typeof candidate !== 'object') return undefined;
  const raw = candidate as Record<string, unknown>;
  // v1 custom publications remain readable: v2 only changes the schema envelope
  // and adds presentation fields; existing v1 sections/defaults remain valid.
  const schema = (raw.version === 1 ? { ...raw, version: INDICATOR_SETTINGS_SCHEMA_VERSION } : raw) as IndicatorSettingsSchema;
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
  for (const section of schema.sections) {
    for (const field of section.fields) Object.assign(patch, writeIndicatorSettingValue(patch, field.path, field.defaultValue));
  }
  return patch;
}

export function buildIndicatorComputationSnapshot(item: Record<string, unknown>): Record<string, unknown> {
  const kind = String(item.kind ?? 'Custom');
  const schema = getIndicatorSettingsSchema(kind, item);
  const inputs: Record<string, unknown> = {};
  for (const section of schema.sections) if (section.id === 'inputs') for (const field of section.fields) {
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
    values,
    computation: buildIndicatorComputationSnapshot(item),
    appearance: buildIndicatorAppearanceSnapshot(item),
  };
}

/**
 * Renderer-only indicator appearance contract.
 *
 * This module is deliberately free of indicator calculation imports. Its state may change every
 * frame without invalidating indicator math. The computation boundary consumes only calculation
 * identity; the renderer consumes this presentation model.
 */
export type IndicatorAppearanceLineStyle = 'solid' | 'dashed' | 'dotted';
export type IndicatorMarkerShape = 'circle' | 'square' | 'diamond' | 'triangleUp' | 'triangleDown' | 'arrowUp' | 'arrowDown' | 'cross' | 'star';
export type IndicatorMarkerPosition = 'aboveBar' | 'belowBar' | 'inBar';
export type IndicatorLevelExtension = 'none' | 'left' | 'right' | 'both';
export type IndicatorLevelLabelPlacement = 'left' | 'right' | 'axis' | 'inline';
export type IndicatorPaneMode = 'auto' | 'overlay' | 'separate';
export type IndicatorPaneScale = 'price' | 'percent' | 'indexed' | 'log';
export type IndicatorPaneScaleMode = 'auto' | 'manual';

export type IndicatorLineAppearance = Readonly<{
  color: string;
  opacity: number;
  width: number;
  style: IndicatorAppearanceLineStyle;
  gradient: boolean;
  gradientColor: string;
  glow: boolean;
  glowStrength: number;
  zoomMinBars: number;
  zoomMaxBars: number;
  timeframes: readonly string[];
}>;

export type IndicatorFillAppearance = Readonly<{
  enabled: boolean;
  upperColor: string;
  lowerColor: string;
  opacity: number;
  gradient: boolean;
  conditional: boolean;
  bullishColor: string;
  bearishColor: string;
}>;

export type IndicatorMarkerAppearance = Readonly<{
  enabled: boolean;
  shape: IndicatorMarkerShape;
  size: number;
  position: IndicatorMarkerPosition;
  color: string;
  text: string;
  textSize: number;
  offset: number;
}>;

export type IndicatorLevelAppearance = Readonly<{
  enabled: boolean;
  color: string;
  width: number;
  style: IndicatorAppearanceLineStyle;
  extension: IndicatorLevelExtension;
  label: boolean;
  labelPlacement: IndicatorLevelLabelPlacement;
}>;

export type IndicatorPaneAppearance = Readonly<{
  mode: IndicatorPaneMode;
  scale: IndicatorPaneScale;
  scaleMode: IndicatorPaneScaleMode;
  min: number | null;
  max: number | null;
  auto: boolean;
  inverted: boolean;
}>;

export type IndicatorAppearanceConfig = Readonly<{
  line: IndicatorLineAppearance;
  fill: IndicatorFillAppearance;
  marker: IndicatorMarkerAppearance;
  levels: IndicatorLevelAppearance;
  pane: IndicatorPaneAppearance;
}>;

export type IndicatorAppearanceContext = Readonly<{
  timeframe?: string;
  visibleBars?: number;
}>;

const DEFAULT_LINE: IndicatorLineAppearance = {
  color: '#94a3b8', opacity: 1, width: 2, style: 'solid', gradient: false, gradientColor: '#60a5fa',
  glow: false, glowStrength: 0.35, zoomMinBars: 0, zoomMaxBars: 0, timeframes: [],
};
const DEFAULT_FILL: IndicatorFillAppearance = {
  enabled: false, upperColor: '#60a5fa', lowerColor: '#60a5fa', opacity: 0.18, gradient: true, conditional: false,
  bullishColor: '#22c55e', bearishColor: '#ef4444',
};
const DEFAULT_MARKER: IndicatorMarkerAppearance = {
  enabled: false, shape: 'circle', size: 6, position: 'aboveBar', color: '#60a5fa', text: '', textSize: 10, offset: 0,
};
const DEFAULT_LEVELS: IndicatorLevelAppearance = {
  enabled: true, color: '#64748b', width: 1, style: 'dashed', extension: 'both', label: true, labelPlacement: 'axis',
};
const DEFAULT_PANE: IndicatorPaneAppearance = {
  mode: 'auto', scale: 'price', scaleMode: 'auto', min: null, max: null, auto: true, inverted: false,
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const asColor = (value: unknown, fallback: string): string => {
  const raw = String(value ?? '').trim();
  return /^#[0-9a-f]{6,8}$/i.test(raw) || /^rgba?\(/i.test(raw) || /^hsla?\(/i.test(raw) ? raw : fallback;
};
const asEnum = <T extends string>(value: unknown, values: readonly T[], fallback: T): T => values.includes(value as T) ? value as T : fallback;
const asFiniteOrNull = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const legacyStyle = (item: Record<string, unknown>): Record<string, unknown> => {
  const display = item.display && typeof item.display === 'object' ? item.display as Record<string, unknown> : {};
  return { ...item, display };
};

export function resolveIndicatorAppearance(item: Record<string, unknown>, context: IndicatorAppearanceContext = {}): IndicatorAppearanceConfig & { visible: boolean } {
  const raw = item.appearance && typeof item.appearance === 'object' ? item.appearance as Record<string, unknown> : {};
  const legacy = legacyStyle(item);
  const rawLine = raw.line && typeof raw.line === 'object' ? raw.line as Record<string, unknown> : {};
  const rawFill = raw.fill && typeof raw.fill === 'object' ? raw.fill as Record<string, unknown> : {};
  const rawMarker = raw.marker && typeof raw.marker === 'object' ? raw.marker as Record<string, unknown> : {};
  const rawLevels = raw.levels && typeof raw.levels === 'object' ? raw.levels as Record<string, unknown> : {};
  const rawPane = raw.pane && typeof raw.pane === 'object' ? raw.pane as Record<string, unknown> : {};
  const display = legacy.display as Record<string, unknown>;

  const line: IndicatorLineAppearance = {
    color: asColor(rawLine.color ?? item.color, DEFAULT_LINE.color),
    opacity: clamp(Number(rawLine.opacity ?? display.opacity ?? 1), 0.05, 1),
    width: clamp(Math.round(Number(rawLine.width ?? item.lineWidth ?? DEFAULT_LINE.width)), 1, 8),
    style: asEnum(rawLine.style ?? legacyLineStyle(item.lineStyle), ['solid', 'dashed', 'dotted'] as const, DEFAULT_LINE.style),
    gradient: Boolean(rawLine.gradient ?? false),
    gradientColor: asColor(rawLine.gradientColor ?? item.signalColor ?? item.upperColor, DEFAULT_LINE.gradientColor),
    glow: Boolean(rawLine.glow ?? false),
    glowStrength: clamp(Number(rawLine.glowStrength ?? DEFAULT_LINE.glowStrength), 0.05, 1),
    zoomMinBars: Math.max(0, Math.round(Number(rawLine.zoomMinBars ?? 0))),
    zoomMaxBars: Math.max(0, Math.round(Number(rawLine.zoomMaxBars ?? 0))),
    timeframes: Array.isArray(rawLine.timeframes) ? rawLine.timeframes.map(String).filter(Boolean).slice(0, 32) : [],
  };

  const fill: IndicatorFillAppearance = {
    enabled: Boolean(rawFill.enabled ?? false),
    upperColor: asColor(rawFill.upperColor ?? item.upperColor ?? line.color, line.color),
    lowerColor: asColor(rawFill.lowerColor ?? item.lowerColor ?? line.color, line.color),
    opacity: clamp(Number(rawFill.opacity ?? 0.18), 0.02, 1),
    gradient: Boolean(rawFill.gradient ?? true),
    conditional: Boolean(rawFill.conditional ?? false),
    bullishColor: asColor(rawFill.bullishColor ?? '#22c55e', '#22c55e'),
    bearishColor: asColor(rawFill.bearishColor ?? '#ef4444', '#ef4444'),
  };

  const marker: IndicatorMarkerAppearance = {
    enabled: Boolean(rawMarker.enabled ?? false),
    shape: asEnum(rawMarker.shape, ['circle','square','diamond','triangleUp','triangleDown','arrowUp','arrowDown','cross','star'] as const, DEFAULT_MARKER.shape),
    size: clamp(Number(rawMarker.size ?? DEFAULT_MARKER.size), 2, 18),
    position: asEnum(rawMarker.position, ['aboveBar','belowBar','inBar'] as const, DEFAULT_MARKER.position),
    color: asColor(rawMarker.color ?? line.color, line.color),
    text: String(rawMarker.text ?? ''),
    textSize: clamp(Number(rawMarker.textSize ?? DEFAULT_MARKER.textSize), 6, 24),
    offset: clamp(Number(rawMarker.offset ?? 0), -24, 24),
  };

  const levels: IndicatorLevelAppearance = {
    enabled: Boolean(rawLevels.enabled ?? true),
    color: asColor(rawLevels.color ?? line.color, line.color),
    width: clamp(Math.round(Number(rawLevels.width ?? 1)), 1, 6),
    style: asEnum(rawLevels.style, ['solid','dashed','dotted'] as const, DEFAULT_LEVELS.style),
    extension: asEnum(rawLevels.extension, ['none','left','right','both'] as const, DEFAULT_LEVELS.extension),
    label: Boolean(rawLevels.label ?? true),
    labelPlacement: asEnum(rawLevels.labelPlacement, ['left','right','axis','inline'] as const, DEFAULT_LEVELS.labelPlacement),
  };

  const pane: IndicatorPaneAppearance = {
    mode: asEnum(rawPane.mode ?? display.pane, ['auto','overlay','separate'] as const, DEFAULT_PANE.mode),
    scale: asEnum(rawPane.scale ?? display.scale, ['price','percent','indexed','log'] as const, DEFAULT_PANE.scale),
    scaleMode: asEnum(rawPane.scaleMode, ['auto','manual'] as const, Boolean(rawPane.auto ?? true) ? 'auto' : 'manual'),
    min: asFiniteOrNull(rawPane.min),
    max: asFiniteOrNull(rawPane.max),
    auto: Boolean(rawPane.auto ?? (rawPane.scaleMode !== 'manual')),
    inverted: Boolean(rawPane.inverted ?? false),
  };

  const visibleBars = Math.max(0, Number(context.visibleBars ?? 0));
  const zoomVisible = (line.zoomMinBars <= 0 || visibleBars <= 0 || visibleBars >= line.zoomMinBars)
    && (line.zoomMaxBars <= 0 || visibleBars <= 0 || visibleBars <= line.zoomMaxBars);
  const timeframeVisible = line.timeframes.length === 0 || !context.timeframe || line.timeframes.includes(context.timeframe);
  return { line, fill, marker, levels, pane, visible: zoomVisible && timeframeVisible && item.enabled !== false };
}

function legacyLineStyle(value: unknown): IndicatorAppearanceLineStyle {
  const n = Number(value);
  return n === 1 ? 'dashed' : n === 2 ? 'dotted' : 'solid';
}

export function buildIndicatorAppearanceSnapshot(item: Record<string, unknown>, context: IndicatorAppearanceContext = {}): Record<string, unknown> {
  const appearance = resolveIndicatorAppearance(item, context);
  return {
    line: appearance.line,
    fill: appearance.fill,
    marker: appearance.marker,
    levels: appearance.levels,
    pane: appearance.pane,
    visible: appearance.visible,
  };
}

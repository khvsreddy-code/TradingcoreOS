/**
 * CoreSpirit user-facing visual semantics.
 *
 * This module is intentionally scene-graph free. It describes what `show`
 * means at the language boundary; compiler/runtime adapters later project the
 * semantic intent into the private renderer-neutral scene graph.
 */
export const CORE_SPIRIT_VISUAL_SURFACE_VERSION = 1 as const;

export type CoreSpiritShowKind =
  | 'series'
  | 'line'
  | 'box'
  | 'zone'
  | 'signal';

export type CoreSpiritCoordinateInferenceReason =
  | 'normalized-literal-pair'
  | 'bar-time-leading-expression'
  | 'default-time-price-geometry';

export type CoreSpiritCoordinateInference = Readonly<{
  space: 'time' | 'bar' | 'normalized';
  reason: CoreSpiritCoordinateInferenceReason;
}>;

const NUMERIC_LITERAL = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const BAR_X = /^(?:bar(?:_index)?|index|i)(?:\[\d+\])?$/i;
const TIME_X = /^(?:time|timestamp|t)(?:\[\d+\])?$/i;

export function isCoreSpiritNumericLiteral(text: string): boolean {
  return NUMERIC_LITERAL.test(text.trim());
}

/**
 * Infer the coordinate space from source shape, before execution.
 *
 * Rules intentionally remain conservative:
 * 1. two numeric literals in [0,1] -> normalized
 * 2. a bar-like x expression -> bar
 * 3. otherwise geometry defaults to time/price
 *
 * The inference result is explicit and serializable; renderers never infer it.
 */
export function inferCoreSpiritCoordinateSpace(
  xExpression: string,
  yExpression: string,
): CoreSpiritCoordinateInference {
  const x = xExpression.trim();
  const y = yExpression.trim();
  if (
    isCoreSpiritNumericLiteral(x) &&
    isCoreSpiritNumericLiteral(y) &&
    Number(x) >= 0 &&
    Number(x) <= 1 &&
    Number(y) >= 0 &&
    Number(y) <= 1
  ) {
    return { space: 'normalized', reason: 'normalized-literal-pair' };
  }
  if (BAR_X.test(x)) return { space: 'bar', reason: 'bar-time-leading-expression' };
  return { space: 'time', reason: 'default-time-price-geometry' };
}

export function inferCoreSpiritPointCall(xExpression: string, yExpression: string): string {
  const inference = inferCoreSpiritCoordinateSpace(xExpression, yExpression);
  return `point(${xExpression.trim()}, ${yExpression.trim()}, "${inference.space}")`;
}

export function parseCoreSpiritCoordinatePair(
  source: string,
): [string, string] | null {
  const trimmed = source.trim();
  const body = trimmed.startsWith('[') && trimmed.endsWith(']')
    ? trimmed.slice(1, -1)
    : trimmed;
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let splitAt = -1;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    else if (c === ',' && depth === 0) {
      if (splitAt !== -1) return null;
      splitAt = i;
    }
  }
  if (splitAt < 0) return null;
  const x = body.slice(0, splitAt).trim();
  const y = body.slice(splitAt + 1).trim();
  return x && y ? [x, y] : null;
}

/**
 * Semantic descriptions of the primary SHOW surface. These are useful to
 * editor tooling and tests without exposing scene-layer/pane/z-index concepts.
 */
export const CORE_SPIRIT_SHOW_SEMANTICS = Object.freeze({
  series: 'project a value/series into an inferred or explicit visual area',
  line: 'project a two-point geometry object',
  box: 'project a bounded rectangle geometry object',
  zone: 'project a price-domain region',
  signal: 'project a trading event label using a relative bar anchor',
} as const);

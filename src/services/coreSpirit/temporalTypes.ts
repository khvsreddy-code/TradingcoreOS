export const CORE_SPIRIT_TEMPORAL_CONTAINERS = Object.freeze([
  'scalar',
  'series',
  'window',
  'state',
  'event',
  'snapshot',
  'stream',
  'confirmed',
  'developing',
  'forecast',
] as const);

export type CoreSpiritTemporalContainer = typeof CORE_SPIRIT_TEMPORAL_CONTAINERS[number];

export const CORE_SPIRIT_TEMPORAL_PHASES = Object.freeze([
  'historical',
  'confirmed',
  'developing',
  'realtime',
  'forecast',
] as const);

export type CoreSpiritTemporalPhase = typeof CORE_SPIRIT_TEMPORAL_PHASES[number];

export type CoreSpiritTemporalTypeSpec = Readonly<{
  container: CoreSpiritTemporalContainer;
  element: string;
  phase?: CoreSpiritTemporalPhase;
}>;

const temporalTypePattern = /^(scalar|series|window|state|event|snapshot|stream|confirmed|developing|forecast)<(.+?)>(?:\\s+@([a-z]+))?$/;

export function parseCoreSpiritTemporalType(typeName: string): CoreSpiritTemporalTypeSpec | undefined {
  const normalized = typeName.trim();
  const match = normalized.match(temporalTypePattern);
  if (!match || !match[2]!.trim()) return undefined;
  const container = match[1] as CoreSpiritTemporalContainer;
  const suffixPhase = match[3] as CoreSpiritTemporalPhase | undefined;
  if (suffixPhase && !(CORE_SPIRIT_TEMPORAL_PHASES as readonly string[]).includes(suffixPhase)) return undefined;
  const intrinsicPhase: CoreSpiritTemporalPhase | undefined =
    container === 'confirmed' ? 'confirmed' :
    container === 'developing' ? 'developing' :
    container === 'forecast' ? 'forecast' : undefined;
  // Reject contradictory certainty (for example confirmed<T> @developing).
  if (intrinsicPhase && suffixPhase && intrinsicPhase !== suffixPhase) return undefined;
  return Object.freeze({
    container,
    element: match[2]!.trim(),
    phase: suffixPhase ?? intrinsicPhase,
  });
}

export function makeCoreSpiritTemporalType(
  container: CoreSpiritTemporalContainer,
  element: string,
  phase?: CoreSpiritTemporalPhase,
): string {
  const normalizedElement = element.trim();
  if (!normalizedElement || /[<>]/.test(normalizedElement)) {
    throw new TypeError('Temporal element type must be non-empty and cannot contain angle brackets.');
  }
  const intrinsicPhase: CoreSpiritTemporalPhase | undefined =
    container === 'confirmed' ? 'confirmed' :
    container === 'developing' ? 'developing' :
    container === 'forecast' ? 'forecast' : undefined;
  if (phase && !(CORE_SPIRIT_TEMPORAL_PHASES as readonly string[]).includes(phase)) {
    throw new TypeError(`Unsupported temporal phase: ${String(phase)}`);
  }
  if (intrinsicPhase && phase && intrinsicPhase !== phase) {
    throw new TypeError(`Container '${container}' conflicts with phase '${phase}'.`);
  }
  const effectivePhase = phase ?? intrinsicPhase;
  return effectivePhase
    ? `${container}<${normalizedElement}> @${effectivePhase}`
    : `${container}<${normalizedElement}>`;
}

export function temporalElementType(typeName: string): string | undefined {
  return parseCoreSpiritTemporalType(typeName)?.element;
}

export function temporalContainer(typeName: string): CoreSpiritTemporalContainer | undefined {
  return parseCoreSpiritTemporalType(typeName)?.container;
}

export function isCoreSpiritTemporalType(typeName: string): boolean {
  return parseCoreSpiritTemporalType(typeName) !== undefined;
}

export function isCoreSpiritSeriesTypeName(typeName: string): boolean {
  return temporalContainer(typeName) === 'series';
}

export function isCoreSpiritStateTypeName(typeName: string): boolean {
  return temporalContainer(typeName) === 'state';
}

export function isCoreSpiritWindowTypeName(typeName: string): boolean {
  return temporalContainer(typeName) === 'window';
}

export function isCoreSpiritTemporalPhaseType(typeName: string): boolean {
  const container = temporalContainer(typeName);
  return container === 'confirmed' || container === 'developing' || container === 'forecast';
}

/**
 * CoreSpirit temporal semantics are intentionally stronger than Pine-style
 * "everything is a time series":
 *
 * - series<T> is historical/vector data with an explicit element type.
 * - window<T> is a bounded view, not persistent history.
 * - state<T> is explicitly mutable per-program memory.
 * - event<T> is a stream of occurrences, not a bar-aligned value.
 * - snapshot<T> is an immutable point-in-time capture.
 * - stream<T> is an asynchronous/event-fed sequence.
 * - confirmed/developing/forecast qualify the temporal certainty of a value.
 */
export function describeTemporalType(typeName: string): Readonly<{
  container: CoreSpiritTemporalContainer;
  element: string;
  persistent: boolean;
  indexed: boolean;
  evented: boolean;
  phase?: CoreSpiritTemporalPhase;
}> | undefined {
  const spec = parseCoreSpiritTemporalType(typeName);
  if (!spec) return undefined;
  return Object.freeze({
    container: spec.container,
    element: spec.element,
    persistent: spec.container === 'series' || spec.container === 'state',
    indexed: spec.container === 'series' || spec.container === 'window',
    evented: spec.container === 'event' || spec.container === 'stream',
    ...(spec.phase ? { phase: spec.phase } : {}),
  });
}

export function temporalAssignmentCompatible(expected: string, actual: string): boolean {
  if (expected === actual || expected === 'unknown' || actual === 'unknown') return true;
  const e = parseCoreSpiritTemporalType(expected);
  const a = parseCoreSpiritTemporalType(actual);
  if (!e || !a) return false;
  if (e.container === 'scalar' && a.container === 'scalar') return e.element === a.element || e.element === 'number' || a.element === 'number';
  if (e.container !== a.container) return false;
  // An explicitly required phase is a safety contract: developing values must
  // never satisfy a confirmed-value requirement, nor forecasts satisfy live data.
  if (e.phase && e.phase !== a.phase) return false;
  if (e.element === a.element || e.element === 'number' || a.element === 'number') return true;
  return false;
}

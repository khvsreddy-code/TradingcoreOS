import type { CanonicalDataPlane } from './canonicalDataPlane';

export type ModelFeatureBinding = Readonly<{
  name: string;
  values: Float64Array;
  timeline: Float64Array;
  revision: number;
  timelineKey: string;
}>;

/** Model feature inputs borrow the canonical market timeline and numeric columns. */
export function bindModelFeature(
  plane: CanonicalDataPlane,
  name: string,
  field: keyof ReturnType<CanonicalDataPlane['market']['views']>,
  from = 0,
  to = plane.length,
): ModelFeatureBinding {
  const view = plane.read(from, to);
  return Object.freeze({
    name: String(name),
    values: view[field],
    timeline: view.time,
    revision: view.revision,
    timelineKey: view.timelineKey,
  });
}

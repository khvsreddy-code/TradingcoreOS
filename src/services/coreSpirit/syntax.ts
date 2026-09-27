import { normalizeCoreSpiritSource as normalizeCoreSpiritSurfaceSource } from './surfaceForms';

/**
 * Compatibility entry point. Surface normalization is implemented once in
 * surfaceForms.ts; syntax.ts does not maintain a second preprocessing pipeline.
 */
export const normalizeCoreSpiritSource = normalizeCoreSpiritSurfaceSource;

/** CoreSpirit surface-syntax normalizer. Keeps the language concise while lowering
 * friendly syntax to the small deterministic core parser/compiler. */
import { normalizeCoreSpiritSource as normalizeCoreSpiritSurfaceSource } from './surfaceForms';

export function normalizeCoreSpiritSource(source: string): string { return normalizeCoreSpiritSurfaceSource(source); }

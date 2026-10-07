/**
 * Chart time boundary shared by renderer adapters.
 * Canonical chart points use epoch seconds; native Vela accepts epoch milliseconds internally.
 */
export function msFromTime(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number.NaN;
  // Epoch seconds are ~1.7e9; epoch milliseconds are ~1.7e12 in 2026.
  // Preserve modern millisecond timestamps instead of multiplying them twice.
  return n >= 1_000_000_000_000 ? n : n * 1000;
}

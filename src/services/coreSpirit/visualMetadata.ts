/** Structured metadata contract for data-rich CoreSpirit visuals. */

export type CoreSpiritVisualMetadataValue = string | number | boolean | null;
export type CoreSpiritVisualMetadata = Readonly<Record<string, CoreSpiritVisualMetadataValue>>;

export type CoreSpiritVisualInspection = Readonly<{
  title: string;
  rows: readonly { label: string; value: CoreSpiritVisualMetadataValue; unit?: string }[];
}>;

export function normalizeCoreSpiritVisualMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined,
): CoreSpiritVisualMetadata | undefined {
  if (!metadata) return undefined;
  const normalized: Record<string, CoreSpiritVisualMetadataValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') normalized[key] = value as CoreSpiritVisualMetadataValue;
  }
  return Object.keys(normalized).length ? Object.freeze({ ...normalized }) : undefined;
}

export function buildCoreSpiritInspection(
  title: string,
  metadata: CoreSpiritVisualMetadata | undefined,
): CoreSpiritVisualInspection {
  return {
    title,
    rows: Object.entries(metadata ?? {}).map(([label, value]) => ({ label, value })),
  };
}

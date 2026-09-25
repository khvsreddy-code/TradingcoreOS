export type CoreSpiritSourceKind = 'indicator' | 'strategy' | 'script';

export interface CoreSpiritSourceMetadata {
  kind: CoreSpiritSourceKind;
  name?: string;
  description?: string;
}

/** Metadata parser lives outside the VM grammar. It lets strategy/indicator headers be UI/compiler metadata. */
export function extractCoreSpiritSourceMetadata(source: string): CoreSpiritSourceMetadata {
  const text = String(source || '');
  const strategy = text.match(/^\s*strategy\s*\(\s*["']([^"']+)["']\s*\)\s*(?:\n|$)/i);
  if (strategy) return { kind: 'strategy', name: strategy[1] };
  const indicator = text.match(/^\s*indicator\s*\(\s*["']([^"']+)["']\s*\)\s*(?:\n|$)/i);
  if (indicator) return { kind: 'indicator', name: indicator[1] };
  return { kind: 'script' };
}

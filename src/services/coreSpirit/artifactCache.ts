import type { CoreSpiritExecutableArtifact } from './artifact';
import { validateExecutableArtifact } from './artifact';
import { sha256Hex } from './artifactIdentity';

export type CoreSpiritArtifactCacheKey = Readonly<{
  compilerVersion: string;
  irVersion: number;
  sourceHash: string;
  semanticsHash: string;
}>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

export class CoreSpiritArtifactCache {
  private readonly entries = new Map<string, CoreSpiritExecutableArtifact>();
  constructor(private readonly maxEntries = 256) {}

  static async key(input: CoreSpiritArtifactCacheKey): Promise<string> {
    return sha256Hex(canonicalJson({ ...input }));
  }

  async get(keyInput: CoreSpiritArtifactCacheKey): Promise<CoreSpiritExecutableArtifact | undefined> {
    const key = await CoreSpiritArtifactCache.key(keyInput);
    const artifact = this.entries.get(key);
    if (!artifact) return undefined;
    this.entries.delete(key);
    this.entries.set(key, artifact);
    return validateExecutableArtifact(artifact) ? artifact : undefined;
  }

  async set(keyInput: CoreSpiritArtifactCacheKey, artifact: CoreSpiritExecutableArtifact): Promise<string> {
    if (!validateExecutableArtifact(artifact)) throw new Error('cannot cache invalid CoreSpirit artifact');
    const key = await CoreSpiritArtifactCache.key(keyInput);
    this.entries.delete(key);
    this.entries.set(key, artifact);
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
    return key;
  }

  clear(): void { this.entries.clear(); }
  get size(): number { return this.entries.size; }
}

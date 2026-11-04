import type { CoreSpiritComponentContract } from './coreSpiritExecutionModel';
import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';
import { coreSpiritComponentRegistry } from './coreSpiritComponents';
import { sha256HexSync } from './artifactIdentity';
import { normalizeCoreSpiritSource } from './syntax';
import { readCoreScriptEdition } from './languageEdition.js';
import { CORE_SPIRIT_COMPILER_VERSION, CORE_SPIRIT_RUNTIME_ABI, CORE_SPIRIT_OPTIMIZER_ABI } from './VERSION';

type FingerprintOptions = { components?: CoreSpiritComponentRegistryLike; layer?: string };

function getComponentContracts(options: FingerprintOptions): readonly CoreSpiritComponentContract[] {
  const components = options.components ?? coreSpiritComponentRegistry;
  if (components && typeof components === 'object' && 'listContracts' in components &&
      typeof (components as { listContracts?: unknown }).listContracts === 'function') {
    return (components as { listContracts(): readonly CoreSpiritComponentContract[] }).listContracts();
  }
  return components as readonly CoreSpiritComponentContract[];
}

/** JSON with stable object-key ordering; array ordering is retained where ports may be positional. */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .filter(key => object[key] !== undefined)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`;
}

/**
 * Remove comments and string literals before detecting function-call identifiers.
 * This intentionally stays in the lightweight identity module rather than importing
 * the parser/compiler into the cache lookup path.
 */
function callableIdentifiers(source: string): ReadonlySet<string> {
  const code = source.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,
    value => value.replace(/[^\n]/g, ' '),
  );
  const names = new Set<string>();
  const calls = /\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = calls.exec(code)) !== null) names.add(match[1]!);
  return names;
}

/**
 * The worker and UI can have different registries because reusable components
 * may be registered dynamically on the UI thread. Only source-referenced contracts
 * affect an artifact; unrelated registrations must not invalidate ordinary scripts.
 * Sorting also removes registry insertion order as a source of identity drift.
 */
function contractsForSource(options: FingerprintOptions, source?: string): readonly CoreSpiritComponentContract[] {
  const contracts = getComponentContracts(options);
  const relevant = source === undefined
    ? [...contracts]
    : (() => {
        const calls = callableIdentifiers(source);
        return contracts.filter(contract =>
          [contract.id, contract.name, ...(contract.aliases ?? [])].some(name => calls.has(name)),
        );
      })();
  return relevant.sort((left, right) => left.id.localeCompare(right.id));
}

export function coreSpiritComponentFingerprint(options: FingerprintOptions, source?: string): string {
  return stableJson(contractsForSource(options, source));
}

/** Kept in a light module so cache identity lookup doesn't eagerly load the compiler/VM graph. */
export function buildCoreSpiritSemanticFingerprint(options: FingerprintOptions = {}, source?: string): string {
  return stableJson({
    compilerPipeline: 'semantic-v5',
    edition: source === undefined ? '1.0' : readCoreScriptEdition(source).edition,
    layer: options.layer || 'script',
    components: contractsForSource(options, source),
  });
}

/**
 * Canonical semantic fingerprint shared by artifact lookup and artifact production.
 * Component contracts are source-scoped so UI-only registrations do not break worker
 * compilation for scripts that never reference those components.
 */
export function buildCoreSpiritArtifactSemanticFingerprint(
  options: FingerprintOptions = {},
  source?: string,
): string {
  return stableJson({
    compiler: CORE_SPIRIT_COMPILER_VERSION,
    semantic: buildCoreSpiritSemanticFingerprint(options, source),
    componentSet: coreSpiritComponentFingerprint(options, source),
    runtimeABI: CORE_SPIRIT_RUNTIME_ABI,
    optimizerABI: CORE_SPIRIT_OPTIMIZER_ABI,
  });
}

export function buildCoreSpiritArtifactLookupIdentity(
  source: string,
  sourceId: string,
  options: FingerprintOptions = {},
): { key: string; sourceHash: string; normalizedHash: string; semanticHash: string } {
  const normalizedSource = normalizeCoreSpiritSource(source);
  const sourceHash = sha256HexSync(source);
  const normalizedHash = sha256HexSync(normalizedSource);
  const semanticFingerprint = buildCoreSpiritArtifactSemanticFingerprint(options, source);
  const semanticHash = sha256HexSync(`${normalizedHash}\n${semanticFingerprint}`);
  return { key: `${sourceId}:${semanticHash}`, sourceHash, normalizedHash, semanticHash };
}

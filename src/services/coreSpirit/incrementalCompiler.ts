import { CoreSpiritIncrementalAst, type IncrementalAstResult } from './incrementalAst';
import { CoreSpiritCompiler, type CoreSpiritCompileResult } from './compiler';
import type { CoreSpiritAst } from './ast';
import type { CoreSpiritIrProgram } from './ir';
import { coreSpiritChecksum } from './artifact';
import { CORE_SPIRIT_COMPILER_VERSION } from './VERSION';
import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';

export type CoreSpiritIncrementalCompileResult = CoreSpiritCompileResult & Readonly<{
  sourceHash: string;
  reusedAstNodes: number;
  cacheHit: boolean;
  /** True when both parse and compile results were restored from a content-addressed cache. */
  parseCacheHit: boolean;
  changedNodeIds: readonly string[];
}>;

type CachedIncrementalCompile = Readonly<{
  result: CoreSpiritCompileResult;
  ast: CoreSpiritAst;
  parseDiagnostics: IncrementalAstResult['diagnostics'];
}>;

function sourceHash(source: string): string { return coreSpiritChecksum(source); }

function graphNodeFingerprints(ir?: CoreSpiritIrProgram): Map<string, string> {
  return new Map((ir?.graphs?.semantic.nodes ?? []).map(node => [node.id, coreSpiritChecksum({ ...node, source: undefined })]));
}

function diffNodeIds(previous?: CoreSpiritIrProgram, current?: CoreSpiritIrProgram): string[] {
  const prev = graphNodeFingerprints(previous);
  return [...graphNodeFingerprints(current)].filter(([id, fingerprint]) => prev.get(id) !== fingerprint).map(([id]) => id);
}

/**
 * Incremental compiler facade. AST nodes are structurally reused, identical
 * source/artifact results are memoized, and changed semantic nodes are reported.
 * The compiler remains the single canonical lowering path.
 */
export class CoreSpiritIncrementalCompiler {
  private readonly ast = new CoreSpiritIncrementalAst();
  private readonly compiler = new CoreSpiritCompiler();
  private readonly cache = new Map<string, CachedIncrementalCompile>();
  private readonly maxCacheEntries = 64;
  private lastIr?: CoreSpiritIrProgram;

  compile(source: string, sourceId = 'coreSpirit', options: { components?: CoreSpiritComponentRegistryLike } = {}): CoreSpiritIncrementalCompileResult {
    const sourceHashValue = sourceHash(source);
    const componentKey = options.components ? coreSpiritChecksum(options.components instanceof Object && 'listContracts' in options.components ? (options.components as any).listContracts() : options.components) : 'default';
    // A source hash alone cannot safely reuse an artifact across compiler releases.
    const hash = `${CORE_SPIRIT_COMPILER_VERSION}:${sourceId}:${sourceHashValue}:${componentKey}`;
    const cached = this.cache.get(hash);
    if (cached) {
      this.cache.delete(hash);
      this.cache.set(hash, cached);
      // Restore the compiler's incremental baseline without parsing identical
      // text again. The next edit can still structurally reuse nodes from it.
      this.ast.restore(source, cached.ast, cached.parseDiagnostics);
      this.lastIr = cached.result.ir;
      return { ...cached.result, sourceHash: sourceHashValue, reusedAstNodes: 0, cacheHit: true, parseCacheHit: true, changedNodeIds: [] };
    }
    const parsed = this.ast.update(source);
    const result = this.compiler.compile(parsed.ast, sourceId, { components: options.components });
    this.cache.set(hash, { result, ast: parsed.ast, parseDiagnostics: parsed.diagnostics });
    while (this.cache.size > this.maxCacheEntries) this.cache.delete(this.cache.keys().next().value!);
    const changedNodeIds = diffNodeIds(this.lastIr, result.ir);
    this.lastIr = result.ir;
    return { ...result, sourceHash: sourceHashValue, reusedAstNodes: parsed.reusedNodes, cacheHit: false, parseCacheHit: false, changedNodeIds };
  }

  compileAst(ast: CoreSpiritAst, sourceId = 'coreSpirit'): CoreSpiritCompileResult { return this.compiler.compile(ast, sourceId); }
  clear(): void { this.cache.clear(); this.lastIr = undefined; }
}

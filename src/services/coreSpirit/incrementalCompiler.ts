import { CoreSpiritIncrementalAst } from './incrementalAst';
import { CoreSpiritCompiler, type CoreSpiritCompileResult } from './compiler';
import type { CoreSpiritAst } from './ast';
import type { CoreSpiritIrProgram } from './ir';
import { coreSpiritChecksum } from './artifact';
import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';

export type CoreSpiritIncrementalCompileResult = CoreSpiritCompileResult & Readonly<{
  sourceHash: string;
  reusedAstNodes: number;
  cacheHit: boolean;
  changedNodeIds: readonly string[];
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
  private readonly cache = new Map<string, CoreSpiritCompileResult>();
  private readonly maxCacheEntries = 64;
  private lastIr?: CoreSpiritIrProgram;

  compile(source: string, sourceId = 'coreSpirit', options: { components?: CoreSpiritComponentRegistryLike } = {}): CoreSpiritIncrementalCompileResult {
    const sourceHashValue = sourceHash(source);
    const componentKey = options.components ? coreSpiritChecksum(options.components instanceof Object && 'listContracts' in options.components ? (options.components as any).listContracts() : options.components) : 'default';
    const hash = `${sourceId}:${sourceHashValue}:${componentKey}`;
    const parsed = this.ast.update(source);
    const cached = this.cache.get(hash);
    if (cached) {
      this.cache.delete(hash);
      this.cache.set(hash, cached);
      this.lastIr = cached.ir;
      return { ...cached, sourceHash: sourceHashValue, reusedAstNodes: parsed.reusedNodes, cacheHit: true, changedNodeIds: [] };
    }
    const result = this.compiler.compile(parsed.ast, sourceId, { components: options.components });
    this.cache.set(hash, result);
    while (this.cache.size > this.maxCacheEntries) this.cache.delete(this.cache.keys().next().value!);
    const changedNodeIds = diffNodeIds(this.lastIr, result.ir);
    this.lastIr = result.ir;
    return { ...result, sourceHash: sourceHashValue, reusedAstNodes: parsed.reusedNodes, cacheHit: false, changedNodeIds };
  }

  compileAst(ast: CoreSpiritAst, sourceId = 'coreSpirit'): CoreSpiritCompileResult { return this.compiler.compile(ast, sourceId); }
  clear(): void { this.cache.clear(); this.lastIr = undefined; }
}

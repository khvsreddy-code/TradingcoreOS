import { CoreSpiritAst, CoreSpiritAstNode } from './ast';
import { CoreSpiritParser } from './parser';

export type CoreSpiritTextChange = { start: number; end: number; text: string };
export type IncrementalAstResult = { ast: CoreSpiritAst; diagnostics: ReturnType<CoreSpiritParser['parseDetailed']>['diagnostics']; reusedNodes: number; reparsed: boolean };

function nodeKey(node: CoreSpiritAstNode, source: string): string {
  const span = (node as any).span;
  return span ? `${node.type}:${source.slice(span.start, span.end)}` : node.type;
}

function collectReusable(ast: CoreSpiritAst, source: string) {
  const map = new Map<string, CoreSpiritAstNode>();
  const visit = (n: CoreSpiritAstNode) => {
    map.set(nodeKey(n, source), n);
    switch (n.type) {
      case 'program': n.body.forEach(visit); break;
      case 'let': visit(n.expression); break;
      case 'expressionStatement': visit(n.expression); break;
      case 'if': visit(n.condition); n.thenBranch.forEach(visit); n.elseBranch?.forEach(visit); break;
      case 'unary': visit(n.operand); break;
      case 'binary': visit(n.left); visit(n.right); break;
      case 'call': n.args.forEach(visit); break;
      case 'index': visit(n.target); visit(n.index); break;
      case 'member': visit(n.target); break;
      case 'typeDeclaration': break;
      case 'number': case 'string': case 'boolean': case 'null': case 'identifier': break;
    }
  };
  visit(ast);
  return map;
}

function reuseTree(next: CoreSpiritAst, previous: CoreSpiritAst, previousSource: string, nextSource: string): { ast: CoreSpiritAst; reused: number } {
  const pool = collectReusable(previous, previousSource); let reused = 0;
  const visit = (n: CoreSpiritAstNode): CoreSpiritAstNode => {
    const prior = pool.get(nodeKey(n, nextSource));
    if (prior && JSON.stringify(prior) === JSON.stringify(n)) { reused++; return prior; }
    switch (n.type) {
      case 'program': return { ...n, body: n.body.map(visit) };
      case 'let': return { ...n, expression: visit(n.expression) };
      case 'expressionStatement': return { ...n, expression: visit(n.expression) };
      case 'if': return { ...n, condition: visit(n.condition), thenBranch: n.thenBranch.map(visit), elseBranch: n.elseBranch?.map(visit) };
      case 'unary': return { ...n, operand: visit(n.operand) };
      case 'binary': return { ...n, left: visit(n.left), right: visit(n.right) };
      case 'call': return { ...n, args: n.args.map(visit) };
      case 'index': return { ...n, target: visit(n.target), index: visit(n.index) };
      case 'member': return { ...n, target: visit(n.target) };
      default: return n;
    }
  };
  return { ast: visit(next) as CoreSpiritAst, reused };
}

export class CoreSpiritIncrementalAst {
  private source = '';
  private ast: CoreSpiritAst = { type:'program', body:[] };
  private diagnostics: IncrementalAstResult['diagnostics'] = [];
  private version = 0;

  update(source: string, _change?: CoreSpiritTextChange): IncrementalAstResult {
    const parsed = new CoreSpiritParser(source).parseDetailed();
    let reusedNodes = 0;
    if (this.source) {
      const reused = reuseTree(parsed.ast, this.ast, this.source, source);
      this.ast = reused.ast; reusedNodes = reused.reused;
    } else this.ast = parsed.ast;
    this.source = source; this.diagnostics = parsed.diagnostics; this.version++;
    return { ast:this.ast, diagnostics:this.diagnostics, reusedNodes, reparsed:true };
  }
  getVersion() { return this.version; }
  getAst() { return this.ast; }
}

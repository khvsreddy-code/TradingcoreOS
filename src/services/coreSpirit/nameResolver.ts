import type { CoreSpiritAst, CoreSpiritAstNode } from './ast';
import { CORE_SPIRIT_BUILTINS } from './standardLibrary';
import type { CoreSpiritType } from './typeSystem';

export type CoreSpiritNameDiagnostic = {
  severity:'error'; code:string; message:string; line?:number; column?:number; start?:number; end?:number;
};

export type CoreSpiritNameResolution = {
  diagnostics: CoreSpiritNameDiagnostic[];
  declarations: Map<string, CoreSpiritType>;
};

const builtinSeries = new Set(['open','high','low','close','volume','time']);
const builtinState = new Set(['na','bar_index']);
const builtinNamespaces = new Set(['ui', 'visual', 'app', 'scan', 'chart']);

/** Pure lexical/name-resolution pass. It does not infer expression types. */
export function resolveCoreSpiritNames(ast: CoreSpiritAst): CoreSpiritNameResolution {
  const diagnostics: CoreSpiritNameDiagnostic[] = [];
  const declarations = new Map<string, CoreSpiritType>();
  const report = (n:CoreSpiritAstNode, message:string, code:string) => diagnostics.push({ severity:'error', code, message, line:n.span?.line, column:n.span?.column, start:n.span?.start, end:n.span?.end });

  const expression = (n:CoreSpiritAstNode, scope:Map<string, CoreSpiritType>) => {
    switch(n.type) {
      case 'identifier':
        if (!builtinSeries.has(n.name) && !builtinState.has(n.name) && !builtinNamespaces.has(n.name) && !scope.has(n.name)) report(n, `Unknown identifier '${n.name}'`, 'UNKNOWN_IDENTIFIER');
        break;
      case 'call':
        if (!CORE_SPIRIT_BUILTINS.has(n.name)) report(n, `Unknown function '${n.name}'`, 'UNKNOWN_FUNCTION');
        n.args.forEach(a => expression(a, scope));
        break;
      case 'index': expression(n.target, scope); expression(n.index, scope); break;
      case 'member': expression(n.target, scope); break;
      case 'memberCall':
        if (!(n.target.type === 'identifier' && ['ui','visual','app','scan'].includes(n.target.name))) expression(n.target, scope);
        n.args.forEach((a, index) => {
          const actionPosition = (n.member === 'button' && index === 1) || (n.member === 'toggle' && index === 2) || (n.member === 'number' && index === 2) || (n.member === 'slider' && index === 4);
          if (actionPosition && a.type === 'identifier' && !scope.has(a.name)) return;
          expression(a, scope);
        });
        break;
      case 'unary': expression(n.operand, scope); break;
      case 'binary': expression(n.left, scope); expression(n.right, scope); break;
      case 'number': case 'string': case 'boolean': case 'null': case 'typeDeclaration': break;
      default: break;
    }
  };

  const statement = (n:CoreSpiritAstNode, scope:Map<string,CoreSpiritType>) => {
    switch(n.type) {
      case 'program': n.body.forEach(x => statement(x, scope)); break;
      case 'typeDeclaration': break;
      case 'let':
        expression(n.expression, scope);
        scope.set(n.name, 'unknown');
        declarations.set(n.name, 'unknown');
        break;
      case 'expressionStatement': expression(n.expression, scope); break;
      case 'if':
        expression(n.condition, scope);
        n.thenBranch.forEach(x => statement(x, new Map(scope)));
        n.elseBranch?.forEach(x => statement(x, new Map(scope)));
        break;
    }
  };

  statement(ast, new Map());
  return { diagnostics, declarations };
}

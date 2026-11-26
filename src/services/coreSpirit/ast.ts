/** CoreSpirit source AST. This layer is pure language data and does not know about the chart. */
export type CoreSpiritFrontendId = 'corescript' | 'pine-v6';
export type CoreSpiritProgramKind = 'indicator' | 'strategy' | 'library' | 'automation' | 'prediction' | 'script';
export type CoreSpiritPineDeclarationArgument = Readonly<{ name?:string; value:string }>;
export type CoreSpiritPineDeclarationMetadata = Readonly<{ version:6; kind:'indicator'|'strategy'|'library'; title:string; arguments:readonly CoreSpiritPineDeclarationArgument[] }>;
export type CoreSpiritLiteral = number | string | boolean | null;
export type CoreSpiritAnnotation = { name:string; args:string[]; span?:CoreSpiritSpan };

export type CoreSpiritAstDiagnosticReference = Readonly<{
  code: string;
  severity: 'error' | 'warning';
  message: string;
}>;

/**
 * Frontend-neutral metadata attached after parsing. The parser only constructs
 * syntax; semantic analysis and name resolution enrich this record in later passes.
 */
export type CoreSpiritAstNodeMetadata = Readonly<{
  sourceId: string;
  frontend: CoreSpiritFrontendId;
  nodeId: string;
  resolvedSymbol?: string;
  inferredType?: import('./semanticTypeSystem').CoreSpiritSemanticType;
  qualifier?: import('./semanticTypeSystem').CoreSpiritTypeQualifier;
  expectedTypes?: readonly string[];
  dependencies: readonly string[];
  diagnostics?: readonly CoreSpiritAstDiagnosticReference[];
}>;

export type CoreSpiritAstNode = (
  | CoreSpiritProgramNode
  | CoreSpiritLetNode
  | CoreSpiritAssignmentNode
  | CoreSpiritOnEventNode
  | CoreSpiritExpressionStatementNode
  | CoreSpiritIfNode
  | CoreSpiritLiteralNode
  | CoreSpiritIdentifierNode
  | CoreSpiritUnaryNode
  | CoreSpiritBinaryNode
  | CoreSpiritCallNode
  | CoreSpiritMemberCallNode
  | CoreSpiritIndexNode
  | CoreSpiritMemberNode
  | CoreSpiritTypeDeclarationNode
  | CoreSpiritArrayLiteralNode
  | CoreSpiritMapLiteralNode
  | CoreSpiritWhileNode
  | CoreSpiritForEachNode
  | CoreSpiritBreakNode
  | CoreSpiritContinueNode
  | CoreSpiritFunctionDeclarationNode
  | CoreSpiritReturnNode
) & { metadata?: CoreSpiritAstNodeMetadata };

export type CoreSpiritProgramNode = { type: 'program'; body: CoreSpiritAstNode[]; programKind?: CoreSpiritProgramKind; pineDeclaration?:CoreSpiritPineDeclarationMetadata; span?: CoreSpiritSpan };
export type CoreSpiritLetNode = { type: 'let'; name: string; declaredType?: string; expression: CoreSpiritAstNode; annotations?: CoreSpiritAnnotation[]; span?: CoreSpiritSpan };
export type CoreSpiritAssignmentNode = { type: 'assignment'; name: string; expression: CoreSpiritAstNode; annotations?: CoreSpiritAnnotation[]; span?: CoreSpiritSpan };
export type CoreSpiritOnEventNode = { type: 'onEvent'; eventName: string; body: CoreSpiritAstNode[]; annotations?: CoreSpiritAnnotation[]; span?: CoreSpiritSpan };
export type CoreSpiritExpressionStatementNode = { type: 'expressionStatement'; expression: CoreSpiritAstNode; annotations?: CoreSpiritAnnotation[]; span?: CoreSpiritSpan };
export type CoreSpiritIfNode = { type: 'if'; condition: CoreSpiritAstNode; thenBranch: CoreSpiritAstNode[]; elseBranch?: CoreSpiritAstNode[]; annotations?: CoreSpiritAnnotation[]; span?: CoreSpiritSpan };
export type CoreSpiritLiteralNode = { type: 'number' | 'string' | 'boolean' | 'null'; value: CoreSpiritLiteral; span?: CoreSpiritSpan };
export type CoreSpiritIdentifierNode = { type: 'identifier'; name: string; span?: CoreSpiritSpan };
export type CoreSpiritUnaryNode = { type: 'unary'; operator: '-' | '!' | '+'; operand: CoreSpiritAstNode; span?: CoreSpiritSpan };
export type CoreSpiritBinaryNode = { type: 'binary'; operator: '+' | '-' | '*' | '/' | '%' | '==' | '!=' | '<' | '<=' | '>' | '>=' | 'and' | 'or'; left: CoreSpiritAstNode; right: CoreSpiritAstNode; span?: CoreSpiritSpan };
export type CoreSpiritCallNode = { type: 'call'; name: string; args: CoreSpiritAstNode[]; span?: CoreSpiritSpan };
export type CoreSpiritMemberCallNode = { type: 'memberCall'; target: CoreSpiritAstNode; member: string; args: CoreSpiritAstNode[]; span?: CoreSpiritSpan };
export type CoreSpiritIndexNode = { type: 'index'; target: CoreSpiritAstNode; index: CoreSpiritAstNode; span?: CoreSpiritSpan };
export type CoreSpiritMemberNode = { type: 'member'; target: CoreSpiritAstNode; member: string; span?: CoreSpiritSpan };
export type CoreSpiritTypeField = { name: string; typeName: string; span?: CoreSpiritSpan };
export type CoreSpiritTypeDeclarationNode = { type: 'typeDeclaration'; name: string; fields: CoreSpiritTypeField[]; annotations?: CoreSpiritAnnotation[]; span?: CoreSpiritSpan };
export type CoreSpiritArrayLiteralNode = { type:'arrayLiteral'; elements:CoreSpiritAstNode[]; span?:CoreSpiritSpan };
export type CoreSpiritMapLiteralNode = { type:'mapLiteral'; entries:Array<{key:string;value:CoreSpiritAstNode}>; span?:CoreSpiritSpan };
export type CoreSpiritWhileNode = { type:'while'; condition:CoreSpiritAstNode; body:CoreSpiritAstNode[]; span?:CoreSpiritSpan };
export type CoreSpiritForEachNode = { type:'forEach'; name:string; iterable:CoreSpiritAstNode; body:CoreSpiritAstNode[]; span?:CoreSpiritSpan };
export type CoreSpiritBreakNode = { type:'break'; span?:CoreSpiritSpan };
export type CoreSpiritContinueNode = { type:'continue'; span?:CoreSpiritSpan };
export type CoreSpiritFunctionParameter = { name:string; declaredType:string; span?:CoreSpiritSpan };
export type CoreSpiritFunctionDeclarationNode = {
  type:'functionDeclaration';
  name:string;
  parameters:CoreSpiritFunctionParameter[];
  returnType:string;
  body:CoreSpiritAstNode[];
  span?:CoreSpiritSpan;
};
export type CoreSpiritReturnNode = { type:'return'; expression:CoreSpiritAstNode; span?:CoreSpiritSpan };

export type CoreSpiritSpan = { start: number; end: number; line: number; column: number };
export type CoreSpiritAst = CoreSpiritProgramNode;

/** Update semantic metadata without allowing partial spreads to drop provenance fields. */
export function updateCoreSpiritAstNodeMetadata(
  node: CoreSpiritAstNode,
  patch: Partial<CoreSpiritAstNodeMetadata>,
): void {
  const current=node.metadata;
  const start=node.span?.start ?? -1;
  const end=node.span?.end ?? start;
  node.metadata={
    sourceId:current?.sourceId ?? 'coreSpirit',
    frontend:current?.frontend ?? 'corescript',
    nodeId:current?.nodeId ?? `coreSpirit:corescript:${node.type}:${start}:${end}`,
    dependencies:current?.dependencies ?? [],
    ...current,
    ...patch,
  };
}


/**
 * Attach deterministic, source-based identity and syntactic identifier dependencies.
 * Semantic types and resolved symbols are filled by their owning later passes.
 */
export function annotateCoreSpiritAst(
  ast: CoreSpiritAst,
  options: { sourceId: string; frontend: CoreSpiritFrontendId },
): void {
  const sourceId = String(options.sourceId || 'coreSpirit');
  let generatedOrdinal = 0;

  const visit = (value: unknown): Set<string> => {
    if (Array.isArray(value)) {
      const dependencies = new Set<string>();
      for (const item of value) for (const dependency of visit(item)) dependencies.add(dependency);
      return dependencies;
    }
    if (!value || typeof value !== 'object') return new Set();
    const candidate = value as Record<string, unknown>;
    const isNode = typeof candidate.type === 'string';
    const dependencies = new Set<string>();
    for (const [key, child] of Object.entries(candidate)) {
      if (key === 'metadata' || key === 'span') continue;
      for (const dependency of visit(child)) dependencies.add(dependency);
    }
    if (!isNode) return dependencies;

    const span = candidate.span && typeof candidate.span === 'object'
      ? candidate.span as Record<string, unknown>
      : undefined;
    const start = Number.isInteger(span?.start) ? Number(span?.start) : -1;
    const end = Number.isInteger(span?.end) ? Number(span?.end) : start;
    const nodeId = start >= 0
      ? `${sourceId}:${options.frontend}:${String(candidate.type)}:${start}:${end}`
      : `${sourceId}:${options.frontend}:${String(candidate.type)}:generated:${generatedOrdinal++}`;
    if (candidate.type === 'identifier' && typeof candidate.name === 'string') dependencies.add(candidate.name);

    candidate.metadata = {
      ...((candidate.metadata && typeof candidate.metadata === 'object') ? candidate.metadata as object : {}),
      sourceId,
      frontend: options.frontend,
      nodeId,
      dependencies: [...dependencies].sort(),
    };
    return dependencies;
  };

  visit(ast);
}

/** CoreSpirit source AST. This layer is pure language data and does not know about the chart. */
export type CoreSpiritLiteral = number | string | boolean | null;
export type CoreSpiritAnnotation = { name:string; args:string[]; span?:CoreSpiritSpan };

export type CoreSpiritAstNode =
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
  | CoreSpiritTypeDeclarationNode;

export type CoreSpiritProgramNode = { type: 'program'; body: CoreSpiritAstNode[]; span?: CoreSpiritSpan };
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

export type CoreSpiritSpan = { start: number; end: number; line: number; column: number };

export type CoreSpiritAst = CoreSpiritProgramNode;

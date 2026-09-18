import { CoreSpiritAst, CoreSpiritAstNode, CoreSpiritSpan } from './ast';
import { CoreSpiritLexer, CoreSpiritSyntaxError, CoreSpiritToken } from './lexer';

export class CoreSpiritParser {
  private readonly tokens: CoreSpiritToken[]; private i=0;
  constructor(source:string){this.tokens=new CoreSpiritLexer(source).tokenize();}
  parse(): CoreSpiritAst { const body:CoreSpiritAstNode[]=[]; while(!this.check('eof')) body.push(this.statement()); return {type:'program',body}; }
  private statement():CoreSpiritAstNode { if(this.match('let')) return this.letStatement(); if(this.match('if')) return this.ifStatement(); const expression=this.expression(); this.match('semicolon'); return {type:'expressionStatement',expression,span:this.span(expression)}; }
  private letStatement():CoreSpiritAstNode { const name=this.consume('identifier','Expected variable name'); this.consume('equal','Expected = after variable name'); const expression=this.expression(); this.match('semicolon'); return {type:'let',name:name.lexeme,expression,span:this.makeSpan(name,this.previous())}; }
  private ifStatement():CoreSpiritAstNode { const start=this.previous(); this.consume('leftParen','Expected ( after if'); const condition=this.expression(); this.consume('rightParen','Expected ) after condition'); const thenBranch=this.block(); let elseBranch:CoreSpiritAstNode[]|undefined; if(this.match('else')) elseBranch=this.block(); return {type:'if',condition,thenBranch,elseBranch,span:this.makeSpan(start,this.previous())}; }
  private block():CoreSpiritAstNode[]{this.consume('leftBrace','Expected {'); const body:CoreSpiritAstNode[]=[]; while(!this.check('rightBrace')&&!this.check('eof'))body.push(this.statement()); this.consume('rightBrace','Expected }'); return body;}
  private expression(){return this.or();}
  private or(){let e=this.and();while(this.match('or'))e=this.binary(e,this.previous().lexeme,this.and());return e;}
  private and(){let e=this.equality();while(this.match('and'))e=this.binary(e,this.previous().lexeme,this.equality());return e;}
  private equality(){let e=this.comparison();while(this.match('equalEqual','bangEqual'))e=this.binary(e,this.previous().lexeme,this.comparison());return e;}
  private comparison(){let e=this.term();while(this.match('less','lessEqual','greater','greaterEqual'))e=this.binary(e,this.previous().lexeme,this.term());return e;}
  private term(){let e=this.factor();while(this.match('plus','minus'))e=this.binary(e,this.previous().lexeme,this.factor());return e;}
  private factor(){let e=this.unary();while(this.match('star','slash','percent'))e=this.binary(e,this.previous().lexeme,this.unary());return e;}
  private unary():CoreSpiritAstNode {if(this.match('bang','minus','plus')){const op=this.previous();return {type:'unary',operator:op.lexeme as '!'|'+'|'-',operand:this.unary(),span:this.makeSpan(op,this.previous())};}return this.postfix();}
  private postfix():CoreSpiritAstNode {let e=this.primary();while(true){if(this.match('leftBracket')){const idx=this.expression();const end=this.consume('rightBracket','Expected ]');e={type:'index',target:e,index:idx,span:this.makeSpanFrom(e,end)};}else if(this.match('leftParen')){const args:CoreSpiritAstNode[]=[];if(!this.check('rightParen')){do{args.push(this.expression());}while(this.match('comma'));}const end=this.consume('rightParen','Expected )');if(e.type!=='identifier')throw this.error('Only named functions can be called');e={type:'call',name:e.name,args,span:this.makeSpanFrom(e,end)};}else break;}return e;}
  private primary():CoreSpiritAstNode {if(this.match('number'))return {type:'number',value:this.previous().value as number,span:this.tokenSpan(this.previous())};if(this.match('string'))return {type:'string',value:this.previous().value as string,span:this.tokenSpan(this.previous())};if(this.match('true','false'))return {type:'boolean',value:this.previous().value as boolean,span:this.tokenSpan(this.previous())};if(this.match('null'))return {type:'null',value:null,span:this.tokenSpan(this.previous())};if(this.match('identifier'))return {type:'identifier',name:this.previous().lexeme,span:this.tokenSpan(this.previous())};if(this.match('leftParen')){const e=this.expression();this.consume('rightParen','Expected )');return e;}throw this.error('Expected expression');}
  private binary(left:CoreSpiritAstNode,operator:string,right:CoreSpiritAstNode):CoreSpiritAstNode{return {type:'binary',operator:operator as any,left,right,span:this.makeSpanFrom(left,right)};}
  private match(...types:any[]){if(types.some(t=>this.check(t))){this.advance();return true;}return false;}
  private check(type:any){return this.peek().type===type;}
  private advance(){if(!this.check('eof'))this.i++;return this.previous();}
  private consume(type:any,message:string){if(this.check(type))return this.advance();throw this.error(message);}
  private peek(){return this.tokens[this.i];} private previous(){return this.tokens[this.i-1];}
  private error(message:string){const t=this.peek();return new CoreSpiritSyntaxError(message,{offset:t.offset,line:t.line,column:t.column});}
  private tokenSpan(t:CoreSpiritToken):CoreSpiritSpan{return {start:t.offset,end:t.offset+t.lexeme.length,line:t.line,column:t.column};}
  private makeSpan(a:CoreSpiritToken,b:CoreSpiritToken):CoreSpiritSpan{return {start:a.offset,end:b.offset+b.lexeme.length,line:a.line,column:a.column};}
  private makeSpanFrom(a:CoreSpiritAstNode,b:CoreSpiritToken|CoreSpiritAstNode):CoreSpiritSpan{const as=(a as any).span;const bs=(b as any).span??this.tokenSpan(b as CoreSpiritToken);return {start:as?.start??0,end:bs?.end??as?.end??0,line:as?.line??1,column:as?.column??1};}
  private span(n:CoreSpiritAstNode){return (n as any).span;}
}

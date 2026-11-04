import { CoreSpiritAst, CoreSpiritAstNode, CoreSpiritSpan } from './ast';
import { CoreSpiritLexer, CoreSpiritSyntaxError, CoreSpiritToken } from './lexer';

export class CoreSpiritParser {
  private readonly tokens: CoreSpiritToken[];
  private i=0;
  constructor(source:string){this.tokens=new CoreSpiritLexer(source).tokenize();}

  parse(): CoreSpiritAst {
    const detailed=this.parseDetailed();
    if(detailed.diagnostics.length){
      throw new CoreSpiritSyntaxError(
        detailed.diagnostics[0].message,
        {
          offset:detailed.diagnostics[0].start ?? 0,
          line:detailed.diagnostics[0].line ?? 1,
          column:detailed.diagnostics[0].column ?? 1,
        },
      );
    }
    return detailed.ast;
  }

  parseDetailed(): { ast: CoreSpiritAst; diagnostics: Array<{message:string; line:number; column:number; start:number; end:number}> } {
    const body:CoreSpiritAstNode[]=[];
    const diagnostics:Array<{message:string;line:number;column:number;start:number;end:number}>=[];
    while(!this.check('eof')){
      const statementStart = this.i;
      try { body.push(this.statement()); }
      catch(error){
        const e=error instanceof CoreSpiritSyntaxError
          ? error
          : new CoreSpiritSyntaxError(String(error), {offset:this.peek().offset,line:this.peek().line,column:this.peek().column});
        diagnostics.push({
          message:e.message.replace(/ at \d+:\d+$/,''),
          line:e.position.line,
          column:e.position.column,
          start:e.position.offset,
          end:e.position.offset+Math.max(1,this.peek().lexeme.length),
        });
        this.synchronize();
      }
      // Recovery must always advance. If synchronize() stops on an unexpected
      // right brace at top level, retrying without consuming it grows diagnostics
      // indefinitely and can exhaust the build worker's memory.
      if (this.i === statementStart && !this.check('eof')) this.advance();
    }
    return {ast:{type:'program',body},diagnostics};
  }

  private statement():CoreSpiritAstNode {
    const annotations=this.parseAnnotations();
    let node:CoreSpiritAstNode;
    if(this.match('type')) node=this.typeDeclaration();
    else if(this.match('let')) node=this.letStatement();
    else if(this.match('on')) node=this.onEventStatement();
    else if(this.match('if')) node=this.ifStatement();
    else if(this.match('coreWhile')) node=this.whileStatement();
    else if(this.match('coreFor')) node=this.forEachStatement();
    else if(this.match('coreBreak')) { const token=this.previous(); this.match('semicolon'); node={type:'break',span:this.tokenSpan(token)}; }
    else if(this.match('coreContinue')) { const token=this.previous(); this.match('semicolon'); node={type:'continue',span:this.tokenSpan(token)}; }
    else if(this.check('identifier') && this.peek(1).type === 'colonEqual') node=this.assignmentStatement();
    else {
      const expression=this.expression();
      this.match('semicolon');
      node={type:'expressionStatement',expression,span:this.span(expression)};
    }
    if(annotations.length) (node as any).annotations=annotations;
    return node;
  }

  private parseAnnotations():Array<{name:string;args:string[];span?:CoreSpiritSpan}> {
    const annotations:Array<{name:string;args:string[];span?:CoreSpiritSpan}>=[];
    while(this.match('at')){
      const at=this.previous();
      const nameToken=this.consume('identifier','Expected annotation name after @');
      const args:string[]=[];
      let end=nameToken;
      if(this.match('leftParen')){
        if(!this.check('rightParen')){
          do {
            const token=this.peek();
            if(this.match('identifier','string','number','true','false','null')) {
              args.push(String(this.previous().value ?? this.previous().lexeme));
              end=this.previous();
            } else {
              throw this.error('Expected annotation argument');
            }
          } while(this.match('comma'));
        }
        end=this.consume('rightParen','Expected ) after annotation arguments');
      }
      annotations.push({name:nameToken.lexeme,args,span:this.makeSpan(at,end)});
    }
    return annotations;
  }

  private assignmentStatement():CoreSpiritAstNode {
    const name=this.consume('identifier','Expected state variable name before :=');
    this.consume('colonEqual','Expected := after state variable name');
    const expression=this.expression();
    this.match('semicolon');
    return {
      type:'assignment',
      name:name.lexeme,
      expression,
      span:this.makeSpan(name,this.previous()),
    };
  }

  private onEventStatement():CoreSpiritAstNode {
    const start=this.previous();
    const nameToken=this.consume('identifier','Expected event name after on');
    const parts=[nameToken.lexeme];
    while(this.match('dot')) parts.push(this.consume('identifier','Expected event segment after .').lexeme);
    let eventName=parts.join('.');
    if(this.match('leftParen')){
      const args:CoreSpiritAstNode[]=[];
      if(!this.check('rightParen')) { do { args.push(this.expression()); } while(this.match('comma')); }
      const endToken=this.consume('rightParen','Expected ) after event filter');
      const rendered=args.map(arg=>this.eventExpressionText(arg)).join(', ');
      eventName = `${eventName}(${rendered})`;
      void endToken;
    }
    const body=this.block();
    return { type:'onEvent', eventName, body, span:this.makeSpan(start,this.previous()) };
  }

  private eventExpressionText(node:CoreSpiritAstNode):string {
    switch(node.type){
      case 'string': return JSON.stringify(node.value);
      case 'number': return String(node.value);
      case 'boolean': return node.value ? 'true' : 'false';
      case 'null': return 'null';
      case 'identifier': return node.name;
      case 'member': return `${this.eventExpressionText(node.target)}.${node.member}`;
      case 'call': return `${node.name}(${node.args.map(arg=>this.eventExpressionText(arg)).join(', ')})`;
      default: return node.type;
    }
  }
  private typeDeclaration():CoreSpiritAstNode {
    const start=this.previous();
    const name=this.consume('identifier','Expected type name');
    this.consume('leftBrace','Expected { after type name');
    const fields:any[]=[];
    while(!this.check('rightBrace')&&!this.check('eof')){
      const field=this.consume('identifier','Expected field name');
      this.consume('colon','Expected : after field name');
      const typeStart=this.peek();
      const typeName=this.typeName();
      fields.push({
        name:field.lexeme,
        typeName,
        span:this.makeSpan(field,typeStart),
      });
      this.match('semicolon');
    }
    const end=this.consume('rightBrace','Expected } after type declaration');
    return {type:'typeDeclaration',name:name.lexeme,fields,span:this.makeSpan(start,end)} as any;
  }

  private letStatement():CoreSpiritAstNode {
    const name=this.consume('identifier','Expected variable name');
    let declaredType:string|undefined;
    if(this.match('colon')) declaredType=this.typeName();
    this.consume('equal','Expected = after variable name');
    const expression=this.expression();
    this.match('semicolon');
    return {
      type:'let',
      name:name.lexeme,
      declaredType,
      expression,
      span:this.makeSpan(name,this.previous()),
    };
  }

  private typeName():string {
    const base=this.consume('identifier','Expected type name').lexeme;
    if(!this.match('less')) return base;

    const args:string[]=[];
    do { args.push(this.typeName()); } while(this.match('comma'));
    this.consume('greater','Expected > after generic type');
    return `${base}<${args.join(',')}>`;
  }

  private whileStatement():CoreSpiritAstNode {
    const start=this.previous();
    this.consume('leftParen','Expected ( after while');
    const condition=this.expression();
    this.consume('rightParen','Expected ) after while condition');
    const body=this.block();
    return {type:'while',condition,body,span:this.makeSpan(start,this.previous())};
  }

  private forEachStatement():CoreSpiritAstNode {
    const start=this.previous();
    this.consume('leftParen','Expected ( after for');
    this.match('let');
    const name=this.consume('identifier','Expected loop variable after for');
    this.consume('coreIn','Expected in after loop variable');
    const iterable=this.expression();
    this.consume('rightParen','Expected ) after for iterable');
    const body=this.block();
    return {type:'forEach',name:name.lexeme,iterable,body,span:this.makeSpan(start,this.previous())};
  }

  private ifStatement():CoreSpiritAstNode {
    const start=this.previous();
    this.consume('leftParen','Expected ( after if');
    const condition=this.expression();
    this.consume('rightParen','Expected ) after condition');
    const thenBranch=this.block();
    let elseBranch:CoreSpiritAstNode[]|undefined;
    if(this.match('else')) elseBranch=this.block();
    return {type:'if',condition,thenBranch,elseBranch,span:this.makeSpan(start,this.previous())};
  }

  private block():CoreSpiritAstNode[]{
    this.consume('leftBrace','Expected {');
    const body:CoreSpiritAstNode[]=[];
    while(!this.check('rightBrace')&&!this.check('eof')) body.push(this.statement());
    this.consume('rightBrace','Expected }');
    return body;
  }

  private expression(){return this.or();}
  private or(){let e=this.and();while(this.match('or'))e=this.binary(e,this.previous().lexeme,this.and());return e;}
  private and(){let e=this.equality();while(this.match('and'))e=this.binary(e,this.previous().lexeme,this.equality());return e;}
  private equality(){let e=this.comparison();while(this.match('equalEqual','bangEqual'))e=this.binary(e,this.previous().lexeme,this.comparison());return e;}
  private comparison(){let e=this.term();while(this.match('less','lessEqual','greater','greaterEqual'))e=this.binary(e,this.previous().lexeme,this.term());return e;}
  private term(){let e=this.factor();while(this.match('plus','minus'))e=this.binary(e,this.previous().lexeme,this.factor());return e;}
  private factor(){let e=this.unary();while(this.match('star','slash','percent'))e=this.binary(e,this.previous().lexeme,this.unary());return e;}

  private unary():CoreSpiritAstNode {
    if(this.match('bang','minus','plus')){
      const op=this.previous();
      return {type:'unary',operator:op.lexeme as '!'|'+'|'-',operand:this.unary(),span:this.makeSpan(op,this.previous())};
    }
    return this.postfix();
  }

  private postfix():CoreSpiritAstNode {
    let e=this.primary();
    while(true){
      if(this.match('leftBracket')){
        const idx=this.expression();
        const end=this.consume('rightBracket','Expected ]');
        e={type:'index',target:e,index:idx,span:this.makeSpanFrom(e,end)};
      } else if(this.match('dot')){
        const member=this.consume('identifier','Expected member name after .');
        e={type:'member',target:e,member:member.lexeme,span:this.makeSpanFrom(e,member)};
      } else if(this.match('leftParen')){
        const args:CoreSpiritAstNode[]=[];
        if(!this.check('rightParen')){
          do { args.push(this.expression()); } while(this.match('comma'));
        }
        const end=this.consume('rightParen','Expected )');
        if(e.type==='identifier'){
          e={type:'call',name:e.name,args,span:this.makeSpanFrom(e,end)};
        } else if(e.type==='member'){
          e={type:'memberCall',target:e.target,member:e.member,args,span:this.makeSpanFrom(e,end)};
        } else {
          throw this.error('Only named functions or namespace members can be called');
        }
      } else break;
    }
    return e;
  }

  private primary():CoreSpiritAstNode {
    if(this.match('leftBracket')) {
      const start=this.previous();
      const elements:CoreSpiritAstNode[]=[];
      if(!this.check('rightBracket')) { do { elements.push(this.expression()); } while(this.match('comma')); }
      const end=this.consume('rightBracket','Expected ] after array literal');
      return {type:'arrayLiteral',elements,span:this.makeSpan(start,end)};
    }
    if(this.match('leftBrace')) {
      const start=this.previous();
      const entries:Array<{key:string;value:CoreSpiritAstNode}> = [];
      const keys=new Set<string>();
      if(!this.check('rightBrace')) {
        do {
          if(!this.match('identifier','string')) throw this.error('Map literal keys must be identifiers or strings');
          const key=String(this.previous().value ?? this.previous().lexeme);
          if(keys.has(key)) throw this.error(`Duplicate map key '${key}'`);
          keys.add(key);
          this.consume('colon','Expected : after map key');
          entries.push({key,value:this.expression()});
        } while(this.match('comma'));
      }
      const end=this.consume('rightBrace','Expected } after map literal');
      return {type:'mapLiteral',entries,span:this.makeSpan(start,end)};
    }
    if(this.match('number')) return {type:'number',value:this.previous().value as number,span:this.tokenSpan(this.previous())};
    if(this.match('string')) return {type:'string',value:this.previous().value as string,span:this.tokenSpan(this.previous())};
    if(this.match('true','false')) return {type:'boolean',value:this.previous().value as boolean,span:this.tokenSpan(this.previous())};
    if(this.match('null')) return {type:'null',value:null,span:this.tokenSpan(this.previous())};
    if(this.match('identifier')) return {type:'identifier',name:this.previous().lexeme,span:this.tokenSpan(this.previous())};
    if(this.match('leftParen')) { const e=this.expression(); this.consume('rightParen','Expected )'); return e; }
    throw this.error('Expected expression');
  }

  private binary(left:CoreSpiritAstNode,operator:string,right:CoreSpiritAstNode):CoreSpiritAstNode {
    return {type:'binary',operator:operator as any,left,right,span:this.makeSpanFrom(left,right)};
  }

  private synchronize(){
    while(!this.check('eof')){
      if(this.match('semicolon')) return;
      if(this.check('rightBrace')) return;
      this.advance();
    }
  }

  private match(...types:any[]){
    if(types.some(t=>this.check(t))){this.advance();return true;}
    return false;
  }

  private check(type:any){return this.peek().type===type;}
  private advance(){if(!this.check('eof'))this.i++;return this.previous();}
  private consume(type:any,message:string){if(this.check(type))return this.advance();throw this.error(message);}
  private peek(offset=0){return this.tokens[this.i+offset] ?? this.tokens[this.tokens.length-1]!;}
  private previous(){return this.tokens[Math.max(0,this.i-1)]!;}
  private error(message:string){const t=this.peek();return new CoreSpiritSyntaxError(message,{offset:t.offset,line:t.line,column:t.column});}
  private tokenSpan(t:CoreSpiritToken):CoreSpiritSpan{return {start:t.offset,end:t.offset+t.lexeme.length,line:t.line,column:t.column};}
  private makeSpan(a:CoreSpiritToken,b:CoreSpiritToken):CoreSpiritSpan{return {start:a.offset,end:b.offset+b.lexeme.length,line:a.line,column:a.column};}
  private makeSpanFrom(a:CoreSpiritAstNode,b:CoreSpiritToken|CoreSpiritAstNode):CoreSpiritSpan{const as=(a as any).span;const bs=(b as any).span??this.tokenSpan(b as CoreSpiritToken);return {start:as?.start??0,end:bs?.end??as?.end??0,line:as?.line??1,column:as?.column??1};}
  private span(n:CoreSpiritAstNode){return (n as any).span;}
}

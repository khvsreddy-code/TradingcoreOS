export type CoreSpiritTokenType =
  | 'identifier' | 'number' | 'string' | 'true' | 'false' | 'null'
  | 'let' | 'if' | 'else' | 'type' | 'on' | 'and' | 'or' | 'while' | 'for' | 'in' | 'break' | 'continue'
  | 'plus' | 'minus' | 'star' | 'slash' | 'percent' | 'bang'
  | 'equal' | 'equalEqual' | 'bangEqual' | 'less' | 'lessEqual' | 'greater' | 'greaterEqual'
  | 'leftParen' | 'rightParen' | 'leftBracket' | 'rightBracket' | 'leftBrace' | 'rightBrace'
  | 'comma' | 'semicolon' | 'colon' | 'colonEqual' | 'at' | 'dot' | 'eof';

export type CoreSpiritToken = { type: CoreSpiritTokenType; lexeme: string; value?: string | number | boolean | null; offset: number; line: number; column: number };

const keywords: Record<string, CoreSpiritTokenType> = { let: 'let', if: 'if', else: 'else', type: 'type', on: 'on', while:'while', for:'for', in:'in', break:'break', continue:'continue', true: 'true', false: 'false', null: 'null', and: 'and', or: 'or' };

export class CoreSpiritLexer {
  private i = 0; private line = 1; private column = 1;
  constructor(private readonly source: string) {}

  tokenize(): CoreSpiritToken[] {
    const out: CoreSpiritToken[] = [];
    while (!this.atEnd()) {
      const c = this.peek();
      if (/\s/.test(c)) { this.advanceWhitespace(); continue; }
      if (c === '/' && this.peek(1) === '/') { this.skipLineComment(); continue; }
      if (c === '/' && this.peek(1) === '*') { this.skipBlockComment(); continue; }
      if (/[A-Za-z_]/.test(c)) out.push(this.identifier());
      else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(this.peek(1)))) out.push(this.number());
      else if (c === '"' || c === "'") out.push(this.string());
      else out.push(this.symbol());
    }
    out.push({ type: 'eof', lexeme: '', offset: this.i, line: this.line, column: this.column });
    return out;
  }

  private identifier(): CoreSpiritToken { const s=this.pos(); while(/[A-Za-z0-9_]/.test(this.peek())) this.advance(); const lex=this.source.slice(s.offset,this.i); const type=keywords[lex]??'identifier'; const value=type==='true'?true:type==='false'?false:type==='null'?null:undefined; return {...s,type,lexeme:lex,value}; }
  private number(): CoreSpiritToken { const s=this.pos(); if(this.peek()==='0'&&(this.peek(1)==='x'||this.peek(1)==='X')){this.advance();this.advance();while(/[0-9a-fA-F]/.test(this.peek()))this.advance();}else{while(/[0-9]/.test(this.peek()))this.advance();if(this.peek()==='.'&&/[0-9]/.test(this.peek(1))){this.advance();while(/[0-9]/.test(this.peek()))this.advance();}if(this.peek().toLowerCase()==='e'){this.advance();if(this.peek()==='+'||this.peek()==='-')this.advance();while(/[0-9]/.test(this.peek()))this.advance();}} const lex=this.source.slice(s.offset,this.i); const value=Number(lex); if(!Number.isFinite(value)) throw new CoreSpiritSyntaxError('Invalid number',s); return {...s,type:'number',lexeme:lex,value}; }
  private string(): CoreSpiritToken { const s=this.pos(); const quote=this.advance(); let value=''; while(!this.atEnd()&&this.peek()!==quote){ if(this.peek()==='\\'){this.advance(); const e=this.advance(); value+=e==='n'?'\n':e==='r'?'\r':e==='t'?'\t':e; } else value+=this.advance(); } if(this.atEnd()) throw new CoreSpiritSyntaxError('Unterminated string',s); this.advance(); return {...s,type:'string',lexeme:this.source.slice(s.offset,this.i),value}; }
  private symbol(): CoreSpiritToken {
    const s=this.pos(); const c=this.advance(); const two=c+this.peek();
    const pairs:Record<string,CoreSpiritTokenType>={'==':'equalEqual','!=':'bangEqual','<=':'lessEqual','>=':'greaterEqual',':=':'colonEqual'};
    if(pairs[two]){this.advance();return {...s,type:pairs[two],lexeme:two};}
    const one:Record<string,CoreSpiritTokenType>={'+':'plus','-':'minus','*':'star','/':'slash','%':'percent','!':'bang','=':'equal','<':'less','>':'greater','(':'leftParen',')':'rightParen','[':'leftBracket',']':'rightBracket','{':'leftBrace','}':'rightBrace',',':'comma',';':'semicolon',':':'colon','@':'at','.':'dot'};
    const type=one[c]; if(!type) throw new CoreSpiritSyntaxError(`Unexpected character '${c}'`,s); return {...s,type,lexeme:c};
  }
  private skipLineComment(){while(!this.atEnd()&&this.peek()!=='\n')this.advance();}
  private skipBlockComment(){const start=this.pos();this.advance();this.advance();while(!this.atEnd()){if(this.peek()==='*'&&this.peek(1)==='/'){this.advance();this.advance();return;}this.advance();}throw new CoreSpiritSyntaxError('Unterminated block comment',start);}
  private advanceWhitespace(){this.advance();}
  private advance(){const c=this.source[this.i++]??''; if(c==='\n'){this.line++;this.column=1;}else this.column++; return c;}
  private peek(n=0){return this.source[this.i+n]??'\0';}
  private atEnd(){return this.i>=this.source.length;}
  private pos(){return {offset:this.i,line:this.line,column:this.column};}
}
export class CoreSpiritSyntaxError extends Error { constructor(message:string, public readonly position:{offset:number;line:number;column:number}){super(`${message} at ${position.line}:${position.column}`);this.name='CoreSpiritSyntaxError';} }

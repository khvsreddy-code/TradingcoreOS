import { CoreSpiritLexer, CoreSpiritToken } from './lexer';

const BOUNDARY_LEXEMES = new Set([
  'and','or','let','if','else','type','when','show','emit','model','automate',
  'input','indicator','strategy','automation','app',
]);

const BOUNDARY_TYPES = new Set([
  'equalEqual','bangEqual','less','lessEqual','greater','greaterEqual',
  'plus','minus','star','slash','percent','comma','semicolon',
  'colon','leftBrace','rightBrace',
]);

type SpanReplacement = { start:number; end:number; text:string };

function findMatchingOpen(tokens: CoreSpiritToken[], index:number, open:'leftParen'|'leftBracket', close:'rightParen'|'rightBracket'):number {
  let depth=0;
  for(let i=index;i>=0;i-=1){
    if(tokens[i].type===close) depth+=1;
    else if(tokens[i].type===open){
      depth-=1;
      if(depth===0) return i;
    }
  }
  return -1;
}

function findExpressionStart(tokens: CoreSpiritToken[], index:number):number {
  let i=index;
  while(i>=0){
    const token=tokens[i];
    if(token.type==='rightParen'){
      const open=findMatchingOpen(tokens,i,'leftParen','rightParen');
      if(open<0) return i;
      i=open-1;
      if(i>=0 && (tokens[i].type==='identifier'||tokens[i].type==='number'||tokens[i].type==='string')) i-=1;
      continue;
    }
    if(token.type==='rightBracket'){
      const open=findMatchingOpen(tokens,i,'leftBracket','rightBracket');
      if(open<0) return i;
      i=open-1;
      continue;
    }
    if(token.type==='dot'){
      i-=1;
      continue;
    }
    if(token.type==='identifier'||token.type==='number'||token.type==='string'||token.type==='true'||token.type==='false'||token.type==='null'){
      if(token.type==='identifier' && BOUNDARY_LEXEMES.has(token.lexeme)) return i+1;
      i-=1;
      continue;
    }
    break;
  }
  return Math.max(0,i+1);
}

function findExpressionEnd(tokens: CoreSpiritToken[], index:number):number {
  let i=index;
  let parenDepth=0;
  let bracketDepth=0;
  const firstLine=tokens[index]?.line ?? 1;
  while(i<tokens.length){
    const token=tokens[i];
    if(token.type==='leftParen') parenDepth+=1;
    else if(token.type==='rightParen'){
      if(parenDepth===0) break;
      parenDepth-=1;
    } else if(token.type==='leftBracket') bracketDepth+=1;
    else if(token.type==='rightBracket'){
      if(bracketDepth===0) break;
      bracketDepth-=1;
    }
    if(parenDepth===0&&bracketDepth===0){
      if(token.type==='eof'||BOUNDARY_TYPES.has(token.type)) break;
      if(token.type==='identifier' && BOUNDARY_LEXEMES.has(token.lexeme)) break;
      if(i>index && token.line>firstLine) break;
    }
    i+=1;
  }
  return Math.max(index,i-1);
}

/**
 * Token-aware readable-operator normalization.
 *
 * This is intentionally narrower than the legacy surface normalizer: it only
 * rewrites a genuine identifier operator surrounded by balanced expressions.
 * Strings/comments are never inspected because the CoreSpirit lexer does not
 * emit them as identifier tokens.
 */
export function normalizeReadableOperatorsWithTokens(source:string):string {
  const input=String(source||'');
  let tokens:CoreSpiritToken[];
  try { tokens=new CoreSpiritLexer(input).tokenize(); }
  catch { return input; }

  const replacements:SpanReplacement[]=[];
  for(let i=0;i<tokens.length;i+=1){
    const token=tokens[i];
    if(token.type!=='identifier'||(token.lexeme!=='crossesAbove'&&token.lexeme!=='crossesBelow')) continue;
    const leftIndex=i-1;
    const rightIndex=i+1;
    if(leftIndex<0||rightIndex>=tokens.length) continue;
    const leftStartIndex=findExpressionStart(tokens,leftIndex);
    const rightEndIndex=findExpressionEnd(tokens,rightIndex);
    const leftStart=tokens[leftStartIndex]?.offset;
    const leftEnd=tokens[leftIndex]?.offset + tokens[leftIndex]?.lexeme.length;
    const rightStart=tokens[rightIndex]?.offset;
    const rightEnd=tokens[rightEndIndex]?.offset + tokens[rightEndIndex]?.lexeme.length;
    if(leftStart==null||leftEnd==null||rightStart==null||rightEnd==null||leftStart>=leftEnd||rightStart>=rightEnd) continue;
    const left=input.slice(leftStart,leftEnd).trim();
    const right=input.slice(rightStart,rightEnd).trim();
    if(!left||!right) continue;
    const call=token.lexeme==='crossesAbove'?'crossover':'crossunder';
    replacements.push({start:leftStart,end:rightEnd,text:`${call}(${left}, ${right})`});
  }

  const accepted:SpanReplacement[]=[];
  let cursor=-1;
  for(const replacement of replacements.sort((a,b)=>a.start-b.start)){
    if(replacement.start<=cursor) continue;
    accepted.push(replacement);
    cursor=replacement.end;
  }
  if(!accepted.length) return input;

  let out=input;
  for(let i=accepted.length-1;i>=0;i-=1){
    const r=accepted[i];
    out=out.slice(0,r.start)+r.text+out.slice(r.end);
  }
  return out;
}

type ProtectedRange = { start:number; end:number; value:string };

function scanProtectedRanges(source:string):ProtectedRange[] {
  const ranges:ProtectedRange[]=[];
  let i=0;
  while(i<source.length){
    const c=source[i];
    if(c==='/'&&source[i+1]==='/'){
      const start=i;
      i+=2;
      while(i<source.length&&source[i]!=='\n') i+=1;
      ranges.push({start,end:i,value:source.slice(start,i)});
      continue;
    }
    if(c==='/'&&source[i+1]==='*'){
      const start=i;
      i+=2;
      while(i<source.length&&!(source[i]==='*'&&source[i+1]==='/')) i+=1;
      i=Math.min(source.length,i+2);
      ranges.push({start,end:i,value:source.slice(start,i)});
      continue;
    }
    if(c==='"'||c==="'"){
      const start=i;
      const quote=c;
      i+=1;
      while(i<source.length){
        if(source[i]==='\\'){i+=2;continue;}
        if(source[i]===quote){i+=1;break;}
        i+=1;
      }
      ranges.push({start,end:i,value:source.slice(start,i)});
      continue;
    }
    i+=1;
  }
  return ranges;
}

/**
 * Runs the still-existing line/regex compatibility transforms without allowing
 * them to inspect strings or comments. This is a containment boundary while
 * those transforms are incrementally retired in favor of token/AST transforms.
 */
export function withProtectedCoreSpiritSurfaceText(source:string, transform:(code:string)=>string):string {
  const ranges=scanProtectedRanges(source);
  if(!ranges.length) return transform(source);
  const placeholders=ranges.map((range,index)=>`__CORESPIRIT_PROTECTED_${index}__`);
  let masked='';
  let cursor=0;
  for(const [index,range] of ranges.entries()){
    masked+=source.slice(cursor,range.start)+placeholders[index];
    cursor=range.end;
  }
  masked+=source.slice(cursor);
  const transformed=transform(masked);
  return transformed.replace(/__CORESPIRIT_PROTECTED_(\d+)__/g,(_full,index)=>ranges[Number(index)]?.value??'');
}

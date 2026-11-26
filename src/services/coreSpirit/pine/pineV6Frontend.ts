import type { CoreSpiritAst, CoreSpiritPineDeclarationArgument, CoreSpiritPineDeclarationMetadata, CoreSpiritProgramKind } from '../ast';
import { CoreSpiritParser } from '../parser';
import { normalizeCoreSpiritSource } from '../syntax';
import type { CoreSpiritFrontendDiagnostic, CoreSpiritFrontendParseResult, CoreSpiritLanguageFrontend } from '../frontends';

type PineDeclarationKind = 'indicator'|'strategy'|'library';
type ParsedHeader = Readonly<{ start:number; end:number; metadata:CoreSpiritPineDeclarationMetadata }>;

function lineColumn(source:string, offset:number):{line:number;column:number} {
  const before=source.slice(0,offset); const lines=before.split('\n');
  return {line:lines.length,column:(lines.at(-1)?.length ?? 0)+1};
}
function diagnostic(source:string, code:string, message:string, start=0, end=start+1):CoreSpiritFrontendDiagnostic {
  return {severity:'error',code,message,start,end,...lineColumn(source,start)};
}
function skipTrivia(source:string, from:number):number {
  let i=from;
  while(i<source.length){
    if(/\s/.test(source[i]!)){i+=1;continue;}
    if(source.startsWith('//',i)){const end=source.indexOf('\n',i+2);i=end<0?source.length:end+1;continue;}
    if(source.startsWith('/*',i)){const end=source.indexOf('*/',i+2);if(end<0)return source.length;i=end+2;continue;}
    break;
  }
  return i;
}
function findCallEnd(source:string, open:number):number {
  let depth=0; let quote=''; let lineComment=false; let blockComment=false;
  for(let i=open;i<source.length;i++){
    const c=source[i]!, next=source[i+1]??'';
    if(lineComment){if(c==='\n')lineComment=false;continue;}
    if(blockComment){if(c==='*'&&next==='/'){blockComment=false;i+=1;}continue;}
    if(quote){if(c==='\\'){i+=1;continue;}if(c===quote)quote='';continue;}
    if(c==='/'&&next==='/'){lineComment=true;i+=1;continue;}
    if(c==='/'&&next==='*'){blockComment=true;i+=1;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='(')depth+=1;
    else if(c===')'){depth-=1;if(depth===0)return i+1;}
  }
  return -1;
}
function splitArguments(raw:string):string[] {
  const out:string[]=[];let start=0,depth=0,quote='';
  for(let i=0;i<raw.length;i++){
    const c=raw[i]!;
    if(quote){if(c==='\\'){i+=1;continue;}if(c===quote)quote='';continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='('||c==='['||c==='{')depth+=1;
    else if(c===')'||c===']'||c==='}')depth-=1;
    else if(c===','&&depth===0){out.push(raw.slice(start,i).trim());start=i+1;}
  }
  const tail=raw.slice(start).trim();if(tail)out.push(tail);
  return out;
}
function splitNamedArgument(value:string):CoreSpiritPineDeclarationArgument {
  let depth=0,quote='';
  for(let i=0;i<value.length;i++){
    const c=value[i]!;
    if(quote){if(c==='\\'){i+=1;continue;}if(c===quote)quote='';continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='('||c==='['||c==='{')depth+=1;
    else if(c===')'||c===']'||c==='}')depth-=1;
    else if(c==='='&&depth===0){
      const name=value.slice(0,i).trim();
      if(/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))return Object.freeze({name,value:value.slice(i+1).trim()});
    }
  }
  return Object.freeze({value:value.trim()});
}
function decodePineString(raw:string):string|undefined {
  const value=raw.trim();
  if(value.length<2||(value[0]!=='"'&&value[0]!=="'")||value.at(-1)!==value[0])return undefined;
  const body=value.slice(1,-1);
  return body.replace(/\\([\\\"'nrt])/g,(_match,escaped:string)=>escaped==='n'?'\n':escaped==='r'?'\r':escaped==='t'?'\t':escaped);
}
function maskCommentsAndStrings(source:string):string {
  const chars=source.split('');let quote='',lineComment=false,blockComment=false;
  for(let i=0;i<source.length;i++){
    const c=source[i]!,next=source[i+1]??'';
    if(lineComment){if(c==='\n')lineComment=false;else chars[i]=' ';continue;}
    if(blockComment){if(c==='*'&&next==='/'){chars[i]=' ';chars[i+1]=' ';i+=1;blockComment=false;}else if(c!=='\n')chars[i]=' ';continue;}
    if(quote){if(c==='\\'){chars[i]=' ';if(i+1<source.length){if(source[i+1]!=='\n')chars[i+1]=' ';i+=1;}continue;}if(c===quote)quote='';if(c!=='\n')chars[i]=' ';continue;}
    if(c==='/'&&next==='/'){chars[i]=' ';chars[i+1]=' ';i+=1;lineComment=true;continue;}
    if(c==='/'&&next==='*'){chars[i]=' ';chars[i+1]=' ';i+=1;blockComment=true;continue;}
    if(c==='"'||c==="'"){quote=c;chars[i]=' ';}
  }
  return chars.join('');
}
function parseHeader(source:string):{header?:ParsedHeader;diagnostics:CoreSpiritFrontendDiagnostic[]} {
  const diagnostics:CoreSpiritFrontendDiagnostic[]=[];
  const versionMatches=[...source.matchAll(/\/\/\s*@version\s*=\s*(\d+)\s*(?:\r?\n|$)/g)];
  if(versionMatches.length>1){diagnostics.push(diagnostic(source,'PINE_DUPLICATE_VERSION','A Pine script can contain only one version directive.',versionMatches[1]!.index??0));return {diagnostics};}
  const version=versionMatches.length?Number(versionMatches[0]![1]):1;
  if(version!==6){
    const index=versionMatches[0]?.index??0;
    diagnostics.push(diagnostic(source,'PINE_VERSION_UNSUPPORTED',version===1?'Pine defaults to v1 when no version annotation is present; this frontend currently targets explicit Pine v6.':`Pine version ${version} is not supported by the Pine v6 frontend.`,index,index+Math.max(1,versionMatches[0]?.[0].length??1)));
    return {diagnostics};
  }
  const codeStart=skipTrivia(source,0);
  const remaining=source.slice(codeStart);
  const match=/^(indicator|strategy|library)\s*\(/.exec(remaining);
  if(!match){
    diagnostics.push(diagnostic(source,'PINE_MISSING_DECLARATION','Pine v6 scripts must begin with exactly one global indicator(), strategy(), or library() declaration.',codeStart));
    return {diagnostics};
  }
  const kind=match[1] as PineDeclarationKind;
  const open=codeStart+match[0].lastIndexOf('(');
  const end=findCallEnd(source,open);
  if(end<0){diagnostics.push(diagnostic(source,'PINE_UNCLOSED_DECLARATION',`Unclosed ${kind}() declaration.`,codeStart,source.length));return {diagnostics};}
  const rawArgs=source.slice(open+1,end-1);
  const args=splitArguments(rawArgs).map(splitNamedArgument);
  const namedTitle=args.find(arg=>arg.name==='title')?.value;
  const positionalTitle=args.find(arg=>!arg.name)?.value;
  const title=decodePineString(positionalTitle??namedTitle??'');
  if(!title){diagnostics.push(diagnostic(source,'PINE_DECLARATION_TITLE','The first declaration argument must be a literal title string.',codeStart,end));return {diagnostics};}
  const rest=source.slice(end);
  const declarationCalls=[...maskCommentsAndStrings(rest).matchAll(/\b(?:indicator|strategy|library)\s*\(/g)];
  if(declarationCalls.length){
    const offset=end+(declarationCalls[0]!.index??0);
    diagnostics.push(diagnostic(source,'PINE_DUPLICATE_OR_SCOPED_DECLARATION','Only one global script declaration is allowed; declaration calls cannot appear in local scopes.',offset,offset+declarationCalls[0]![0].length));
    return {diagnostics};
  }
  const metadata:CoreSpiritPineDeclarationMetadata=Object.freeze({version:6,kind,title,arguments:Object.freeze(args)});
  return {header:Object.freeze({start:codeStart,end,metadata}),diagnostics};
}
function blankRange(source:string,start:number,end:number):string {
  return source.slice(0,start)+source.slice(start,end).replace(/[^\r\n]/g,' ')+source.slice(end);
}

export class PineV6Frontend implements CoreSpiritLanguageFrontend {
  readonly id='pine-v6' as const;
  parse(source:string):CoreSpiritFrontendParseResult {
    const original=String(source??'');
    const parsedHeader=parseHeader(original);
    if(parsedHeader.diagnostics.length)return {frontend:this.id,normalizedSource:original,diagnostics:parsedHeader.diagnostics};
    const header=parsedHeader.header!;
    const body=blankRange(original,header.start,header.end);
    let normalizedSource:string;
    try{normalizedSource=normalizeCoreSpiritSource(body);}
    catch(error){return {frontend:this.id,normalizedSource:body,diagnostics:[diagnostic(original,'PINE_NORMALIZE_ERROR',error instanceof Error?error.message:String(error))]};}
    try{
      const parsed=new CoreSpiritParser(normalizedSource).parseDetailed();
      if(parsed.diagnostics.length)return {frontend:this.id,normalizedSource,diagnostics:parsed.diagnostics.map(item=>({severity:'error' as const,code:'PINE_SYNTAX_ERROR',message:item.message,start:item.start,end:item.end,line:item.line,column:item.column}))};
      const programKind=header.metadata.kind as CoreSpiritProgramKind;
      const ast:CoreSpiritAst={...parsed.ast,programKind,pineDeclaration:header.metadata};
      return {frontend:this.id,normalizedSource,ast,diagnostics:[]};
    }catch(error){
      const failure=error as {message?:string;position?:{offset?:number;line?:number;column?:number}};
      const offset=Math.max(0,Number(failure?.position?.offset)||0);
      return {frontend:this.id,normalizedSource,diagnostics:[diagnostic(original,'PINE_PARSE_ERROR',failure?.message??String(error),offset,offset+1)]};
    }
  }
}

export function validatePineV6DeclarationMetadata(metadata:CoreSpiritPineDeclarationMetadata):string[] {
  const errors:string[]=[];
  if(metadata.version!==6)errors.push('Pine declaration metadata version must be 6.');
  if(!metadata.title.trim())errors.push('Pine declaration title cannot be empty.');
  if(!['indicator','strategy','library'].includes(metadata.kind))errors.push('Unsupported Pine declaration kind.');
  return errors;
}
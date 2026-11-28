import type { CoreSpiritAst, CoreSpiritFrontendId } from './ast';
import { CoreSpiritParser, readCoreSpiritProgramDeclaration } from './parser';
import { normalizeCoreSpiritSource } from './syntax';
import { PineV6Frontend } from './pine/pineV6Frontend';

export type CoreSpiritFrontendDiagnostic = Readonly<{
  severity: 'error' | 'warning';
  code: string;
  message: string;
  start?: number;
  end?: number;
  line?: number;
  column?: number;
}>;
export type CoreSpiritFrontendParseResult = Readonly<{
  frontend: CoreSpiritFrontendId;
  normalizedSource: string;
  ast?: CoreSpiritAst;
  diagnostics: readonly CoreSpiritFrontendDiagnostic[];
}>;

/** A frontend emits canonical AST only; it cannot emit executable IR or call the VM. */
export interface CoreSpiritLanguageFrontend {
  readonly id: CoreSpiritFrontendId;
  parse(source: string): CoreSpiritFrontendParseResult;
}

export class CoreScriptFrontend implements CoreSpiritLanguageFrontend {
  readonly id = 'corescript' as const;
  parse(source: string): CoreSpiritFrontendParseResult {
    const original=String(source ?? '');
    let normalizedSource=original;
    try {
      normalizedSource=normalizeCoreSpiritSource(original);
      const parsed=new CoreSpiritParser(normalizedSource).parseDetailed();
      const programDeclaration=readCoreSpiritProgramDeclaration(original);
      if(programDeclaration){
        parsed.ast.programKind=programDeclaration.kind;
        parsed.ast.programTitle=programDeclaration.title;
      }
      const diagnostics=parsed.diagnostics.map(item => ({
        severity:'error' as const, code:'SYNTAX_ERROR', message:item.message,
        start:item.start, end:item.end, line:item.line, column:item.column,
      }));
      return {frontend:this.id,normalizedSource,ast:diagnostics.length ? undefined : parsed.ast,diagnostics};
    } catch(error) {
      const failure=error as {message?:string;position?:{offset?:number;line?:number;column?:number}};
      const start=Math.max(0,Number(failure?.position?.offset) || 0);
      return {frontend:this.id,normalizedSource,diagnostics:[{
        severity:'error',code:'FRONTEND_PARSE_ERROR',message:failure?.message || String(error),
        start,end:start+1,line:failure?.position?.line ?? 1,column:failure?.position?.column ?? 1,
      }]};
    }
  }
}

const frontends=new Map<CoreSpiritFrontendId,CoreSpiritLanguageFrontend>();
frontends.set('corescript',new CoreScriptFrontend());
frontends.set('pine-v6',new PineV6Frontend());

export function registerCoreSpiritFrontend(frontend: CoreSpiritLanguageFrontend): () => void {
  const current=frontends.get(frontend.id);
  if(current && current !== frontend) throw new Error(`CoreSpirit frontend '${frontend.id}' is already registered.`);
  frontends.set(frontend.id,frontend);
  return () => { if(frontends.get(frontend.id)===frontend) frontends.delete(frontend.id); };
}
export function getCoreSpiritFrontend(id: CoreSpiritFrontendId): CoreSpiritLanguageFrontend | undefined {
  return frontends.get(id);
}
export function parseWithCoreSpiritFrontend(id: CoreSpiritFrontendId, source: string): CoreSpiritFrontendParseResult {
  const frontend=frontends.get(id);
  if(!frontend) return {
    frontend:id,normalizedSource:String(source ?? ''),
    diagnostics:[{
      severity:'error',code:'FRONTEND_NOT_REGISTERED',
      message:id==='pine-v6'
        ? 'The Pine Script v6 frontend is not registered; Pine source is not parsed as CoreScript.'
        : `CoreSpirit frontend '${id}' is not registered.`,
      start:0,end:0,line:1,column:1,
    }],
  };
  return frontend.parse(source);
}

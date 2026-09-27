import { CoreSpiritAstNode, CoreSpiritAst } from './ast';
import { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import { analyzeCoreSpirit, CoreSpiritDiagnostic } from './semanticAnalyzer';
import { CoreSpiritExecutableArtifact, makeExecutableArtifact } from './artifact';
import { resolveCoreSpiritNames } from './nameResolver';
import { optimizeCoreSpiritIr } from './optimizer';
import { validateCoreSpiritIr } from './irContract';
import type { CoreSpiritProgramLayer } from './layeredPlatformContract';
import { buildCoreSpiritGraphBundle } from './semanticGraph';
import { getCoreSpiritBuiltin } from './standardLibrary';
import { getCoreSpiritMemberContract, CORE_SPIRIT_ROOT_NAMESPACES } from './memberRegistry';
import type { CoreSpiritSurfaceMetadata } from './languageConcepts';
import { createCoreSpiritCompilationUnit } from './compilerPipeline';

export type CoreSpiritCompileResult = { ir?: CoreSpiritIrProgram; diagnostics: CoreSpiritDiagnostic[]; artifact?: CoreSpiritExecutableArtifact };

export class CoreSpiritCompiler {
  compileSource(
    source: string,
    sourceId = 'coreSpirit',
    options: { layer?: CoreSpiritProgramLayer; surface?: CoreSpiritSurfaceMetadata } = {},
  ): CoreSpiritCompileResult {
    const unit = createCoreSpiritCompilationUnit(source, options);
    const errors = unit.diagnostics.filter(d => d.severity === 'error');
    if (errors.length || !unit.semantic) return { diagnostics: unit.diagnostics };
    return this.compile(unit.ast, sourceId, options);
  }

  compile(ast: CoreSpiritAst, sourceId = 'coreSpirit', options: { layer?: CoreSpiritProgramLayer; surface?: CoreSpiritSurfaceMetadata } = {}): CoreSpiritCompileResult {
    const layer: CoreSpiritProgramLayer = options.layer || 'script';
    const names = resolveCoreSpiritNames(ast);
    const semantic = analyzeCoreSpirit(ast, { layer, surface: options.surface });
    const stageDiagnostics = Array.from(new Map([...names.diagnostics.map(d => ({ ...d })), ...semantic.diagnostics].map(d => [`${d.code ?? ''}|${d.message}|${d.start ?? ''}`, d])).values());
    if (stageDiagnostics.some(d => d.severity === 'error')) return { diagnostics: stageDiagnostics };
    const instructions: CoreSpiritIrInstruction[] = [];
    const locals: string[] = [];
    const originFor = (node: CoreSpiritAstNode) => node.span ? {
      sourceNodeId: node.type + ':' + node.span.start + ':' + node.span.end,
      start: node.span.start,
      end: node.span.end,
      line: node.span.line,
      column: node.span.column,
    } : undefined;
    const emitInstruction = (node: CoreSpiritAstNode, instruction: CoreSpiritIrInstruction): void => {
      const origin = originFor(node);
      instructions.push(origin ? ({ ...instruction, origin } as CoreSpiritIrInstruction) : instruction);
    };
    const dataRefRegisters = new Map<string, string>();
    const modelRefRegisters = new Map<string, string>();
    const dataMemberSources = new Map<CoreSpiritAstNode, { ref: string; field: 'open'|'high'|'low'|'close'|'volume'|'time' }>();
    let temp = 0;

    const expr = (n: CoreSpiritAstNode): string => {
      switch (n.type) {
        case 'number': case 'string': case 'boolean': case 'null': {
          const dest = `t${temp++}`;
          emitInstruction(n, { op: 'const', dest, value: n.value as number | string | boolean | null }); return dest;
        }
        case 'identifier': {
          const dest = `t${temp++}`;
          if (['open','high','low','close','volume','time'].includes(n.name)) emitInstruction(n, { op:'loadSeries', dest, name:n.name, offset:0 });
          else if (n.name === 'bar_index') emitInstruction(n, { op:'call', dest, name:'bar_index', args:[], callId:`bar_index:${n.span?.start ?? temp}` });
          else if (n.name === 'na') emitInstruction(n, { op:'const', dest, value:null });
          else emitInstruction(n, { op:'move', dest, source:n.name });
          return dest;
        }
        case 'unary': { const operand=expr(n.operand), dest=`t${temp++}`; emitInstruction(n, {op:'unary',dest,operator:n.operator,operand}); return dest; }
        case 'binary': { const left=expr(n.left),right=expr(n.right),dest=`t${temp++}`;emitInstruction(n, {op:'binary',dest,operator:n.operator,left,right});return dest; }
        case 'call': {
          const args=n.args.map(expr),dest=`t${temp++}`;
          const seriesArgs=n.args.filter(a=>a.type==='identifier'&&['open','high','low','close','volume','time'].includes(a.name)).map(a=>(a as any).name);
          const seriesSources = n.args.flatMap(arg => { const source = dataMemberSources.get(arg); return source ? [source] : []; });
          emitInstruction(n, {op:'call',dest,name:n.name,args,seriesArgs,seriesSources:seriesSources.length ? seriesSources : undefined,callId:`${n.name}:${n.span?.start ?? temp}`});
          const builtin = getCoreSpiritBuiltin(n.name);
          if (builtin?.emitKind) {
            emitInstruction(n, {op:'emit',kind:builtin.emitKind,args:[dest,...args],outputId:`${builtin.emitKind}:${n.span?.start ?? temp}`});
          }
          if (n.name === 'market' || n.name === 'timeframe') dataRefRegisters.set(n.span ? `${n.span.start}:${n.span.end}` : `temp:${dest}`, dest);
          return dest;
        }
        case 'memberCall': {
          const rootNamespace = n.target.type === 'identifier' && CORE_SPIRIT_ROOT_NAMESPACES.includes(n.target.name as any) ? n.target.name : undefined;
          const namespace = rootNamespace || 'panel';
          const contract = getCoreSpiritMemberContract(namespace, n.member);
          if (!contract) throw new Error(`Unknown member '${namespace}.${n.member}'.`);
          const target = rootNamespace ? undefined : expr(n.target);
          const actionPositions = new Set(contract.actionArgIndices || []);
          const args = n.args.map((arg, index) => {
            if (actionPositions.has(index) && arg.type === 'identifier' && !locals.includes(arg.name)) {
              const actionDest = `t${temp++}`;
              emitInstruction(n, { op:'const', dest:actionDest, value:arg.name });
              return actionDest;
            }
            return expr(arg);
          });
          const dest=`t${temp++}`;
          emitInstruction(n, {op:'call', dest, name:contract.callName, args:target ? [target,...args] : args, callId:`${contract.callName}:${n.span?.start ?? temp}`});
          if (contract.emitKind) {
            emitInstruction(n, {op:'emit',kind:contract.emitKind,args:[dest,...args],outputId:`${contract.emitKind}:${n.span?.start ?? temp}`});
          }
          return dest;
        }
        case 'member': {
          if (n.target.type === 'identifier' && n.target.name === 'chart' && ['price','volume','indicator','custom'].includes(n.member)) {
            const memberDest=`t${temp++}`; const areaDest=`t${temp++}`;
            emitInstruction(n, { op:'const', dest:areaDest, value:n.member });
            emitInstruction(n, { op:'call', dest:memberDest, name:'visual.area', args:[areaDest], callId:`chart.area:${n.member}:${n.span?.start ?? temp}` });
            return memberDest;
          }
          const isModelRef = (n.target.type === 'call' && n.target.name === 'model') ||
            (n.target.type === 'identifier' && modelRefRegisters.has(n.target.name));
          if (isModelRef) {
            const target = expr(n.target);
            const memberDest = `t${temp++}`;
            const memberName = `t${temp++}`;
            emitInstruction(n, { op:'const', dest:memberName, value:n.member });
            emitInstruction(n, { op:'call', dest:memberDest, name:'__model_get', args:[target,memberName], callId:`model:${n.member}:${n.span?.start ?? temp}` });
            return memberDest;
          }
          const target = expr(n.target);
          const isDataRef = n.target.type === 'identifier' && dataRefRegisters.has(n.target.name) || n.target.type === 'call' && (n.target.name === 'market' || n.target.name === 'timeframe');
          if (!isDataRef) throw new Error(`Member access '${n.member}' is only executable for market()/timeframe() references or chart areas.`);
          const memberDest=`t${temp++}`; const memberName=`t${temp++}`;
          emitInstruction(n, {op:'const',dest:memberName,value:n.member});
          emitInstruction(n, {op:'call',dest:memberDest,name:'__member_get',args:[target,memberName],callId:`member:${n.member}:${n.span?.start ?? temp}`});
          const refRegister = n.target.type === 'identifier' ? (dataRefRegisters.get(n.target.name) || target) : target;
          dataMemberSources.set(n,{ ref: refRegister, field: n.member as 'open'|'high'|'low'|'close'|'volume'|'time' });
          return memberDest;
        }
        case 'typeDeclaration': return '';
        case 'index': {
          const target=expr(n.target), index=expr(n.index), dest=`t${temp++}`;
          if(n.target.type==='identifier'&&n.index.type==='number'&&typeof n.index.value==='number'&&Number.isInteger(n.index.value)) emitInstruction(n, {op:'loadSeries',dest,name:n.target.name,offset:n.index.value});
          else if(n.target.type==='identifier'&&['open','high','low','close','volume','time'].includes(n.target.name)) emitInstruction(n, {op:'index',dest,target,index,seriesName:n.target.name});
          else if(n.target.type==='identifier') emitInstruction(n, {op:'index',dest,target,index,seriesName:n.target.name});
          else emitInstruction(n, {op:'index',dest,target,index});
          return dest;
        }
        default: throw new Error(`Unsupported expression node ${n.type}`);
      }
    };
    const stmt=(n:CoreSpiritAstNode):void=>{
      switch(n.type){
        case 'program': n.body.forEach(stmt); break;
        case 'typeDeclaration': break;
        case 'let': {
          const source=expr(n.expression);
          const isDataRef = n.expression.type === 'call' && (n.expression.name === 'market' || n.expression.name === 'timeframe');
          const isModelRef = n.expression.type === 'call' && n.expression.name === 'model';
          if (isDataRef) dataRefRegisters.set(n.name, source);
          if (isModelRef) modelRefRegisters.set(n.name, source);
          emitInstruction(n, {op:'setLocal',name:n.name,source,series:!isDataRef && !isModelRef});
          if(!locals.includes(n.name))locals.push(n.name);
          break;
        }
        case 'expressionStatement': expr(n.expression); break;
        case 'if': {
          const condition=expr(n.condition), jumpFalse=instructions.length; emitInstruction(n, {op:'jumpIfFalse',condition,target:-1});
          n.thenBranch.forEach(stmt);
          if(n.elseBranch?.length){const jumpEnd=instructions.length;emitInstruction(n, {op:'jump',target:-1});(instructions[jumpFalse] as any).target=instructions.length;n.elseBranch.forEach(stmt);(instructions[jumpEnd] as any).target=instructions.length;}
          else (instructions[jumpFalse] as any).target=instructions.length;
          break;
        }
        default: throw new Error(`Unsupported statement node ${n.type}`);
      }
    };
    try {
      stmt(ast);
      const rawIr:CoreSpiritIrProgram={
        version:1,
        sourceId,
        entry:{instructions},
        locals,
        maxLookback:semantic.maxLookback,
        diagnostics:[],
        sourceMap:coreSpiritSourceMapFromInstructions(sourceId,instructions),
        ...(options.surface ? { surface: options.surface } : {}),
      };
      const optimized = optimizeCoreSpiritIr(rawIr);
      const ir = { ...optimized, sourceMap: coreSpiritSourceMapFromInstructions(sourceId, optimized.entry.instructions), graphs: buildCoreSpiritGraphBundle(optimized) } as CoreSpiritIrProgram;
      if (!validateCoreSpiritIr(ir)) return { diagnostics:[...stageDiagnostics,{severity:'error',message:'Generated CoreSpirit IR failed the stable VM contract.'}] };
      return {ir,diagnostics:stageDiagnostics,artifact:makeExecutableArtifact(ir)};
    } catch(error) {
      return {diagnostics:[...stageDiagnostics,{severity:'error',message:error instanceof Error?error.message:String(error)}]};
    }
  }
}

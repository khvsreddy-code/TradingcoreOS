import { CoreSpiritAstNode, CoreSpiritAst } from './ast';
import { CoreSpiritParser } from './parser';
import { normalizeCoreSpiritSource } from './syntax';
import { CoreSpiritIrInstruction, CoreSpiritIrProgram, coreSpiritSourceMapFromInstructions } from './ir';
import { analyzeCoreSpirit, CoreSpiritDiagnostic } from './semanticAnalyzer';
import { CoreSpiritExecutableArtifact, makeExecutableArtifact } from './artifact';
import { resolveCoreSpiritNames } from './nameResolver';
import { optimizeCoreSpiritIr } from './optimizer';
import { validateCoreSpiritIr } from './irContract';
import type { CoreSpiritProgramLayer } from './layeredPlatformContract';
import { buildCoreSpiritGraphBundle } from './semanticGraph';
import { getCoreSpiritBuiltin } from './standardLibrary';
import { getCoreSpiritMemberContract, CORE_SPIRIT_ROOT_NAMESPACES } from './memberRegistry';
import { makeCoreSpiritSurfaceMetadata, extractCoreSpiritSurfaceMetadata } from './languageConcepts';
import type { CoreSpiritSurfaceMetadata } from './languageConcepts';
import { coreSpiritComponentRegistry, resolveCoreSpiritComponent } from './coreSpiritComponents';
import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';
import { isCoreSpiritLibraryNamespace, resolveCoreSpiritLibraryCall } from './standardLibraryNamespaces';
import { makeCoreSpiritCompilerPipelineTrace } from './compilerPipeline';
import { buildCoreSpiritSemanticDependencyGraph } from './semanticDependencyGraph';
import { planCoreSpiritExecution } from './executionPlanner';
import { buildCoreSpiritSpecializedPlan } from './specializedPlan';
import { buildCoreSpiritTradingNativePlan } from './tradingNativePlan';
import { isStateType } from './typeSystem';
import { analyzeCoreSpiritRepaintSafety } from './repaintSafety';
import { analyzeCoreSpiritCausality } from './causalityAnalysis';
import { buildCoreSpiritExecutionPlanVisualization } from './executionPlanVisualizer';
import { buildCoreSpiritResearchPlan } from './researchSurface';
import { inferCoreSpiritRequiredLevel } from './coreSpiritExecutionModel';
import { validateCoreScriptCapabilityRequirementsFromAst, buildCoreScriptLanguagePolicy, type CoreScriptLanguageFeature } from './coreScriptLanguagePolicy';
import { buildCoreSpiritArtifactSemanticFingerprint } from './artifactLookupIdentity';
import { readCoreScriptEdition, type CoreScriptEdition } from './languageEdition.js';
export { buildCoreSpiritSemanticFingerprint } from './artifactLookupIdentity';

export type CoreSpiritCompileDiagnostic = CoreSpiritDiagnostic;
export type CoreSpiritCompileSymbol = Readonly<{name:string;type:string;kind:'variable'|'type'}>;
export type CoreSpiritCompileResult = {
  ir?: CoreSpiritIrProgram;
  diagnostics: CoreSpiritDiagnostic[];
  artifact?: CoreSpiritExecutableArtifact;
  /** Serializable semantic names for IDE completion/hover, never runtime authority. */
  symbols?: readonly CoreSpiritCompileSymbol[];
};

function symbolsFromSemantic(semantic: { symbols: ReadonlyMap<string, unknown>; udts: ReadonlyMap<string, unknown> }): CoreSpiritCompileSymbol[] {
  return [
    ...[...semantic.symbols.entries()].map(([name, type]) => ({ name, type: String(type), kind: 'variable' as const })),
    ...[...semantic.udts.keys()].map(name => ({ name, type: `type ${name}`, kind: 'type' as const })),
  ];
}
export type CoreSpiritCompilerOptions = {
  layer?: CoreSpiritProgramLayer;
  surface?: CoreSpiritSurfaceMetadata;
  components?: CoreSpiritComponentRegistryLike;
  artifactContext?: { source:string; normalizedSource:string; semanticFingerprint?:string };
  /** Original authoring source used for declarative research/model metadata. */
  researchSource?: string;
  languageEdition?: CoreScriptEdition;
};

export function parseModelFeatureExpression(source: string): CoreSpiritAstNode {
  const wrapper = 'let __model_feature = ' + source;
  const parsed = new CoreSpiritParser(normalizeCoreSpiritSource(wrapper)).parse();
  const declaration = parsed.body[0];
  if (!declaration || declaration.type !== 'let') throw new Error(`Invalid model feature expression: ${source}`);
  return declaration.expression;
}

/**
 * A normal emitted trading signal is not a privileged system-event subscription.
 * Only non-signal event handlers raise the source authoring level; a signal handler
 * with automation is elevated independently by its automation semantic nodes.
 */
function containsCoreSpiritSystemEventHandler(nodes: readonly CoreSpiritAstNode[]): boolean {
  return nodes.some(node => {
    switch (node.type) {
      case 'onEvent':
        return !/^signal\s*\(/i.test(node.eventName.trim()) ||
          containsCoreSpiritSystemEventHandler(node.body);
      case 'program':
        return containsCoreSpiritSystemEventHandler(node.body);
      case 'if':
        return containsCoreSpiritSystemEventHandler(node.thenBranch) ||
          containsCoreSpiritSystemEventHandler(node.elseBranch ?? []);
      default:
        return false;
    }
  });
}

function traceSmcCompilerStage(sourceId: string, stage: string): void {
  if (sourceId === 'luxalgo-smc-port-contract') console.log('SMC_COMPILER_TRACE', stage);
}

export class CoreSpiritCompiler {
  compileSource(
    source: string,
    sourceId = 'coreSpirit',
    options: CoreSpiritCompilerOptions = {},
  ): CoreSpiritCompileResult {
    const original = String(source ?? '');
    traceSmcCompilerStage(sourceId, 'compileSource:start');
    const edition = readCoreScriptEdition(original);
    if (edition.diagnostics.length) {
      return {
        diagnostics: edition.diagnostics.map(item => ({
          severity: 'error' as const,
          code: item.code,
          message: item.message,
          line: item.line,
          column: item.column,
          start: item.start,
          end: item.end,
        })),
        symbols: [],
      };
    }
    const normalizedSource = normalizeCoreSpiritSource(original);
    traceSmcCompilerStage(sourceId, 'compileSource:normalized');
    let parsed: ReturnType<CoreSpiritParser['parseDetailed']>;
    try {
      parsed = new CoreSpiritParser(normalizedSource).parseDetailed();
      traceSmcCompilerStage(sourceId, 'compileSource:parsed');
    } catch (error) {
      const failure = error as { message?: string; position?: { offset?: number; line?: number; column?: number } };
      const start = Math.max(0, Number(failure?.position?.offset) || 0);
      return { diagnostics: [{ severity: 'error', code: 'SYNTAX_ERROR', message: failure?.message || String(error), start, end: start + 1, line: failure?.position?.line ?? 1, column: failure?.position?.column ?? 1 }], symbols: [] };
    }
    if (parsed.diagnostics.length) {
      return {
        diagnostics: parsed.diagnostics.map(d => ({ severity: 'error' as const, code: 'SYNTAX_ERROR', message: d.message, line: d.line, column: d.column, start: d.start, end: d.end })),
        symbols: [],
      };
    }
    traceSmcCompilerStage(sourceId, 'compileSource:surface:start');
    const surface = options.surface ?? extractCoreSpiritSurfaceMetadata(original);
    traceSmcCompilerStage(sourceId, 'compileSource:surface:done');
    traceSmcCompilerStage(sourceId, 'compileSource:compile:start');
    const result = this.compile(parsed.ast, sourceId, {
      ...options,
      surface,
      languageEdition: edition.edition,
      researchSource: original,
      artifactContext: { source: original, normalizedSource, semanticFingerprint: this.semanticFingerprint(options, original) },
    });
    traceSmcCompilerStage(sourceId, 'compileSource:compile:done');
    return result;
  }

  compile(ast: CoreSpiritAst, sourceId = 'coreSpirit', options: CoreSpiritCompilerOptions = {}): CoreSpiritCompileResult {
    traceSmcCompilerStage(sourceId, 'compile:start');
    const layer: CoreSpiritProgramLayer = options.layer || 'script';
    const componentSource = options.components ?? coreSpiritComponentRegistry;
    traceSmcCompilerStage(sourceId, 'names:start');
    const names = resolveCoreSpiritNames(ast, { components: componentSource });
    traceSmcCompilerStage(sourceId, 'names:done');
    traceSmcCompilerStage(sourceId, 'semantic:start');
    const semantic = analyzeCoreSpirit(ast, { layer, surface: options.surface, components: componentSource });
    traceSmcCompilerStage(sourceId, 'semantic:done');
    const symbols = symbolsFromSemantic(semantic);
    const stageDiagnostics = Array.from(new Map([...names.diagnostics.map(d => ({ ...d })), ...semantic.diagnostics].map(d => [`${d.code ?? ''}|${d.message}|${d.start ?? ''}`, d])).values());
    if (stageDiagnostics.some(d => d.severity === 'error')) return { diagnostics: stageDiagnostics, symbols };
    const surface = options.surface ?? makeCoreSpiritSurfaceMetadata([]);
    traceSmcCompilerStage(sourceId, 'semantic-graph:start');
    const semanticDependencyGraph = buildCoreSpiritSemanticDependencyGraph(ast, semantic, surface);
    traceSmcCompilerStage(sourceId, 'semantic-graph:done');
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
    const componentRefRegisters = new Map<string, string>();
    const dataMemberSources = new Map<CoreSpiritAstNode, { ref: string; field: 'open'|'high'|'low'|'close'|'volume'|'time' }>();
    const isDataRefExpression = (node: CoreSpiritAstNode): boolean =>
      (node.type === 'call' && ['market','timeframe','series'].includes(node.name)) ||
      (node.type === 'memberCall' &&
        ['timeframe','tf','confirmed','developing','historical','realtime'].includes(node.member) &&
        ((node.target.type === 'call' && ['market','timeframe','series'].includes(node.target.name)) ||
         (node.target.type === 'identifier' && dataRefRegisters.has(node.target.name)) ||
         (node.target.type === 'memberCall' && ['timeframe','tf','confirmed','developing','historical','realtime'].includes(node.target.member))));
    let temp = 0;

    const expr = (n: CoreSpiritAstNode): string => {
      switch (n.type) {
        case 'number': case 'string': case 'boolean': case 'null': {
          const dest = `t${temp++}`;
          emitInstruction(n, { op: 'const', dest, value: n.value as number | string | boolean | null }); return dest;
        }
        case 'identifier': {
          const dest = `t${temp++}`;
          const semanticType=semantic.symbols.get(n.name);
          if (semanticType && (semanticType.startsWith('model<') || semanticType === 'model:ref')) {
            const modelName = semanticType.startsWith('model<') ? semanticType.slice(6,-1) : n.name;
            const modelNameDest = `t${temp++}`;
            emitInstruction(n, { op:'const', dest:modelNameDest, value:modelName });
            emitInstruction(n, { op:'call', dest, name:'model', args:[modelNameDest], callId:`model:${n.name}:${n.span?.start ?? temp}` });
          } else if (semanticType && isStateType(semanticType as any)) emitInstruction(n, { op:'loadState', dest, name:n.name });
          else if (['open','high','low','close','volume','time'].includes(n.name)) emitInstruction(n, { op:'loadSeries', dest, name:n.name, offset:0 });
          else if (n.name === 'bar_index') emitInstruction(n, { op:'call', dest, name:'bar_index', args:[], callId:`bar_index:${n.span?.start ?? temp}` });
          else if (n.name === 'na') emitInstruction(n, { op:'const', dest, value:null });
          else emitInstruction(n, { op:'move', dest, source:n.name, sourceKind:'local' });
          return dest;
        }
        case 'unary': { const operand=expr(n.operand), dest=`t${temp++}`; emitInstruction(n, {op:'unary',dest,operator:n.operator,operand}); return dest; }
        case 'binary': { const left=expr(n.left),right=expr(n.right),dest=`t${temp++}`;emitInstruction(n, {op:'binary',dest,operator:n.operator,left,right});return dest; }
        case 'call': {
          const args=n.args.map(expr),dest=`t${temp++}`;
          const seriesArgs=n.args.filter(a=>a.type==='identifier'&&['open','high','low','close','volume','time'].includes(a.name)).map(a=>(a as any).name);
          const seriesSources = n.args.flatMap(arg => { const source = dataMemberSources.get(arg); return source ? [source] : []; });
          const component = resolveCoreSpiritComponent(componentSource,n.name);
          emitInstruction(n, {
            op:'call',
            dest,
            name:n.name,
            args,
            seriesArgs,
            seriesSources:seriesSources.length ? seriesSources : undefined,
            ...(component ? { componentId:component.id, componentPure:component.deterministic && !component.stateful, componentStateful:component.stateful, componentDeterministic:component.deterministic } : {}),
            callId:`${n.name}:${n.span?.start ?? temp}`,
          });
          if (component && component.outputs.length > 1) componentRefRegisters.set(dest,component.id);
          const builtin = getCoreSpiritBuiltin(n.name);
          if (builtin?.emitKind) {
            emitInstruction(n, {op:'emit',kind:builtin.emitKind,args:[dest,...args],outputId:`${builtin.emitKind}:${n.span?.start ?? temp}`});
          }
          if (n.name === 'market' || n.name === 'timeframe' || n.name === 'series') dataRefRegisters.set(n.span ? `${n.span.start}:${n.span.end}` : `temp:${dest}`, dest);
          return dest;
        }
        case 'memberCall': {
          const isTemporalDataReference =
            (n.target.type === 'call' && ['market','timeframe','series'].includes(n.target.name)) ||
            (n.target.type === 'identifier' && dataRefRegisters.has(n.target.name)) ||
            (n.target.type === 'memberCall' && ['timeframe','tf','confirmed','developing','historical','realtime'].includes(n.target.member));
          if (['confirmed','developing','historical','realtime'].includes(n.member) && isTemporalDataReference) {
            if (n.args.length !== 0) throw new Error(`market-data temporal selector .${n.member}() does not accept arguments.`);
            const target=expr(n.target);
            const phase=`t${temp++}`;
            emitInstruction(n,{op:'const',dest:phase,value:n.member});
            const dest=`t${temp++}`;
            emitInstruction(n,{op:'call',dest,name:'__market_alignment',args:[target,phase],callId:`market.alignment:${n.member}:${n.span?.start ?? temp}`});
            return dest;
          }
          const targetSemanticType = n.target.type === 'identifier' ? semantic.symbols.get(n.target.name) : undefined;
          const isModelTarget = targetSemanticType === 'model:ref' || targetSemanticType?.startsWith('model<') || (n.target.type === 'call' && n.target.name === 'model');
          if (isModelTarget && ['predict','prediction','probability','confidence'].includes(n.member)) {
            const target = expr(n.target);
            const directModelName = n.target.type === 'call' && n.target.name === 'model' && n.target.args[0]?.type === 'string'
              ? String(n.target.args[0].value)
              : undefined;
            const modelName = targetSemanticType?.startsWith('model<')
              ? targetSemanticType.slice(6,-1)
              : n.target.type === 'identifier'
                ? n.target.name
                : directModelName;
            const declaration = modelName ? options.surface?.declarations.find(item => item.kind === 'model' && item.name === modelName) : undefined;
            const featureArgs = n.args.length ? n.args.map(expr) : (declaration?.kind === 'model' ? declaration.inputs.flatMap(name => {
              const nameDest=`t${temp++}`;
              emitInstruction(n,{op:'const',dest:nameDest,value:name});
              const normalizedName=name.trim();
              const featureExpression=/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalizedName)
                ? ({type:'identifier',name:normalizedName} as CoreSpiritAstNode)
                : parseModelFeatureExpression(normalizedName);
              return [nameDest,expr(featureExpression)];
            }) : []);
            const dest=`t${temp++}`;
            emitInstruction(n,{op:'call',dest,name:n.member === 'probability' || n.member === 'confidence' ? '__model_probability' : '__model_predict',args:[target,...featureArgs],callId:`model.${n.member}:${n.span?.start ?? temp}`});
            return dest;
          }
          if (n.member === 'tf' && n.target.type === 'call' && n.target.name === 'market') {
            const target=expr(n.target); const timeframe=expr(n.args[0]!); const dest=`t${temp++}`;
            emitInstruction(n,{op:'call',dest,name:'__market_timeframe',args:[target,timeframe],callId:`market.tf:${n.span?.start ?? temp}`});
            return dest;
          }
          if (n.member === 'timeframe' && (
            (n.target.type === 'call' && n.target.name === 'market') ||
            (n.target.type === 'identifier' && dataRefRegisters.has(n.target.name))
          )) {
            if (n.args.length !== 1) throw new Error('market(...).timeframe(...) expects exactly one timeframe argument.');
            const target = expr(n.target);
            const timeframe = expr(n.args[0]!);
            const dest = `t${temp++}`;
            emitInstruction(n, {
              op:'call',
              dest,
              name:'__market_timeframe',
              args:[target,timeframe],
              callId:`market.timeframe:${n.span?.start ?? temp}`,
            });
            return dest;
          }
          if (n.target.type === 'identifier' && CORE_SPIRIT_ROOT_NAMESPACES.includes(n.target.name as typeof CORE_SPIRIT_ROOT_NAMESPACES[number])) {
            const contract = getCoreSpiritMemberContract(n.target.name, n.member);
            if (contract) {
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
              emitInstruction(n, {op:'call', dest, name:contract.callName, args, callId:`${contract.callName}:${n.span?.start ?? temp}`});
              if (contract.emitKind) emitInstruction(n, {op:'emit',kind:contract.emitKind,args:[dest,...args],outputId:`${contract.emitKind}:${n.span?.start ?? temp}`});
              return dest;
            }
          }
          if (n.target.type === 'identifier' && isCoreSpiritLibraryNamespace(n.target.name)) {
            const resolved = resolveCoreSpiritLibraryCall(n.target.name, n.member, componentSource);
            if (!resolved) throw new Error(`Unknown standard-library member '${n.target.name}.${n.member}'.`);
            if (resolved.entry.status === 'catalog') throw new Error(`Standard-library member '${n.target.name}.${n.member}' is cataloged but not registered for execution.`);
            const args = n.args.map(expr);
            const dest = `t${temp++}`;
            if (resolved.component) {
              emitInstruction(n, {
                op:'call',
                dest,
                name:resolved.component.name,
                args,
                componentId:resolved.component.id,
                componentPure:resolved.component.deterministic && !resolved.component.stateful,
                componentStateful:resolved.component.stateful,
                componentDeterministic:resolved.component.deterministic,
                callId:`${resolved.entry.qualifiedName}:${n.span?.start ?? temp}`,
              });
              if (resolved.component.outputs.length > 1) componentRefRegisters.set(dest, resolved.component.id);
              return dest;
            }
            const builtinName = resolved.builtin?.name;
            if (!builtinName) throw new Error(`Standard-library member '${n.target.name}.${n.member}' has no executable lowering.`);
            const seriesArgs = n.args.filter(a => a.type === 'identifier' && ['open','high','low','close','volume','time'].includes(a.name)).map(a => (a as any).name);
            emitInstruction(n, { op:'call', dest, name:builtinName, args, seriesArgs, callId:`${n.target.name}.${n.member}:${n.span?.start ?? temp}` });
            if (resolved.builtin?.emitKind) emitInstruction(n, { op:'emit', kind:resolved.builtin.emitKind, args:[dest,...args], outputId:`${resolved.builtin.emitKind}:${n.span?.start ?? temp}` });
            return dest;
          }
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
          if (n.target.type === 'identifier' && n.target.name === 'bar' && ['confirmed','developing','realtime','historical','forecast'].includes(n.member)) {
            const phaseDest=`t${temp++}`;
            emitInstruction(n,{op:'const',dest:phaseDest,value:n.member});
            const memberDest=`t${temp++}`;
            emitInstruction(n,{op:'call',dest:memberDest,name:'__bar_phase',args:[phaseDest],callId:`bar.phase:${n.member}:${n.span?.start ?? temp}`});
            return memberDest;
          }
          if (n.target.type === 'identifier' && n.target.name === 'chart' && ['price','volume','indicator','custom'].includes(n.member)) {
            const memberDest=`t${temp++}`; const areaDest=`t${temp++}`;
            emitInstruction(n, { op:'const', dest:areaDest, value:n.member });
            emitInstruction(n, { op:'call', dest:memberDest, name:'visual.area', args:[areaDest], callId:`chart.area:${n.member}:${n.span?.start ?? temp}` });
            return memberDest;
          }
          const directComponent = n.target.type === 'call' ? resolveCoreSpiritComponent(componentSource,n.target.name) : undefined;
          const isComponentRef = directComponent && directComponent.outputs.length > 1 ||
            (n.target.type === 'identifier' && componentRefRegisters.has(n.target.name));
          if (isComponentRef) {
            const target = expr(n.target);
            const memberDest=`t${temp++}`; const memberName=`t${temp++}`;
            emitInstruction(n, { op:'const', dest:memberName, value:n.member });
            emitInstruction(n, { op:'call', dest:memberDest, name:'__component_get', args:[target,memberName], callId:`component:${n.member}:${n.span?.start ?? temp}` });
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
          const isDataRef =
            (n.target.type === 'identifier' && dataRefRegisters.has(n.target.name)) ||
            (n.target.type === 'call' && (n.target.name === 'market' || n.target.name === 'timeframe' || n.target.name === 'series')) ||
            (n.target.type === 'memberCall' && ['timeframe','tf','confirmed','developing','historical','realtime'].includes(n.target.member));
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
          const marketSeriesNames=['open','high','low','close','volume','time'];
          // Literal offsets on canonical OHLCV columns use the direct market-data ABI.
          // Local CoreSpirit series must instead be read from the series registry; routing
          // every identifier through loadSeries silently returns null for local names.
          if(n.target.type==='identifier'&&marketSeriesNames.includes(n.target.name)&&n.index.type==='number'&&typeof n.index.value==='number'&&Number.isInteger(n.index.value)) {
            emitInstruction(n, {op:'loadSeries',dest,name:n.target.name,offset:n.index.value});
          } else if(n.target.type==='identifier') {
            emitInstruction(n, {op:'index',dest,target,index,seriesName:n.target.name});
          } else {
            emitInstruction(n, {op:'index',dest,target,index});
          }
          return dest;
        }
        default: throw new Error(`Unsupported expression node ${n.type}`);
      }
    };
    const stmt=(n:CoreSpiritAstNode):void=>{
      switch(n.type){
        case 'program': n.body.forEach(stmt); break;
        case 'typeDeclaration': break;
        case 'onEvent': {
          const gateIndex=instructions.length;
          emitInstruction(n,{op:'eventGate',eventName:n.eventName,target:-1});
          n.body.forEach(stmt);
          (instructions[gateIndex] as Extract<CoreSpiritIrInstruction,{op:'eventGate'}>).target=instructions.length;
          break;
        }
        case 'assignment': {
          const source=expr(n.expression);
          emitInstruction(n,{op:'setState',name:n.name,source});
          break;
        }
        case 'let': {
          const source=expr(n.expression);
          const isDataRef = isDataRefExpression(n.expression);
          const isModelRef = n.expression.type === 'call' && n.expression.name === 'model';
          if (isDataRef) dataRefRegisters.set(n.name, source);
          if (isModelRef) modelRefRegisters.set(n.name, source);
          const component = n.expression.type === 'call' ? resolveCoreSpiritComponent(componentSource,n.expression.name) : undefined;
          if (component && component.outputs.length > 1) componentRefRegisters.set(n.name, component.id);
          const isState=isStateType(semantic.symbols.get(n.name) as any);
          if(isState) emitInstruction(n,{op:'setState',name:n.name,source,initialize:true});
          else emitInstruction(n,{op:'setLocal',name:n.name,source,series:!isDataRef && !isModelRef});
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
      traceSmcCompilerStage(sourceId, 'lowering:start');
      stmt(ast);
      traceSmcCompilerStage(sourceId, 'lowering:done');
      const rawIr:CoreSpiritIrProgram={
        version:1,
        sourceId,
        entry:{instructions},
        locals,
        maxLookback:semantic.maxLookback,
        semanticEnvironment:Object.freeze(Object.fromEntries([...semantic.semanticSymbols.entries()].map(([name,type]) => [name,Object.freeze({...type})]))),
        diagnostics:[],
        sourceMap:coreSpiritSourceMapFromInstructions(sourceId,instructions),
        surface,
        semanticDependencyGraph,
        compilerPipeline:makeCoreSpiritCompilerPipelineTrace(),
      };
      traceSmcCompilerStage(sourceId, 'optimizer:start');
      const optimized = optimizeCoreSpiritIr(rawIr);
      traceSmcCompilerStage(sourceId, 'optimizer:done');
      const graphInput = { ...optimized, sourceMap: coreSpiritSourceMapFromInstructions(sourceId, optimized.entry.instructions), semanticDependencyGraph } as CoreSpiritIrProgram;
      traceSmcCompilerStage(sourceId, 'execution-graph:start');
      const graphs = buildCoreSpiritGraphBundle(graphInput, { components: componentSource });
      traceSmcCompilerStage(sourceId, 'execution-graph:done');
      const specializedPlan = buildCoreSpiritSpecializedPlan(graphInput.entry.instructions);
      const tradingNativePlan = buildCoreSpiritTradingNativePlan(ast, surface);
      const researchPlan = buildCoreSpiritResearchPlan(options.researchSource ?? options.artifactContext?.source ?? '', surface);
      const capabilityCheck = validateCoreScriptCapabilityRequirementsFromAst(ast, surface, semanticDependencyGraph.nodes);
      const hasModel = researchPlan.models.length > 0 || semanticDependencyGraph.nodes.some(node => node.kind === 'model' || node.kind === 'model-output');
      const hasResearch = researchPlan.backtests.length > 0 || researchPlan.modelSpecs.length > 0;
      // Capability flags come from typed semantic values, not strings/comments in source.
      const semanticTypeNames = [
        ...[...semantic.symbols.values()].map(type => String(type)),
        ...[...semantic.udts.values()].flatMap(declaration => declaration.fields.map(field => String(field.type))),
      ];
      const semanticContainers = [...semantic.semanticSymbols.values()].map(type => type.container).filter(Boolean);
      const hasMatrix = semanticContainers.includes('matrix') || semanticTypeNames.some(type => /^matrix(?:<|$)/i.test(type));
      const hasTensor = semanticContainers.includes('tensor') || semanticTypeNames.some(type => /^tensor(?:<|$)/i.test(type));
      const hasMultiSymbol = tradingNativePlan.dataDependencies.map(dep => dep.symbol).filter(symbol => symbol !== 'current').filter((symbol, index, all) => all.indexOf(symbol) === index).length > 1;
      const hasMultiTimeframe = tradingNativePlan.dataDependencies.some(dep => dep.timeframe !== 'chart');
      const hasSystemEvent = containsCoreSpiritSystemEventHandler(ast.body);
      // `requires ai.invoke` is a host-job capability declaration, not a callable
      // function in the per-candle runtime. It still affects authoring level and
      // must be included in the canonical compiled capability manifest.
      const hasAiInvoke = (surface.requiredCapabilities ?? []).includes('ai.invoke');
      // The source determines its required level. Execution-layer selection is
      // separate policy context and must not silently rewrite authoring metadata.
      const hasAutomation = semanticDependencyGraph.nodes.some(node => node.kind === 'automation') ||
        surface.declarations.some(declaration => declaration.kind === 'automation');
      const hasOrderIntent = semanticDependencyGraph.nodes.some(node => node.kind === 'order-intent');
      const hasStrategy = surface.declarations.some(declaration => declaration.kind === 'indicator' && declaration.role === 'strategy') ||
        hasOrderIntent;
      const languageFeatures:CoreScriptLanguageFeature[] = ['beginner'];
      if (hasMultiSymbol) languageFeatures.push('trader','multi-symbol');
      if (hasMultiTimeframe) languageFeatures.push('trader','multi-timeframe');
      if (hasStrategy) languageFeatures.push('trader','strategy');
      if (hasModel) languageFeatures.push('quant','models');
      if (hasResearch) languageFeatures.push('quant','research');
      if (hasMatrix) languageFeatures.push('quant','matrix');
      if (hasTensor) languageFeatures.push('quant','tensor');
      if (hasOrderIntent) languageFeatures.push('trader','order-intent');
      if (hasSystemEvent) languageFeatures.push('system','system-events');
      if (hasAutomation) languageFeatures.push('system','automation');
      if (hasAiInvoke) languageFeatures.push('system','ai-invocation');
      const authoringLevel = inferCoreSpiritRequiredLevel({
        model:hasModel, research:hasResearch, matrix:hasMatrix, tensor:hasTensor,
        multiSymbol:hasMultiSymbol, multiTimeframe:hasMultiTimeframe, strategy:hasStrategy,
        systemEvent:hasSystemEvent, automation:hasAutomation, orderIntent:hasOrderIntent,
        aiInvoke:hasAiInvoke,
      });
      const capabilityRequirements = Object.freeze([
        ...capabilityCheck.requirements,
        ...(hasAiInvoke ? [Object.freeze({
          capability:'ai.invoke' as const,
          source:'requires ai.invoke',
          reason:'Asynchronous remote AI invocation is explicitly declared and is only available through the server automation job lane.',
        })] : []),
      ]);
      // Preserve declared capabilities as part of the immutable compiled artifact,
      // even when a capability has no synchronous AST call by design.
      const requiredCapabilities = Object.freeze([...new Set([
        ...capabilityCheck.requirements.map(item => item.capability),
        ...(surface.requiredCapabilities ?? []),
      ])]);
      const languageCapabilities = Object.freeze([...new Set([
        'core',
        ...(hasMultiSymbol ? ['multi-symbol'] : []),
        ...(hasMultiTimeframe ? ['multi-timeframe'] : []),
        ...(hasModel ? ['models','predictions'] : []),
        ...(hasResearch ? ['research','backtest'] : []),
        ...(hasMatrix ? ['matrix','linear-algebra'] : []),
        ...(hasTensor ? ['tensor'] : []),
        ...(hasOrderIntent ? ['strategy','order-intents'] : []),
        ...(hasSystemEvent ? ['events','system-events'] : []),
        ...(hasAutomation ? ['automation'] : []),
        ...(hasAiInvoke ? ['ai-invocation'] : []),
        ...(semanticDependencyGraph.nodes.some(node => node.kind === 'data-source') ? ['market-data'] : []),
        ...(semanticDependencyGraph.nodes.some(node => node.kind === 'visual') ? ['visualization'] : []),
      ])]);
      const repaintSafety = analyzeCoreSpiritRepaintSafety(ast);
      const repaintDiagnostics = [
        ...repaintSafety.warnings.map(message => ({severity:'warning' as const,message,code:'REPAINT_SAFETY'})),
        ...repaintSafety.errors.map(message => ({severity:'error' as const,message,code:'REPAINT_SAFETY_ASSERTION'})),
      ];
      // Causality is a compiler property, not an advisory Copilot-only heuristic.
      // Strict mode fails compilation before an artifact can be produced.
      const causalityReport = analyzeCoreSpiritCausality(ast);
      const causalityDiagnostics = causalityReport.diagnostics;
      const capabilityDiagnostics = capabilityCheck.errors.map(message => ({ severity:'error' as const, message, code:'CAPABILITY_REQUIRED' }));
      const allDiagnostics = [...stageDiagnostics,...capabilityDiagnostics,...repaintDiagnostics,...causalityDiagnostics];
      if (allDiagnostics.some(d => d.severity === 'error')) return { diagnostics: allDiagnostics };
      traceSmcCompilerStage(sourceId, 'backend-planner:start');
      const executionPlan = planCoreSpiritExecution({ ...graphInput, graphs, specializedPlan, tradingNativePlan });
      traceSmcCompilerStage(sourceId, 'backend-planner:done');
      const executionPlanVisualization = buildCoreSpiritExecutionPlanVisualization({ ...graphInput, graphs, executionPlan, specializedPlan, tradingNativePlan, repaintSafety } as CoreSpiritIrProgram);
      const uniqueLanguageFeatures = Object.freeze([...new Set(languageFeatures)]);
      const languagePolicy = buildCoreScriptLanguagePolicy({
        level:authoringLevel,
        features:uniqueLanguageFeatures,
        requiredCapabilities,
        capabilityRequirements,
      });
      const ir = { ...graphInput, graphs, executionPlan, specializedPlan, tradingNativePlan, researchPlan, authoringLevel, languageCapabilities, languageFeatures:uniqueLanguageFeatures, requiredCapabilities, capabilityRequirements, languagePolicy, language:'CoreScript' as const, languageVersion:1 as const, languageEdition:options.languageEdition ?? '1.0', repaintSafety, causalityAnalysis:causalityReport, executionPlanVisualization, compilerPipeline: makeCoreSpiritCompilerPipelineTrace() } as CoreSpiritIrProgram;
      if (!validateCoreSpiritIr(ir)) return { diagnostics:[...allDiagnostics,{severity:'error',message:'Generated CoreSpirit IR failed the stable VM contract.'}], symbols };
      return {ir,diagnostics:allDiagnostics,artifact:makeExecutableArtifact(ir, options.artifactContext),symbols};
    } catch(error) {
      return {diagnostics:[...stageDiagnostics,{severity:'error',message:error instanceof Error ? `${error.message}\\n${error.stack ?? ''}` : String(error)}], symbols};
    }
  }
  private semanticFingerprint(options: CoreSpiritCompilerOptions, source: string): string {
    return buildCoreSpiritArtifactSemanticFingerprint(options, source);
  }
}

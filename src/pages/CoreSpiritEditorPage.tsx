import { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Play, Save, RotateCcw, CheckCircle2, AlertTriangle, BookOpen, Zap, Activity, ShieldCheck, GitBranch, Eye, Sparkles } from 'lucide-react';
import { WorkspaceModuleShell, ModuleHeader, Panel, WorkspaceRoute } from '../components/workspace/WorkspaceModuleShell';
import { CoreSpiritEditorModel } from '../services/coreSpirit/editorModel';
import { mountCoreSpiritMonaco, type CoreSpiritMonacoAdapter } from '../services/coreSpirit/monacoAdapter';
import { CoreSpiritIdeRuntimeBridge, type CoreSpiritIdeRuntimeSnapshot } from '../services/coreSpirit/ideRuntimeBridge';
import type { CoreSpiritSourceInspection } from '../services/coreSpirit/sourceInspector';
import type { CoreSpiritCompileResult } from '../services/coreSpirit/compiler';
import { compileCoreSpiritSourceOffThread, previewCoreSpiritArtifactOffThread } from '../services/coreSpirit/coreSpiritCompilerClient';
import { getSupabaseClient } from '../services/auth/supabaseClient';
import { createCoreSpiritSandbox, validateCoreScriptCapabilitiesAgainstSandbox, validateCoreSpiritSandboxArchitecture } from '../services/coreSpirit/capabilitySandbox';
import { coreSpiritChartRegistry } from '../services/coreSpirit/chartRegistry';
import { sha256HexSync } from '../services/coreSpirit/artifactIdentity';
import { loadEditorScript, saveEditorScript, saveExecutionRun } from '../services/coreSpirit/cloudPersistence';
import { versionedStorageKey } from '../services/coreSpirit/storageSchema';
import { normalizeCoreSpiritSource } from '../services/coreSpirit/syntax';

const DEFAULT_SOURCE = `indicator("CoreSpirit Trend") {
    overlay: true
    input length = int(20, min: 1)
}

fast = ema(close, length)
slow = ema(close, length * 2)

plot fast
plot slow

if fast crossesAbove slow {
    signal "BUY"
}

if fast crossesBelow slow {
    signal "SELL"
}`;

const EXAMPLES: Array<[string, string]> = [
  ['Trend', DEFAULT_SOURCE],
  ['RSI signal', `indicator("RSI Signal")\n\nr = rsi(close, 14)\nplot(r, name = "RSI")\n\nif crossover(r, 30) {\n    signal("RSI RECOVERY")\n}`],
  ['Levels', `indicator("Range Levels")\n\nhi = highest(high, 20)\nlo = lowest(low, 20)\nplot(hi, name = "20-bar High")\nplot(lo, name = "20-bar Low")`],
  ['Interactive UI', `let panel = ui.panel("Market Structure")\npanel.number("ATR", atr(14))\npanel.button("Recalculate", recalibrate)\npanel.toggle("Show Liquidity", true, toggle_liquidity)\npanel.slider("Sensitivity", 1, 10, 5, set_sensitivity)`],
];

type CopilotMode = 'generate'|'explain-error'|'fix'|'optimize'|'convert-to-quant'|'generate-tests'|'generate-backtest'|'generate-features'|'generate-model'|'generate-docs'|'explain-lookback'|'find-lookahead'|'find-repainting'|'find-unused-computation';
const COPILOT_MODE_OPTIONS:ReadonlyArray<{value:CopilotMode;label:string}> = [
  {value:'generate',label:'Generate script'},
  {value:'explain-error',label:'Explain compiler errors'},
  {value:'fix',label:'Repair current script'},
  {value:'optimize',label:'Optimize current script'},
  {value:'convert-to-quant',label:'Beginner → quant'},
  {value:'generate-tests',label:'Generate tests'},
  {value:'generate-backtest',label:'Generate backtest'},
  {value:'generate-features',label:'Generate feature set'},
  {value:'generate-model',label:'Generate model'},
  {value:'generate-docs',label:'Generate documentation'},
  {value:'explain-lookback',label:'Explain lookback'},
  {value:'find-lookahead',label:'Find lookahead bias'},
  {value:'find-repainting',label:'Find repainting'},
  {value:'find-unused-computation',label:'Find unused computation'},
];
const ANALYSIS_ONLY_COPILOT_MODES=new Set<CopilotMode>(['explain-error','generate-tests','generate-docs','explain-lookback','find-lookahead','find-repainting','find-unused-computation']);

type CopilotReplayGate = Readonly<{
  source:string;
  artifactHash:string;
  chartId:string;
  symbol:string;
  timeframe:string;
  barsProcessed:number;
  datasetSignature:string;
}>;

// Bind approval to every normalized OHLCV row, not just the first/last bars.
// This runs only during Copilot replay and explicit Run validation, never per tick.
function replayDatasetSignature(bars:readonly unknown[]):string {
  const canonical=bars.map(bar=>{
    const value=bar&&typeof bar==='object'?bar as Record<string,unknown>:{};
    return JSON.stringify([value.timestamp??value.time??null,value.open??null,value.high??null,value.low??null,value.close??null,value.volume??null]);
  }).join('\n');
  return `${bars.length}:${sha256HexSync(canonical)}`;
}

function replayGateMatches(gate:CopilotReplayGate,source:string,artifactHash:string|null,target:NonNullable<ReturnType<typeof coreSpiritChartRegistry.getActive>>):boolean {
  if(gate.source!==source||!artifactHash||gate.artifactHash!==artifactHash||gate.chartId!==target.chartId||gate.symbol!==target.symbol||gate.timeframe!==target.timeframe)return false;
  const bars=Array.from(target.getBars?.()??[]).slice(-3000);
  return bars.length===gate.barsProcessed&&replayDatasetSignature(bars)===gate.datasetSignature;
}

function lineCount(source: string) { return Math.max(1, source.split('\n').length); }

function escapeHtml(value: string) { return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function highlightedLines(source: string, tokens: Array<{line:number;column:number;length:number;token:string}>) {
  const lines = source.replace(/\r/g,'').split('\n');
  const byLine = new Map<number, typeof tokens>();
  tokens.forEach(t => { const arr=byLine.get(t.line)||[]; arr.push(t); byLine.set(t.line,arr); });
  const cls: Record<string,string> = { keyword:'text-[#c084fc]', function:'text-[#60a5fa]', series:'text-[#60a5fa]', number:'text-[#fbbf24]', string:'text-[#fda4af]', comment:'text-[var(--tco-dim)]', identifier:'text-[var(--tco-code-text)]' };
  return lines.map((line,i)=>{
    const ts=(byLine.get(i+1)||[]).sort((a,b)=>a.column-b.column); let pos=0; const parts:string[]=[];
    ts.forEach(t=>{ const start=Math.max(0,t.column-1), end=start+t.length; if(start>pos) parts.push(escapeHtml(line.slice(pos,start))); parts.push(`<span class="${cls[t.token]||'text-[var(--tco-code-text)]'}">${escapeHtml(line.slice(start,end))}</span>`); pos=end; });
    if(pos<line.length) parts.push(escapeHtml(line.slice(pos))); return parts.join('') || '&nbsp;';
  });
}

export function CoreSpiritEditorPage({ onNavigate, onBackToLanding, onBroker }: { onNavigate: (path: WorkspaceRoute) => void; onBackToLanding: () => void; onBroker?: () => void }) {
  const initialSource = useMemo(() => localStorage.getItem(versionedStorageKey('editor')) || localStorage.getItem('tradingcore:corespirit:editor') || DEFAULT_SOURCE, []);
  const editorModel = useMemo(() => new CoreSpiritEditorModel(initialSource), [initialSource]);
  const ideBridge = useMemo(() => new CoreSpiritIdeRuntimeBridge(editorModel), [editorModel]);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const [source, setSource] = useState(initialSource);
  const [diagnostics, setDiagnostics] = useState<Array<{ severity: string; message: string; line?: number }>>([]);
  const [compiled, setCompiled] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<'local' | 'loading' | 'saved' | 'error'>('local');
  const [cloudScriptId, setCloudScriptId] = useState<string | null>(null);
  const [lastCompile, setLastCompile] = useState<CoreSpiritCompileResult | null>(null);
  const [runStatus, setRunStatus] = useState('');
  const [editorVersion, setEditorVersion] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [showCompletions, setShowCompletions] = useState(false);
  const [useMonaco, setUseMonaco] = useState(true);
  const [monacoStatus, setMonacoStatus] = useState<'loading'|'ready'|'fallback'>('loading');
  const monacoRef = useRef<HTMLDivElement | null>(null);
  const monacoAdapterRef = useRef<CoreSpiritMonacoAdapter | null>(null);
  const [completionIndex, setCompletionIndex] = useState(0);
  const [runtimeInspector, setRuntimeInspector] = useState<CoreSpiritIdeRuntimeSnapshot>(() => ideBridge.getSnapshot());
  const [selectedExplanation, setSelectedExplanation] = useState<string | null>(null);
  const [debugBarInput, setDebugBarInput] = useState('0');
  const [sourceInspection, setSourceInspection] = useState<CoreSpiritSourceInspection>(() => ({
    source,normalizedSource:source,diagnostics:[],effectAnnotations:[],instructionCount:0,maxLookback:0,
  }));
  const compileRequestRef = useRef(0);
  const lastCompileRef = useRef<{source:string;result:CoreSpiritCompileResult}|null>(null);
  const compilePromiseRef = useRef<{source:string;promise:Promise<CoreSpiritCompileResult|null>}|null>(null);
  const copilotSourceRef = useRef<string|null>(null);
  const copilotValidationPassRef = useRef<boolean|null>(null);
  const copilotServerArtifactHashRef = useRef<string|null>(null);
  const copilotValidationDiagnosticsRef = useRef<CoreSpiritCompileResult['diagnostics']>([]);
  // AI drafts require both compiler/security approval and a successful bounded replay.
  const copilotReplayPassRef = useRef<boolean|null>(null);
  const copilotReplayGateRef = useRef<CopilotReplayGate|null>(null);
  const copilotGenerationRef = useRef(0);
  const [compilePending,setCompilePending]=useState(false);
  const [copilotPrompt,setCopilotPrompt]=useState('');
  const [copilotMode,setCopilotMode]=useState<CopilotMode>('generate');
  const [copilotStatus,setCopilotStatus]=useState<'idle'|'generating'|'validating'|'replaying'|'ready'|'needs-fixes'|'blocked'|'error'>('idle');
  const [copilotSummary,setCopilotSummary]=useState('');
  const [copilotAssumptions,setCopilotAssumptions]=useState<string[]>([]);
  const [copilotArtifactHash,setCopilotArtifactHash]=useState<string|null>(null);
  const [copilotError,setCopilotError]=useState('');
  const lines = useMemo(() => Array.from({ length: lineCount(source) }, (_, i) => i + 1), [source]);
  const editorSnapshot = editorModel.getSnapshot();
  const highlighted = useMemo(() => highlightedLines(source, editorSnapshot.tokens), [source, editorSnapshot.tokens]);
  const completionState = useMemo(() => editorModel.completionAt(cursor), [editorVersion, cursor, source, lastCompile]);
  const completionItems = completionState.completions.slice(0, 12);
  const lineHeight = 20;
  useEffect(() => ideBridge.subscribe(setRuntimeInspector), [ideBridge]);
  useEffect(() => { if (!selectedExplanation && runtimeInspector.latestExplanation) setSelectedExplanation(runtimeInspector.latestExplanation.signalId); }, [runtimeInspector.latestExplanation?.signalId]);
  useEffect(() => {
    const onChartDebug = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (runtimeInspector.target && detail.symbol && detail.symbol !== runtimeInspector.target.symbol) return;
      const index = Number(detail.barIndex);
      if (!Number.isInteger(index) || index < 0) return;
      setDebugBarInput(String(index));
      ideBridge.inspectDebugBar(index);
    };
    window.addEventListener('TRADINGCORE_CORESPIRIT_DEBUG_BAR', onChartDebug);
    return () => window.removeEventListener('TRADINGCORE_CORESPIRIT_DEBUG_BAR', onChartDebug);
  }, [ideBridge, runtimeInspector.target?.symbol]);

  useEffect(() => {
    let active = true;
    loadEditorScript().then((script) => {
      if (!active || !script) return;
      const nextSource = script.source || DEFAULT_SOURCE;
      compileRequestRef.current+=1;
      compilePromiseRef.current=null;
      lastCompileRef.current=null;
      editorModel.updateSource(nextSource,'',{deferSemanticAnalysis:true});
      setSource(nextSource);
      setLastCompile(null);
      setCompiled(false);
      setCompilePending(true);
      setEditorVersion(v=>v+1);
      monacoAdapterRef.current?.setSource(nextSource);
      monacoAdapterRef.current?.setDiagnostics([],nextSource);
      setCloudScriptId(script.id);
      setCloudStatus('saved');
    }).catch(() => { if (active) setCloudStatus('local'); });
    return () => { active = false; };
  }, []);

  const setEditorSource=(next:string,options:{completionPrefix?:string;cursor?:number;showCompletions?:boolean;modelAlreadyUpdated?:boolean;keepDiagnostics?:boolean}={})=>{
    compileRequestRef.current+=1;
    compilePromiseRef.current=null;
    lastCompileRef.current=null;
    setLastCompile(null);
    setCompilePending(true);
    if(!options.modelAlreadyUpdated)editorModel.updateSource(next,options.completionPrefix||'',{deferSemanticAnalysis:true});
    setSource(next);
    setCompiled(false);
    setEditorVersion(v=>v+1);
    if(options.cursor!=null)setCursor(options.cursor);
    setShowCompletions(options.showCompletions===true);
    if(!options.keepDiagnostics){
      setDiagnostics([]);
      monacoAdapterRef.current?.setDiagnostics([],next);
    }
    if(copilotSourceRef.current&&copilotSourceRef.current!==next){
      copilotSourceRef.current=null;
      copilotValidationPassRef.current=null;
      copilotServerArtifactHashRef.current=null;
      copilotValidationDiagnosticsRef.current=[];
      copilotReplayPassRef.current=null;
      copilotReplayGateRef.current=null;
      setCopilotStatus('idle');
      setCopilotArtifactHash(null);
    }
    if(monacoAdapterRef.current)monacoAdapterRef.current.setSource(next);
  };

  const compileSource=(sourceSnapshot:string):Promise<CoreSpiritCompileResult|null>=>{
    const current=compilePromiseRef.current;
    if(current?.source===sourceSnapshot)return current.promise;
    const sourceVersion=editorModel.getVersion();
    const request=++compileRequestRef.current;
    setCompilePending(true);
    let promise:Promise<CoreSpiritCompileResult|null>;
    promise=(async()=>{
      try{
        const workerResult=await compileCoreSpiritSourceOffThread(sourceSnapshot,sourceVersion,'corespirit-editor',{layer:'script'});
        if(request!==compileRequestRef.current||workerResult.sourceVersion!==sourceVersion||editorModel.getSource()!==sourceSnapshot||editorModel.getVersion()!==sourceVersion)return null;
        // The compiler and capability gate form one blocking validation result.
        // Generated source receives exactly the same chart policy as handwritten source.
        const sandbox=createCoreSpiritSandbox({layer:'script',target:'chart'});
        const policyDiagnostics=[
          ...validateCoreSpiritSandboxArchitecture().map(message=>({severity:'error' as const,message,code:'EDITOR_SANDBOX_ARCHITECTURE'})),
          ...(workerResult.ir?validateCoreScriptCapabilitiesAgainstSandbox(sandbox,workerResult.ir.requiredCapabilities??[]):[]).map(message=>({severity:'error' as const,message,code:'EDITOR_CAPABILITY_DENIED'})),
        ];
        const isCopilotSource=copilotSourceRef.current===sourceSnapshot;
        const copilotDiagnostics=isCopilotSource?copilotValidationDiagnosticsRef.current:[];
        const expectedServerHash=isCopilotSource?copilotServerArtifactHashRef.current:null;
        const copilotHashMismatch=Boolean(
          isCopilotSource&&copilotValidationPassRef.current===true&&
          (!expectedServerHash||workerResult.artifact?.abi?.artifactHash!==expectedServerHash),
        );
        const hashDiagnostics=copilotHashMismatch?[{
          severity:'error' as const,
          message:'Server-side and editor compiler artifact hashes differ. Revalidate this draft before using it.',
          code:'COPILOT_ARTIFACT_HASH_MISMATCH',
        }]:[];
        const result:CoreSpiritCompileResult={
          ...workerResult,
          diagnostics:[...(workerResult.diagnostics||[]),...policyDiagnostics,...copilotDiagnostics,...hashDiagnostics],
        };
        editorModel.applyWorkerCompileResult(result,sourceSnapshot);
        const next=result.diagnostics.map((d:any)=>({severity:String(d.severity||'error'),message:String(d.message||d),line:d.line}));
        const semanticNodes=result.ir?.graphs?.semantic.nodes??[];
        setSourceInspection({
          source:sourceSnapshot,
          normalizedSource:normalizeCoreSpiritSource(sourceSnapshot),
          diagnostics:result.diagnostics,
          effectAnnotations:semanticNodes.filter((node:any)=>node.source).map((node:any)=>({
            sourceNodeId:node.id,line:node.source.line,column:node.source.column,end:node.source.end,kind:node.kind,name:node.name,
            effectful:node.effectful,estimatedCost:node.estimatedCost,latencyClass:node.latencyClass,
            stateful:node.stateful,deterministic:node.deterministic,parallelizable:node.parallelizable,
          })),
          instructionCount:result.ir?.entry.instructions.length??0,
          maxLookback:result.ir?.maxLookback??0,
          executionPlanVisualization:result.ir?.executionPlanVisualization,
        });
        setDiagnostics(next);
        setLastCompile(result);
        lastCompileRef.current={source:sourceSnapshot,result};
        const localValid=Boolean(result.artifact&&result.ir&&!next.some(x=>x.severity==='error'));
        const serverGateApplies=copilotSourceRef.current===sourceSnapshot;
        const serverArtifactMatches=!serverGateApplies||
          (copilotValidationPassRef.current===true&&Boolean(expectedServerHash)&&workerResult.artifact?.abi?.artifactHash===expectedServerHash);
        setCompiled(localValid&&copilotValidationPassRef.current!==false&&serverArtifactMatches);
        monacoAdapterRef.current?.setDiagnostics(result.diagnostics,sourceSnapshot);
        monacoAdapterRef.current?.setSymbolInfo(workerResult.symbols||[]);
        if(copilotSourceRef.current===sourceSnapshot){
          const copilotValid=localValid&&copilotValidationPassRef.current===true&&
            Boolean(expectedServerHash)&&workerResult.artifact?.abi?.artifactHash===expectedServerHash;
          setCopilotStatus(copilotValid?(copilotReplayPassRef.current===true?'ready':'validating'):'needs-fixes');
          setCopilotArtifactHash(copilotValid?(workerResult.artifact?.abi?.artifactHash??null):null);
        }
        return result;
      }catch(error:unknown){
        if(request===compileRequestRef.current&&editorModel.getSource()===sourceSnapshot){
          const message=error instanceof Error?error.message:String(error);
          setDiagnostics([{severity:'error',message}]);
          setCompiled(false);
          monacoAdapterRef.current?.setDiagnostics([{severity:'error',message}],sourceSnapshot);
          if(copilotSourceRef.current===sourceSnapshot){setCopilotStatus('needs-fixes');setCopilotArtifactHash(null);}
        }
        return null;
      }finally{
        if(request===compileRequestRef.current)setCompilePending(false);
        if(compilePromiseRef.current?.promise===promise)compilePromiseRef.current=null;
      }
    })();
    compilePromiseRef.current={source:sourceSnapshot,promise};
    return promise;
  };

  // Compile with a 150 ms debounce in the dedicated worker. Older responses are
  // discarded by request ID + source version so red squiggles never lag behind edits.
  useEffect(()=>{
    let active=true;
    const sourceVersion=editorModel.getVersion();
    const timer=window.setTimeout(()=>{
      if(lastCompileRef.current?.source===source&&editorModel.getVersion()===sourceVersion)return;
      void compileSource(source).then(result=>{
        if(!active||!result)return;
      });
    },150);
    return ()=>{active=false;window.clearTimeout(timer);};
  },[source,editorVersion,editorModel]);

  useEffect(() => {
    let active=true;
    if (!useMonaco || !monacoRef.current) { monacoAdapterRef.current?.dispose(); monacoAdapterRef.current=null; if(active) setMonacoStatus('fallback'); return; }
    setMonacoStatus('loading');
    mountCoreSpiritMonaco(monacoRef.current, editorModel, (next)=>{ if(!active)return; setEditorSource(next); })
      .then(adapter=>{ if(!active){adapter.dispose();return;} monacoAdapterRef.current=adapter; setMonacoStatus('ready');
        const last=lastCompileRef.current;
        if(last?.source===editorModel.getSource()){
          adapter.setDiagnostics(last.result.diagnostics||[],last.source);
          adapter.setSymbolInfo(last.result.symbols||[]);
        }
      })
      .catch(()=>{ if(active)setMonacoStatus('fallback'); });
    return ()=>{active=false;monacoAdapterRef.current?.dispose();monacoAdapterRef.current=null;};
  }, [useMonaco, editorModel]);

  const compile=async()=>{
    const existing=lastCompileRef.current;
    const result=existing?.source===source?existing.result:await compileSource(source);
    if(!result)return;
    setCompiled(Boolean(result.artifact&&result.ir&&!result.diagnostics.some(d=>d.severity==='error')));
  };

  const runOnChart=async()=>{
    try{
      const targetAtStart=coreSpiritChartRegistry.getActive();
      if(!targetAtStart)throw new Error('No active TradingCoreOS chart. Open a live chart and click it once.');
      const targetIdentityAtStart={chartId:targetAtStart.chartId,symbol:targetAtStart.symbol,timeframe:targetAtStart.timeframe};
      if(copilotSourceRef.current===source){
        if(copilotValidationPassRef.current!==true){
          setRunStatus('Copilot security validation has not passed. Fix the diagnostics before Run.');
          return;
        }
        const replayGate=copilotReplayGateRef.current;
        if(copilotReplayPassRef.current!==true||!replayGate||!replayGateMatches(replayGate,source,copilotServerArtifactHashRef.current,targetAtStart)){
          copilotReplayPassRef.current=false;copilotReplayGateRef.current=null;setCopilotStatus('blocked');
          setRunStatus('Copilot replay approval is stale: the source, artifact, chart, or chart-history boundary changed. Revalidate and replay this draft before Run.');
          return;
        }
      }
      const existing=lastCompileRef.current;
      const result=existing?.source===source?existing.result:await compileSource(source);
      if(!result)return;
      const errors=(result.diagnostics||[]).filter(d=>d.severity==='error');
      if(errors.length||!result.ir||!result.artifact){setCompiled(false);return;}
      if(copilotSourceRef.current===source&&result.artifact.abi?.artifactHash!==copilotReplayGateRef.current?.artifactHash){
        copilotReplayPassRef.current=false;copilotReplayGateRef.current=null;setCopilotStatus('blocked');
        setRunStatus('The compiled artifact no longer matches the artifact approved by Copilot replay. Revalidate before Run.');
        return;
      }
      const activeImmediatelyBeforeRun=coreSpiritChartRegistry.getActive();
      if(!activeImmediatelyBeforeRun||activeImmediatelyBeforeRun.chartId!==targetIdentityAtStart.chartId||
        activeImmediatelyBeforeRun.symbol!==targetIdentityAtStart.symbol||activeImmediatelyBeforeRun.timeframe!==targetIdentityAtStart.timeframe){
        throw new Error('The active chart, symbol, or timeframe changed during compilation. Select the intended chart and run again.');
      }
      if(copilotSourceRef.current===source){
        const latestReplayGate=copilotReplayGateRef.current;
        if(copilotReplayPassRef.current!==true||!latestReplayGate||
          !replayGateMatches(latestReplayGate,source,copilotServerArtifactHashRef.current,activeImmediatelyBeforeRun)){
          copilotReplayPassRef.current=false;copilotReplayGateRef.current=null;setCopilotStatus('blocked');
          setRunStatus('Copilot replay approval became stale while compiling. Revalidate and replay the current chart history before Run.');
          return;
        }
      }
      setLastCompile(result);setCompiled(true);setRunStatus('Running on active chart…');
      const target=activeImmediatelyBeforeRun;
      const snapshot=await ideBridge.runActiveChart(source,'coreSpirit-editor',result);
      const run=snapshot.run;
      if(!run)throw new Error(snapshot.error||'CoreSpirit run failed');
      setRunStatus(`${run.barsProcessed.toLocaleString()} bars · ${run.plotsEmitted} plots · ${run.signalsEmitted} signals`);
      if(cloudScriptId){try{await saveExecutionRun({scriptId:cloudScriptId,executionType:'chart',symbol:target.symbol,timeframe:target.timeframe,status:run.diagnostics.length?'error':'success',barsProcessed:run.barsProcessed,plotsEmitted:run.plotsEmitted,signalsEmitted:run.signalsEmitted,metrics:{source:'CoreSpirit Coder',runtimeStatus:snapshot.status,signalExplainability:snapshot.explanations.length,artifactHash:result.artifact.abi?.artifactHash}});}catch{}}
      setDiagnostics(run.diagnostics.length?run.diagnostics.map(message=>({severity:'warning',message})): [{severity:'info',message:`CoreSpirit rendered on ${target.symbol} · ${target.timeframe}.`}]);
    }catch(error:unknown){
      setRunStatus('Run failed');
      setDiagnostics([{severity:'error',message:error instanceof Error?error.message:String(error)}]);
    }
  };

  const generateCopilotDraft=async()=>{
    const modeDefaults:Partial<Record<CopilotMode,string>>={
      'explain-error':'Explain current compiler errors and warnings, prioritizing root causes and source locations.',
      'fix':'Repair the current CoreScript with the smallest safe changes. Preserve intended signals, visuals, risk controls and causal semantics.',
      'optimize':'Optimize the current CoreScript for redundant work and bounded lookbacks without changing intended signals or causal behavior.',
      'convert-to-quant':'Refactor the current CoreScript into typed, reusable quant-oriented code while preserving strategy behavior.',
      'generate-tests':'Generate focused regression tests for current source, especially edge cases, temporal alignment and no-lookahead behavior.',
      'generate-backtest':'Draft a deterministic causal backtest for current strategy intent. State entry/exit, warm-up and transaction-cost assumptions.',
      'generate-features':'Propose a compact typed feature set from available market inputs, with lookbacks and leakage risks.',
      'generate-model':'Draft a supported CoreScript model/inference pipeline from current source intent, separating training and live inference.',
      'generate-docs':'Document current source purpose, inputs, outputs, signal rules, lookback, temporal assumptions and limitations.',
      'explain-lookback':'Explain compiler-reported maximum lookback, warm-up requirements and the expressions driving them.',
      'find-lookahead':'Audit current source for future access, developing higher-timeframe values and backtest/live divergence. Separate findings from risks.',
      'find-repainting':'Audit repainting risks using confirmation gates, timeframe access and compiler diagnostics.',
      'find-unused-computation':'Find calculations not consumed by outputs or downstream work; keep all observable side effects.',
    };
    const prompt=copilotPrompt.trim()||modeDefaults[copilotMode]||'';
    if(!prompt){setCopilotStatus('error');setCopilotError('Describe what you want the script to build.');return;}
    const generationRequest=++copilotGenerationRef.current;
    const requestedSource=source;
    const requestedEditorVersion=editorModel.getVersion();
    setCopilotStatus('generating');setCopilotError('');setCopilotSummary('');setCopilotAssumptions([]);setCopilotArtifactHash(null);copilotSourceRef.current=null;copilotValidationPassRef.current=null;copilotServerArtifactHashRef.current=null;copilotValidationDiagnosticsRef.current=[];copilotReplayPassRef.current=null;copilotReplayGateRef.current=null;
    try{
      const {data:{session},error:sessionError}=await getSupabaseClient().auth.getSession();
      if(sessionError||!session?.access_token)throw new Error('Sign in to TradingCore before using Copilot.');
      const target=coreSpiritChartRegistry.getActive();
      const response=await fetch('/api/corespirit/copilot/generate',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({prompt,mode:copilotMode,currentSource:source,symbol:target?.symbol,timeframe:target?.timeframe}),
        cache:'no-store',
      });
      const payload=await response.json().catch(()=>null) as {
        success?:boolean;error?:string;source?:string;summary?:string;assumptions?:string[];
        analysisOnly?:boolean;validation?:{valid?:boolean;analysisOnly?:boolean;artifactHash?:string|null;diagnostics?:Array<{severity:string;message:string;line?:number;column?:number;start?:number;end?:number;code?:string}>};
      }|null;
      if(generationRequest!==copilotGenerationRef.current)return;
      if(!response.ok||!payload?.success||typeof payload.source!=='string')throw new Error(payload?.error||'CoreSpirit Copilot request failed.');
      if(editorModel.getSource()!==requestedSource||editorModel.getVersion()!==requestedEditorVersion){
        setCopilotStatus('needs-fixes');
        setCopilotError('The editor changed while Copilot was generating. Your edits were preserved; generate again to apply a draft to the current source.');
        return;
      }
      const activeAfterGeneration=coreSpiritChartRegistry.getActive();
      if(!payload.analysisOnly&&((target?.chartId??null)!==(activeAfterGeneration?.chartId??null)||target?.symbol!==activeAfterGeneration?.symbol||target?.timeframe!==activeAfterGeneration?.timeframe)){
        setCopilotStatus('blocked');
        setCopilotError('The active chart changed while Copilot was generating. Your editor was not replaced; select the intended chart and generate again.');
        return;
      }
      setCopilotSummary(payload.summary||'Copilot task completed. Review the findings before acting.');
      setCopilotAssumptions(payload.assumptions||[]);
      if(payload.analysisOnly){
        // Reports, generated tests and documentation are read-only Copilot
        // outputs. Never replace the editor or grant a replay/run gate.
        copilotSourceRef.current=null;
        copilotValidationPassRef.current=false;
        copilotServerArtifactHashRef.current=null;
        copilotReplayPassRef.current=false;
        copilotReplayGateRef.current=null;
        setCopilotArtifactHash(null);
        setDiagnostics((payload.validation?.diagnostics||[]).map(d=>({
          severity:d.severity==='warning'?'warning' as const:'error' as const,
          message:d.message,line:d.line,column:d.column,start:d.start,end:d.end,code:d.code,
        })));
        setCopilotStatus('analysis-complete');
        return;
      }
      copilotSourceRef.current=payload.source;
      copilotValidationPassRef.current=payload.validation?.valid===true;
      copilotServerArtifactHashRef.current=payload.validation?.artifactHash??null;
      copilotValidationDiagnosticsRef.current=(payload.validation?.diagnostics||[]).map(d=>({
        severity:d.severity==='warning'?'warning' as const:'error' as const,
        message:d.message,line:d.line,start:d.start,end:d.end,code:d.code,
      }));
      setCopilotStatus('validating');
      setEditorSource(payload.source);

      // The AI can only supply source. Compile and validate it against the
      // chart sandbox first, then replay that artifact in a dedicated worker.
      const compiled=await compileSource(payload.source);
      const compiledValid=Boolean(
        compiled?.artifact&&compiled.ir&&
        !compiled.diagnostics.some(item=>item.severity==='error')&&
        copilotValidationPassRef.current===true&&
        Boolean(copilotServerArtifactHashRef.current)&&
        compiled.artifact.abi?.artifactHash===copilotServerArtifactHashRef.current,
      );
      if(!compiledValid||!compiled?.artifact){
        setCopilotStatus('needs-fixes');
        return;
      }

      const replayTarget=coreSpiritChartRegistry.getActive();
      if(!replayTarget||replayTarget.chartId!==target?.chartId||replayTarget.symbol!==target?.symbol||replayTarget.timeframe!==target?.timeframe){
        copilotReplayPassRef.current=false;copilotReplayGateRef.current=null;setCopilotStatus('blocked');
        setCopilotSummary(prev=>`${prev}\n\nRun is blocked because the active chart changed after generation. Select the original chart and generate/revalidate the draft again.`);
        return;
      }
      const recentBars=Array.from(replayTarget.getBars?.()??[]).slice(-3000);
      if(!recentBars.length){
        copilotReplayPassRef.current=false;
        setCopilotSummary(prev=>`${prev}\n\nRun is blocked: no chart history was available for the required replay preflight. Open a chart with candle history, then generate/revalidate the draft again.`);
        setCopilotStatus('blocked');
        return;
      }

      const replayContext={
        chartId:replayTarget.chartId,
        symbol:replayTarget.symbol,
        timeframe:replayTarget.timeframe,
        barsProcessed:recentBars.length,
        datasetSignature:replayDatasetSignature(recentBars),
      };
      setCopilotStatus('replaying');
      setCopilotSummary(prev=>`${prev}\n\nChecking the compiled artifact against the latest ${recentBars.length.toLocaleString()} chart bars in an isolated read-only replay…`);
      try{
        const replay=await previewCoreSpiritArtifactOffThread(compiled.artifact,recentBars,{
          symbol:replayTarget?.symbol,
          timeframe:replayTarget?.timeframe,
          sourceId:'corespirit-copilot-preflight',
        });
        if(generationRequest!==copilotGenerationRef.current||copilotSourceRef.current!==payload.source||editorModel.getSource()!==payload.source)return;
        const replayDiagnostics=replay.diagnostics.length
          ? `\nReplay diagnostics: ${replay.diagnostics.slice(0,3).join(' | ')}`
          : '';
        const activeAfterReplay=coreSpiritChartRegistry.getActive();
        const latestBars=Array.from(activeAfterReplay?.getBars?.()??[]).slice(-3000);
        const replayContextStillCurrent=Boolean(activeAfterReplay&&activeAfterReplay.chartId===replayContext.chartId&&
          activeAfterReplay.symbol===replayContext.symbol&&activeAfterReplay.timeframe===replayContext.timeframe&&
          latestBars.length===replayContext.barsProcessed&&replayDatasetSignature(latestBars)===replayContext.datasetSignature);
        const replayPassed=replay.diagnostics.length===0&&replay.barsProcessed===recentBars.length&&Boolean(replay.outputChecksum)&&replayContextStillCurrent;
        copilotReplayPassRef.current=replayPassed;
        copilotReplayGateRef.current=replayPassed?{source:payload.source,artifactHash:compiled.artifact.abi?.artifactHash??'',...replayContext}:null;
        setCopilotSummary(prev=>`${prev}\n\nRead-only historical replay: ${replay.barsProcessed.toLocaleString()} bars, ${replay.plotsEmitted} plots, ${replay.signalsEmitted} signals. Output fingerprint: ${replay.outputChecksum.slice(0,12)}.${replayDiagnostics}${replayPassed?'\nReplay gate passed for this artifact and chart-history boundary.':replayContextStillCurrent?'\nRun is blocked until replay diagnostics are resolved and the draft passes again.':'\nThe active chart or its history changed during replay. Run is blocked; replay the current chart context again.'}`);
        setCopilotStatus(replayPassed?'ready':replayContextStillCurrent?'needs-fixes':'blocked');
      }catch(replayError){
        if(generationRequest!==copilotGenerationRef.current||copilotSourceRef.current!==payload.source||editorModel.getSource()!==payload.source)return;
        copilotReplayPassRef.current=false;copilotReplayGateRef.current=null;
        setCopilotSummary(prev=>`${prev}\n\nRun is blocked because the required read-only replay could not complete: ${replayError instanceof Error?replayError.message:String(replayError)}. Retry after the replay worker is healthy.`);
        // A missing replay result is not evidence of correctness: fail closed.
        setCopilotStatus('blocked');
      }
    }catch(error){
      if(generationRequest!==copilotGenerationRef.current)return;
      setCopilotStatus('error');
      setCopilotError(error instanceof Error?error.message:String(error));
    }
  };

  const save = async () => {
    localStorage.setItem(versionedStorageKey('editor'), source);
    setCloudStatus('loading');
    try {
      const result = await saveEditorScript(source, lastCompile || undefined);
      setCloudScriptId(result.script.id);
      setCloudStatus('saved');
      setDiagnostics([{ severity: 'info', message: `Saved CoreSpirit v${result.version.version} to cloud.` }]);
    } catch (error: unknown) {
      setCloudStatus('error');
      setDiagnostics([{ severity: 'info', message: `Saved locally. Cloud save unavailable: ${error instanceof Error ? error.message : String(error)}` }]);
    }
  };

  return <WorkspaceModuleShell active="/corespirit" onNavigate={onNavigate} onBackToLanding={onBackToLanding} onBroker={onBroker}>
    <ModuleHeader eyebrow="CoreSpirit IDE" title="CoreSpirit Coder" description="A CoreSpirit-first script workspace for TradingCoreOS, with a small language surface that can express indicators, models, drawings, multi-symbol data and realtime automation." action={<div className="flex flex-wrap gap-2"><button onClick={()=>onNavigate('/corespirit')} className="premium-button"><BookOpen className="w-4 h-4"/> Script Docs</button><button onClick={()=>setUseMonaco(v=>!v)} className="premium-button"><Code2 className="w-4 h-4"/>{useMonaco && monacoStatus==='ready' ? 'Classic Editor' : 'Monaco Editor'}</button><button onClick={save} className="premium-button"><Save className="w-4 h-4"/> Save</button><button onClick={compile} className="premium-button premium-button-primary"><Play className="w-4 h-4"/> Compile</button><button onClick={runOnChart} className="premium-button"><Zap className="w-4 h-4"/> Run on chart</button></div>} />
    <main className="grid min-h-[calc(100vh-170px)] gap-4 p-4 md:p-6 xl:grid-cols-[1fr_300px]">
      <Panel title="SCRIPT EDITOR" subtitle="CoreSpirit source • compile first, execute on the active chart in the next editor milestone" className="min-h-[650px] overflow-hidden">
        <div className="flex h-[610px] overflow-hidden rounded-lg border border-[var(--tco-border)] bg-[var(--tco-code-bg)] font-mono text-[12px]">
          <div className="w-12 shrink-0 select-none overflow-hidden border-r border-[var(--tco-border-soft)] bg-[var(--tco-surface)] py-3 text-right text-[var(--tco-slate)]">{lines.map(n => <div key={n} className="h-[20px] pr-3 leading-[20px]">{n}</div>)}</div>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div ref={monacoRef} className={`absolute inset-0 z-30 ${useMonaco && monacoStatus !== 'fallback' ? 'block' : 'hidden'}`} />
            <pre ref={highlightRef} aria-hidden className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words p-3 leading-[20px] text-[var(--tco-code-text)]">{highlighted.map((line,i)=><div key={i} className="h-[20px]">{line}</div>)}</pre>
            <textarea
              ref={editorRef}
              value={source}
              onChange={e => setEditorSource(e.target.value,{completionPrefix:completionState.prefix,cursor:e.target.selectionStart,showCompletions:true})}
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void save(); return; }
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void runOnChart(); return; }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); const snap=editorModel.undo(); setEditorSource(snap.source,{modelAlreadyUpdated:true}); return; }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); const snap=editorModel.redo(); setEditorSource(snap.source,{modelAlreadyUpdated:true}); return; }
                if (showCompletions && e.key === 'ArrowDown') { e.preventDefault(); setCompletionIndex(i=>Math.min(i+1,Math.max(0,completionItems.length-1))); return; }
                if (showCompletions && e.key === 'ArrowUp') { e.preventDefault(); setCompletionIndex(i=>Math.max(0,i-1)); return; }
                if (showCompletions && e.key === 'Enter' && completionItems[completionIndex]) { e.preventDefault(); const item=completionItems[completionIndex]; const start=e.currentTarget.selectionStart-(completionState.prefix?.length||0); const next=editorModel.applyEdit({start,end:e.currentTarget.selectionStart,text:item.label},'',{deferSemanticAnalysis:true}); setEditorSource(next.source,{modelAlreadyUpdated:true,showCompletions:false}); requestAnimationFrame(()=>{ const pos=start+item.label.length; editorRef.current?.setSelectionRange(pos,pos); }); return; }
                if (e.key === 'Escape') setShowCompletions(false);
              }}
              onKeyUp={e => { setCursor(e.currentTarget.selectionStart); if (/[A-Za-z_.]/.test(e.key) || e.key === 'Backspace') { setShowCompletions(true); setCompletionIndex(0); } }}
              onClick={e => { setCursor(e.currentTarget.selectionStart); setShowCompletions(false); }}
              onScroll={e => { if (highlightRef.current) { highlightRef.current.scrollTop=e.currentTarget.scrollTop; highlightRef.current.scrollLeft=e.currentTarget.scrollLeft; } }}
              spellCheck={false}
              className="relative z-10 h-full w-full resize-none overflow-auto bg-transparent p-3 leading-[20px] text-transparent caret-[#f8fafc] outline-none selection:bg-[#3b82f6]/20"
              aria-label="CoreSpirit source editor"
            />
            {showCompletions && completionItems.length > 0 && <div className="absolute left-4 top-14 z-20 w-72 overflow-hidden rounded-lg border border-[var(--tco-control)] bg-[#0b0f17]/95 shadow-2xl backdrop-blur">{completionItems.map((item,i)=><button key={item.label} onMouseDown={e=>{e.preventDefault(); const ta=editorRef.current; if(!ta)return; const start=ta.selectionStart-(completionState.prefix?.length||0); const snap=editorModel.applyEdit({start,end:ta.selectionStart,text:item.label},'',{deferSemanticAnalysis:true}); setEditorSource(snap.source,{modelAlreadyUpdated:true,showCompletions:false}); requestAnimationFrame(()=>{const pos=start+item.label.length; ta.focus(); ta.setSelectionRange(pos,pos);});}} className={`block w-full px-3 py-2 text-left text-[10px] ${i===completionIndex?'bg-[#3b82f6]/15 text-[#f8fafc]':'text-[var(--tco-code-muted)]'} hover:bg-[#3b82f6]/10`}><span className="mr-2 text-[#60a5fa]">{item.kind}</span>{item.label}<span className="ml-2 text-[var(--tco-slate)]">{item.detail}</span></button>)}</div>}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider"><span className={`rounded border px-2 py-1 ${compiled ? 'border-[#3b82f6]/30 text-[#3b82f6]' : 'border-[var(--tco-control)] text-[var(--tco-dim)]'}`}>{compilePending?'COMPILING…':compiled?'COMPILED':'EDITING'}</span><span className="text-[var(--tco-slate)]">CoreSpirit compiler / IR</span><span className="text-[var(--tco-dim)]">{useMonaco ? `Monaco ${monacoStatus}` : 'Classic editor'}</span><span className="ml-2 text-[var(--tco-code-muted)]">{runStatus}</span><span className={`ml-auto ${cloudStatus === 'saved' ? 'text-[#3b82f6]' : cloudStatus === 'error' ? 'text-[#f59e0b]' : 'text-[var(--tco-dim)]'}`}>{cloudStatus === 'saved' ? `CLOUD${cloudScriptId ? ' • SYNCED' : ''}` : cloudStatus === 'loading' ? 'CLOUD • SAVING…' : cloudStatus === 'error' ? 'CLOUD • LOCAL FALLBACK' : 'LOCAL'}</span></div>
        {diagnostics.length > 0 && <div className="mt-3 space-y-2 rounded-lg border border-[var(--tco-border)] bg-[#090b11] p-3">{diagnostics.map((d, i) => { const actions=editorModel.codeActions({message:d.message,line:d.line||1,column:1,severity:d.severity==='error'?'error':'warning'}); return <div key={i} className="rounded-md border border-transparent px-1 py-1 hover:border-[var(--tco-border)]"><div className="flex gap-2 text-[10px] leading-5"><span className={d.severity === 'error' ? 'text-[#ef4444]' : 'text-[#3b82f6]'}>{d.severity === 'error' ? <AlertTriangle className="mt-0.5 h-3 w-3"/> : <CheckCircle2 className="mt-0.5 h-3 w-3"/>}</span><span className="text-[var(--tco-code-muted)]">{d.line ? `Line ${d.line}: ` : ''}{d.message}</span></div>{actions.map(a=><button key={a.title} onClick={()=>{ if(!a.edit)return; const snap=editorModel.applyEdit(a.edit,'',{deferSemanticAnalysis:true}); setEditorSource(snap.source,{modelAlreadyUpdated:true}); }} className="ml-5 mt-1 text-[9px] text-[#60a5fa] hover:text-[#93c5fd]">{a.title}</button>)}</div>})}</div>}
      </Panel>

      <div className="space-y-4">
        <Panel title="CORESPIRIT COPILOT" subtitle="AI drafts code; the CoreScript compiler decides whether it is valid">
          <div className="space-y-3">
            <label className="block text-[9px] uppercase tracking-wider text-[var(--tco-dim)]">Copilot task
              <select value={copilotMode} onChange={e=>setCopilotMode(e.target.value as CopilotMode)} className="mt-1 w-full rounded-lg border border-[var(--tco-border)] bg-[#090b11] p-2 text-[10px] text-[var(--tco-text-2)]">
                {COPILOT_MODE_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <textarea value={copilotPrompt} onChange={e=>setCopilotPrompt(e.target.value)} rows={4} maxLength={4000} placeholder={ANALYSIS_ONLY_COPILOT_MODES.has(copilotMode)?'Optional: focus the analysis on a particular error, dependency or behavior.':'Describe the strategy, model or improvement. Existing compiler diagnostics are supplied automatically for repair/optimization tasks.'} className="w-full resize-y rounded-lg border border-[var(--tco-border)] bg-[#090b11] p-3 text-[10px] leading-5 text-[var(--tco-text-2)] outline-none focus:border-[#3b82f6]/50" />
            <button onClick={()=>void generateCopilotDraft()} disabled={copilotStatus==='generating'||copilotStatus==='validating'||copilotStatus==='replaying'} className="premium-button premium-button-primary w-full justify-center disabled:opacity-50"><Sparkles className="h-4 w-4"/>{copilotStatus==='generating'?'Working…':copilotStatus==='replaying'?'Running read-only replay…':ANALYSIS_ONLY_COPILOT_MODES.has(copilotMode)?'Analyze current script':copilotMode==='fix'?'Repair current script':copilotMode==='optimize'?'Optimize current script':'Generate CoreScript draft'}</button>
            <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider text-[var(--tco-dim)]">
              <span className={copilotStatus==='ready'?'text-[#3b82f6]':copilotStatus==='needs-fixes'||copilotStatus==='blocked'||copilotStatus==='error'?'text-[#f59e0b]':'text-[var(--tco-dim)]'}>{copilotStatus==='ready'?'VALIDATED · REPLAY CHECKED':copilotStatus==='needs-fixes'?'NEEDS FIXES':copilotStatus==='blocked'?'REPLAY REQUIRED':copilotStatus==='replaying'?'HISTORICAL REPLAY':copilotStatus==='validating'?'VALIDATING CORE SCRIPT':copilotStatus==='generating'?'GENERATING':copilotStatus==='error'?'COPILOT ERROR':copilotStatus==='analysis-complete'?'ANALYSIS COMPLETE':'DRAFT ONLY'}</span>
              {copilotArtifactHash&&<span className="ml-auto truncate" title={copilotArtifactHash}>ARTIFACT · {copilotArtifactHash.slice(0,12)}</span>}
            </div>
            {copilotSummary&&<div className="whitespace-pre-wrap break-words rounded border border-[var(--tco-border)] bg-[#090b11] p-2 text-[10px] leading-5 text-[var(--tco-text-2)]">{copilotSummary}</div>}
            {copilotAssumptions.length>0&&<div className="space-y-1 text-[9px] leading-4 text-[var(--tco-dim)]">{copilotAssumptions.map((item,i)=><div key={i}>• {item}</div>)}</div>}
            {copilotError&&<div className="text-[10px] leading-4 text-[#f59e0b]">{copilotError}</div>}
            <div className="text-[9px] leading-4 text-[var(--tco-dim)]">Copilot generates CoreScript only. The compiler, type checker and capability/security gate validate the artifact; the exact artifact must then pass a bounded read-only historical replay before Run. Replay does not update the chart or send orders. Review the source and explicitly use Run on chart yourself.</div>
          </div>
        </Panel>
        <Panel title="EXAMPLES" subtitle="Starter CoreSpirit scripts"><div className="space-y-2">{EXAMPLES.map(([name, code]) => <button key={name} onClick={() => setEditorSource(code)} className="flex w-full items-center gap-2 rounded-lg border border-[var(--tco-border)] bg-[#090b11] p-3 text-left hover:border-[#3b82f6]/40"><BookOpen className="h-4 w-4 text-[#3b82f6]"/><span className="text-[10px] font-mono text-[var(--tco-text-2)]">{name}</span></button>)}</div></Panel>
        <Panel title="CORESPIRIT SYNTAX" subtitle="The concise surface language lowers to the deterministic core"><div className="mb-3 rounded-lg border border-[var(--tco-border)] bg-[#090b11] p-3 font-mono text-[9px] leading-4 text-[var(--tco-code-muted)]">fast = ema(close, 20)<br/>plot fast<br/>if fast crossesAbove slow {'{'} ... {'}'}<br/>input length = int(20, min: 1)</div></Panel>
        <Panel title="SEMANTIC CONTRACT" subtitle="Compiler-normalized view • effects and execution cost come from the same IR graph"><div className="space-y-2"><div className="grid grid-cols-3 gap-1"><div className="rounded border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="text-[8px] text-[var(--tco-dim)]">IR</div><div className="text-[11px] font-bold text-white">{sourceInspection.instructionCount}</div></div><div className="rounded border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="text-[8px] text-[var(--tco-dim)]">LOOKBACK</div><div className="text-[11px] font-bold text-white">{sourceInspection.maxLookback}</div></div><div className="rounded border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="text-[8px] text-[var(--tco-dim)]">EFFECTS</div><div className="text-[11px] font-bold text-[#c084fc]">{sourceInspection.effectAnnotations.filter(x => x.effectful).length}</div></div></div>{sourceInspection.effectAnnotations.length ? <div className="max-h-56 space-y-1 overflow-auto">{sourceInspection.effectAnnotations.slice(0, 30).map(annotation=><div key={`${annotation.sourceNodeId}-${annotation.line}-${annotation.column}`} className="rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] px-2 py-1.5"><div className="flex items-center justify-between"><span className="text-[8px] font-mono text-[var(--tco-text-2)]">L{annotation.line}:{annotation.column} · {annotation.name || annotation.kind}</span><span className={`text-[8px] ${annotation.effectful ? 'text-[#f59e0b]' : 'text-[#3b82f6]'}`}>{annotation.effectful ? 'EFFECT' : 'PURE'}</span></div><div className="mt-0.5 text-[8px] text-[var(--tco-dim)]">cost {annotation.estimatedCost} · {annotation.latencyClass} · {annotation.stateful ? 'stateful' : 'stateless'} · {annotation.deterministic ? 'deterministic' : 'nondeterministic'} · {annotation.parallelizable ? 'parallel' : 'serial'}</div></div>)}</div> : <div className="rounded border border-dashed border-[var(--tco-border)] p-2 text-[8px] text-[var(--tco-dim)]">No semantic nodes resolved yet.</div>}{sourceInspection.normalizedSource !== source && <details className="rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-2"><summary className="cursor-pointer text-[8px] uppercase tracking-widest text-[var(--tco-dim)]">Normalized source</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[8px] leading-4 text-[var(--tco-code-muted)]">{sourceInspection.normalizedSource}</pre></details>}</div></Panel>        <Panel title="EXECUTION PLAN" subtitle="Compiled dependency graph • fused kernels • traversal and allocation accounting">
          <div className="space-y-3">
            {sourceInspection.executionPlanVisualization ? <>
              <div className="grid grid-cols-3 gap-1">
                <div className="rounded border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="text-[8px] text-[var(--tco-dim)]">KERNELS</div><div className="text-[11px] font-bold text-white">{sourceInspection.executionPlanVisualization.summary.kernelCount}</div></div>
                <div className="rounded border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="text-[8px] text-[var(--tco-dim)]">TRAVERSALS</div><div className="text-[11px] font-bold text-white">{sourceInspection.executionPlanVisualization.summary.traversalCount}</div></div>
                <div className="rounded border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="text-[8px] text-[var(--tco-dim)]">INTERMEDIATE ARRAYS</div><div className="text-[11px] font-bold text-[#3b82f6]">{sourceInspection.executionPlanVisualization.summary.intermediateArrays}</div></div>
              </div>
              <div className="rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-2">
                <div className="mb-2 flex items-center justify-between text-[8px] font-mono uppercase tracking-widest text-[var(--tco-dim)]">
                  <span>Dependency graph</span>
                  <span>{sourceInspection.executionPlanVisualization.summary.strategy}</span>
                </div>
                <pre className="max-h-56 overflow-auto whitespace-pre font-mono text-[9px] leading-4 text-[var(--tco-code-muted)]">{sourceInspection.executionPlanVisualization.ascii || 'No executable graph yet.'}</pre>
              </div>
              <div className="space-y-1">
                {sourceInspection.executionPlanVisualization.kernels.map(kernel => <div key={kernel.id} className="rounded border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2">
                  <div className="flex items-center justify-between text-[9px]"><span className="font-semibold text-white">{kernel.label}</span><span className="text-[#3b82f6]">{kernel.status.toUpperCase()}</span></div>
                  <div className="mt-1 text-[8px] text-[var(--tco-dim)]">{kernel.operationCount} operations · {kernel.traversals} traversal · {kernel.intermediateArrays} intermediate arrays</div>
                  <div className="mt-1 truncate font-mono text-[8px] text-[var(--tco-code-muted)]">{kernel.operations.join(' → ')}</div>
                </div>)}
              </div>
            </> : <div className="rounded border border-dashed border-[var(--tco-border)] p-3 text-[9px] text-[var(--tco-dim)]">Compile a valid CoreSpirit script to materialize its execution plan.</div>}
          </div>
        </Panel>
        <Panel title="RUNTIME INSPECTOR" subtitle="Compile → Run → Chart → Signal → Automation preview"><div className="space-y-3"><div className="grid grid-cols-2 gap-2"><div className="rounded-md border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="text-[8px] font-mono uppercase text-[var(--tco-dim)]">Runtime</div><div className={`mt-1 text-[10px] font-bold ${runtimeInspector.status==='error'?'text-[#ef4444]':runtimeInspector.status==='ready'?'text-[#3b82f6]':'text-[#fbbf24]'}`}>{runtimeInspector.status.toUpperCase()}</div></div><div className="rounded-md border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="text-[8px] font-mono uppercase text-[var(--tco-dim)]">Signals</div><div className="mt-1 text-[10px] font-bold text-white">{runtimeInspector.explanations.length}</div></div></div>{runtimeInspector.target && <div className="rounded-md border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2 text-[9px] text-[var(--tco-code-muted)]"><Activity className="mr-1 inline h-3 w-3 text-[#60a5fa]"/>{runtimeInspector.target.symbol} · {runtimeInspector.target.timeframe}</div>}{runtimeInspector.run && <div className="rounded-md border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="mb-2 text-[8px] font-mono uppercase tracking-widest text-[var(--tco-dim)]">Executed artifact</div><div className="grid grid-cols-3 gap-1"><div><div className="text-[8px] text-[var(--tco-dim)]">SOURCE REV</div><div className="text-[10px] font-bold text-white">{runtimeInspector.run.sourceVersion}</div></div><div><div className="text-[8px] text-[var(--tco-dim)]">BARS</div><div className="text-[10px] font-bold text-white">{runtimeInspector.run.barsProcessed.toLocaleString()}</div></div><div><div className="text-[8px] text-[var(--tco-dim)]">PLOTS</div><div className="text-[10px] font-bold text-white">{runtimeInspector.run.plotsEmitted.toLocaleString()}</div></div></div><div className="mt-2 text-[8px] text-[var(--tco-dim)]">Artifact hash</div><div className="truncate font-mono text-[8px] text-[var(--tco-code-muted)]" title={runtimeInspector.run.artifactHash}>{runtimeInspector.run.artifactHash || 'Unavailable'}</div><div className="mt-1 text-[8px] text-[var(--tco-dim)]">Source hash</div><div className="truncate font-mono text-[8px] text-[var(--tco-code-muted)]" title={runtimeInspector.run.sourceHash}>{runtimeInspector.run.sourceHash}</div></div>}<div className="rounded-md border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="mb-2 flex items-center gap-2 text-[8px] font-mono uppercase tracking-widest text-[var(--tco-dim)]"><ShieldCheck className="h-3 w-3 text-[#3b82f6]"/>Automation preview</div><div className="grid gap-1 text-[9px]"><div className="flex justify-between"><span>Lifecycle</span><b className="text-[#3b82f6]">{runtimeInspector.automationPreview.lifecycle}</b></div><div className="flex justify-between"><span>Signals</span><span>{runtimeInspector.automationPreview.signalCount}</span></div><div className="flex justify-between"><span>Order intents</span><span>{runtimeInspector.automationPreview.orderIntentCount}</span></div><div className="flex justify-between"><span>Risk gate</span><span>{runtimeInspector.automationPreview.riskGate}</span></div><div className="flex justify-between"><span>Policy gate</span><span>{runtimeInspector.automationPreview.policyGate}</span></div><div className="flex justify-between"><span>Execution</span><span>{runtimeInspector.automationPreview.execution}</span></div></div><div className="mt-2 text-[8px] text-[var(--tco-dim)]">Preview mode never submits a broker request.</div></div>{runtimeInspector.explanations.length > 0 && <div className="rounded-md border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="mb-2 flex items-center gap-2 text-[8px] font-mono uppercase tracking-widest text-[var(--tco-dim)]"><Eye className="h-3 w-3 text-[#c084fc]"/>Signal explainability</div><div className="space-y-1">{runtimeInspector.explanations.slice().reverse().slice(0,5).map((ex)=><button key={ex.signalId} onClick={()=>{setSelectedExplanation(ex.signalId); setDebugBarInput(String(ex.barIndex)); ideBridge.inspectDebugBar(ex.barIndex);}} className={`w-full rounded border p-2 text-left ${selectedExplanation===ex.signalId?'border-[#3b82f6]/40 bg-[#3b82f6]/5':'border-[var(--tco-border)]'}`}><div className="flex justify-between"><span className="text-[10px] font-semibold text-white">{ex.title}</span><span className="text-[8px] text-[var(--tco-dim)]">bar {ex.barIndex}</span></div><div className="mt-1 truncate text-[8px] text-[var(--tco-dim)]">{ex.reason}</div></button>)}</div></div>}{selectedExplanation && (()=>{const ex=runtimeInspector.explanations.find(x=>x.signalId===selectedExplanation); if(!ex)return null; return <div className="rounded-md border border-[#3b82f6]/20 bg-[#3b82f6]/5 p-2"><div className="text-[9px] font-semibold text-[var(--tco-text-2)]">{ex.title}</div><div className="mt-1 text-[9px] text-[var(--tco-code-muted)]">Reason: {ex.reason}</div><div className="mt-2 space-y-1">{ex.facts.slice(0,8).map(f=><div key={f.id} className="flex justify-between text-[8px]"><span className="text-[var(--tco-dim)]">{f.label}</span><span className="text-white">{String(f.value)}</span></div>)}</div><div className="mt-2 space-y-1">{ex.decisionTrace.slice(-6).map(step=><div key={step.id} className="rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-1.5 text-[8px]"><div className="flex justify-between"><span className="font-mono text-[var(--tco-dim)]">{step.stage}</span><span className="font-semibold text-white">{step.status}</span></div><div className="mt-0.5 text-[var(--tco-code-muted)]">{step.reason}</div></div>)}</div><div className="mt-2 flex items-center gap-1 text-[8px] text-[#3b82f6]"><GitBranch className="h-3 w-3"/>{ex.checksum.slice(0,12)}</div></div>})()}</div></Panel>
<Panel title="VISUAL DEBUGGER" subtitle="Click a chart bar or signal to inspect source → IR → runtime state"><div className="space-y-2"><div className="flex items-center gap-2"><input value={debugBarInput} onChange={e=>setDebugBarInput(e.target.value)} type="number" min="0" className="w-24 rounded border border-[var(--tco-border)] bg-[var(--tco-surface-2)] px-2 py-1.5 text-[9px] font-mono text-white outline-none"/><button onClick={()=>ideBridge.inspectDebugBar(Number(debugBarInput)||0)} className="rounded border border-[#3b82f6]/30 px-2 py-1.5 text-[9px] font-semibold text-[#3b82f6] hover:bg-[#3b82f6]/5">Inspect bar</button>{runtimeInspector.debugger && <span className="ml-auto text-[8px] text-[var(--tco-dim)]">trace {runtimeInspector.debugger.traceChecksum.slice(0,10)}</span>}</div>{runtimeInspector.debugger ? <div className="space-y-2"><div className="grid grid-cols-3 gap-1"><div className="rounded border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="text-[8px] text-[var(--tco-dim)]">BAR</div><div className="text-[10px] font-bold text-white">{runtimeInspector.debugger.selectedBarIndex}</div></div><div className="rounded border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="text-[8px] text-[var(--tco-dim)]">IR STEPS</div><div className="text-[10px] font-bold text-white">{runtimeInspector.debugger.executionPath.length}</div></div><div className="rounded border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="text-[8px] text-[var(--tco-dim)]">SOURCE</div><div className="text-[10px] font-bold text-[#c084fc]">{runtimeInspector.debugger.sourceHighlight?.line ?? '—'}</div></div></div>{runtimeInspector.debugger.sourceHighlight&&<div className="rounded border border-[#c084fc]/20 bg-[#c084fc]/5 p-2"><div className="text-[8px] uppercase tracking-widest text-[var(--tco-dim)]">Source highlight</div><div className="mt-1 text-[9px] font-mono text-[var(--tco-text-2)]">Line {runtimeInspector.debugger.sourceHighlight.line}:{runtimeInspector.debugger.sourceHighlight.column}</div><div className="mt-1 truncate text-[9px] text-[var(--tco-text-2)]">{runtimeInspector.debugger.sourceHighlight.text||'source location resolved from Core IR map'}</div></div>}<div className="grid grid-cols-2 gap-2"><div className="rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-2"><div className="mb-1 text-[8px] uppercase tracking-widest text-[var(--tco-dim)]">State</div>{runtimeInspector.debugger.frames[0]?.state.slice(0,10).map(v=><div key={v.name} className="flex justify-between text-[8px]"><span className="text-[var(--tco-dim)]">{v.name}</span><span className="font-mono text-white">{String(v.value)}</span></div>)}</div><div className="rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-2"><div className="mb-1 text-[8px] uppercase tracking-widest text-[var(--tco-dim)]">Outputs</div>{runtimeInspector.debugger.frames[0]?.outputs.map((o,i)=><div key={`${o.kind}-${i}`} className="rounded border border-[var(--tco-border)] px-2 py-1 text-[8px]"><div className="flex justify-between"><span className="font-mono text-[var(--tco-dim)]">{o.kind}</span><span className="text-white">{o.name||''}</span></div><div className="text-[var(--tco-code-muted)]">{o.message||String(o.value??'')}</div></div>)}</div></div><div className="rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-2"><div className="mb-1 text-[8px] uppercase tracking-widest text-[var(--tco-dim)]">Execution trace</div><div className="max-h-40 space-y-1 overflow-auto">{runtimeInspector.debugger.executionPath.slice(-10).map(step=><div key={`${step.pc}-${step.opcode}`} className="rounded border border-[var(--tco-border)] px-2 py-1 text-[8px]"><div className="flex justify-between"><span className="font-mono text-[var(--tco-dim)]">PC {step.pc} · {step.opcode}</span><span className="text-[#3b82f6]">{String(step.value??'')}</span></div>{step.source&&<div className="text-[var(--tco-code-muted)]">Line {step.source.line}:{step.source.column}</div>}</div>)}{!runtimeInspector.debugger.executionPath.length&&<div className="text-[8px] text-[var(--tco-dim)]">No instruction trace available.</div>}</div></div></div> : <div className="rounded border border-dashed border-[var(--tco-border)] p-3 text-[9px] text-[var(--tco-dim)]">Run the script on an active chart, then inspect a bar or select a signal.</div>}</div></Panel>
<Panel title="LANGUAGE UI" subtitle="Runtime-owned controls declared by CoreSpirit"><div className="space-y-2">{runtimeInspector.uiState?.panels?.length ? runtimeInspector.uiState.panels.map(panel=><div key={panel.id} className="rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-2"><div className="flex items-center justify-between"><span className="text-[10px] font-semibold text-white">{panel.title}</span><span className="text-[8px] text-[var(--tco-dim)]">{panel.controls.length} controls</span></div><div className="mt-2 space-y-1">{panel.controls.map(control=><div key={control.id} className="flex items-center justify-between text-[8px]"><span className="text-[var(--tco-code-muted)]">{control.label}</span><span className="font-mono text-[#c084fc]">{String(control.value)}{control.actionId ? ` · ${control.actionId}` : ''}</span></div>)}</div></div>) : <div className="rounded border border-dashed border-[var(--tco-border)] p-3 text-[9px] text-[var(--tco-dim)]">Run a script using ui.panel(...) to populate runtime UI state.</div>}</div></Panel>
<Panel title="SCENE GRAPH" subtitle="Same runtime outputs, persistent visual objects"><div className="space-y-2"><div className="grid grid-cols-3 gap-2"><div className="rounded-md border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="text-[8px] uppercase text-[var(--tco-dim)]">Nodes</div><div className="mt-1 text-[11px] font-bold text-white">{runtimeInspector.scene?.nodes.length ?? 0}</div></div><div className="rounded-md border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="text-[8px] uppercase text-[var(--tco-dim)]">Interactive</div><div className="mt-1 text-[11px] font-bold text-[#c084fc]">{runtimeInspector.scene?.nodes.filter(n=>n.interactive).length ?? 0}</div></div><div className="rounded-md border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-2"><div className="text-[8px] uppercase text-[var(--tco-dim)]">Revision</div><div className="mt-1 text-[11px] font-bold text-[#3b82f6]">{runtimeInspector.scene?.revision ?? 0}</div></div></div>{runtimeInspector.scene?.nodes.length ? <div className="space-y-1">{runtimeInspector.scene.nodes.slice(-8).reverse().map(node=><div key={node.id} className="flex items-center justify-between rounded border border-[var(--tco-border)] bg-[var(--tco-code-bg)] px-2 py-1.5"><div className="min-w-0"><div className="truncate text-[9px] font-mono text-white">{node.id}</div><div className="text-[8px] text-[var(--tco-dim)]">{node.kind} · {node.layer}{node.semanticRole ? ` · ${node.semanticRole}` : ''}</div></div><div className="ml-2 text-[8px] text-[var(--tco-dim)]">{node.interaction?.onClick?.actionId ? 'CLICK' : ''}</div></div>)}</div> : <div className="rounded border border-dashed border-[var(--tco-border)] p-3 text-[9px] text-[var(--tco-dim)]">Run the script to populate the renderer-neutral scene graph.</div>}</div></Panel>
        <Panel title="CORESPIRIT ROADMAP" subtitle="The editor will grow with the runtime"><div className="space-y-2 text-[10px] leading-5 text-[var(--tco-muted)]"><div><Zap className="mr-2 inline h-3 w-3 text-[#3b82f6]"/>Compile + diagnostics <b className="text-[#3b82f6]">ACTIVE</b></div><div>• Run on active chart <b className="text-[#3b82f6]">ACTIVE</b></div><div>• Runtime inspector / explainability <b className="text-[#3b82f6]">ACTIVE</b></div><div>• Syntax highlighting / autocomplete <b className="text-[#3b82f6]">ACTIVE</b></div><div>• Hover / outline / quick fixes <b className="text-[#3b82f6]">ACTIVE</b></div><div>• Inputs with instant hot reload <b className="text-[#f59e0b]">NEXT</b></div><div>• Plot / line / box / zone controls</div><div>• Webhooks + event handlers</div><div>• Models / feature calls</div><div>• Multi-symbol / multi-timeframe requests</div><div>• Replay / backtest / live execution modes</div><div>• Language-driven panels + controls <b className="text-[#3b82f6]">ACTIVE</b></div><div>• Data-rich visual metadata + inspect <b className="text-[#3b82f6]">ACTIVE</b></div></div></Panel>
        <Panel title="RESET"><button onClick={() => setEditorSource(DEFAULT_SOURCE)} className="premium-button w-full"><RotateCcw className="h-4 w-4"/> Reset starter script</button></Panel>
      </div>
    </main>
  </WorkspaceModuleShell>;
}

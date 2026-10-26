import { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, Code2, Copy, ExternalLink, Layers3, ShieldCheck, Terminal, Zap } from 'lucide-react';
import { WorkspaceModuleShell, ModuleHeader, Panel, type WorkspaceRoute } from '../components/workspace/WorkspaceModuleShell';

const sections = [
  ['overview','Overview'],['concepts','Six concepts'],['indicator','Build an indicator'],['data','Data + LET'],['when','WHEN'],['show','SHOW'],['model','MODEL'],['automate','AUTOMATE'],['types','Types'],['ui','UI panels'],['limits','What is live today']
] as const;

const indicatorExample = `indicator("Core Trend") {
    overlay: true
    input length = int(20, min: 1)
}

fast = ema(close, length)
slow = ema(close, length * 2)

show fast, slow

when fast crossesAbove slow:
    signal "LONG"`;

const probabilityExample = `model Regime {
    inputs:
        close: series<number>
        volume: series<number>
    outputs:
        probability: number
}

show Regime`;

const automationExample = `automate "Open Range" {
    when event("OPEN_RANGE_BREAK"):
        order("BUY", 1)
}`;

function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return <div className="relative overflow-hidden rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface-2)]"><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(children);setCopied(true);window.setTimeout(()=>setCopied(false),1200);}catch{}}} className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-[var(--tco-border)] bg-[var(--tco-surface-3)] px-2 py-1 text-[8px] font-mono text-[var(--tco-muted)] hover:text-white">{copied?<CheckCircle2 className="h-3 w-3"/>:<Copy className="h-3 w-3"/>}{copied?'COPIED':'COPY'}</button><pre className="overflow-x-auto p-4 pr-20 text-[11px] leading-6 text-[var(--tco-code-text)]"><code>{children}</code></pre></div>;
}

function DocSection({ id, title, children }: { id:string; title:string; children:React.ReactNode }) {
  return <section id={id} className="scroll-mt-24 space-y-3"><div className="text-[10px] font-mono uppercase tracking-[.2em] text-[#3b82f6]">CoreSpirit / {id}</div><h2 className="text-2xl font-bold tracking-tight text-[var(--tco-heading)]">{title}</h2>{children}</section>;
}

export function CoreSpiritDocsPage({ onNavigate, onBackToLanding, onBroker }: { onNavigate:(path:WorkspaceRoute)=>void; onBackToLanding:()=>void; onBroker?:()=>void }) {
  const [active, setActive] = useState('overview');
  const activeLabel = useMemo(() => sections.find(([id]) => id===active)?.[1] ?? 'Overview', [active]);
  const scrollTo = (id:string) => { setActive(id); document.getElementById(id)?.scrollIntoView({ behavior:'smooth', block:'start' }); };
  return <WorkspaceModuleShell active="/corespirit/docs" onNavigate={onNavigate} onBackToLanding={onBackToLanding} onBroker={onBroker}>
    <ModuleHeader eyebrow="CoreSpirit Scripting" title="Language & Scripting Docs" description="The practical reference for writing indicators, data transforms, models, visuals and automations with the same compact CoreSpirit surface." action={<button type="button" onClick={()=>onNavigate('/corespirit')} className="inline-flex items-center gap-2 rounded-lg border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-3 py-2 text-[10px] font-mono font-bold text-[#3b82f6]"><Code2 className="h-4 w-4"/> OPEN EDITOR</button>} />
    <div className="grid min-h-0 gap-5 p-4 md:grid-cols-[220px_1fr] md:p-8">
      <aside className="md:sticky md:top-[86px] md:h-[calc(100vh-110px)]"><div className="rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface)] p-2"><div className="px-3 py-2 text-[9px] font-mono uppercase tracking-widest text-[var(--tco-dim)]">{activeLabel}</div>{sections.map(([id,label])=><button key={id} type="button" onClick={()=>scrollTo(id)} className={`w-full rounded-lg px-3 py-2 text-left text-[10px] font-mono transition-colors ${active===id?'bg-[#3b82f6]/10 text-[#3b82f6]':'text-[var(--tco-muted)] hover:bg-[var(--tco-hover)] hover:text-white'}`}>{label}</button>)}</div></aside>
      <main className="max-w-4xl space-y-12 pb-16">
        <DocSection id="overview" title="What CoreSpirit is"><p className="text-sm leading-7 text-[var(--tco-muted)]">CoreSpirit is TradingCoreOS's deterministic scripting layer. The source surface is intentionally small, while the compiler, graph, runtime and host capabilities underneath can express much larger systems.</p><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface)] p-4"><Terminal className="h-4 w-4 text-[#3b82f6]"/><div className="mt-3 text-xs font-bold">Simple surface</div><div className="mt-1 text-[10px] leading-5 text-[var(--tco-dim)]">DATA · LET · WHEN · SHOW · MODEL · AUTOMATE</div></div><div className="rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface)] p-4"><Layers3 className="h-4 w-4 text-[#c084fc]"/><div className="mt-3 text-xs font-bold">Composable graph</div><div className="mt-1 text-[10px] leading-5 text-[var(--tco-dim)]">Values and outputs converge into one semantic/execution graph.</div></div><div className="rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface)] p-4"><ShieldCheck className="h-4 w-4 text-[#60a5fa]"/><div className="mt-3 text-xs font-bold">Safe boundary</div><div className="mt-1 text-[10px] leading-5 text-[var(--tco-dim)]">The VM does not own broker credentials, network or DOM access.</div></div></div></DocSection>
        <DocSection id="concepts" title="The six concepts"><div className="overflow-x-auto rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface)]"><table className="w-full text-left text-[10px]"><thead className="border-b border-[var(--tco-border)] text-[var(--tco-dim)]"><tr><th className="px-4 py-3">Concept</th><th className="px-4 py-3">Use it for</th></tr></thead><tbody className="divide-y divide-[#222636]">{[['DATA','Read market/context inputs'],['LET','Create values, series and derived features'],['WHEN','Conditions and event guards'],['SHOW','Project values into visuals'],['MODEL','Declare host-bound model inputs/outputs'],['AUTOMATE','Turn events/conditions into order intent or external actions']].map(([a,b])=><tr key={a}><td className="px-4 py-3 font-mono font-bold text-[#3b82f6]">{a}</td><td className="px-4 py-3 text-[var(--tco-muted)]">{b}</td></tr>)}</tbody></table></div></DocSection>
        <DocSection id="indicator" title="Build an indicator"><p className="text-sm leading-7 text-[var(--tco-muted)]">The current editor/runtime path supports the existing indicator declaration syntax, standard library functions, plots/show outputs, conditions and signal emission.</p><Code>{indicatorExample}</Code><div className="grid gap-3 sm:grid-cols-2"><Panel title="1 · Declare"><p className="text-[10px] leading-5 text-[var(--tco-muted)]">Give the indicator a stable name and declare inputs inside the declaration block.</p></Panel><Panel title="2 · Compute"><p className="text-[10px] leading-5 text-[var(--tco-muted)]">Use DATA values plus LET bindings and standard functions such as ema, sma, highest, lowest, stdev, vwap and crossover.</p></Panel><Panel title="3 · Show"><p className="text-[10px] leading-5 text-[var(--tco-muted)]">Use SHOW as the universal visual surface. Compatibility plot(...) calls converge into the same runtime output path.</p></Panel><Panel title="4 · Signal"><p className="text-[10px] leading-5 text-[var(--tco-muted)]">Emit deterministic signal facts; broker execution remains outside the VM.</p></Panel></div></DocSection>
        <DocSection id="data" title="DATA + LET"><p className="text-sm leading-7 text-[var(--tco-muted)]">Built-in market series include open, high, low, close, volume and time. Host-provided data capabilities can expose request, lower-timeframe, footprint and depth values.</p><Code>{`LET price = close\nLET range = high - low\nLET upper = highest(high, 20)\nLET participation = volume / max(sma(volume, 20), 1)`}</Code></DocSection>
        <DocSection id="when" title="WHEN"><p className="text-sm leading-7 text-[var(--tco-muted)]">WHEN is readable control-flow sugar. It does not create a second execution engine.</p><Code>{`when close > ema(close, 20):\n    show close\n\nwhen event("SESSION_OPEN"):\n    signal "OPEN"`}</Code></DocSection>
        <DocSection id="show" title="SHOW"><p className="text-sm leading-7 text-[var(--tco-muted)]">SHOW is the universal visual projection surface. Advanced visual functions remain available as compatibility/advanced APIs.</p><Code>{`show fast, slow\nshow liquidityZones\nshow Regime`}</Code></DocSection>
        <DocSection id="model" title="MODEL"><p className="text-sm leading-7 text-[var(--tco-muted)]">MODEL describes typed model intent and host bindings. The production VM does not invent a second Python/ML runtime.</p><Code>{probabilityExample}</Code><div className="rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface)] p-4 text-[10px] leading-5 text-[var(--tco-muted)]">Supported host binding kinds in the current surface include registry, python, cpp, rust, wasm, onnx and remote. The host resolves the strict model ABI and remains responsible for state, quotas and transport.</div></DocSection>
        <DocSection id="automate" title="AUTOMATE"><p className="text-sm leading-7 text-[var(--tco-muted)]">AUTOMATE is the orchestration layer. Order intent is broker-neutral and still passes through risk/policy/execution boundaries.</p><Code>{automationExample}</Code></DocSection>
        <DocSection id="types" title="Types"><p className="text-sm leading-7 text-[var(--tco-muted)]">The language foundation currently defines scalar types int, float, number, boolean, string and null, plus <code>series&lt;int&gt;</code>, <code>series&lt;float&gt;</code>, <code>series&lt;number&gt;</code>, <code>series&lt;boolean&gt;</code> and <code>series&lt;string&gt;</code>.</p><Code>{`LET x: number = 10\nLET enabled: boolean = true\nLET prices: series<number> = close`}</Code></DocSection>
        <DocSection id="ui" title="Language-driven UI"><p className="text-sm leading-7 text-[var(--tco-muted)]">Runtime-owned UI can be declared from CoreSpirit and surfaced in the editor/workspace without giving the VM DOM ownership.</p><Code>{`let panel = ui.panel("Market Controls")\npanel.number("ATR", atr(14))\npanel.toggle("Show Liquidity", true, toggle_liquidity)\npanel.slider("Sensitivity", 1, 10, 5, set_sensitivity)`}</Code></DocSection>
        <DocSection id="limits" title="What is live today"><div className="space-y-2">{['Six-concept language boundary','Compiler diagnostics + stable IR','Native deterministic indicator kernels','Realtime transactional semantics','Renderer-neutral visual scene model','Model ABI + host-bound model declarations','Automation/order-intent boundary','Multi-symbol/timeframe contracts','IDE autocomplete/hover/quick fixes'].map(item=><div key={item} className="flex items-center gap-2 rounded-lg border border-[var(--tco-border)] bg-[var(--tco-surface)] px-3 py-2 text-[10px] text-[var(--tco-muted)]"><CheckCircle2 className="h-4 w-4 text-[#3b82f6]"/>{item}</div>)}</div><p className="text-[10px] leading-5 text-[var(--tco-dim)]">Some production adapters and browser end-to-end renderer paths remain implementation work. The documentation describes the contracts and supported surface in this repository, not a claim that every future backend is complete.</p></DocSection>
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--tco-border)] pt-5"><button type="button" onClick={()=>onNavigate('/corespirit')} className="inline-flex items-center gap-2 rounded-lg bg-[#3b82f6] px-3 py-2 text-[10px] font-bold text-black"><Code2 className="h-4 w-4"/> GO TO EDITOR</button><a href="/corespirit" className="inline-flex items-center gap-2 rounded-lg border border-[var(--tco-border)] px-3 py-2 text-[10px] font-mono text-[var(--tco-muted)] hover:text-white"><ExternalLink className="h-4 w-4"/> OPEN DOCS PAGE</a></div>
      </main>
    </div>
  </WorkspaceModuleShell>;
}

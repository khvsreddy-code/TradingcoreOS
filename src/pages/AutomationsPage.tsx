import { useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Play, Plus, ShieldAlert, Zap, TrendingDown, TrendingUp } from 'lucide-react';
import { WorkspaceModuleShell, ModuleHeader, Panel, WorkspaceRoute } from '../components/workspace/WorkspaceModuleShell';
import { AutomationConfig, defaultAutomations, getAutomations, saveAutomations } from '../services/workspace/workspaceState';

const optionTemplates: Array<{name:string;description:string;kind:AutomationConfig['kind'];period?:number}> = [
 {name:'BUY CE · Bullish breakout',description:'Paper-first CE buy signal when price closes above the rolling 20-bar breakout level.',kind:'DONCHIAN_BREAKOUT',period:20},
 {name:'BUY PE · Bearish breakout',description:'Paper-first PE buy signal when price closes below the rolling 20-bar breakout level.',kind:'DONCHIAN_BREAKOUT',period:20},
 {name:'SELL CE · Bearish reversal',description:'Paper-first CE sell signal on a bearish VWAP reclaim failure.',kind:'VWAP_RECLAIM'},
 {name:'SELL PE · Bullish reversal',description:'Paper-first PE sell signal on a bullish VWAP reclaim.',kind:'VWAP_RECLAIM'},
];

export function AutomationsPage({ onNavigate, onBackToLanding, onBroker }: { onNavigate:(path:WorkspaceRoute)=>void; onBackToLanding:()=>void; onBroker?:()=>void }) {
 const [items,setItems]=useState<AutomationConfig[]>(getAutomations); const [last,setLast]=useState('');
 useEffect(()=>saveAutomations(items),[items]);
 const toggle=(id:string)=>setItems(v=>v.map(x=>x.id===id?{...x,enabled:!x.enabled,mode:x.enabled?'Off':(x.mode==='Off'?'Paper':x.mode)}:x));
 const mode=(id:string,m:AutomationConfig['mode'])=>setItems(v=>v.map(x=>x.id===id?{...x,mode:m,enabled:m!=='Off'}:x));
 const add=()=>{const id=`automation-${Date.now()}`;setItems(v=>[...v,{id,name:'Donchian breakout',description:'Close breaks the rolling 20-bar channel. Paper-first starter rule.',mode:'Paper',enabled:false,kind:'DONCHIAN_BREAKOUT',period:20}]);};
 const addTemplate=(template:typeof optionTemplates[number])=>{const id=`${template.kind.toLowerCase().replace(/\W/g,'-')}-${Date.now()}`;setItems(v=>[...v,{id,name:template.name,description:template.description,mode:'Paper',enabled:false,kind:template.kind,period:template.period}]);setLast(`${template.name} added in Paper mode.`);};
 const enabled=useMemo(()=>items.filter(x=>x.enabled),[items]);
 return <WorkspaceModuleShell active="/automations" onNavigate={onNavigate} onBackToLanding={onBackToLanding} onBroker={onBroker}>
  <ModuleHeader eyebrow="Rules Engine" title="Automations" description="Build simple paper-first CE/PE buy and sell signals. Live order submission remains behind explicit risk controls." action={<button onClick={add} className="premium-button premium-button-primary"><Plus className="w-4 h-4"/> New automation</button>}/>
  <main className="p-4 md:p-8 space-y-4">
   <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    {optionTemplates.map((t,i)=><button key={t.name} onClick={()=>addTemplate(t)} className="rounded-xl border border-[#222636] bg-[#090a0f] p-4 text-left hover:border-[#10b981]/40 hover:bg-[#0c1018]"><div className="flex items-center justify-between"><span className="text-xs font-semibold">{t.name}</span>{i<2?<TrendingUp className="w-4 h-4 text-[#10b981]"/>:<TrendingDown className="w-4 h-4 text-[#ef4444]"/>}</div><div className="mt-2 text-[10px] leading-4 text-[#64748b]">{t.description}</div><div className="mt-3 text-[8px] font-mono uppercase tracking-widest text-[#10b981]">ADD PAPER RULE</div></button>)}
   </div>
   <div className="grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
    <Panel title="Automation Library" subtitle={`${enabled.length} enabled · Paper mode is the default`}>
     <div className="space-y-2">{items.map(x=><div key={x.id} className="rounded-xl border border-[#222636] bg-[#090a0f] p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="flex items-center gap-2 text-sm font-semibold">{x.name}{x.enabled&&<span className="h-1.5 w-1.5 rounded-full bg-[#10b981]"/>}</div><div className="mt-1 text-xs text-[#7e889d]">{x.description}</div></div><div className="flex gap-1">{(['Paper','Live','Off'] as const).map(m=><button key={m} onClick={()=>mode(x.id,m)} className={`rounded-md border px-2 py-1.5 text-[9px] font-mono ${x.mode===m?'border-[#10b981]/40 bg-[#10b981]/10 text-[#10b981]':'border-[#222636] text-[#64748b]'}`}>{m}</button>)}<button onClick={()=>toggle(x.id)} className="rounded-md border border-[#222636] px-2 py-1.5 text-[9px]">{x.enabled?'Disable':'Enable'}</button></div></div><div className="mt-3 flex items-center justify-between text-[9px] font-mono text-[#64748b]"><span>CHART SIGNALS · {x.kind}</span><button onClick={()=>{setLast(`${x.name}: test event generated (paper only)`);window.dispatchEvent(new CustomEvent('tradingcore:automation-test',{detail:x}));}} className="rounded-md border border-[#222636] px-3 py-1.5 hover:text-white"><Play className="inline w-3 h-3 mr-1"/> Test event</button></div></div>)}</div>
     {last&&<div className="mt-3 rounded-md border border-[#10b981]/20 bg-[#10b981]/5 p-3 text-[10px] font-mono text-[#9ee6c5]">{last}</div>}
    </Panel>
    <div className="space-y-4"><Panel title="Safety Gate" subtitle="Live automation is not allowed to silently place orders."><div className="space-y-3 text-xs text-[#8c93a6]"><div className="flex gap-3"><ShieldAlert className="w-4 h-4 text-[#f59e0b]"/><span>Risk limits, duplicate protection and explicit live enablement belong between signal and broker.</span></div><div className="flex gap-3"><Zap className="w-4 h-4 text-[#10b981]"/><span>Paper signals can be visualized on the chart without sending orders.</span></div><div className="flex gap-3"><CheckCircle2 className="w-4 h-4 text-[#60a5fa]"/><span>Rules are user-scoped in browser state for this build.</span></div></div></Panel><Panel title="Signal pipeline"><div className="rounded-lg border border-[#222636] bg-[#090a0f] p-4 text-[10px] font-mono text-[#c9ceda]">Tick → Indicator → Condition → CE/PE Signal → Risk Gate → Broker</div><div className="mt-3 text-[10px] leading-5 text-[#64748b]">Models remain Coming Soon. Models will feed the same signal pipeline rather than bypassing the risk gate.</div></Panel></div>
   </div>
  </main>
 </WorkspaceModuleShell>;
}

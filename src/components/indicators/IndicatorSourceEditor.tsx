import { useMemo, useState } from 'react';
import { CheckCircle2, Code2, Cloud, Copy, Eye, ImagePlus, RotateCcw, Save, Upload, X } from 'lucide-react';
import type { IndicatorConfig } from '../../services/marketData/indicatorEngine';
import { getIndicatorSourceTemplate } from '../../services/coreSpirit/indicatorSourceTemplates';
import { getIndicatorSettingsSchema } from '../../services/coreSpirit/indicatorSettingsSchema';
import { compileCoreSpirit } from '../../services/coreSpirit/coreSpiritPipeline';
import { publishUserIndicator, saveUserIndicatorDraft, type IndicatorPublication } from '../../services/coreSpirit/indicatorPublicationService';
import type { UserProfile } from '../../auth/types';

export type IndicatorSourceEditorProps = {
  item: IndicatorConfig;
  user: Pick<UserProfile, 'name' | 'avatar'>;
  onClose: () => void;
  onSaved?: (result: { scriptId: string; source: string }) => void;
};

export function IndicatorSourceEditor({ item, user, onClose, onSaved }: IndicatorSourceEditorProps) {
  const template = useMemo(() => getIndicatorSourceTemplate(item.kind, item), [item.kind, item]);
  const [source, setSource] = useState(item.sourceCode || template.source);
  const [title, setTitle] = useState(item.customName || item.kind);
  const [description, setDescription] = useState(template.note);
  const [category, setCategory] = useState('Custom');
  const [tags, setTags] = useState(item.kind.toLowerCase().replace(/[^a-z0-9]+/g, ' '));
  const [license, setLicense] = useState('MIT');
  const [cover, setCover] = useState<File | null>(null);
  const [tab, setTab] = useState<'code' | 'publish'>('code');
  const [scriptId, setScriptId] = useState<string | null>(item.scriptId || null);
  const [status, setStatus] = useState<'idle'|'saving'|'saved'|'publishing'|'published'|'error'>('idle');
  const [message, setMessage] = useState('');
  const [publication, setPublication] = useState<IndicatorPublication | null>(null);
  const lines = useMemo(() => source.split('\n').length, [source]);

  const compile = () => compileCoreSpirit(source, `indicator-studio:${item.id}`);

  const saveDraft = async () => {
    setStatus('saving'); setMessage('');
    try {
      const compiled = compile();
      const result = await saveUserIndicatorDraft({ scriptId, title, description, source, metadata: { category, tags: tags.split(',').map((x)=>x.trim()).filter(Boolean), nativeKind: item.kind, settings: item, settingsSchema: getIndicatorSettingsSchema(item.kind, item as Record<string, unknown>) }, compile: compiled });
      setScriptId(result.script.id); setStatus('saved'); setMessage(`Saved draft v${result.version.version}.`); onSaved?.({ scriptId: result.script.id, source });
    } catch (error) {
      setStatus('error'); setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const publish = async () => {
    setStatus('publishing'); setMessage('');
    try {
      const compiled = compile();
      const result = await publishUserIndicator({
        scriptId, title, description, source, category, tags: tags.split(','), coverImage: cover, license, openSource: true, visibility: 'public', profile: user, settings: item, compile: compiled,
      });
      setScriptId(result.script.id); setPublication(result.publication); setStatus('published'); setMessage(`Published as /explore/indicators/${result.publication.slug}.`); onSaved?.({ scriptId: result.script.id, source });
    } catch (error) {
      setStatus('error'); setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const reset = () => { setSource(template.source); setStatus('idle'); setMessage(''); };
  const copy = async () => { await navigator.clipboard?.writeText(source); setMessage('Source copied.'); };

  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event)=>{ if(event.currentTarget===event.target) onClose(); }}>
    <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[var(--tco-border)] bg-[var(--tco-surface)] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[var(--tco-border)] px-4 py-3">
        <div className="min-w-0"><div className="flex items-center gap-2 text-[9px] uppercase tracking-widest text-[#3b82f6]"><Code2 className="h-3.5 w-3.5"/> CoreSpirit Indicator Studio</div><div className="mt-1 truncate text-lg font-semibold text-white">{title}</div><div className="mt-1 text-[10px] text-[var(--tco-dim)]">Edit the starter source, save versions to Supabase, then publish a public code-visible indicator.</div></div>
        <button type="button" onClick={onClose} className="rounded-lg border border-[var(--tco-border)] p-2 text-[var(--tco-dim)] hover:text-white"><X className="h-4 w-4"/></button>
      </div>
      <div className="flex gap-1 border-b border-[var(--tco-border)] px-4 pt-2"><button onClick={()=>setTab('code')} className={`rounded-t-lg px-3 py-2 text-[10px] font-mono ${tab==='code'?'bg-[var(--tco-code-bg)] text-white':'text-[var(--tco-dim)] hover:text-white'}`}>SOURCE</button><button onClick={()=>setTab('publish')} className={`rounded-t-lg px-3 py-2 text-[10px] font-mono ${tab==='publish'?'bg-[var(--tco-code-bg)] text-white':'text-[var(--tco-dim)] hover:text-white'}`}>PUBLISH</button></div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {tab==='code' ? <div className="grid min-h-[560px] gap-4 lg:grid-cols-[1.4fr_.6fr]">
          <div className="min-h-0 overflow-hidden rounded-xl border border-[var(--tco-border)] bg-[var(--tco-code-bg)]">
            <div className="flex items-center justify-between border-b border-[var(--tco-border)] px-3 py-2"><div className="text-[9px] font-mono text-[var(--tco-dim)]">CORESPIRIT SOURCE · {lines} lines</div><div className="flex gap-1"><button onClick={copy} title="Copy source" className="rounded-md p-1.5 text-[var(--tco-dim)] hover:text-white"><Copy className="h-3.5 w-3.5"/></button><button onClick={reset} title="Reset starter" className="rounded-md p-1.5 text-[var(--tco-dim)] hover:text-white"><RotateCcw className="h-3.5 w-3.5"/></button></div></div>
            <div className="grid min-h-0 grid-cols-[40px_1fr] overflow-auto"><div className="select-none border-r border-[var(--tco-border)] py-3 text-right font-mono text-[10px] leading-5 text-[var(--tco-dim)]">{Array.from({length:lines},(_,i)=><div key={i} className="pr-2">{i+1}</div>)}</div><textarea value={source} onChange={e=>{setSource(e.target.value);setStatus('idle');setMessage('')}} spellCheck={false} className="min-h-[520px] w-full resize-none bg-transparent p-3 font-mono text-[11px] leading-5 text-[var(--tco-code-text)] outline-none" /></div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-4"><div className="text-[9px] uppercase tracking-widest text-[var(--tco-dim)]">Template status</div><div className="mt-2 flex items-center gap-2 text-xs font-semibold text-white"><CheckCircle2 className="h-4 w-4 text-[#22c55e]"/>{template.editable ? 'Editable source' : 'Read-only source'}</div><div className="mt-2 text-[10px] leading-4 text-[var(--tco-muted)]">{template.note}</div></div>
            <div className="rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-4"><div className="text-[9px] uppercase tracking-widest text-[var(--tco-dim)]">Safety boundary</div><div className="mt-2 text-[10px] leading-4 text-[var(--tco-muted)]">Publishing makes the source public. Never place broker credentials, tokens, private keys, or secrets in indicator code.</div></div><div className="rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-4"><div className="text-[9px] uppercase tracking-widest text-[var(--tco-dim)]">Execution status</div><div className="mt-2 text-[10px] leading-4 text-[var(--tco-muted)]">Saved source is versioned and compiled to CoreSpirit IR. Native chart execution remains the current workspace path; arbitrary edited source execution is introduced through the future user-component runtime gate.</div></div>
            <button onClick={saveDraft} disabled={status==='saving'} className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-3 py-2.5 text-[10px] font-semibold text-[#60a5fa] disabled:opacity-60"><Cloud className="h-4 w-4"/>{status==='saving'?'Saving…':'Save version to Supabase'}</button>
            <button onClick={()=>setTab('publish')} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#3b82f6] px-3 py-2.5 text-[10px] font-semibold text-white"><Upload className="h-4 w-4"/> Continue to publish</button>
          </div>
        </div> : <div className="grid gap-4 lg:grid-cols-[1fr_.8fr]">
          <div className="space-y-3">
            {([['Title',title,setTitle,'text'],['Description',description,setDescription,'text'],['Category',category,setCategory,'text'],['Tags',tags,setTags,'text']] as const).map(([label,value,setValue,type])=><label key={label} className="block text-[9px] font-mono text-[var(--tco-muted)]">{label}<input type={type} value={value} onChange={e=>setValue(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--tco-control)] bg-[var(--tco-code-bg)] px-3 py-2 text-[10px] text-white outline-none focus:border-[#3b82f6]/50" /></label>)}
            <label className="block text-[9px] font-mono text-[var(--tco-muted)]">License<select value={license} onChange={e=>setLicense(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--tco-control)] bg-[var(--tco-code-bg)] px-3 py-2 text-[10px] text-white"><option>MIT</option><option>Apache-2.0</option><option>CC BY 4.0</option><option>CC BY-NC 4.0</option></select></label>
            <label className="block rounded-xl border border-dashed border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-4 text-[9px] text-[var(--tco-muted)]"><div className="flex items-center gap-2 text-white"><ImagePlus className="h-4 w-4 text-[#3b82f6]"/> Cover image</div><div className="mt-1">PNG, JPEG, or WebP · max 6 MB</div><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setCover(e.target.files?.[0]||null)} className="mt-2 w-full text-[9px]" />{cover&&<div className="mt-2 text-[#60a5fa]">Selected: {cover.name}</div>}</label>
          </div>
          <div className="rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface-2)] p-4"><div className="text-[9px] uppercase tracking-widest text-[var(--tco-dim)]">Public listing</div><div className="mt-3 rounded-xl border border-[var(--tco-border)] bg-[var(--tco-code-bg)] p-3"><div className="text-sm font-semibold text-white">{title || 'Untitled Indicator'}</div><div className="mt-1 text-[10px] text-[var(--tco-dim)]">by {user.name || 'Trader'} · {category}</div><div className="mt-3 text-[10px] leading-4 text-[var(--tco-muted)]">{description || 'No description yet.'}</div><div className="mt-3 flex flex-wrap gap-1">{tags.split(',').map(x=>x.trim()).filter(Boolean).slice(0,8).map(tag=><span key={tag} className="rounded-full border border-[var(--tco-border)] px-2 py-1 text-[8px] text-[var(--tco-dim)]">{tag}</span>)}</div></div><div className="mt-3 text-[9px] leading-4 text-[var(--tco-dim)]">The public card exposes the image, title, author, description, tags and complete CoreSpirit source snapshot.</div><button onClick={publish} disabled={status==='publishing'} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-[#3b82f6] px-3 py-2.5 text-[10px] font-semibold text-white disabled:opacity-60"><Upload className="h-4 w-4"/>{status==='publishing'?'Publishing…':'Publish publicly'}</button>{publication&&<a href={`/explore/indicators/${publication.slug}`} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--tco-border)] px-3 py-2.5 text-[10px] text-[var(--tco-text-2)]"><Eye className="h-4 w-4"/> View public listing</a>}</div>
        </div>}
      </div>
      {message&&<div className={`border-t px-4 py-2 text-[9px] font-mono ${status==='error'?'border-[#ef4444]/30 text-[#fca5a5]':'border-[var(--tco-border)] text-[var(--tco-dim)]'}`}>{message}</div>}
    </div>
  </div>;
}

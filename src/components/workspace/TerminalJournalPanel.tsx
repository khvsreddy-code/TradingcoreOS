import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Activity, CalendarDays, Check, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  deleteTerminalJournalTrade,
  listTerminalJournalTrades,
  saveTerminalJournalTrade,
  type TerminalJournalTrade,
} from '../../services/terminal/terminalDataService';
import { loadTcoVelaJournal, saveTcoVelaJournal } from '../../services/core/chart/tcoVelaSupabaseStorage';

type Props = { symbol: string; timeframe: string };

function localDateTimeValue(date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function money(value: number): string {
  return '₹' + value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function TerminalJournalPanel({ symbol, timeframe }: Props) {
  const [trades, setTrades] = useState<TerminalJournalTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesStatus, setNotesStatus] = useState('Loading notes…');
  const [notesReady, setNotesReady] = useState(false);
  const [form, setForm] = useState({
    symbol,
    side: 'long' as 'long' | 'short',
    quantity: '1',
    entryPrice: '',
    exitPrice: '',
    entryAt: localDateTimeValue(),
    exitAt: '',
    fees: '0',
    timeframe,
    setup: '',
    notes: '',
  });

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      setTrades(await listTerminalJournalTrades(150));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Journal could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    let live = true;
    void loadTcoVelaJournal().then(value => {
      if (!live) return;
      setNotes(value || '');
      setNotesStatus('Notes synced to your account');
      setNotesReady(true);
    }).catch(() => {
      if (live) {
        setNotesStatus('Notes sync unavailable');
        setNotesReady(true);
      }
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    setForm(current => ({
      ...current,
      symbol: current.symbol || symbol,
      timeframe: current.timeframe || timeframe,
    }));
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!notesReady) return;
    const timer = window.setTimeout(() => {
      setNotesStatus('Saving notes…');
      void saveTcoVelaJournal(notes).then(saved => {
        setNotesStatus(saved ? 'Notes saved to your account' : 'Notes saved locally · account sync unavailable');
      }).catch(() => setNotesStatus('Notes saved locally · cloud sync unavailable'));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [notes, notesReady]);

  const closed = useMemo(() => trades.filter(trade => trade.net_pnl != null), [trades]);
  const net = useMemo(() => closed.reduce((sum, trade) => sum + Number(trade.net_pnl || 0), 0), [closed]);
  const wins = useMemo(() => closed.filter(trade => Number(trade.net_pnl) > 0).length, [closed]);
  const winRate = closed.length ? wins / closed.length * 100 : 0;

  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  const submitTrade = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setStatus('');
    const quantity = Number(form.quantity);
    const entryPrice = Number(form.entryPrice);
    const exitPrice = form.exitPrice.trim() ? Number(form.exitPrice) : null;
    const fees = Number(form.fees || 0);
    const entryAt = new Date(form.entryAt);
    const exitAt = form.exitAt ? new Date(form.exitAt) : null;
    const tradeSymbol = form.symbol.trim().toUpperCase();

    if (!tradeSymbol || !Number.isFinite(quantity) || quantity <= 0
      || !Number.isFinite(entryPrice) || entryPrice <= 0
      || (exitPrice !== null && (!Number.isFinite(exitPrice) || exitPrice <= 0))
      || !Number.isFinite(fees) || fees < 0
      || !Number.isFinite(entryAt.getTime())
      || (exitAt && (!Number.isFinite(exitAt.getTime()) || exitAt < entryAt))) {
      setError('Check the instrument, quantity, prices, fees and entry/exit times.');
      return;
    }

    const gross = exitPrice === null ? null
      : (form.side === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice) * quantity;
    setSaving(true);
    try {
      const saved = await saveTerminalJournalTrade({
        symbol: tradeSymbol,
        side: form.side,
        quantity,
        entry_price: entryPrice,
        exit_price: exitPrice,
        entry_at: entryAt.toISOString(),
        exit_at: exitAt?.toISOString() || null,
        gross_pnl: gross,
        fees,
        net_pnl: gross === null ? null : gross - fees,
        timeframe: form.timeframe.trim() || null,
        setup: form.setup.trim() || null,
        strategy_name: null,
        tags: [],
        notes: form.notes.trim(),
        source: 'manual',
        metadata: { chartSymbol: symbol, chartTimeframe: timeframe },
      });
      setTrades(current => [saved, ...current.filter(item => item.id !== saved.id)].slice(0, 150));
      setStatus('Trade saved to your account.');
      setShowForm(false);
      setForm(current => ({
        ...current,
        quantity: '1',
        entryPrice: '',
        exitPrice: '',
        entryAt: localDateTimeValue(),
        exitAt: '',
        fees: '0',
        setup: '',
        notes: '',
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Trade could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const removeTrade = async (id: string) => {
    setError('');
    try {
      await deleteTerminalJournalTrade(id);
      setTrades(current => current.filter(item => item.id !== id));
      setStatus('Trade removed.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Trade could not be removed.');
    }
  };

  const fieldClass = 'min-w-0 w-full rounded-lg border border-[#2b3a4d] bg-[#080e17] px-2.5 py-2 text-[10px] text-[#e6edf7] outline-none focus:border-[#5685c1]';
  const labelClass = 'flex min-w-0 flex-col gap-1 text-[9px] font-medium text-[#8d9fb7]';

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-[#0b1018] p-3 text-[#e5edf7]">
      <div className="flex items-center justify-between gap-3">
        <div><div className="text-[12px] font-semibold">Trading Journal</div><div className="mt-1 text-[9px] text-[#8092aa]">Structured trade records · saved to your Supabase account</div></div>
        <button type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh journal" className="rounded-lg border border-[#2b3a4d] p-2 text-[#8fa3be] hover:bg-[#172232]"><RefreshCw className={'h-3.5 w-3.5 ' + (loading ? 'animate-spin' : '')} /></button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-[#28374a] bg-[#101a27] p-2"><div className="text-[8px] uppercase tracking-wider text-[#7f91a8]">Net P&amp;L</div><div className={'mt-1 text-[12px] font-semibold tabular-nums ' + (net >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{money(net)}</div></div>
        <div className="rounded-lg border border-[#28374a] bg-[#101a27] p-2"><div className="text-[8px] uppercase tracking-wider text-[#7f91a8]">Win rate</div><div className="mt-1 text-[12px] font-semibold tabular-nums text-[#e2e8f0]">{closed.length ? winRate.toFixed(1) + '%' : '—'}</div></div>
        <div className="rounded-lg border border-[#28374a] bg-[#101a27] p-2"><div className="text-[8px] uppercase tracking-wider text-[#7f91a8]">Trades</div><div className="mt-1 text-[12px] font-semibold tabular-nums text-[#e2e8f0]">{trades.length}</div></div>
      </div>

      <button type="button" onClick={() => setShowForm(value => !value)} className="flex items-center justify-center gap-2 rounded-lg border border-[#4c79af] bg-[#1c3a5b] px-3 py-2.5 text-[10px] font-semibold text-white hover:bg-[#254b74]">
        <Plus className="h-3.5 w-3.5" /> {showForm ? 'Close trade form' : 'Record a trade'}
      </button>

      {showForm && <form onSubmit={event => void submitTrade(event)} className="grid grid-cols-2 gap-2 rounded-xl border border-[#2b3b50] bg-[#101925] p-3">
        <label className={labelClass + ' col-span-2'}>Instrument<input className={fieldClass} value={form.symbol} onChange={event => update('symbol', event.target.value)} required maxLength={80} /></label>
        <label className={labelClass}>Side<select className={fieldClass} value={form.side} onChange={event => update('side', event.target.value)}><option value="long">Long</option><option value="short">Short</option></select></label>
        <label className={labelClass}>Quantity<input className={fieldClass} type="number" min="0.00000001" step="any" value={form.quantity} onChange={event => update('quantity', event.target.value)} required /></label>
        <label className={labelClass}>Entry price<input className={fieldClass} type="number" min="0.00000001" step="any" value={form.entryPrice} onChange={event => update('entryPrice', event.target.value)} required /></label>
        <label className={labelClass}>Exit price (optional)<input className={fieldClass} type="number" min="0.00000001" step="any" value={form.exitPrice} onChange={event => update('exitPrice', event.target.value)} /></label>
        <label className={labelClass}>Entry time<input className={fieldClass} type="datetime-local" value={form.entryAt} onChange={event => update('entryAt', event.target.value)} required /></label>
        <label className={labelClass}>Exit time<input className={fieldClass} type="datetime-local" value={form.exitAt} onChange={event => update('exitAt', event.target.value)} /></label>
        <label className={labelClass}>Fees / charges<input className={fieldClass} type="number" min="0" step="any" value={form.fees} onChange={event => update('fees', event.target.value)} /></label>
        <label className={labelClass}>Timeframe<input className={fieldClass} value={form.timeframe} onChange={event => update('timeframe', event.target.value)} /></label>
        <label className={labelClass + ' col-span-2'}>Setup / strategy<input className={fieldClass} value={form.setup} onChange={event => update('setup', event.target.value)} maxLength={120} /></label>
        <label className={labelClass + ' col-span-2'}>Notes<textarea className={fieldClass + ' resize-y'} rows={2} value={form.notes} onChange={event => update('notes', event.target.value)} maxLength={4000} /></label>
        <button type="submit" disabled={saving} className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-[#315f92] px-3 py-2.5 text-[10px] font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save trade record</button>
      </form>}

      {status && <div role="status" className="text-[9px] text-emerald-300">{status}</div>}
      {error && <div role="alert" className="rounded-lg border border-rose-900/50 bg-rose-950/20 p-2 text-[9px] text-rose-200">{error}</div>}

      <div className="min-h-[130px] flex-1">
        <div className="mb-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[.13em] text-[#8193aa]"><CalendarDays className="h-3.5 w-3.5" /> Recent trades</div>
        {loading ? <div className="flex items-center gap-2 py-5 text-[10px] text-[#8193aa]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading account journal…</div> : trades.length ? <div className="space-y-1.5">
          {trades.map(trade => <article key={trade.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#263448] bg-[#0f1722] px-2.5 py-2">
            <div className="min-w-0"><div className="truncate text-[10px] font-semibold text-[#e2eaf4]">{trade.symbol} <span className={trade.side === 'long' ? 'text-emerald-400' : 'text-rose-400'}>{trade.side.toUpperCase()}</span></div><div className="mt-1 text-[8px] text-[#7d90a9]">{Number(trade.quantity).toLocaleString('en-IN')} · {new Date(trade.entry_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} IST</div><div className="mt-1 truncate text-[8px] text-[#70839d]">{trade.setup || trade.timeframe || 'Manual journal entry'}</div></div>
            <div className="flex shrink-0 items-center gap-2"><div className={'text-[10px] font-semibold tabular-nums ' + (trade.net_pnl == null ? 'text-[#93a2b7]' : Number(trade.net_pnl) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{trade.net_pnl == null ? 'OPEN' : money(Number(trade.net_pnl))}</div><button type="button" onClick={() => void removeTrade(trade.id)} title="Delete journal record" className="rounded-md p-1.5 text-[#667991] hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="h-3 w-3" /></button></div>
          </article>)}
        </div> : <div className="rounded-lg border border-dashed border-[#2a394d] p-4 text-center text-[9px] leading-4 text-[#71849d]">No trade records yet. Record your first trade to start tracking P&amp;L and execution.</div>}
      </div>

      <section className="flex flex-col gap-2 border-t border-[#263448] pt-3">
        <div className="flex items-center justify-between gap-2"><div className="text-[9px] font-bold uppercase tracking-[.13em] text-[#8193aa]">Trading notes</div><span className="text-[8px] text-[#71849d]">{notesStatus}</span></div>
        <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={4} placeholder={'Market plan, observations and execution review…\n' + symbol + ' · ' + timeframe} className="w-full resize-y rounded-lg border border-[#2b3a4d] bg-[#080e17] p-2.5 text-[10px] leading-5 text-[#dce5f1] outline-none focus:border-[#5685c1]" />
        <div className="flex items-center gap-2 text-[8px] text-[#71839d]"><Activity className="h-3 w-3" /> Notes autosave to your account; trade records are stored separately.</div>
      </section>
    </div>
  );
}

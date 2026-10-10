import {
  registerLegendAction,
  registerLegendCallout,
  registerSidePanel,
  registerStatePersistence,
  registerSymbolRanking,
  registerDefaultEngine,
  registerWidgetAction,
  registerWidgetAttachment,
  type LegendCalloutSpec,
  type SidePanelDescriptor,
  type WidgetActionDescriptor,
  type WidgetAttachment,
  type StatePersistenceHandler,
  type SymbolRankingHook,
} from './velaChartFacade';
import { tradingCoreRuntime } from '../../runtime/TradingCoreRuntime';
import { LazyCoreSpiritVelaEngine } from '../../coreSpirit/coreSpiritVelaEngineLoader';
import { loadTcoVelaJournal, saveTcoVelaJournal } from './tcoVelaSupabaseStorage';
import { getAutomations } from '../../workspace/workspaceState';

type WatchlistItem = { symbol: string; label: string; short: string };

const DEFAULT_WATCHLIST: readonly WatchlistItem[] = [
  { symbol: 'NSE:NIFTY50-INDEX', label: 'NIFTY 50', short: 'NIFTY' },
  { symbol: 'NSE:NIFTYBANK-INDEX', label: 'NIFTY BANK', short: 'BANKNIFTY' },
  { symbol: 'NSE:FINNIFTY-INDEX', label: 'NIFTY FIN SERVICE', short: 'FINNIFTY' },
  { symbol: 'NSE:MIDCPNIFTY-INDEX', label: 'NIFTY MIDCAP SELECT', short: 'MIDCPNIFTY' },
  { symbol: 'BSE:SENSEX-INDEX', label: 'S&P BSE SENSEX', short: 'SENSEX' },
];
const WATCHLIST_STATE_KEY = 'tco.watchlist.v2';
const WATCHLIST_LOCAL_KEY = 'tradingcore:vela:watchlist:v2';
let watchlist: WatchlistItem[] = [...DEFAULT_WATCHLIST];
const watchlistRefreshers = new Set<() => void>();

function normalizeWatchlist(value: unknown): WatchlistItem[] {
  const raw: unknown[] = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).items)
      ? (value as Record<string, unknown>).items as unknown[]
      : [];
  const result: WatchlistItem[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Record<string, unknown>;
    const symbol = String(source.symbol ?? '').trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    const ticker = symbol.includes(':') ? symbol.split(':', 2)[1] ?? symbol : symbol;
    const short = String(source.short ?? ticker).trim() || symbol;
    const label = String(source.label ?? ticker ?? symbol).trim() || symbol;
    result.push({ symbol, label, short });
    seen.add(symbol);
    if (result.length >= 50) break;
  }
  return result.length ? result : [...DEFAULT_WATCHLIST];
}

function persistWatchlistLocal(): void {
  try { localStorage.setItem(WATCHLIST_LOCAL_KEY, JSON.stringify({ version: 2, items: watchlist })); } catch {}
}

function loadWatchlistLocal(): void {
  try {
    const raw = localStorage.getItem(WATCHLIST_LOCAL_KEY);
    if (raw) watchlist = normalizeWatchlist(JSON.parse(raw));
  } catch {}
}

function symbolDescriptor(item: WatchlistItem) {
  const [prefix, ticker] = item.symbol.includes(':') ? item.symbol.split(':', 2) : ['NSE', item.symbol];
  return {
    ticker: ticker || item.symbol,
    prefix: prefix || 'NSE',
    description: item.label,
    type: 'index',
    provider: 'tco',
  };
}

function applyWatchlist(next: WatchlistItem[], ctx?: { stateChanged?: () => void }): void {
  watchlist = normalizeWatchlist(next);
  persistWatchlistLocal();
  ctx?.stateChanged?.();
  watchlistRefreshers.forEach((refresh) => refresh());
}

loadWatchlistLocal();

const watchlistStatePersistence: StatePersistenceHandler = {
  key: WATCHLIST_STATE_KEY,
  scope: 'global',
  serialize() {
    return { version: 2, items: watchlist };
  },
  restore(payload) {
    watchlist = normalizeWatchlist(payload);
    persistWatchlistLocal();
    watchlistRefreshers.forEach((refresh) => refresh());
  },
};

const watchlistSymbolRanking: SymbolRankingHook = (pool) => {
  const existing = new Map(pool.map((descriptor) => [
    `${String(descriptor.prefix || '').toUpperCase()}:${String(descriptor.ticker || '').toUpperCase()}`,
    descriptor,
  ]));
  const preferred = watchlist.map((item) => {
    const descriptor = symbolDescriptor(item);
    const key = `${descriptor.prefix.toUpperCase()}:${descriptor.ticker.toUpperCase()}`;
    return existing.get(key) ?? descriptor;
  });
  const preferredKeys = new Set(preferred.map((descriptor) => `${String(descriptor.prefix || '').toUpperCase()}:${String(descriptor.ticker || '').toUpperCase()}`));
  return [...preferred, ...pool.filter((descriptor) => !preferredKeys.has(`${String(descriptor.prefix || '').toUpperCase()}:${String(descriptor.ticker || '').toUpperCase()}`))];
};

registerStatePersistence(watchlistStatePersistence);
registerSymbolRanking(watchlistSymbolRanking);

// Make CoreSpirit Vela's default scripting language for TCO-owned Vela charts. Workspace-level
// engines may still override this factory, so the contribution remains composable.
registerDefaultEngine('corespirit', () => new LazyCoreSpiritVelaEngine());


const JOURNAL_KEY = 'tradingcore:vela:journal:v1';

function panelRoot(body: HTMLElement): HTMLDivElement {
  body.textContent = '';
  const root = document.createElement('div');
  root.style.cssText = 'height:100%;display:flex;flex-direction:column;gap:8px;padding:10px;box-sizing:border-box;background:var(--vela-bg, #080b12);color:var(--vela-fg, #e5e7eb);font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;';
  body.appendChild(root);
  return root;
}

const bookmarksPanel: SidePanelDescriptor = {
  id: 'tco.bookmarks', title: 'Watchlist', icon: 'star', order: 10, width: 320, resizable: true, minWidth: 260, maxWidth: 460,
  mount(ctx, body, header) {
    header.setTitle('Watchlist');
    const root = panelRoot(body);
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.12em;';
    root.appendChild(meta);

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 0 6px;';
    const addCurrent = document.createElement('button');
    addCurrent.type = 'button';
    addCurrent.textContent = '+ Add current';
    addCurrent.title = 'Add the active symbol to the watchlist';
    addCurrent.style.cssText = 'border:1px solid rgba(155,138,255,.24);border-radius:6px;padding:5px 8px;background:rgba(124,92,255,.10);color:#ddd6fe;font:600 9px ui-monospace;cursor:pointer;';
    const search = document.createElement('button');
    search.type = 'button';
    search.textContent = 'Search';
    search.title = 'Open Vela symbol search';
    search.style.cssText = 'border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:5px 8px;background:#0c111a;color:#cbd5e1;font:600 9px ui-monospace;cursor:pointer;';
    controls.append(addCurrent, search);
    root.appendChild(controls);

    const rows = document.createElement('div');
    rows.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-height:0;overflow:auto;';
    root.appendChild(rows);

    type Quote = { ltp: number; changePercent?: number; receivedAt: number };
    const quotes = new Map<string, Quote>();
    let quoteStop: (() => void) | undefined;

    const quoteSubscribe = (): void => {
      quoteStop?.();
      quoteStop = undefined;
      const symbols = watchlist.map((item) => item.symbol);
      if (!symbols.length) return;
      quoteStop = tradingCoreRuntime.subscribeMarketData(symbols, (event) => {
        if (event.type !== 'tick' || !event.tick) return;
        const symbol = String(event.tick.instrumentKey || '').trim();
        const ltp = Number(event.tick.ltp ?? event.tick.close);
        if (!symbol || !Number.isFinite(ltp)) return;
        quotes.set(symbol, {
          ltp,
          changePercent: Number.isFinite(Number(event.tick.changePercent)) ? Number(event.tick.changePercent) : undefined,
          receivedAt: Date.now(),
        });
        updateRows();
      });
    };

    type RowRef = {
      row: HTMLDivElement;
      button: HTMLButtonElement;
      value: HTMLSpanElement;
      change: HTMLSpanElement;
    };
    const rowRefs = new Map<string, RowRef>();

    const updateRows = (): void => {
      const current = String(ctx.symbol || '').toUpperCase();
      meta.textContent = `${current} · ${ctx.timeframe} · ${watchlist.length} symbols`;

      for (const item of watchlist) {
        const ref = rowRefs.get(item.symbol);
        if (!ref) continue;
        const isSelected = item.symbol === current;
        ref.row.style.background = isSelected ? 'rgba(124,92,255,.10)' : 'transparent';
        ref.row.style.borderColor = isSelected ? 'rgba(155,138,255,.22)' : 'transparent';
        const quote = quotes.get(item.symbol);
        const pct = quote?.changePercent;
        ref.value.textContent = quote
          ? quote.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })
          : '—';
        ref.change.textContent = Number.isFinite(pct)
          ? `${pct! >= 0 ? '+' : ''}${pct!.toFixed(2)}%`
          : 'LIVE —';
        ref.change.style.color = Number.isFinite(pct)
          ? (pct! >= 0 ? '#4ade80' : '#fb7185')
          : '#64748b';
      }
    };

    const buildRows = (): void => {
      const current = String(ctx.symbol || '').toUpperCase();
      const activeSymbols = new Set(watchlist.map(item => item.symbol));
      for (const [symbol, ref] of rowRefs) {
        if (!activeSymbols.has(symbol)) {
          ref.row.remove();
          rowRefs.delete(symbol);
        }
      }

      for (const item of watchlist) {
        let ref = rowRefs.get(item.symbol);
        if (!ref) {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:4px;width:100%;border:1px solid transparent;border-radius:7px;padding:4px 5px;background:transparent;box-sizing:border-box;';

          const button = document.createElement('button');
          button.type = 'button';
          button.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex:1;min-width:0;border:0;border-radius:5px;padding:7px 6px;background:transparent;color:#e2e8f0;text-align:left;cursor:pointer;';

          const left = document.createElement('span');
          left.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:2px;';
          const label = document.createElement('span');
          label.textContent = item.short;
          label.style.cssText = 'font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          const detail = document.createElement('span');
          detail.textContent = item.label;
          detail.style.cssText = 'font-size:9px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          left.append(label, detail);

          const right = document.createElement('span');
          right.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:0 0 auto;';
          const value = document.createElement('span');
          value.style.cssText = 'font-size:11px;font-weight:700;color:#cbd5e1;font-variant-numeric:tabular-nums;';
          const change = document.createElement('span');
          change.style.cssText = 'font-size:9px;color:#64748b;font-variant-numeric:tabular-nums;';
          right.append(value, change);
          button.append(left, right);

          button.addEventListener('mouseenter', () => {
            if (button.dataset.selected !== '1') button.style.background = 'rgba(255,255,255,.04)';
          });
          button.addEventListener('mouseleave', () => { button.style.background = 'transparent'; });
          button.addEventListener('click', () => ctx.setSymbol(item.symbol));

          const remove = document.createElement('button');
          remove.type = 'button';
          remove.textContent = '×';
          remove.title = `Remove ${item.short}`;
          remove.style.cssText = 'width:24px;height:24px;border:0;border-radius:5px;background:transparent;color:#475569;font:14px/1 sans-serif;cursor:pointer;';
          remove.addEventListener('mouseenter', () => { remove.style.background = 'rgba(239,68,68,.08)'; remove.style.color = '#fb7185'; });
          remove.addEventListener('mouseleave', () => { remove.style.background = 'transparent'; remove.style.color = '#475569'; });
          remove.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            applyWatchlist(watchlist.filter((candidate) => candidate.symbol !== item.symbol), ctx);
            quoteSubscribe();
          });

          row.append(button, remove);
          rows.appendChild(row);
          ref = { row, button, value, change };
          rowRefs.set(item.symbol, ref);
        }
        ref.button.dataset.selected = item.symbol === current ? '1' : '';
      }

      updateRows();
    };

    const refresh = (): void => {
      buildRows();
      if (watchlist.length) quoteSubscribe();
    };

    addCurrent.addEventListener('click', () => {
      const symbol = String(ctx.symbol || '').trim().toUpperCase();
      if (!symbol) return;
      if (watchlist.some((item) => item.symbol === symbol)) {
        ctx.toast(`${symbol} is already in the watchlist`, 'info');
        return;
      }
      const [prefix, ticker] = symbol.includes(':') ? symbol.split(':', 2) : ['NSE', symbol];
      applyWatchlist([...watchlist, {
        symbol,
        label: ticker || symbol,
        short: ticker || symbol,
      }], ctx);
      quoteSubscribe();
      ctx.toast(`${symbol} added to watchlist`, 'success');
    });

    search.addEventListener('click', () => ctx.openSymbolSearch());

    watchlistRefreshers.add(refresh);
    refresh();

    return {
      onOpen: refresh,
      onChart: refresh,
      destroy() {
        watchlistRefreshers.delete(refresh);
        quoteStop?.();
        quoteStop = undefined;
      },
    };
  },
};


const healthPanel: SidePanelDescriptor = {
  id: 'tco.market-health',
  title: 'Market Health',
  icon: 'activity',
  order: 30,
  width: 340,
  resizable: true,
  minWidth: 280,
  maxWidth: 520,
  mount(ctx, body, header) {
    header.setTitle('Market Health');
    const root = panelRoot(body);
    const status = document.createElement('div');
    const rows = document.createElement('div');
    rows.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
    root.append(status, rows);

    let latestLtp: number | null = null;
    let latestTickAt = 0;
    let quoteStop: (() => void) | undefined;

    const subscribe = () => {
      quoteStop?.();
      quoteStop = tradingCoreRuntime.subscribeMarketData([ctx.symbol], (event) => {
        if (event.type !== 'tick' || !event.tick) return;
        const symbol = String(event.tick.instrumentKey || '').trim();
        if (symbol !== String(ctx.symbol || '').trim()) return;
        const ltp = Number(event.tick.ltp ?? event.tick.close);
        if (!Number.isFinite(ltp)) return;
        latestLtp = ltp;
        latestTickAt = Date.now();
      });
    };

    const setValue = (label: string, value: string, tone = '#cbd5e1') => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;gap:14px;border:1px solid rgba(255,255,255,.06);border-radius:7px;padding:7px 8px;background:rgba(255,255,255,.025);';
      const key = document.createElement('span');
      key.textContent = label;
      key.style.cssText = 'font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;';
      const valueEl = document.createElement('span');
      valueEl.textContent = value;
      valueEl.style.cssText = `font-size:10px;color:${tone};font-variant-numeric:tabular-nums;text-align:right;`;
      row.append(key, valueEl);
      rows.appendChild(row);
    };

    const render = () => {
      rows.textContent = '';
      const broker = tradingCoreRuntime.getPrimaryBrokerInfo();
      const now = Date.now();
      const age = latestTickAt ? Math.max(0, now - latestTickAt) : Number.POSITIVE_INFINITY;
      const ageText = Number.isFinite(age) ? `${Math.round(age)} ms` : 'no tick';
      const ageTone = age < 1200 ? '#4ade80' : age < 4000 ? '#facc15' : '#fb7185';
      status.textContent = `${ctx.symbol} · ${ctx.timeframe}`;
      status.style.cssText = 'font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.12em;margin-bottom:2px;';
      setValue('Broker', broker?.brokerId || 'none', broker?.status === 'Connected' ? '#4ade80' : '#facc15');
      setValue('Connection', broker?.status || 'Unavailable', broker?.status === 'Connected' ? '#4ade80' : '#facc15');
      setValue('LTP', latestLtp != null ? latestLtp.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—');
      setValue('Tick age', ageText, ageTone);
      setValue('Transport', 'Vela → TCO canonical feed', '#c4b5fd');

      const perf = (window as Window & { __TCO_PERF__?: { cells?: Array<{ cellId?: string; fps?: number; p95FrameMs?: number; backend?: string }> } }).__TCO_PERF__;
      const cell = perf?.cells?.find(item => item.cellId && String(item.cellId).length > 0);
      if (cell) {
        setValue('Renderer', cell.backend || 'auto', '#c4b5fd');
        setValue('FPS', Number.isFinite(Number(cell.fps)) ? Number(cell.fps).toFixed(1) : '—');
        setValue('P95 frame', Number.isFinite(Number(cell.p95FrameMs)) ? `${Number(cell.p95FrameMs).toFixed(2)} ms` : '—');
      }
      const isolated = typeof window !== 'undefined' && Boolean(window.crossOriginIsolated) && typeof SharedArrayBuffer !== 'undefined';
      setValue('Shared memory', isolated ? 'available' : 'unavailable', isolated ? '#4ade80' : '#facc15');
    };

    subscribe();
    render();
    const timer = window.setInterval(render, 1000);
    return {
      onOpen: () => { subscribe(); render(); },
      onChart: () => { subscribe(); render(); },
      destroy: () => { window.clearInterval(timer); quoteStop?.(); quoteStop = undefined; },
    };
  },
};


function panelSectionTitle(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.12em;margin:4px 0 2px;';
  return el;
}

function panelValueRow(parent: HTMLElement, label: string, value: string, tone = '#cbd5e1'): void {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05);';
  const left = document.createElement('span');
  left.textContent = label;
  left.style.cssText = 'font-size:10px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  const right = document.createElement('span');
  right.textContent = value;
  right.style.cssText = `font-size:10px;color:${tone};font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap;`;
  row.append(left, right);
  parent.appendChild(row);
}

const replayPanel: SidePanelDescriptor = {
  id: 'tco.replay',
  title: 'Replay',
  icon: 'play',
  order: 15,
  width: 320,
  resizable: true,
  minWidth: 280,
  maxWidth: 460,
  mount(ctx, body, header) {
    header.setTitle('Vela Replay');
    const replay: {
      state: { active: boolean; playing: boolean; cursorTime: number | null };
      start(opts: { from: number; cell?: string }): Promise<void>;
      step(): boolean;
      play(intervalMs?: number): unknown;
      pause(): unknown;
      stop(): unknown;
      on?: (event: string, handler: () => void) => () => void;
    } = ctx.chart.replay as any;
    const replayOn = (event: string, handler: () => void): (() => void) =>
      typeof replay.on === 'function' ? replay.on(event, handler) : () => undefined;
    const root = panelRoot(body);
    const status = document.createElement('div');
    status.style.cssText = 'font-size:10px;color:#64748b;margin-bottom:8px;';
    root.appendChild(status);

    const controls = document.createElement('div');
    controls.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;';
    root.appendChild(controls);

    const input = document.createElement('input');
    input.type = 'datetime-local';
    input.title = 'Replay start';
    input.style.cssText = 'grid-column:1/-1;border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:7px 8px;background:#0c111a;color:#cbd5e1;font:10px ui-monospace;box-sizing:border-box;';
    root.insertBefore(input, controls);

    const makeButton = (label: string, handler: () => void): HTMLButtonElement => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.style.cssText = 'border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:7px 6px;background:#0c111a;color:#cbd5e1;font:10px ui-monospace;cursor:pointer;';
      button.addEventListener('click', handler);
      controls.appendChild(button);
      return button;
    };

    makeButton('Start', () => {
      const raw = input.value ? new Date(input.value).getTime() : Date.now() - 60 * 60 * 1000;
      void replay.start({ from: Number.isFinite(raw) ? raw : Date.now() - 60 * 60 * 1000 }).catch(error => {
        ctx.toast(error instanceof Error ? error.message : String(error), 'error');
      });
    });
    makeButton('Step', () => { if (!replay.step()) ctx.toast('Replay has reached the end.', 'info'); });
    makeButton('Play', () => { replay.play(250); });
    makeButton('Pause', () => { replay.pause(); });
    makeButton('Stop', () => { replay.stop(); });

    const refresh = () => {
      const state = replay.state;
      status.textContent = state.active
        ? `ACTIVE · ${state.playing ? 'PLAYING' : 'PAUSED'} · ${state.cursorTime ? new Date(state.cursorTime).toLocaleString('en-IN') : '—'}`
        : 'READY · multi-chart replay follows one Vela clock';
    };
    refresh();
    const timer = window.setInterval(refresh, 250);
    const offStart = replayOn('replay:start', refresh);
    const offStep = replayOn('replay:step', refresh);
    const offPlay = replayOn('replay:play', refresh);
    const offPause = replayOn('replay:pause', refresh);
    const offEnd = replayOn('replay:end', refresh);
    return {
      onOpen: refresh,
      onChart: refresh,
      destroy() {
        window.clearInterval(timer);
        offStart(); offStep(); offPlay(); offPause(); offEnd();
      },
    };
  },
};

const positionsPanel: SidePanelDescriptor = {
  id: 'tco.positions',
  title: 'Positions',
  icon: 'briefcase',
  order: 40,
  width: 360,
  resizable: true,
  minWidth: 300,
  maxWidth: 560,
  mount(ctx, body, header) {
    header.setTitle('Positions');
    const root = panelRoot(body);
    const summary = document.createElement('div');
    summary.style.cssText = 'font-size:10px;color:#64748b;margin-bottom:6px;';
    root.appendChild(summary);
    const rows = document.createElement('div');
    rows.style.cssText = 'min-height:0;overflow:auto;';
    root.appendChild(rows);

    const render = async () => {
      rows.textContent = '';
      try {
        const positions = await tradingCoreRuntime.getPositions();
        summary.textContent = `${positions.length} open positions · ${ctx.symbol}`;
        if (!positions.length) {
          rows.appendChild(panelSectionTitle('No open positions'));
          return;
        }
        for (const position of positions) {
          const card = document.createElement('div');
          card.style.cssText = 'padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);';
          panelValueRow(card, position.symbol, String(position.quantity), position.quantity >= 0 ? '#cbd5e1' : '#fda4af');
          panelValueRow(card, 'Avg', Number(position.avgPrice).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
          panelValueRow(card, 'LTP', Number(position.ltp).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
          panelValueRow(card, 'P&L', Number(position.pnl).toLocaleString('en-IN', { maximumFractionDigits: 2 }), Number(position.pnl) >= 0 ? '#4ade80' : '#fb7185');
          rows.appendChild(card);
        }
      } catch (error) {
        summary.textContent = 'Position service unavailable';
        const msg = document.createElement('div');
        msg.textContent = error instanceof Error ? error.message : String(error);
        msg.style.cssText = 'font-size:10px;color:#fb7185;padding:10px 0;';
        rows.appendChild(msg);
      }
    };

    void render();
    const timer = window.setInterval(() => void render(), 3000);
    return { onOpen: () => void render(), onChart: () => void render(), destroy: () => window.clearInterval(timer) };
  },
};

const riskPanel: SidePanelDescriptor = {
  id: 'tco.risk',
  title: 'Risk',
  icon: 'shield',
  order: 45,
  width: 340,
  resizable: true,
  minWidth: 280,
  maxWidth: 500,
  mount(_ctx, body, header) {
    header.setTitle('Risk');
    const root = panelRoot(body);
    const rows = document.createElement('div');
    root.appendChild(rows);

    const render = async () => {
      rows.textContent = '';
      try {
        const [funds, positions] = await Promise.all([
          tradingCoreRuntime.getFunds(),
          tradingCoreRuntime.getPositions(),
        ]);
        panelValueRow(rows, 'Available margin', funds ? Number(funds.availableMargin).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—');
        panelValueRow(rows, 'Used margin', funds ? Number(funds.usedMargin).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—');
        panelValueRow(rows, 'Collateral', funds ? Number(funds.collateralMargin).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—');
        panelValueRow(rows, 'Open positions', String(positions.length));
        const gross = positions.reduce((sum, p) => sum + Math.abs(Number(p.quantity) * Number(p.ltp)), 0);
        const pnl = positions.reduce((sum, p) => sum + Number(p.pnl || 0), 0);
        panelValueRow(rows, 'Gross exposure', gross.toLocaleString('en-IN', { maximumFractionDigits: 2 }));
        panelValueRow(rows, 'Open P&L', pnl.toLocaleString('en-IN', { maximumFractionDigits: 2 }), pnl >= 0 ? '#4ade80' : '#fb7185');
      } catch (error) {
        const msg = document.createElement('div');
        msg.textContent = error instanceof Error ? error.message : String(error);
        msg.style.cssText = 'font-size:10px;color:#fb7185;padding:10px 0;';
        rows.appendChild(msg);
      }
    };
    void render();
    const timer = window.setInterval(() => void render(), 3000);
    return { onOpen: () => void render(), onChart: () => void render(), destroy: () => window.clearInterval(timer) };
  },
};

const orderBookPanel: SidePanelDescriptor = {
  id: 'tco.orderbook',
  title: 'Order Book',
  icon: 'list',
  order: 50,
  width: 320,
  resizable: true,
  minWidth: 260,
  maxWidth: 460,
  mount(ctx, body, header) {
    header.setTitle('Order Book');
    const root = panelRoot(body);
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:10px;color:#64748b;margin-bottom:7px;';
    root.appendChild(meta);
    const ladder = document.createElement('div');
    ladder.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
    root.appendChild(ladder);

    const render = () => {
      ladder.textContent = '';
      const tick = tradingCoreRuntime.getMarketSnapshot(ctx.symbol);
      meta.textContent = `${ctx.symbol} · ${ctx.timeframe} · live`;
      const asks = Array.isArray((tick as any)?.ask) ? (tick as any).ask : [];
      const bids = Array.isArray((tick as any)?.bid) ? (tick as any).bid : [];
      const row = (side: 'ASK'|'BID', level: any, index: number) => {
        const price = Number(level?.price);
        if (!Number.isFinite(price)) return;
        const el = document.createElement('div');
        el.style.cssText = 'display:grid;grid-template-columns:42px 1fr 1fr;gap:8px;padding:5px 6px;border-radius:5px;background:rgba(255,255,255,.025);font:10px ui-monospace;';
        const s = document.createElement('span'); s.textContent = `${side} ${index + 1}`; s.style.color = side === 'BID' ? '#4ade80' : '#fb7185';
        const p = document.createElement('span'); p.textContent = price.toLocaleString('en-IN', { maximumFractionDigits: 2 }); p.style.color = '#e2e8f0';
        const q = document.createElement('span'); q.textContent = String(Number(level?.quantity || 0)); q.style.color = '#94a3b8';
        el.append(s,p,q); ladder.appendChild(el);
      };
      asks.slice().reverse().forEach((level: any, index: number) => row('ASK', level, index));
      const mid = document.createElement('div');
      mid.style.cssText = 'height:1px;background:rgba(255,255,255,.10);margin:4px 0;';
      ladder.appendChild(mid);
      bids.forEach((level: any, index: number) => row('BID', level, index));
      if (!asks.length && !bids.length) {
        const empty = document.createElement('div');
        empty.textContent = 'Depth data unavailable for this symbol.';
        empty.style.cssText = 'font-size:10px;color:#64748b;padding:12px 0;';
        ladder.appendChild(empty);
      }
    };
    render();
    const timer = window.setInterval(render, 500);
    return { onOpen: render, onChart: render, destroy: () => window.clearInterval(timer) };
  },
};

const optionsPanel: SidePanelDescriptor = {
  id: 'tco.options',
  title: 'Options',
  icon: 'layers',
  order: 55,
  width: 440,
  resizable: true,
  minWidth: 340,
  maxWidth: 620,
  mount(ctx, body, header) {
    header.setTitle('Options Chain');
    const root = panelRoot(body);
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:10px;color:#64748b;margin-bottom:7px;';
    root.appendChild(meta);
    const table = document.createElement('div');
    table.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-height:0;overflow:auto;';
    root.appendChild(table);

    let requestKey = '';
    const render = async () => {
      const symbol = String(ctx.symbol || '').trim();
      if (!symbol) return;
      if (requestKey === symbol) return;
      requestKey = symbol;
      try {
        const chain = await tradingCoreRuntime.getOptionChain(symbol);
        table.textContent = '';
        meta.textContent = `${symbol} · ${chain.expiry} · Spot ${Number(chain.spot || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
        const head = document.createElement('div');
        head.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:4px 6px;color:#64748b;font:9px ui-monospace;text-transform:uppercase;';
        head.innerHTML = '<span>Call</span><span>Strike</span><span>Put</span>';
        table.appendChild(head);
        const contracts = Array.isArray(chain.contracts) ? chain.contracts : [];
        for (const contract of contracts.slice(0, 40)) {
          const row = document.createElement('div');
          row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;padding:5px 6px;border-radius:5px;background:rgba(255,255,255,.025);font:10px ui-monospace;';
          const call = document.createElement('span'); call.textContent = contract.call?.ltp != null ? Number(contract.call.ltp).toFixed(2) : '—'; call.style.color = '#4ade80';
          const strike = document.createElement('span'); strike.textContent = Number(contract.strike).toLocaleString('en-IN', { maximumFractionDigits: 2 }); strike.style.color = '#e2e8f0'; strike.style.textAlign = 'center';
          const put = document.createElement('span'); put.textContent = contract.put?.ltp != null ? Number(contract.put.ltp).toFixed(2) : '—'; put.style.color = '#fb7185'; put.style.textAlign = 'right';
          row.append(call,strike,put); table.appendChild(row);
        }
      } catch (error) {
        table.textContent = '';
        const msg = document.createElement('div');
        msg.textContent = error instanceof Error ? error.message : String(error);
        msg.style.cssText = 'font-size:10px;color:#fb7185;padding:10px 0;';
        table.appendChild(msg);
      } finally {
        requestKey = '';
      }
    };
    void render();
    const timer = window.setInterval(() => void render(), 5000);
    return { onOpen: () => void render(), onChart: () => void render(), destroy: () => window.clearInterval(timer) };
  },
};


function navigateTcoTerminalRoute(route:string): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === route) {
    window.dispatchEvent(new PopStateEvent('popstate'));
    return;
  }
  window.history.pushState({}, '', route);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function terminalRouteButton(parent:HTMLElement, label:string, route:string, icon:string):void {
  const button=document.createElement('button');
  button.type='button';
  button.textContent=`${icon}  ${label}`;
  button.title=`Open ${label}`;
  button.style.cssText='width:100%;text-align:left;border:1px solid rgba(255,255,255,.07);border-radius:7px;padding:8px 10px;background:rgba(255,255,255,.025);color:#cbd5e1;font:10px ui-monospace;cursor:pointer;';
  button.addEventListener('mouseenter',()=>{button.style.background='rgba(124,92,255,.10)';button.style.borderColor='rgba(155,138,255,.20)';});
  button.addEventListener('mouseleave',()=>{button.style.background='rgba(255,255,255,.025)';button.style.borderColor='rgba(255,255,255,.07)';});
  button.addEventListener('click',()=>navigateTcoTerminalRoute(route));
  parent.appendChild(button);
}

const researchPanel:SidePanelDescriptor={
  id:'tco.research',
  title:'Research',
  icon:'search',
  order:12,
  width:320,
  resizable:true,
  minWidth:280,
  maxWidth:480,
  mount(ctx,body,header){
    header.setTitle('Research');
    const root=panelRoot(body);
    const summary=document.createElement('div');
    summary.style.cssText='font-size:10px;color:#64748b;line-height:1.5;margin-bottom:8px;';
    summary.textContent=`Vela terminal · ${ctx.symbol} · ${ctx.timeframe}`;
    root.appendChild(summary);

    const section=panelSectionTitle('Research surfaces');
    root.appendChild(section);
    const actions=document.createElement('div');
    actions.style.cssText='display:flex;flex-direction:column;gap:5px;';
    terminalRouteButton(actions,'CoreSpirit editor','/corespirit','⌘');
    terminalRouteButton(actions,'Indicators','/indicators','◈');
    terminalRouteButton(actions,'Models','/models','∿');
    terminalRouteButton(actions,'Predictions','/predictions','↗');
    terminalRouteButton(actions,'CoreSpirit documentation','/corespirit/docs','▤');
    root.appendChild(actions);

    const chartSection=panelSectionTitle('Active chart');
    root.appendChild(chartSection);
    const chartInfo=document.createElement('div');
    chartInfo.style.cssText='display:flex;flex-direction:column;gap:2px;font:9px ui-monospace;color:#94a3b8;';
    chartInfo.innerHTML=`<span>Engine: <b style="color:#c4b5fd">CoreSpirit → Vela</b></span><span>Viewport: Vela-managed</span><span>Data: canonical columnar</span>`;
    root.appendChild(chartInfo);
    return { onOpen:()=>{summary.textContent=`Vela terminal · ${ctx.symbol} · ${ctx.timeframe}`;} };
  },
};

const automationPanel:SidePanelDescriptor={
  id:'tco.automation',
  title:'Automation',
  icon:'replay',
  order:13,
  width:340,
  resizable:true,
  minWidth:300,
  maxWidth:520,
  mount(_ctx,body,header){
    header.setTitle('Automation');
    const root=panelRoot(body);
    const status=document.createElement('div');
    status.style.cssText='font-size:10px;color:#64748b;margin-bottom:8px;';
    root.appendChild(status);
    const rows=document.createElement('div');
    rows.style.cssText='display:flex;flex-direction:column;gap:4px;min-height:0;overflow:auto;';
    root.appendChild(rows);

    const render=()=>{
      rows.textContent='';
      const automations=getAutomations();
      const enabled=automations.filter(item=>item.enabled);
      status.textContent=`${enabled.length} enabled · ${automations.length} configured`;
      if(!automations.length){
        rows.appendChild(panelSectionTitle('No automations configured'));
      }else{
        for(const item of automations.slice(0,50)){
          const row=document.createElement('div');
          row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid rgba(255,255,255,.06);border-radius:7px;padding:7px 8px;background:rgba(255,255,255,.025);';
          const left=document.createElement('span');
          left.style.cssText='min-width:0;display:flex;flex-direction:column;gap:2px;';
          const name=document.createElement('span'); name.textContent=item.name; name.style.cssText='font-size:10px;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          const detail=document.createElement('span'); detail.textContent=`${item.kind} · ${item.mode}`; detail.style.cssText='font-size:9px;color:#64748b;';
          left.append(name,detail);
          const badge=document.createElement('span'); badge.textContent=item.enabled?'ON':'OFF'; badge.style.cssText=`font:700 8px ui-monospace;padding:3px 5px;border-radius:4px;color:${item.enabled?'#4ade80':'#64748b'};background:${item.enabled?'rgba(34,197,94,.08)':'rgba(100,116,139,.08)'};`;
          row.append(left,badge); rows.appendChild(row);
        }
      }
      const manage=document.createElement('button');
      manage.type='button'; manage.textContent='Manage automations';
      manage.style.cssText='margin-top:7px;border:1px solid rgba(155,138,255,.20);border-radius:7px;padding:8px;background:rgba(124,92,255,.10);color:#ddd6fe;font:600 10px ui-monospace;cursor:pointer;';
      manage.addEventListener('click',()=>navigateTcoTerminalRoute('/automations'));
      rows.appendChild(manage);
    };
    render();
    const refresh=()=>render();
    window.addEventListener('tradingcore:automations',refresh as EventListener);
    return { onOpen:render, onChart:render, destroy:()=>window.removeEventListener('tradingcore:automations',refresh as EventListener) };
  },
};

const tradingPanel:SidePanelDescriptor={
  id:'tco.trading',
  title:'Trading',
  icon:'datawindow',
  order:14,
  width:350,
  resizable:true,
  minWidth:300,
  maxWidth:520,
  mount(ctx,body,header){
    header.setTitle('Trading');
    const root=panelRoot(body);
    const summary=document.createElement('div');
    summary.style.cssText='font-size:10px;color:#64748b;margin-bottom:8px;';
    root.appendChild(summary);
    const rows=document.createElement('div');
    rows.style.cssText='display:flex;flex-direction:column;gap:4px;';
    root.appendChild(rows);

    const render=async()=>{
      rows.textContent='';
      try{
        const [funds,positions]=await Promise.all([tradingCoreRuntime.getFunds(),tradingCoreRuntime.getPositions()]);
        summary.textContent=`${ctx.symbol} · ${positions.length} open positions`;
        panelValueRow(rows,'Available margin',funds?Number(funds.availableMargin).toLocaleString('en-IN',{maximumFractionDigits:2}):'—');
        panelValueRow(rows,'Used margin',funds?Number(funds.usedMargin).toLocaleString('en-IN',{maximumFractionDigits:2}):'—');
        panelValueRow(rows,'Open P&L',positions.reduce((sum,p)=>sum+Number(p.pnl||0),0).toLocaleString('en-IN',{maximumFractionDigits:2}));
        const actions=panelSectionTitle('Trading tools');
        rows.appendChild(actions);
        for(const [label,id] of [['Positions','tco.positions'],['Risk','tco.risk'],['Order Book','tco.orderbook'],['Options Chain','tco.options'],['Market Health','tco.market-health']] as const){
          const button=document.createElement('button');
          button.type='button'; button.textContent=label;
          button.style.cssText='border:1px solid rgba(255,255,255,.07);border-radius:7px;padding:7px 8px;background:rgba(255,255,255,.025);color:#cbd5e1;font:10px ui-monospace;text-align:left;cursor:pointer;';
          button.addEventListener('click',()=>ctx.togglePanel(id));
          rows.appendChild(button);
        }
      }catch(error){
        summary.textContent='Trading services unavailable';
        const msg=document.createElement('div'); msg.textContent=error instanceof Error?error.message:String(error); msg.style.cssText='font-size:10px;color:#fb7185;padding:8px 0;'; rows.appendChild(msg);
      }
    };
    void render();
    const timer=window.setInterval(()=>void render(),3000);
    return { onOpen:()=>void render(), onChart:()=>void render(), destroy:()=>window.clearInterval(timer) };
  },
};

const tradeMarksAttachment: WidgetAttachment = {
  id: 'tco.trade-marks',
  mount(ctx) {
    let lastChart: typeof ctx.chart | null = null;
    let lastMarketListener: (() => void) | undefined;
    let generation = 0;

    const refresh = async (): Promise<void> => {
      const chart = ctx.chart;
      const currentGeneration = ++generation;
      if (chart !== lastChart) {
        lastMarketListener?.();
        lastMarketListener = undefined;
        lastChart?.marks.clear();
        lastChart = chart;
        chart.marks.defineGroup({ id: 'trades', label: 'Trades', visible: true });
        lastMarketListener = chart.on('market:changed', () => void refresh());
      }

      try {
        const symbol = String(ctx.symbol || '').trim().toUpperCase();
        const trades = await tradingCoreRuntime.getTradeHistory();
        if (currentGeneration !== generation) return;
        const marks = trades
          .filter((trade) => String(trade.symbol || '').trim().toUpperCase() === symbol)
          .slice(-250)
          .map((trade) => {
            const timeValue = Number(trade.timestamp);
            const parsed = Number.isFinite(timeValue)
              ? (timeValue > 1e12 ? timeValue : timeValue * 1000)
              : Date.parse(String(trade.timestamp || ''));
            if (!Number.isFinite(parsed)) return null;
            const buy = trade.side === 'Buy';
            const pnl = Number(trade.pnl);
            return {
              id: `tco.trade.${trade.tradeId}`,
              time: parsed,
              title: `${buy ? 'BUY' : 'SELL'} ${trade.symbol}`,
              glyph: {
                shape: 'circle' as const,
                color: buy ? '#22c55e' : '#ef4444',
                letter: buy ? 'B' : 'S',
              },
              tooltip: `${buy ? 'BUY' : 'SELL'} · ${Number(trade.quantity).toLocaleString('en-IN')} @ ${Number(trade.price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`,
              group: 'trades',
              content: {
                panel: {
                  items: [
                    { type: 'field' as const, label: 'Side', value: trade.side },
                    { type: 'field' as const, label: 'Quantity', value: String(trade.quantity) },
                    { type: 'field' as const, label: 'Price', value: Number(trade.price).toLocaleString('en-IN', { maximumFractionDigits: 2 }) },
                    { type: 'field' as const, label: 'Order', value: trade.orderId },
                    { type: 'field' as const, label: 'Product', value: trade.product },
                    ...(Number.isFinite(pnl) ? [{ type: 'field' as const, label: 'P&L', value: pnl.toLocaleString('en-IN', { maximumFractionDigits: 2 }) }] : []),
                  ],
                },
              },
            };
          })
          .filter((mark): mark is NonNullable<typeof mark> => Boolean(mark));

        chart.marks.set(marks);
      } catch {
        if (currentGeneration === generation) chart.marks.clear();
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);

    return () => {
      window.clearInterval(timer);
      lastMarketListener?.();
      lastMarketListener = undefined;
      lastChart?.marks.clear();
      lastChart = null;
    };
  },
};

const dataWindowPanel: SidePanelDescriptor = {
  id: 'tco.data-window',
  title: 'Data Window',
  icon: 'datawindow',
  order: 35,
  width: 360,
  resizable: true,
  minWidth: 300,
  maxWidth: 520,
  mount(ctx, body, header) {
    header.setTitle('Vela Data Window');
    const root = panelRoot(body);
    const context = document.createElement('div');
    context.style.cssText = 'font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.12em;';
    root.appendChild(context);
    const rows = document.createElement('div');
    rows.style.cssText = 'display:flex;flex-direction:column;gap:4px;overflow:auto;min-height:0;';
    root.appendChild(rows);

    const field = (label: string, value: string, tone = '#cbd5e1') => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:1fr auto;gap:10px;padding:6px 8px;border:1px solid rgba(255,255,255,.06);border-radius:6px;background:rgba(255,255,255,.025);font:10px ui-monospace;';
      const key = document.createElement('span'); key.textContent = label; key.style.color = '#64748b';
      const val = document.createElement('span'); val.textContent = value; val.style.color = tone; val.style.fontVariantNumeric = 'tabular-nums';
      row.append(key, val); rows.appendChild(row);
    };

    const render = () => {
      rows.textContent = '';
      context.textContent = `${ctx.symbol} · ${ctx.timeframe}`;
      const readout = ctx.chart.renderer.dataWindowReadout?.();
      if (!readout) {
        field('Status', 'Unavailable on current renderer', '#facc15');
        return;
      }
      if (!readout.ohlc) {
        field('Status', 'Waiting for bars', '#64748b');
        return;
      }
      field('Date', readout.date);
      field('Time', readout.time);
      field('Open', readout.ohlc.o, readout.ohlc.up ? '#4ade80' : '#fb7185');
      field('High', readout.ohlc.h);
      field('Low', readout.ohlc.l);
      field('Close', readout.ohlc.c, readout.ohlc.up ? '#4ade80' : '#fb7185');
      if (readout.ohlc.vol) field('Volume', readout.ohlc.vol);

      for (const group of readout.groups) {
        const title = document.createElement('div');
        title.textContent = group.name;
        title.style.cssText = 'margin-top:7px;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.10em;';
        rows.appendChild(title);
        for (const item of group.rows) field(item.label, item.value, item.color);
      }
    };

    render();
    const timer = window.setInterval(render, 250);
    return {
      onOpen: render,
      onChart: render,
      destroy: () => window.clearInterval(timer),
    };
  },
};

const journalPanel: SidePanelDescriptor = {
  id: 'tco.journal', title: 'Journal', icon: 'calendar', order: 20, width: 340, resizable: true, minWidth: 280, maxWidth: 520,
  mount(ctx, body, header) {
    header.setTitle('Journal');
    const root = panelRoot(body);
    const context = document.createElement('div');
    context.style.cssText = 'font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.12em;';
    root.appendChild(context);
    const textarea = document.createElement('textarea');
    textarea.value = localStorage.getItem(JOURNAL_KEY) ?? '';
    void loadTcoVelaJournal().then((cloud) => { if (cloud != null && document.contains(textarea)) textarea.value = cloud; });
    textarea.placeholder = 'Trade notes, observations, setups, execution review...';
    textarea.style.cssText = 'flex:1;min-height:180px;resize:none;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px;background:#090d15;color:#e2e8f0;outline:none;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;box-sizing:border-box;';
    root.appendChild(textarea);
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:6px;';
    root.appendChild(actions);
    const save = document.createElement('button');
    save.type = 'button'; save.textContent = 'Save note';
    save.style.cssText = 'flex:1;border:1px solid rgba(155,138,255,.28);border-radius:7px;padding:8px;background:rgba(124,92,255,.12);color:#ddd6fe;font:11px ui-monospace;cursor:pointer;';
    save.addEventListener('click', () => { localStorage.setItem(JOURNAL_KEY, textarea.value); void saveTcoVelaJournal(textarea.value); });
    const stamp = document.createElement('button');
    stamp.type = 'button'; stamp.textContent = 'Stamp context';
    stamp.style.cssText = 'border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:8px 10px;background:#0c111a;color:#cbd5e1;font:11px ui-monospace;cursor:pointer;';
    stamp.addEventListener('click', () => {
      const line = `[${new Date().toLocaleString('en-IN')}] ${ctx.symbol} · ${ctx.timeframe}
`;
      textarea.value = textarea.value ? `${textarea.value.replace(/\s*$/, '')}\n${line}` : line;
      textarea.focus();
    });
    actions.append(save, stamp);
    const refresh = (): void => { context.textContent = `${ctx.symbol} · ${ctx.timeframe}`; };
    refresh();
    return { onOpen: refresh, onChart: refresh };
  },
};

const accountPanel: SidePanelDescriptor = {
  id: 'tco.account', title: 'Account', icon: 'user', order: 5, width: 300, resizable: false, minWidth: 280, maxWidth: 360,
  mount(_ctx, body, header) {
    header.setTitle('TradingCoreOS Account');
    const root = panelRoot(body);
    const card = document.createElement('div');
    card.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;padding:18px 10px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:linear-gradient(145deg,#11131a,#090b10);';
    const avatar = document.createElement('img');
    avatar.alt = 'Profile picture'; avatar.width = 64; avatar.height = 64;
    avatar.style.cssText = 'width:64px;height:64px;border-radius:50%;object-fit:cover;border:1px solid rgba(124,92,255,.45);box-shadow:0 0 30px rgba(124,92,255,.16);';
    avatar.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#12141a"/><circle cx="32" cy="25" r="12" fill="#7c5cff"/><path d="M12 58c3-15 12-21 20-21s17 6 20 21" fill="#7c5cff"/></svg>');
    const name = document.createElement('div'); name.style.cssText='font-size:13px;font-weight:700;color:#f8fafc;';
    const email = document.createElement('div'); email.style.cssText='font-size:10px;color:#7f899e;';
    const actions = document.createElement('div'); actions.style.cssText='display:flex;gap:6px;width:100%;margin-top:8px;';
    const profile = document.createElement('button'); profile.type='button'; profile.textContent='Profile'; profile.style.cssText='flex:1;border:1px solid rgba(124,92,255,.3);border-radius:8px;padding:8px;background:rgba(124,92,255,.10);color:#ddd6fe;font:600 10px ui-monospace;cursor:pointer;';
    profile.onclick=()=>{ window.history.pushState({},'', '/profile'); window.dispatchEvent(new PopStateEvent('popstate')); };
    const settings = document.createElement('button'); settings.type='button'; settings.textContent='Settings'; settings.style.cssText='flex:1;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px;background:#0d1017;color:#cbd5e1;font:600 10px ui-monospace;cursor:pointer;';
    settings.onclick=()=>{ window.dispatchEvent(new Event('tco:open-settings')); };
    actions.append(profile,settings); card.append(avatar,name,email,actions); root.append(card);
    void (async()=>{ try { const client=(await import('../../auth/supabaseClient')).getSupabaseClient(); const u=(await client.auth.getUser()).data.user; if(!u)return; name.textContent=u.user_metadata?.full_name||u.email||'Trader'; email.textContent=u.email||''; if (u.user_metadata?.avatar_url) avatar.src=String(u.user_metadata.avatar_url); const {data}=await client.from('profiles').select('name,email,avatar').eq('id',u.id).maybeSingle(); if(data){name.textContent=data.name||name.textContent;email.textContent=data.email||email.textContent;if(data.avatar)avatar.src=String(data.avatar);} } catch {} })();
    return {};
  },
};

const coreSpiritOpenAction: Parameters<typeof registerLegendAction>[0] = {
  id: 'tco.corespirit.open',
  icon: 'indicators',
  tooltip: 'Open CoreSpirit source',
  order: 10,
  when: (indicator) => Boolean(indicator.source),
  run(ctx, indicator) {
    if (indicator.source) {
      try { localStorage.setItem('tradingcore:corespirit:selected-source', indicator.source); } catch {}
    }
    ctx.toast('CoreSpirit source selected', 'info');
    window.dispatchEvent(new Event('tco:corespirit-source-selected'));
  },
};

const coreSpiritStatusCallout: Parameters<typeof registerLegendCallout>[0] = {
  id: 'tco.corespirit.status',
  order: 10,
  callout(indicator) {
    if (!indicator.source) return null;
    const spec: LegendCalloutSpec = {
      icon: 'indicators',
      background: 'rgba(124,92,255,.14)',
      color: '#c4b5fd',
      tooltip: 'CoreSpirit indicator',
      content: {
        title: indicator.title,
        items: [
          { type: 'text', text: 'CoreSpirit executable · Vela renderer' },
        ],
      },
    };
    return spec;
  },
};

registerLegendAction(coreSpiritOpenAction);
registerLegendCallout(coreSpiritStatusCallout);
registerSidePanel(accountPanel);

const brandAction: WidgetActionDescriptor = {
  id: 'tco.brand', target: 'topbar', label: 'TradingCoreOS × Vela', iconOnly: false, align: 'left', order: 0, mobile: 'menu',
  run() {},
};

const researchAction:WidgetActionDescriptor={
  id:'tco.research', target:'topbar', label:'Research', icon:'search', iconOnly:false, align:'right', order:1.5, mobile:'menu',
  run(ctx){ctx.togglePanel('tco.research');},
};

const automationAction:WidgetActionDescriptor={
  id:'tco.automation', target:'topbar', label:'Automation', icon:'replay', iconOnly:false, align:'right', order:1.6, mobile:'menu',
  run(ctx){ctx.togglePanel('tco.automation');},
};

const tradingAction:WidgetActionDescriptor={
  id:'tco.trading', target:'topbar', label:'Trading', icon:'datawindow', iconOnly:false, align:'right', order:1.7, mobile:'menu',
  run(ctx){ctx.togglePanel('tco.trading');},
};

const replayAction: WidgetActionDescriptor = {
  id: 'tco.replay',
  target: 'topbar',
  label: 'Replay',
  icon: 'play',
  iconOnly: false,
  align: 'right',
  order: 3,
  mobile: 'menu',
  run(ctx) { ctx.togglePanel('tco.replay'); },
};

const positionsAction: WidgetActionDescriptor = {
  id: 'tco.positions',
  target: 'topbar',
  label: 'Positions',
  icon: 'briefcase',
  iconOnly: false,
  align: 'right',
  order: 4,
  mobile: 'menu',
  run(ctx) { ctx.togglePanel('tco.positions'); },
};

const riskAction: WidgetActionDescriptor = {
  id: 'tco.risk',
  target: 'topbar',
  label: 'Risk',
  icon: 'shield',
  iconOnly: true,
  align: 'right',
  order: 5,
  mobile: 'menu',
  run(ctx) { ctx.togglePanel('tco.risk'); },
};

const orderBookAction: WidgetActionDescriptor = {
  id: 'tco.orderbook',
  target: 'topbar',
  label: 'Order Book',
  icon: 'list',
  iconOnly: true,
  align: 'right',
  order: 6,
  mobile: 'menu',
  run(ctx) { ctx.togglePanel('tco.orderbook'); },
};

const optionsAction: WidgetActionDescriptor = {
  id: 'tco.options',
  target: 'topbar',
  label: 'Options',
  icon: 'layers',
  iconOnly: true,
  align: 'right',
  order: 7,
  mobile: 'menu',
  run(ctx) { ctx.togglePanel('tco.options'); },
};

const dataWindowAction: WidgetActionDescriptor = {
  id: 'tco.data-window',
  target: 'topbar',
  label: 'Data Window',
  icon: 'table',
  iconOnly: true,
  align: 'right',
  order: 8,
  mobile: 'menu',
  run(ctx) { ctx.togglePanel('tco.data-window'); },
};

const vpvrAction: WidgetActionDescriptor = {
  id: 'tco.vpvr',
  target: 'topbar',
  label: 'VPVR',
  icon: 'objects',
  iconOnly: true,
  align: 'right',
  order: 9,
  mobile: 'menu',
  run(ctx) {
    try {
      ctx.addNativeIndicator('vpvr');
      ctx.toast('VPVR added via Vela native indicator', 'success');
    } catch (error) {
      ctx.toast(error instanceof Error ? error.message : 'Unable to add VPVR', 'error');
    }
  },
};

const watchlistAction: WidgetActionDescriptor = {
  id: 'tco.watchlist', target: 'topbar', label: 'Watchlist', icon: 'star', iconOnly: false, align: 'right', order: 0, mobile: 'menu',
  run(ctx) { ctx.togglePanel('tco.bookmarks'); },
};

const journalAction: WidgetActionDescriptor = {
  id: 'tco.journal', target: 'topbar', label: 'Journal', icon: 'calendar', iconOnly: false, align: 'right', order: 1, mobile: 'menu',
  run(ctx) { ctx.togglePanel('tco.journal'); },
};

const panelsAction: WidgetActionDescriptor = {
  id: 'tco.panels', target: 'topbar', label: 'Panels', icon: 'layout', iconOnly: false, align: 'right', order: 2, mobile: 'menu',
  run() { window.dispatchEvent(new Event('tco:toggle-primary-panel')); },
};

const profileAction: WidgetActionDescriptor = {
  id: 'tco.profile', target: 'topbar', label: 'Account', icon: 'user', iconOnly: true, align: 'right', order: 1, mobile: 'menu',
  run() { window.dispatchEvent(new Event('tco:open-profile-panel')); },
};

const brokerAction: WidgetActionDescriptor = {
  id: 'tco.broker-connection', target: 'topbar', label: 'Broker Connection', icon: 'gear', iconOnly: true, align: 'right', order: 10, mobile: 'menu',
  run() { window.dispatchEvent(new Event('tco:open-broker')); },
};

registerSidePanel(bookmarksPanel);
registerSidePanel(researchPanel);
registerSidePanel(automationPanel);
registerSidePanel(tradingPanel);
registerSidePanel(journalPanel);
registerSidePanel(dataWindowPanel);
registerSidePanel(healthPanel);
registerSidePanel(replayPanel);
registerSidePanel(positionsPanel);
registerSidePanel(riskPanel);
registerSidePanel(orderBookPanel);
registerSidePanel(optionsPanel);
registerWidgetAction(brandAction);
const marketHealthAction: WidgetActionDescriptor = {
  id: 'tco.market-health',
  target: 'topbar',
  label: 'Market Health',
  icon: 'activity',
  iconOnly: true,
  align: 'right',
  order: 3,
  mobile: 'menu',
  run(ctx) { ctx.togglePanel('tco.market-health'); },
};

const healthAttachment: WidgetAttachment = {
  id: 'tco.market-health-attachment',
  mount(ctx) {
    const strip = document.createElement('div');
    strip.style.cssText = 'height:22px;display:flex;align-items:center;justify-content:center;gap:14px;padding:0 10px;border-top:1px solid rgba(255,255,255,.06);background:rgba(7,10,16,.96);color:#64748b;font:9px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.03em;';
    const status = document.createElement('span');
    const broker = document.createElement('span');
    const latency = document.createElement('span');
    const renderer = document.createElement('span');
    strip.append(status, broker, latency, renderer);
    const undock = ctx.dockStrip(strip);

    const refresh = () => {
      const info = tradingCoreRuntime.getPrimaryBrokerInfo();
      const tick = tradingCoreRuntime.getMarketSnapshot(ctx.symbol);
      const tickAge = tick?.receivedAt ? Math.max(0, Date.now() - Date.parse(String(tick.receivedAt))) : Number.POSITIVE_INFINITY;
      const healthy = info?.status === 'Connected' && tickAge < 4000;
      status.textContent = healthy ? '● LIVE' : '● DEGRADED';
      status.style.color = healthy ? '#4ade80' : '#fb7185';
      broker.textContent = info?.brokerId ? String(info.brokerId).toUpperCase() : 'NO BROKER';
      broker.style.color = '#cbd5e1';
      latency.textContent = Number.isFinite(tickAge) ? `TICK ${Math.round(tickAge)}MS` : 'TICK —';
      latency.style.color = tickAge < 1200 ? '#cbd5e1' : '#facc15';
      const perf = (window as Window & { __TCO_PERF__?: { cells?: Array<{ backend?: string; fps?: number; p95FrameMs?: number }> } }).__TCO_PERF__;
      const cell = perf?.cells?.[0];
      renderer.textContent = cell?.backend ? `VELA ${String(cell.backend).toUpperCase()}` : 'VELA AUTO';
      if (cell?.p95FrameMs != null && Number(cell.p95FrameMs) > 20) renderer.style.color = '#facc15';
      else renderer.style.color = '#cbd5e1';
    };

    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => {
      window.clearInterval(timer);
      undock();
    };
  },
};

registerWidgetAction(marketHealthAction);
registerWidgetAttachment(healthAttachment);
registerWidgetAttachment(tradeMarksAttachment);
registerWidgetAction(researchAction);
registerWidgetAction(automationAction);
registerWidgetAction(tradingAction);
registerWidgetAction(replayAction);
registerWidgetAction(positionsAction);
registerWidgetAction(riskAction);
registerWidgetAction(orderBookAction);
registerWidgetAction(optionsAction);
registerWidgetAction(dataWindowAction);
registerWidgetAction(vpvrAction);
registerWidgetAction(watchlistAction);
registerWidgetAction(journalAction);
registerWidgetAction(panelsAction);
registerWidgetAction(profileAction);
registerWidgetAction(brokerAction);

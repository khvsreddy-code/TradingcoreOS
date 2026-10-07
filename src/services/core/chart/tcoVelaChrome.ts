import {
  registerLegendAction,
  registerLegendCallout,
  registerSidePanel,
  registerStatePersistence,
  registerSymbolRanking,
  registerWidgetAction,
  type LegendCalloutSpec,
  type SidePanelDescriptor,
  type WidgetActionDescriptor,
  type StatePersistenceHandler,
  type SymbolRankingHook,
} from './velaChartFacade';
import { tradingCoreRuntime } from '../../runtime/TradingCoreRuntime';
import { loadTcoVelaJournal, saveTcoVelaJournal } from './tcoVelaSupabaseStorage';

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
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).items)
      ? (value as Record<string, unknown>).items
      : [];
  const result: WatchlistItem[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Record<string, unknown>;
    const symbol = String(source.symbol ?? '').trim().toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    const [prefix, ticker] = symbol.includes(':') ? symbol.split(':', 2) : ['NSE', symbol];
    const short = String(source.short ?? ticker ?? symbol).trim() || symbol;
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
        render();
      });
    };

    const render = (): void => {
      const current = String(ctx.symbol || '').toUpperCase();
      meta.textContent = `${current} · ${ctx.timeframe} · ${watchlist.length} symbols`;
      rows.textContent = '';

      for (const item of watchlist) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:4px;width:100%;border:1px solid transparent;border-radius:7px;padding:4px 5px;background:transparent;box-sizing:border-box;';

        const button = document.createElement('button');
        button.type = 'button';
        button.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex:1;min-width:0;border:0;border-radius:5px;padding:7px 6px;background:transparent;color:#e2e8f0;text-align:left;cursor:pointer;';
        const isSelected = item.symbol === current;
        if (isSelected) {
          row.style.background = 'rgba(124,92,255,.10)';
          row.style.borderColor = 'rgba(155,138,255,.22)';
        }

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
        const quote = quotes.get(item.symbol);
        value.textContent = quote ? quote.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
        value.style.cssText = 'font-size:11px;font-weight:700;color:#cbd5e1;font-variant-numeric:tabular-nums;';
        const change = document.createElement('span');
        const pct = quote?.changePercent;
        change.textContent = Number.isFinite(pct) ? `${pct! >= 0 ? '+' : ''}${pct!.toFixed(2)}%` : 'LIVE —';
        change.style.cssText = `font-size:9px;color:${Number.isFinite(pct) ? (pct! >= 0 ? '#4ade80' : '#fb7185') : '#64748b'};font-variant-numeric:tabular-nums;`;
        right.append(value, change);

        button.append(left, right);
        button.addEventListener('mouseenter', () => { if (!isSelected) button.style.background = 'rgba(255,255,255,.04)'; });
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
      }
    };

    const refresh = (): void => {
      render();
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
  icon: 'code',
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
      icon: 'code',
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
registerSidePanel(journalPanel);
registerWidgetAction(brandAction);
registerWidgetAction(watchlistAction);
registerWidgetAction(journalAction);
registerWidgetAction(panelsAction);
registerWidgetAction(profileAction);
registerWidgetAction(brokerAction);

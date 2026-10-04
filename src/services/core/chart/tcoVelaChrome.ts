import { registerSidePanel, registerWidgetAction, type SidePanelDescriptor, type WidgetActionDescriptor } from './velaChartFacade';
import { tradingCoreRuntime } from '../../runtime/TradingCoreRuntime';
import { loadTcoVelaJournal, saveTcoVelaJournal } from './tcoVelaSupabaseStorage';

const WATCHLIST = [
  { symbol: 'NSE:NIFTY50-INDEX', label: 'NIFTY 50', short: 'NIFTY' },
  { symbol: 'NSE:NIFTYBANK-INDEX', label: 'NIFTY BANK', short: 'BANKNIFTY' },
  { symbol: 'NSE:FINNIFTY-INDEX', label: 'NIFTY FIN SERVICE', short: 'FINNIFTY' },
  { symbol: 'NSE:MIDCPNIFTY-INDEX', label: 'NIFTY MIDCAP SELECT', short: 'MIDCPNIFTY' },
  { symbol: 'BSE:SENSEX-INDEX', label: 'S&P BSE SENSEX', short: 'SENSEX' },
] as const;

const JOURNAL_KEY = 'tradingcore:vela:journal:v1';

function panelRoot(body: HTMLElement): HTMLDivElement {
  body.textContent = '';
  const root = document.createElement('div');
  root.style.cssText = 'height:100%;display:flex;flex-direction:column;gap:8px;padding:10px;box-sizing:border-box;background:var(--vela-bg, #080b12);color:var(--vela-fg, #e5e7eb);font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;';
  body.appendChild(root);
  return root;
}

const bookmarksPanel: SidePanelDescriptor = {
  id: 'tco.bookmarks', title: 'Watchlist', icon: 'star', order: 10, width: 300, resizable: true, minWidth: 240, maxWidth: 420,
  mount(ctx, body, header) {
    header.setTitle('Watchlist');
    const root = panelRoot(body);
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.12em;';
    root.appendChild(meta);
    const rows = document.createElement('div');
    rows.style.cssText = 'display:flex;flex-direction:column;gap:3px;';
    root.appendChild(rows);
    const values = new Map<string, HTMLSpanElement>();
    const active = new Map<string, HTMLButtonElement>();

    for (const item of WATCHLIST) {
      const button = document.createElement('button');
      button.type = 'button';
      button.style.cssText = 'display:flex;align-items:center;justify-content:space-between;width:100%;border:1px solid transparent;border-radius:7px;padding:9px 10px;background:transparent;color:#e2e8f0;text-align:left;cursor:pointer;';
      button.addEventListener('mouseenter', () => { button.style.background = 'rgba(124,92,255,.10)'; });
      button.addEventListener('mouseleave', () => { if (!button.dataset.active) button.style.background = 'transparent'; });
      const left = document.createElement('span');
      left.innerHTML = `<span style="display:block;font-size:11px;font-weight:700">${item.label}</span><span style="display:block;margin-top:2px;font-size:9px;color:#64748b">${item.short}</span>`;
      const value = document.createElement('span');
      value.textContent = '—';
      value.style.cssText = 'font-size:11px;font-weight:700;color:#cbd5e1;';
      button.append(left, value);
      button.addEventListener('click', () => { ctx.setSymbol(item.symbol); });
      rows.appendChild(button);
      values.set(item.symbol, value);
      active.set(item.symbol, button);
    }

    const refresh = (): void => {
      const current = ctx.symbol;
      meta.textContent = `${current} · ${ctx.timeframe}`;
      for (const item of WATCHLIST) {
        const button = active.get(item.symbol)!;
        const selected = item.symbol === current;
        button.dataset.active = selected ? '1' : '';
        button.style.background = selected ? 'rgba(124,92,255,.12)' : 'transparent';
        button.style.borderColor = selected ? 'rgba(155,138,255,.24)' : 'transparent';
      }
    };

    const quoteStop = tradingCoreRuntime.subscribeMarketData(WATCHLIST.map((x) => x.symbol), (event) => {
      if (event.type !== 'tick' || !event.tick) return;
      const symbol = String(event.tick.instrumentKey || '');
      const ltp = Number(event.tick.ltp ?? event.tick.close);
      const value = values.get(symbol);
      if (value && Number.isFinite(ltp)) value.textContent = ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    });

    refresh();
    return {
      onOpen: refresh,
      onChart: refresh,
      destroy: quoteStop,
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

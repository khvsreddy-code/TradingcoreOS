import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';

(() => {
  const q = <T extends Element = Element>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
  const qa = <T extends Element = Element>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<T>(s));
  const paths = [
    ['/live', 'CHARTS'], ['/models', 'MODELS'], ['/automations', 'AUTOMATIONS'],
    ['/portfolio', 'PORTFOLIO'], ['/indicators', 'INDICATORS'], ['/profile', 'PROFILE'],
  ] as const;

  function injectChrome() {
    if (window.location.pathname !== '/live') return;
    const header = q('body > #root header');
    if (!header || q('#tco-workspace-nav', header)) return;
    const nav = document.createElement('div');
    nav.id = 'tco-workspace-nav';
    nav.innerHTML = `<div class="tco-nav-inner">${paths.map(([path, label]) => `<button data-tco-nav="${path}" class="tco-nav-btn ${path === '/live' ? 'active' : ''}">${label}</button>`).join('')}</div>`;
    header.appendChild(nav);
    qa<HTMLButtonElement>('[data-tco-nav]', nav).forEach(button => button.addEventListener('click', () => {
      const path = button.dataset.tcoNav!;
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }));
  }

  const underlyingFor = (label: string) => {
    const n = label.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (n.includes('NIFTY50')) return 'NSE:NIFTY50-INDEX';
    if (n.includes('BANKNIFTY') || n.includes('NIFTYBANK')) return 'NSE:NIFTYBANK-INDEX';
    if (n.includes('FINNIFTY')) return 'NSE:FINNIFTY-INDEX';
    if (n.includes('MIDCPNIFTY')) return 'NSE:MIDCPNIFTY-INDEX';
    if (n.includes('SENSEX')) return 'BSE:SENSEX-INDEX';
    return null;
  };

  const instrument = () => {
    // Use the selected chart header, not the watchlist body text. The watchlist
    // always contains NIFTY, so body-wide matching misclassified stocks as index options.
    const candidates = qa<HTMLButtonElement>('main section button');
    const selected = candidates.find(button => /·\s*(Index|Stock|Equity|Future|Option|Instrument)/i.test(button.textContent || '') && !(button.textContent || '').includes('LIVE ORDER'));
    const text = selected?.textContent?.trim() || '';
    const match = text.match(/^(.+?)\s*·\s*(Index|Stock|Equity|Future|Option|Instrument)/i);
    const label = (match?.[1] || text).trim();
    const type = (match?.[2] || '').trim();
    const underlying = underlyingFor(label);
    return { label, type, underlying, isIndex: Boolean(underlying) || /^index$/i.test(type) };
  };

  const mk = (tag: 'input' | 'select', placeholder = '') => {
    const el = document.createElement(tag) as HTMLInputElement | HTMLSelectElement;
    el.className = 'tco-q2-control';
    if (el instanceof HTMLInputElement) { el.placeholder = placeholder; el.type = 'number'; el.step = 'any'; }
    return el;
  };
  const sel = (values: string[]) => { const s = mk('select') as HTMLSelectElement; values.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; s.appendChild(o); }); return s; };

  async function loadChain(key: string) { return await tradingCoreRuntime.getOptionChain(key, 'current_week') as any; }

  function chooseContract(data: any, side: 'CE' | 'PE', mode: string) {
    const rows = Array.isArray(data?.contracts) ? data.contracts : [];
    const strikes = [...new Set(rows.map((r: any) => Number(r.strike ?? r.strikePrice)).filter(Number.isFinite))].sort((a: number, b: number) => a - b);
    if (!rows.length || !strikes.length) return null;
    const spot = Number(data?.spot || data?.underlyingSpot || 0);
    if (!spot) return null;
    let atm = 0;
    for (let i = 1; i < strikes.length; i++) if (Math.abs(strikes[i] - spot) < Math.abs(strikes[atm] - spot)) atm = i;
    let index = atm;
    if (mode !== 'ATM') {
      const match = mode.match(/(ITM|OTM)\s*\+(\d+)/);
      if (match) {
        const steps = Number(match[2]);
        const direction = match[1] === 'ITM' ? (side === 'CE' ? -1 : 1) : (side === 'CE' ? 1 : -1);
        index = Math.max(0, Math.min(strikes.length - 1, atm + direction * steps));
      }
    }
    const strike = strikes[index];
    const row = rows.find((r: any) => Number(r.strike ?? r.strikePrice) === strike);
    const quote = row?.[side === 'CE' ? 'call' : 'put'] || row?.[side === 'CE' ? 'ce' : 'pe'];
    const token = quote?.instrumentKey || quote?.instrument_key || quote?.symbol || '';
    if (!token) return null;
    return { ...quote, instrumentKey: token, strike, expiry: row?.expiry || data?.expiry, premium: Number(quote?.ltp ?? quote?.lastPrice ?? quote?.premium ?? 0), spot };
  }

  function panel() {
    const button = qa<HTMLButtonElement>('button').find(b => /LIVE ORDER/.test(b.textContent || ''));
    return button?.closest('.rounded-xl') as HTMLElement | undefined;
  }

  function renderOrder() {
    const p = panel(); if (!p) return;
    let ui = q<HTMLElement>('[data-tco-q2]', p);
    if (!ui) { ui = document.createElement('div'); ui.dataset.tcoQ2 = '1'; p.appendChild(ui); }
    const current = instrument();
    const signature = `${current.label}|${current.type}`;
    if (ui.dataset.signature === signature && ui.children.length) return;
    ui.dataset.signature = signature;
    qa<HTMLElement>(':scope > *', p).forEach(x => { if (x !== ui) x.style.display = 'none'; });
    ui.innerHTML = ''; ui.className = 'tco-q2';
    const { label, underlying, isIndex } = current;
    const title = document.createElement('div'); title.className = 'tco-q2-title'; title.innerHTML = `<span>${isIndex ? 'OPTION ORDER' : 'CASH ORDER'}</span><b>${label || 'SELECTED INSTRUMENT'}</b>`; ui.appendChild(title);

    let cepe: HTMLSelectElement | undefined, mode: HTMLSelectElement | undefined;
    if (isIndex && underlying) { const row = document.createElement('div'); row.className = 'tco-q2-grid'; cepe = sel(['CE', 'PE']); mode = sel(['ATM', 'ITM +1', 'ITM +2', 'ITM +3', 'OTM +1', 'OTM +2', 'OTM +3']); row.append(cepe, mode); ui.appendChild(row); }
    const side = sel(['Buy', 'Sell']); const orderType = sel(['Market', 'Limit', 'SL-L', 'SL-M']);
    const row1 = document.createElement('div'); row1.className = 'tco-q2-grid'; row1.append(side, orderType); ui.appendChild(row1);
    const qty = mk('input', 'Quantity') as HTMLInputElement; qty.value = '1'; qty.min = '1';
    const product = sel(isIndex ? ['MIS', 'NRML'] : ['CNC']);
    const row2 = document.createElement('div'); row2.className = 'tco-q2-grid'; row2.append(qty, product); ui.appendChild(row2);

    const premium = document.createElement('div'); premium.className = 'tco-q2-premium'; premium.textContent = isIndex ? 'Premium —' : 'LTP —'; ui.appendChild(premium);
    const riskHead = document.createElement('div'); riskHead.className = 'tco-q2-riskhead'; riskHead.textContent = 'PROTECTION'; ui.appendChild(riskHead);
    const target = mk('input', 'Target price') as HTMLInputElement;
    const stop = mk('input', 'Stop loss') as HTMLInputElement;
    const trail = mk('input', 'Trailing stop') as HTMLInputElement;
    const riskRow = document.createElement('div'); riskRow.className = 'tco-q2-grid'; riskRow.append(target, stop); ui.appendChild(riskRow); ui.appendChild(trail);
    const limit = mk('input', 'Limit price') as HTMLInputElement; limit.style.display = 'none'; ui.appendChild(limit);
    const trigger = mk('input', 'Trigger price') as HTMLInputElement; trigger.style.display = 'none'; ui.appendChild(trigger);
    const contractInfo = document.createElement('div'); contractInfo.className = 'tco-q2-contract'; contractInfo.textContent = isIndex ? 'Loading contract…' : 'Cash instrument · CNC'; ui.appendChild(contractInfo);
    const status = document.createElement('div'); status.className = 'tco-q2-status'; ui.appendChild(status);
    const submit = document.createElement('button'); submit.className = 'tco-q2-submit'; submit.textContent = 'BUY · LIVE ORDER'; ui.appendChild(submit);

    let contract: any = null;
    const refresh = async () => {
      if (!isIndex || !underlying || !cepe || !mode) return;
      contractInfo.textContent = 'Loading contract…';
      try { const data = await loadChain(underlying); contract = chooseContract(data, cepe.value as 'CE' | 'PE', mode.value); premium.textContent = contract ? `${cepe.value} PREMIUM  ₹${Number(contract.premium || 0).toFixed(2)}  ·  STRIKE ${contract.strike}` : 'Premium unavailable'; contractInfo.textContent = contract ? `${cepe.value} ${contract.strike} · ${contract.expiry || data?.expiry || ''}` : 'No valid contract returned'; }
      catch (e: any) { contract = null; contractInfo.textContent = e?.message || 'Option chain unavailable'; premium.textContent = 'Premium —'; }
    };
    cepe?.addEventListener('change', refresh); mode?.addEventListener('change', refresh);
    const updateOrderType = () => { limit.style.display = orderType.value === 'Limit' || orderType.value === 'SL-L' ? '' : 'none'; trigger.style.display = orderType.value === 'SL-L' || orderType.value === 'SL-M' ? '' : 'none'; };
    orderType.addEventListener('change', updateOrderType);
    side.addEventListener('change', () => { submit.textContent = `${side.value.toUpperCase()} · LIVE ORDER`; });
    submit.addEventListener('click', async () => {
      if (isIndex && !contract?.instrumentKey) { status.textContent = 'Select a valid option contract first.'; return; }
      const quantity = Number(qty.value); if (!Number.isInteger(quantity) || quantity <= 0) { status.textContent = 'Quantity must be a positive whole number.'; return; }
      const order = {
        symbol: isIndex ? contract.instrumentKey : label,
        instrument_token: isIndex ? contract.instrumentKey : label,
        quantity,
        price: Number(limit.value || 0),
        triggerPrice: Number(trigger.value || 0),
        orderType: orderType.value === 'SL-L' ? 'SL' : orderType.value,
        side: side.value as 'Buy' | 'Sell',
        product: product.value as 'CNC' | 'MIS' | 'NRML',
        stopLoss: Number(stop.value || 0),
        takeProfit: Number(target.value || 0),
        trailingStopLoss: Number(trail.value || 0),
        idempotencyKey: globalThis.crypto.randomUUID(),
      } as any;
      status.textContent = 'Submitting…'; submit.disabled = true;
      try { const result = await tradingCoreRuntime.placeOrder(order); status.textContent = `${result.status} · ${result.orderId || ''}${result.message ? ` · ${result.message}` : ''}`; }
      catch (e: any) { status.textContent = `REJECTED · ${e?.message || 'Order failed'}`; }
      finally { submit.disabled = false; }
    });
    void refresh();
  }

  function install() {
    injectChrome(); renderOrder();
    const root = q('#root'); if (!root) return;
    const observer = new MutationObserver(() => { injectChrome(); renderOrder(); });
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener('popstate', () => setTimeout(injectChrome, 50));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})();

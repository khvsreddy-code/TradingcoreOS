/**
 * TradingCore workspace resilience/UI bridge.
 * Mirrors the existing React watchlist controls into the desktop left rail
 * and makes the Levels rail action activate the real chart Levels control.
 */
(() => {
  const DESKTOP = '(min-width: 1536px)';
  const q = <T extends Element = Element>(selector: string, root: ParentNode = document) => root.querySelector<T>(selector);

  function isDesktop() { return window.matchMedia(DESKTOP).matches; }

  function findTopWatchlist(): HTMLElement | null {
    const header = q('header');
    if (!header) return null;
    const children = Array.from(header.children).filter(x => x instanceof HTMLElement) as HTMLElement[];
    return children[children.length - 1] || null;
  }

  function ensureWatchlistRail() {
    const main = q('main');
    const leftRail = main?.firstElementChild as HTMLElement | null;
    if (!main || !leftRail) return;

    let rail = q<HTMLElement>('[data-tco-watchlist-rail]', leftRail);
    if (!rail) {
      rail = document.createElement('section');
      rail.dataset.tcoWatchlistRail = '1';
      rail.className = 'tco-watchlist-rail';
      leftRail.insertBefore(rail, leftRail.firstChild);
    }

    const source = findTopWatchlist();
    if (!source) return;
    if (isDesktop()) source.classList.add('tco-watchlist-source-hidden');
    else source.classList.remove('tco-watchlist-source-hidden');

    if (!isDesktop()) {
      rail.hidden = true;
      return;
    }
    rail.hidden = false;

    const cards = Array.from(source.children).filter(x => x instanceof HTMLElement) as HTMLElement[];
    const signature = cards.map(x => x.textContent || '').join('|');
    if (rail.dataset.signature === signature) return;
    rail.dataset.signature = signature;
    rail.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'tco-watchlist-title';
    title.innerHTML = '<span>WATCHLIST</span><span class="tco-watchlist-live">LIVE</span>';
    rail.appendChild(title);

    cards.forEach(card => {
      const originalAction = card.querySelector('button') as HTMLButtonElement | null;
      const removeAction = card.querySelectorAll('button')[1] as HTMLButtonElement | undefined;
      if (!originalAction || (originalAction.textContent || '').includes('Add symbol')) return;
      const clone = document.createElement('button');
      clone.type = 'button';
      clone.className = 'tco-watchlist-item';
      clone.innerHTML = originalAction.innerHTML;
      clone.addEventListener('click', () => originalAction.click());
      if (removeAction) {
        const remove = document.createElement('span');
        remove.className = 'tco-watchlist-remove';
        remove.textContent = '×';
        remove.title = 'Remove';
        remove.addEventListener('click', event => { event.stopPropagation(); removeAction.click(); });
        clone.appendChild(remove);
      }
      rail.appendChild(clone);
    });

    const addSource = cards.find(card => card.textContent?.includes('Add symbol'))?.querySelector('button') as HTMLButtonElement | null;
    if (addSource) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'tco-watchlist-add';
      add.textContent = '+ Add symbol';
      add.addEventListener('click', () => addSource.click());
      rail.appendChild(add);
    }
  }

  function installRequestCache() {
    const originalFetch = window.fetch.bind(window);
    const cache = new Map<string, { expiresAt: number; response: Response }>();
    const inflight = new Map<string, Promise<Response>>();
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (method !== 'GET' || !url.includes('/api/trading/')) return originalFetch(input, init);
      const isOptionChain = url.includes('/option-chain');
      const isInstrumentSearch = url.includes('/instruments/search');
      if (!isOptionChain && !isInstrumentSearch) return originalFetch(input, init);
      const ttl = isOptionChain ? 12_000 : 10_000;
      const cached = cache.get(url);
      if (cached && cached.expiresAt > Date.now()) return cached.response.clone();
      const existing = inflight.get(url);
      if (existing) return (await existing).clone();
      const request = originalFetch(input, init).then(response => {
        if (response.ok) cache.set(url, { expiresAt: Date.now() + ttl, response: response.clone() });
        return response;
      }).finally(() => inflight.delete(url));
      inflight.set(url, request);
      return request;
    };
  }

  function bindLevelsBridge() {
    document.addEventListener('click', event => {
      const target = event.target as Element | null;
      const button = target?.closest('button');
      if (!button || button.classList.contains('toolbar-pill')) return;
      if ((button.textContent || '').trim() !== 'Levels') return;
      window.setTimeout(() => {
        const toolbar = Array.from(document.querySelectorAll('button.toolbar-pill')).find(x => (x.textContent || '').trim() === 'Levels') as HTMLButtonElement | undefined;
        toolbar?.click();
      }, 0);
    }, true);
  }

  function install() {
    installRequestCache();
    ensureWatchlistRail();
    bindLevelsBridge();
    const root = q('#root');
    if (!root) return;
    const observer = new MutationObserver(() => window.requestAnimationFrame(ensureWatchlistRail));
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener('resize', ensureWatchlistRail, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

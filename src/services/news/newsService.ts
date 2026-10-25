export type TradingCoreNewsItem = {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  snippet?: string;
};

export type TradingCoreNewsBundle = {
  provider: string;
  items: TradingCoreNewsItem[];
  fetchedAt?: string;
};

export async function fetchTradingCoreNewsBundle(symbol: string, signal?: AbortSignal): Promise<TradingCoreNewsBundle> {
  const response = await fetch(`/api/news?symbol=${encodeURIComponent(symbol)}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) throw new Error(payload?.error || `News request failed (${response.status})`);
  return {
    provider: typeof payload?.provider === 'string' && payload.provider.trim() ? payload.provider : 'Market news',
    items: Array.isArray(payload?.items) ? payload.items : [],
    ...(typeof payload?.fetchedAt === 'string' ? { fetchedAt: payload.fetchedAt } : {}),
  };
}

export async function fetchTradingCoreNews(symbol: string, signal?: AbortSignal): Promise<TradingCoreNewsItem[]> {
  return (await fetchTradingCoreNewsBundle(symbol, signal)).items;
}

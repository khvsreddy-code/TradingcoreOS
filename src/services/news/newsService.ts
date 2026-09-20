export type TradingCoreNewsItem = {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  snippet?: string;
};

export async function fetchTradingCoreNews(symbol: string, signal?: AbortSignal): Promise<TradingCoreNewsItem[]> {
  const response = await fetch(`/api/news?symbol=${encodeURIComponent(symbol)}`, {
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) throw new Error(payload?.error || `News request failed (${response.status})`);
  return Array.isArray(payload?.items) ? payload.items : [];
}

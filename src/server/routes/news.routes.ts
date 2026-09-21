import { Router } from 'express';

type NewsItem = {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  snippet?: string;
};

const router = Router();
const cache = new Map<string, { expiresAt: number; items: NewsItem[] }>();
const inflight = new Map<string, Promise<NewsItem[]>>();

const symbolAliases: Record<string, string[]> = {
  NIFTY50: ['NIFTY 50', 'NIFTY50', 'Nifty 50'],
  NIFTY: ['NIFTY 50', 'NIFTY50'],
  BANKNIFTY: ['BANK NIFTY', 'NIFTY BANK', 'BANKNIFTY'],
  SENSEX: ['SENSEX', 'BSE SENSEX'],
};

function queryFor(raw: string): string {
  const value = String(raw || '').trim();
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const aliases = symbolAliases[normalized];
  if (aliases?.length) return `(${aliases.map(x => `"${x}"`).join(' OR ')})`;
  const cleaned = value.replace(/[^A-Za-z0-9 .&-]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? `"${cleaned.slice(0, 80)}"` : 'financial markets';
}

async function fetchGdelt(rawSymbol: string): Promise<NewsItem[]> {
  const query = encodeURIComponent(queryFor(rawSymbol));
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&format=json&maxrecords=12&sort=datedesc`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'TradingCoreOS/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`GDELT news request failed (${response.status})`);
  const payload: any = await response.json();
  const rows = Array.isArray(payload?.articles) ? payload.articles : [];
  return rows.map((row: any, index: number) => ({
    id: String(row?.url || row?.title || index),
    title: String(row?.title || 'Untitled market article'),
    source: String(row?.domain || row?.sourcecountry || 'GDELT'),
    url: String(row?.url || ''),
    publishedAt: String(row?.seendate || row?.date || new Date().toISOString()),
    snippet: String(row?.socialimage || ''),
  })).filter((item: NewsItem) => item.title && item.url);
}

async function getNews(symbol: string): Promise<NewsItem[]> {
  const key = String(symbol || 'markets').trim().toUpperCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.items;
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = fetchGdelt(key)
    .then(items => {
      cache.set(key, { items, expiresAt: Date.now() + 60_000 });
      return items;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

router.get('/news', async (req, res) => {
  const symbol = String(req.query.symbol || req.query.q || 'financial markets');
  try {
    const items = await getNews(symbol);
    res.json({ success: true, provider: 'GDELT', symbol, items, fetchedAt: new Date().toISOString() });
  } catch (error: any) {
    res.status(502).json({ success: false, provider: 'GDELT', symbol, items: [], error: error?.message || 'News unavailable' });
  }
});

export const newsRoutes = router;

import { Router } from 'express';

type JsonRecord = Record<string, unknown>;
type NewsItem = { id: string; title: string; source: string; url: string; publishedAt: string; snippet?: string };
type NewsBundle = { provider: 'Yahoo Finance RSS' | 'GDELT fallback'; items: NewsItem[] };

const router = Router();
const cache = new Map<string, { expiresAt: number; bundle: NewsBundle }>();
const inflight = new Map<string, Promise<NewsBundle>>();
const NEWS_CACHE_TTL_MS = 90_000;

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
  if (aliases?.length) return `(${aliases.map(x => `\"${x}\"`).join(' OR ')})`;
  const cleaned = value.replace(/[^A-Za-z0-9 .&-]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? `\"${cleaned.slice(0, 80)}\"` : 'financial markets';
}

/** Map common India index/stock names to Yahoo Finance's published RSS ticker IDs. */
function yahooSymbolsFor(raw: string): string {
  const value = String(raw || '').trim().toUpperCase();
  const normalized = value.replace(/[^A-Z0-9]/g, '');
  if (/^(NIFTY|NIFTY50|NSE:NIFTY50-INDEX|NIFTY50-INDEX)$/.test(value) || ['NIFTY', 'NIFTY50', 'NIFTY50INDEX', 'NSENIFTY50INDEX'].includes(normalized)) return '^NSEI';
  if (value.includes('BANKNIFTY') || value.includes('NIFTYBANK') || normalized === 'BANKNIFTY') return '^NSEBANK';
  if (value.includes('SENSEX') || value.includes('BSESENSEX') || normalized === 'SENSEX') return '^BSESN';
  if (value.includes('FINNIFTY') || value.includes('MIDCPNIFTY')) return '^NSEI,^NSEBANK,^BSESN';
  const parts = value.split(':', 2);
  if (parts.length === 2) {
    const [exchange, rawTicker] = parts;
    const ticker = String(rawTicker || '').replace(/-(EQ|INDEX)$/i, '').trim();
    // Yahoo doesn't provide a ticker-equivalent feed for option contracts; use broad indices.
    if (/(CE|PE|FUT|FUTURES?)$/i.test(ticker) || !/^[A-Z0-9.^=-]{1,24}$/.test(ticker)) return '^NSEI,^NSEBANK,^BSESN';
    if (exchange === 'NSE') return `${ticker}.NS`;
    if (exchange === 'BSE') return `${ticker}.BO`;
  }
  if (/^(\^NSEI|\^NSEBANK|\^BSESN|[A-Z0-9.^=-]+(?:\.NS|\.BO))$/.test(value)) return value;
  if (/^[A-Z0-9.-]{1,20}$/.test(value) && !/^(MARKETS|FINANCIALMARKETS|INDIA|ALL)$/.test(normalized)) return `${value.replace(/-(EQ|INDEX)$/i, '')}.NS`;
  return '^NSEI,^NSEBANK,^BSESN,RELIANCE.NS,HDFCBANK.NS,INFY.NS';
}

function decodeXml(value: string): string {
  return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => { const code = Number.parseInt(hex, 16); return Number.isFinite(code) ? String.fromCodePoint(code) : ''; })
    .replace(/&#(\d+);/g, (_match, dec: string) => { const code = Number.parseInt(dec, 10); return Number.isFinite(code) ? String.fromCodePoint(code) : ''; })
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '\"').replace(/&apos;|&#39;/g, '\'')
    .replace(/<[^>]*>/g, '').trim();
}

function readXmlTag(xml: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)</${escaped}>`, 'i').exec(xml);
  return match ? decodeXml(match[1] || '') : '';
}

async function fetchYahooFinanceRss(rawSymbol: string): Promise<NewsItem[]> {
  const url = new URL('https://feeds.finance.yahoo.com/rss/2.0/headline');
  url.searchParams.set('s', yahooSymbolsFor(rawSymbol));
  url.searchParams.set('region', 'IN');
  url.searchParams.set('lang', 'en-IN');
  const response = await fetch(url, {
    headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9', 'User-Agent': 'TradingCoreOS/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Yahoo Finance RSS request failed (${response.status})`);
  const xml = await response.text();
  if (!/<(?:rss|feed)\b/i.test(xml)) throw new Error('Yahoo Finance returned an invalid RSS feed.');
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => {
    const item = match[1] || '';
    const title = readXmlTag(item, 'title');
    const link = readXmlTag(item, 'link') || readXmlTag(item, 'guid');
    const published = readXmlTag(item, 'pubDate') || readXmlTag(item, 'dc:date');
    const parsedDate = Date.parse(published);
    const source = readXmlTag(item, 'source') || 'Yahoo Finance';
    // Headlines are displayed exactly as delivered and link directly to the source article.
    return { id: link || title, title, source, url: link, publishedAt: Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : '' };
  }).filter(item => item.title && /^https?:\/\//i.test(item.url));
  const unique = new Map<string, NewsItem>();
  for (const item of items) if (!unique.has(item.url)) unique.set(item.url, item);
  return [...unique.values()].sort((a, b) => Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || '')).slice(0, 20);
}

async function fetchGdelt(rawSymbol: string): Promise<NewsItem[]> {
  const query = encodeURIComponent(queryFor(rawSymbol));
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&format=json&maxrecords=12&sort=datedesc`;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'TradingCoreOS/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`GDELT news request failed (${response.status})`);
  const payload: unknown = await response.json();
  const payloadRecord = payload && typeof payload === 'object' ? payload as JsonRecord : {};
  const rows = Array.isArray(payloadRecord.articles) ? payloadRecord.articles : [];
  return rows.map((row: unknown, index: number) => {
    const item = row && typeof row === 'object' ? row as JsonRecord : {};
    return { id: String(item.url || item.title || index), title: String(item.title || 'Untitled market article'),
      source: String(item.domain || item.sourcecountry || 'GDELT'), url: String(item.url || ''),
      publishedAt: String(item.seendate || item.date || '') };
  }).filter((item: NewsItem) => item.title && /^https?:\/\//i.test(item.url));
}

async function getNews(symbol: string): Promise<NewsBundle> {
  const key = String(symbol || 'financial markets').trim().toUpperCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.bundle;
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = (async () => {
    try {
      const items = await fetchYahooFinanceRss(key);
      if (items.length) return { provider: 'Yahoo Finance RSS' as const, items };
    } catch { /* Use the existing independent source if Yahoo's RSS is unavailable. */ }
    const items = await fetchGdelt(key);
    return { provider: 'GDELT fallback' as const, items };
  })().then(bundle => {
    cache.set(key, { bundle, expiresAt: Date.now() + NEWS_CACHE_TTL_MS });
    return bundle;
  }).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

router.get('/news', async (req, res) => {
  const symbol = String(req.query.symbol || req.query.q || 'financial markets');
  try {
    const bundle = await getNews(symbol);
    res.json({ success: true, provider: bundle.provider, symbol, items: bundle.items, fetchedAt: new Date().toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'News unavailable';
    res.status(502).json({ success: false, provider: 'Yahoo Finance RSS', symbol, items: [], error: message });
  }
});

export const newsRoutes = router;
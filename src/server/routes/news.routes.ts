import { Router } from 'express';

type NewsItem = { id: string; title: string; source: string; url: string; publishedAt: string; snippet?: string };
type NewsBundle = { provider: 'Investing.com India RSS' | 'Moneycontrol RSS' | 'Investing.com India + Moneycontrol RSS'; items: NewsItem[] };

const router = Router();
const cache = new Map<string, { expiresAt: number; bundle: NewsBundle }>();
const inflight = new Map<string, Promise<NewsBundle>>();
const NEWS_CACHE_TTL_MS = 90_000;
const FETCH_TIMEOUT_MS = 7_000;
const INDIA_RELEVANCE = /\b(india|indian|nifty|sensex|bank nifty|banknifty|nse|bse|rupee|inr|rbi|sebi|mumbai|delhi|reliance|tata|infosys|hdfc|icici|sbi|bharti|adani|zomato|eternal|paytm|indusind|axis bank|kotak|bajaj|larsen|ltimindtree|wipro|coal india|ongc|maruti|hindalco|vedanta|irctc|f&o|futures and options|indian markets)\b/i;

const FEEDS = [
  { name: 'Investing.com India RSS', url: 'https://in.investing.com/rss/news_25.rss', host: 'investing.com' },
  { name: 'Moneycontrol RSS', url: 'https://www.moneycontrol.com/rss/marketreports.xml', host: 'moneycontrol.com' },
  { name: 'Moneycontrol RSS', url: 'https://www.moneycontrol.com/rss/latestnews.xml', host: 'moneycontrol.com' },
] as const;

function decodeXml(value: string): string {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_match, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'")
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(xml: string, name: string): string {
  const escaped = name.replace(/[.*+?^\u0024{}()|[\]\\]/g, '\\$&');
  const match = new RegExp('<' + escaped + '\\b[^>]*>([\\s\\S]*?)</' + escaped + '>', 'i').exec(xml);
  return match ? decodeXml(match[1] || '') : '';
}

function safeFeedUrl(raw: string, allowedHost: string): string {
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) ||
        !(url.hostname === allowedHost || url.hostname.endsWith('.' + allowedHost))) return '';
    // Some long-running publisher RSS feeds still emit HTTP article links.
    // Keep the host allowlist strict while upgrading those links to HTTPS.
    url.protocol = 'https:';
    return url.toString();
  } catch { return ''; }
}

async function fetchFeed(feed: typeof FEEDS[number], topic: string): Promise<NewsItem[]> {
  const response = await fetch(feed.url, {
    headers: { Accept: 'application/rss+xml, application/xml, text/xml;q=0.9', 'User-Agent': 'TradingCoreOS/1.0 (+India market news RSS reader)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(feed.name + ' returned HTTP ' + response.status);
  const xml = await response.text();
  if (!/<(?:rss|feed)\b/i.test(xml)) throw new Error(feed.name + ' returned an invalid RSS document.');
  const rows = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => {
    const item = match[1] || '';
    const title = tag(item, 'title');
    const rawUrl = tag(item, 'link') || tag(item, 'guid');
    const url = safeFeedUrl(rawUrl, feed.host);
    const description = tag(item, 'description') || tag(item, 'content:encoded');
    const publishedRaw = tag(item, 'pubDate') || tag(item, 'dc:date') || tag(item, 'pubdate');
    const publishedMs = Date.parse(publishedRaw);
    const relevanceText = title + ' ' + description;
    if (!title || !url || !INDIA_RELEVANCE.test(relevanceText)) return null;
    if (topic && !relevanceText.toLowerCase().includes(topic.toLowerCase()) && !INDIA_RELEVANCE.test(topic)) return null;
    return {
      id: url,
      title,
      source: feed.name.startsWith('Investing') ? 'Investing.com' : 'Moneycontrol',
      url,
      publishedAt: Number.isFinite(publishedMs) ? new Date(publishedMs).toISOString() : '',
      ...(description ? { snippet: description.slice(0, 320) } : {}),
    } satisfies NewsItem;
  }).filter((item): item is NewsItem => item !== null);
  return rows;
}

async function getNews(topic = '', cacheNamespace: 'SYMBOL' | 'TOPIC' = 'SYMBOL'): Promise<NewsBundle> {
  // Keep topic research and symbol/watchlist requests independently cached. The
  // same RSS publisher can support both, but mode-specific cache entries avoid
  // serving a broader symbol query for a narrower topic preset (or vice versa).
  const key = cacheNamespace + ':' + String(topic || 'INDIA_MARKETS').trim().toUpperCase().slice(0, 120);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.bundle;
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = (async (): Promise<NewsBundle> => {
    const results = await Promise.allSettled(FEEDS.map(feed => fetchFeed(feed, topic)));
    const items = new Map<string, NewsItem>();
    let investing = false, moneycontrol = false;
    for (let i = 0; i < results.length; i += 1) {
      const result = results[i]!;
      if (result.status !== 'fulfilled') continue;
      if (FEEDS[i]!.name.startsWith('Investing')) investing = true;
      else moneycontrol = true;
      for (const item of result.value) if (!items.has(item.url)) items.set(item.url, item);
    }
    const sorted = [...items.values()].sort((a, b) => Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || '')).slice(0, 30);
    const provider: NewsBundle['provider'] = investing && moneycontrol ? 'Investing.com India + Moneycontrol RSS'
      : investing ? 'Investing.com India RSS' : 'Moneycontrol RSS';
    if (!sorted.length && !investing && !moneycontrol) throw new Error('India market news feeds are temporarily unavailable.');
    return { provider, items: sorted };
  })().then(bundle => {
    cache.set(key, { bundle, expiresAt: Date.now() + NEWS_CACHE_TTL_MS });
    return bundle;
  }).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

async function getSymbolNews(symbol: string): Promise<NewsBundle> {
  return getNews(symbol, 'SYMBOL');
}

async function getTopicNews(topic: string): Promise<NewsBundle> {
  return getNews(topic, 'TOPIC');
}

router.get('/news', async (req, res) => {
  const topicMode = req.query.topic !== undefined;
  const topic = String(req.query.topic || req.query.symbol || req.query.q || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  try {
    const bundle = topicMode ? await getTopicNews(topic) : await getSymbolNews(topic);
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.json({ success: true, provider: bundle.provider, topic: topic || 'India markets', region: 'IN', items: bundle.items, fetchedAt: new Date().toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'India market news unavailable';
    res.status(502).json({ success: false, provider: 'Investing.com India + Moneycontrol RSS', topic: topic || 'India markets', region: 'IN', items: [], error: message });
  }
});

export const newsRoutes = router;

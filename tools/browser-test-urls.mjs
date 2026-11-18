const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Build explicit Vela layout URLs from the canonical /live terminal URL.
 * Existing query parameters (for example a shared symbol/timeframe) are retained.
 */
export function buildChartLayoutUrls(baseUrl, layouts = [1, 4, 8]) {
  const raw = String(baseUrl ?? '').trim();
  if (!raw) throw new Error('A complete TCO_BROWSER_BASE_URL is required.');

  let base;
  try {
    base = new URL(raw);
  } catch {
    throw new Error('TCO_BROWSER_BASE_URL must be an absolute URL ending in /live.');
  }

  const localHttp = base.protocol === 'http:' && LOCAL_HTTP_HOSTS.has(base.hostname);
  if (base.protocol !== 'https:' && !localHttp) {
    throw new Error('TCO_BROWSER_BASE_URL must use HTTPS (HTTP is allowed only for localhost testing).');
  }
  if (base.username || base.password) {
    throw new Error('TCO_BROWSER_BASE_URL must not embed credentials.');
  }

  const pathname = base.pathname.replace(/\/+$/, '') || '/'
  if (pathname !== '/live') {
    throw new Error('TCO_BROWSER_BASE_URL must point to the complete /live route, not the site root or another page.');
  }

  if (!Array.isArray(layouts) || layouts.length === 0) {
    throw new Error('At least one Vela layout size must be provided.');
  }

  const normalized = layouts.map(value => {
    const layout = Number(String(value).trim());
    if (!Number.isSafeInteger(layout) || layout < 1 || layout > 8) {
      throw new Error(`Invalid Vela layout "${value}". Supported chart counts are integers from 1 through 8.`);
    }
    return layout;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('Vela layout sizes must be unique.');
  }

  return normalized.map(layout => {
    const url = new URL(base.href);
    url.pathname = '/live';
    url.searchParams.set('velaLayout', String(layout));
    return url.toString();
  });
}

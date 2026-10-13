/**
 * Normalize client/provider symbol formats to FYERS's canonical exchange-qualified
 * symbol. Keep derivatives intact: compact CE/PE option tickers do not contain a hyphen,
 * so a generic NSE:<ticker> equity fallback must not append "-EQ" to them.
 */
export function canonicalFyersSymbol(value: string): string {
  const raw = String(value || '').trim();
  const n = raw.toLowerCase().replace(/\s+/g, '');
  if (['nse_index|nifty50','nse_index|nifty50index','nifty','nifty50','nifty50index'].includes(n) || n.includes('nifty50-index')) return 'NSE:NIFTY50-INDEX';
  if (['nse_index|niftybank','nse_index|banknifty','banknifty','niftybank'].includes(n) || n.includes('niftybank-index')) return 'NSE:NIFTYBANK-INDEX';
  if (['nse_index|finnifty','nse_index|niftyfinancialservices'].includes(n) || n.includes('finnifty-index')) return 'NSE:FINNIFTY-INDEX';
  if (['nse_index|niftymidcapselect','nse_index|midcap'].includes(n) || n.includes('midcpnifty-index')) return 'NSE:MIDCPNIFTY-INDEX';
  if (['bse_index|sensex','sensex'].includes(n) || n.includes('sensex-index')) return 'BSE:SENSEX-INDEX';

  const eq = raw.match(/^(NSE|BSE)_(EQ|CM)\|(.+)$/i);
  if (eq) {
    const exchange = eq[1].toUpperCase();
    const ticker = eq[3];
    return /-(EQ|BE|SM|ST)$/i.test(ticker) ? `${exchange}:${ticker}` : `${exchange}:${ticker}-EQ`;
  }

  const pipe = raw.match(/^(NSE|BSE|MCX)_(CM|FO|CD|COM)\|(.+)$/i);
  if (pipe) {
    const exchange = pipe[1].toUpperCase();
    const segment = pipe[2].toUpperCase();
    const ticker = pipe[3];
    if (segment === 'CM' && !/-(EQ|BE|SM|ST)$/i.test(ticker)) return `${exchange}:${ticker}-EQ`;
    return `${exchange}:${ticker}`;
  }

  // Some clients provide a bare derivative ticker. Infer the exchange from the
  // underlying index family rather than treating it as an NSE equity by default.
  if (!raw.includes(':') && /^(?:NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY|SENSEX|BANKEX).*?(?:FUT|CE|PE)$/i.test(raw)) {
    const exchange = /^(?:SENSEX|BANKEX)/i.test(raw) ? 'BSE' : 'NSE';
    return `${exchange}:${raw}`;
  }

  // Compact FYERS derivative tickers end in ...<strike>CE/PE or ...FUT. Preserve them
  // before the broad exchange-qualified equity fallback can append "-EQ".
  const qualified = raw.match(/^(NSE|BSE):(.+)$/i);
  if (qualified) {
    const exchange = qualified[1]!.toUpperCase();
    const ticker = qualified[2]!;
    if (/\d+(?:\.\d+)?(?:CE|PE)$/i.test(ticker) || /FUT(?:URES?)?$/i.test(ticker)) {
      return `${exchange}:${ticker}`;
    }
  }

  if (/^NSE:[A-Z0-9&._-]+$/i.test(raw) && !/-[A-Z]+$/i.test(raw)) return `${raw}-EQ`;
  if (/^BSE:[A-Z0-9&._-]+$/i.test(raw) && !/-[A-Z]+$/i.test(raw)) return `${raw}-EQ`;
  return raw;
}
